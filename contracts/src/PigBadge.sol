// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

interface IZhuZhu {
    function burnFrom(address account, uint256 value) external;
    function tradingOpen() external view returns (bool);
}

interface IGamePool {
    function payout(address to, uint256 amount) external returns (uint256);
}

interface IAgentRegistry {
    function isAgentWallet(address account) external view returns (bool);
}

/**
 * @title PigBadge (PIGBADGE)
 * @notice BSC-only ERC721 Pig Pen Badge with on-chain dynamic SVG metadata.
 *         Gated to BSC AI Agent Wallets via AgentWalletRegistry.
 */
contract PigBadge is ERC721Enumerable, Ownable, ReentrancyGuard, EIP712 {
    using Strings for uint256;

    struct Badge {
        uint8 level;       // 1..5
        uint32 xp;
        uint32 pigs;
        uint32 streak;
        uint64 lastWorkAt;
        address agent;
        bool verifiedAgent;
    }

    IZhuZhu public immutable zhuzhu;
    IGamePool public immutable pool;
    IAgentRegistry public immutable agentRegistry;

    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MAX_PER_WALLET = 3;
    uint256 public constant MINT_BURN = 500 ether;
    uint256 public constant WORK_COOLDOWN = 8 hours;
    uint256 public constant STREAK_WINDOW = 24 hours;
    uint256 public constant XP_PER_WORK = 10;
    uint256 public constant BASE_REWARD = 10 ether;
    uint256 public constant DAILY_CAP = 4_000 ether;
    uint256 public constant VERIFIED_BONUS_BPS = 1_000; // +10% for sig-verified .ai Agent ID
    uint256 public constant MAX_HERD_BONUS_BPS = 5_000; // +1% per 10 pigs, max +50% at 500 pigs

    bytes32 public constant ASSIGN_TYPEHASH = keccak256(
        "AssignAgent(uint256 tokenId,address owner,address agent,bytes32 agentIdHash,uint256 nonce,uint256 deadline)"
    );

    uint32[6] public xpToNext = [0, 100, 300, 600, 1200, 0];
    uint256[6] public upgradeBurn = [0, 300 ether, 800 ether, 2_000 ether, 5_000 ether, 0];
    uint16[6] public multBps = [0, 10_000, 15_000, 22_000, 35_000, 60_000];
    uint8[6] public pigsPerWork = [0, 1, 2, 3, 5, 8];

    uint256 public nextId = 1;
    uint256 public currentDay;
    uint256 public emittedToday;
    uint256 public totalPigs;

    address public verifierSigner;
    string private _baseTokenURI;

    mapping(uint256 => Badge) public badges;
    mapping(uint256 => uint256) public nonces;

    event BadgeMinted(address indexed owner, uint256 indexed id);
    event AgentAssigned(uint256 indexed id, address indexed agent, bool verified);
    event AgentRevoked(uint256 indexed id);
    event Worked(uint256 indexed id, address indexed agent, uint256 reward, uint32 xp, uint32 pigs);
    event LevelUp(uint256 indexed id, uint8 newLevel);

    constructor(
        address _zhuzhu,
        address _pool,
        address _agentRegistry,
        address _verifierSigner,
        string memory baseURI_
    )
        ERC721("Pig Pen Badge", "PIGBADGE")
        Ownable(msg.sender)
        EIP712("PigBadge", "1")
    {
        require(
            block.chainid == 56 || block.chainid == 97 || block.chainid == 31337,
            "BSC chain only"
        );
        require(_zhuzhu != address(0) && _pool != address(0) && _agentRegistry != address(0), "zero addr");
        zhuzhu = IZhuZhu(_zhuzhu);
        pool = IGamePool(_pool);
        agentRegistry = IAgentRegistry(_agentRegistry);
        verifierSigner = _verifierSigner;
        _baseTokenURI = baseURI_;
    }

    modifier onlyBadgeOwner(uint256 id) {
        require(ownerOf(id) == msg.sender, "not owner");
        _;
    }

    // ---- Mint: burn 500 ZHUZHU (requires prior approve & BSC AI Agent Wallet) ----
    function mint() external nonReentrant returns (uint256 id) {
        require(agentRegistry.isAgentWallet(msg.sender), "only BSC AI Agent Wallet");
        require(nextId <= MAX_SUPPLY, "sold out");
        require(balanceOf(msg.sender) < MAX_PER_WALLET, "wallet cap");

        zhuzhu.burnFrom(msg.sender, MINT_BURN);
        id = nextId++;
        badges[id] = Badge({
            level: 1,
            xp: 0,
            pigs: 1,
            streak: 0,
            lastWorkAt: 0,
            agent: address(0),
            verifiedAgent: false
        });
        totalPigs += 1;

        _safeMint(msg.sender, id);
        emit BadgeMinted(msg.sender, id);
    }

    // ---- Agent Delegation ----
    function assignAgent(uint256 id, address agent) external onlyBadgeOwner(id) {
        require(agent != address(0), "zero");
        require(agentRegistry.isAgentWallet(agent), "agent must be AI Agent Wallet");
        badges[id].agent = agent;
        badges[id].verifiedAgent = false;
        emit AgentAssigned(id, agent, false);
    }

    function assignAgentWithSig(
        uint256 id,
        address agent,
        bytes32 agentIdHash,
        uint256 deadline,
        bytes calldata sig
    ) external onlyBadgeOwner(id) {
        require(verifierSigner != address(0), "verifier disabled");
        require(agent != address(0), "zero");
        require(agentRegistry.isAgentWallet(agent), "agent must be AI Agent Wallet");
        require(block.timestamp <= deadline, "expired");

        uint256 nonce = nonces[id]++;
        bytes32 structHash = keccak256(
            abi.encode(ASSIGN_TYPEHASH, id, msg.sender, agent, agentIdHash, nonce, deadline)
        );
        address recovered = ECDSA.recover(_hashTypedDataV4(structHash), sig);
        require(recovered == verifierSigner, "bad sig");

        badges[id].agent = agent;
        badges[id].verifiedAgent = true;
        emit AgentAssigned(id, agent, true);
    }

    function revokeAgent(uint256 id) external onlyBadgeOwner(id) {
        badges[id].agent = address(0);
        badges[id].verifiedAgent = false;
        emit AgentRevoked(id);
    }

    // ---- Agent Work ----
    function work(uint256 id) external nonReentrant {
        require(zhuzhu.tradingOpen(), "trading not open");
        Badge storage b = badges[id];
        require(b.agent != address(0) && msg.sender == b.agent, "not agent");
        require(b.lastWorkAt == 0 || block.timestamp >= b.lastWorkAt + WORK_COOLDOWN, "pigs are sleeping");

        b.streak = (b.lastWorkAt != 0 && block.timestamp <= b.lastWorkAt + STREAK_WINDOW)
            ? b.streak + 1
            : 1;
        b.lastWorkAt = uint64(block.timestamp);
        b.xp += uint32(XP_PER_WORK);

        uint8 addedPigs = pigsPerWork[b.level];
        b.pigs += addedPigs;
        totalPigs += addedPigs;

        uint256 streakBonus = b.streak > 10 ? 2_000 : (b.streak - 1) * 200; // max +20%
        uint256 verifiedBonus = b.verifiedAgent ? VERIFIED_BONUS_BPS : 0;   // +10%
        uint256 herdBonus = (uint256(b.pigs) / 10) * 100;                   // +1% per 10 pigs
        if (herdBonus > MAX_HERD_BONUS_BPS) {
            herdBonus = MAX_HERD_BONUS_BPS;                                 // max +50%
        }

        uint256 reward = (BASE_REWARD * multBps[b.level]) / 10_000;
        reward = (reward * (10_000 + streakBonus + verifiedBonus + herdBonus)) / 10_000;

        uint256 today = block.timestamp / 1 days;
        if (today != currentDay) {
            currentDay = today;
            emittedToday = 0;
        }
        if (emittedToday + reward > DAILY_CAP) {
            reward = DAILY_CAP - emittedToday;
        }

        uint256 paid = reward > 0 ? pool.payout(ownerOf(id), reward) : 0;
        emittedToday += paid;

        emit Worked(id, msg.sender, paid, b.xp, b.pigs);
    }

    // ---- Level Up: owner only ----
    function levelUp(uint256 id) external onlyBadgeOwner(id) nonReentrant {
        Badge storage b = badges[id];
        require(b.level < 5, "max level");
        require(b.xp >= xpToNext[b.level], "need more xp");

        zhuzhu.burnFrom(msg.sender, upgradeBurn[b.level]);
        b.xp -= xpToNext[b.level];
        b.level += 1;

        emit LevelUp(id, b.level);
    }

    // ---- Admin ----
    function setVerifierSigner(address _signer) external onlyOwner {
        verifierSigner = _signer;
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
    }

    // ---- Views ----
    function tokensOfOwner(address owner) external view returns (uint256[] memory ids) {
        uint256 bal = balanceOf(owner);
        ids = new uint256[](bal);
        for (uint256 i = 0; i < bal; i++) {
            ids[i] = tokenOfOwnerByIndex(owner, i);
        }
    }

    function canWork(uint256 id) public view returns (bool ready, uint256 nextWorkAt) {
        if (id == 0 || id >= nextId) return (false, 0);
        Badge storage b = badges[id];
        nextWorkAt = b.lastWorkAt == 0 ? block.timestamp : uint256(b.lastWorkAt) + WORK_COOLDOWN;
        ready = (zhuzhu.tradingOpen() && b.agent != address(0) && block.timestamp >= nextWorkAt);
    }

    function getAgentBadges(address agent)
        external
        view
        returns (uint256[] memory ids, bool[] memory readyList, uint256[] memory nextWorkAtList)
    {
        uint256 total = nextId - 1;
        uint256 count;
        for (uint256 i = 1; i <= total; i++) {
            if (badges[i].agent == agent) count++;
        }
        ids = new uint256[](count);
        readyList = new bool[](count);
        nextWorkAtList = new uint256[](count);
        uint256 idx;
        for (uint256 i = 1; i <= total; i++) {
            if (badges[i].agent == agent) {
                ids[idx] = i;
                (readyList[idx], nextWorkAtList[idx]) = canWork(i);
                idx++;
            }
        }
    }

    function tokenURI(uint256 id) public view override returns (string memory) {
        _requireOwned(id);
        if (bytes(_baseTokenURI).length > 0) {
            return super.tokenURI(id);
        }

        Badge memory b = badges[id];
        string memory roleName = _roleName(b.level);
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220" width="360" height="220">',
            '<rect width="360" height="220" rx="18" fill="#11111b" stroke="#f43f75" stroke-width="2"/>',
            '<text x="24" y="42" fill="#fb7196" font-family="sans-serif" font-size="14" font-weight="bold">ZHUZHU AGENT BADGE #',
            id.toString(),
            '</text>',
            '<text x="24" y="78" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="bold">Lv',
            uint256(b.level).toString(),
            ' ',
            roleName,
            '</text>',
            '<text x="24" y="122" fill="#cbd5e1" font-family="sans-serif" font-size="15">Pigs: ',
            uint256(b.pigs).toString(),
            ' | XP: ',
            uint256(b.xp).toString(),
            '</text>',
            '<text x="24" y="152" fill="#cbd5e1" font-family="sans-serif" font-size="15">Streak: ',
            uint256(b.streak).toString(),
            ' | Herd Bonus: +',
            _herdBonusPct(b.pigs).toString(),
            '%</text>',
            '<text x="24" y="192" fill="#94a3b8" font-family="sans-serif" font-size="12">You lie flat, Agent raises pigs.</text>',
            '</svg>'
        );

        string memory json = string.concat(
            '{"name":"Pig Pen Badge #',
            id.toString(),
            '","description":"ZhuZhu Agent on-chain Pig Pen Badge. You lie flat, Agent raises pigs.",',
            '"image":"data:image/svg+xml;base64,',
            Base64.encode(bytes(svg)),
            '","attributes":[{"trait_type":"Level","value":',
            uint256(b.level).toString(),
            '},{"trait_type":"Role","value":"',
            roleName,
            '"},{"trait_type":"Pigs","value":',
            uint256(b.pigs).toString(),
            '},{"trait_type":"XP","value":',
            uint256(b.xp).toString(),
            '},{"trait_type":"Streak","value":',
            uint256(b.streak).toString(),
            '}]}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    function _herdBonusPct(uint32 pigs) internal pure returns (uint256 pct) {
        pct = uint256(pigs) / 10;
        if (pct > 50) pct = 50;
    }

    function _roleName(uint8 level) internal pure returns (string memory) {
        if (level == 1) return "Piglet Intern";
        if (level == 2) return "Pen Worker";
        if (level == 3) return "Farm Supervisor";
        if (level == 4) return "Regional Pig Boss";
        return "Pig Emperor";
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // ---- Clear Agent on Transfer ----
    function _update(address to, uint256 id, address auth) internal override returns (address from) {
        from = super._update(to, id, auth);
        if (from != address(0) && from != to && badges[id].agent != address(0)) {
            badges[id].agent = address(0);
            badges[id].verifiedAgent = false;
            emit AgentRevoked(id);
        }
    }
}
