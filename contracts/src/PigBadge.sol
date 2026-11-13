// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IZhuZhu {
    function burnFrom(address account, uint256 value) external;
}

interface IGamePool {
    function payout(address to, uint256 amount) external returns (uint256);
}

/**
 * @title PigBadge (PIGBADGE)
 * @notice ERC721 Pig Pen Badge. Owners delegate work() rights to an AI Agent address,
 *         while retaining NFT ownership, rewards, and level-up control.
 */
contract PigBadge is ERC721Enumerable, Ownable, ReentrancyGuard, EIP712 {
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

    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant MAX_PER_WALLET = 3;
    uint256 public constant MINT_BURN = 500 ether;
    uint256 public constant WORK_COOLDOWN = 8 hours;
    uint256 public constant STREAK_WINDOW = 24 hours;
    uint256 public constant XP_PER_WORK = 10;
    uint256 public constant BASE_REWARD = 10 ether;
    uint256 public constant DAILY_CAP = 4_000 ether;
    uint256 public constant VERIFIED_BONUS_BPS = 1_000; // +10% for verified .ai Agent ID

    bytes32 public constant ASSIGN_TYPEHASH = keccak256(
        "AssignAgent(uint256 tokenId,address agent,bytes32 agentIdHash,uint256 deadline)"
    );

    uint32[6] public xpToNext = [0, 100, 300, 800, 2000, 0];
    uint256[6] public upgradeBurn = [0, 1_000 ether, 3_000 ether, 8_000 ether, 20_000 ether, 0];
    uint16[6] public multBps = [0, 10_000, 12_500, 15_000, 20_000, 30_000];
    uint8[6] public pigsPerWork = [0, 1, 2, 3, 5, 8];

    uint256 public nextId = 1;
    uint256 public currentDay;
    uint256 public emittedToday;
    uint256 public totalPigs;

    address public verifierSigner;
    string private _baseTokenURI;

    mapping(uint256 => Badge) public badges;

    event BadgeMinted(address indexed owner, uint256 indexed id);
    event AgentAssigned(uint256 indexed id, address indexed agent, bool verified);
    event AgentRevoked(uint256 indexed id);
    event Worked(uint256 indexed id, address indexed agent, uint256 reward, uint32 xp, uint32 pigs);
    event LevelUp(uint256 indexed id, uint8 newLevel);

    constructor(
        address _zhuzhu,
        address _pool,
        address _verifierSigner,
        string memory baseURI_
    )
        ERC721("Pig Pen Badge", "PIGBADGE")
        Ownable(msg.sender)
        EIP712("PigBadge", "1")
    {
        require(_zhuzhu != address(0) && _pool != address(0), "zero addr");
        zhuzhu = IZhuZhu(_zhuzhu);
        pool = IGamePool(_pool);
        verifierSigner = _verifierSigner;
        _baseTokenURI = baseURI_;
    }

    modifier onlyBadgeOwner(uint256 id) {
        require(ownerOf(id) == msg.sender, "not owner");
        _;
    }

    // ---- Mint: burn 500 ZHUZHU (requires prior approve) ----
    function mint() external nonReentrant returns (uint256 id) {
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
        require(block.timestamp <= deadline, "expired");

        bytes32 structHash = keccak256(
            abi.encode(ASSIGN_TYPEHASH, id, agent, agentIdHash, deadline)
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
        Badge storage b = badges[id];
        require(b.agent != address(0) && msg.sender == b.agent, "not agent");
        require(block.timestamp >= b.lastWorkAt + WORK_COOLDOWN, "pigs are sleeping");

        b.streak = (b.lastWorkAt != 0 && block.timestamp <= b.lastWorkAt + STREAK_WINDOW)
            ? b.streak + 1
            : 1;
        b.lastWorkAt = uint64(block.timestamp);
        b.xp += uint32(XP_PER_WORK);

        uint8 addedPigs = pigsPerWork[b.level];
        b.pigs += addedPigs;
        totalPigs += addedPigs;

        uint256 streakBonus = b.streak > 10 ? 2_000 : (b.streak - 1) * 200; // max +20%
        uint256 verifiedBonus = b.verifiedAgent ? VERIFIED_BONUS_BPS : 0;
        uint256 reward = (BASE_REWARD * multBps[b.level]) / 10_000;
        reward = (reward * (10_000 + streakBonus + verifiedBonus)) / 10_000;

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

    function canWork(uint256 id) external view returns (bool ready, uint256 nextWorkAt) {
        Badge storage b = badges[id];
        nextWorkAt = uint256(b.lastWorkAt) + WORK_COOLDOWN;
        ready = (b.agent != address(0) && block.timestamp >= nextWorkAt);
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
