// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ZhuZhuDividendTracker} from "./ZhuZhuDividendTracker.sol";

interface IPancakeRouter02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external;
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

interface IPancakePair {
    function mint(address to) external returns (uint256 liquidity);
    function sync() external;
}

interface IWBNB {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}

interface IAgentIdRegistry {
    function handleOf(address account) external view returns (string memory);
}

/**
 * @title ZhuZhuToken ($ZHUZHU)
 * @notice BSC AI Agent Wallet exclusive meme launch:
 *         - Total supply: 1,000,000,000,000 (1T) $ZHUZHU
 *         - 60% Community Mint: 10,000 lots * 0.002 BNB = 20 BNB (max 10 lots / 0.02 BNB per wallet)
 *         - 30% Auto DEX Liquidity paired with 100% raised BNB & LP burned to 0x...dEaD
 *         - 10% Community Reserve
 *         - 3% Buy/Sell tax: 1.5% BNB Dividends (holders >= 1,000,000 $ZHUZHU) + 1.5% Community
 */
contract ZhuZhuToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    // ---- Tokenomics (Total: 1,000,000,000,000 $ZHUZHU) ----
    uint256 public constant TOTAL_SUPPLY  = 1_000_000_000_000 ether;
    uint256 public constant MINT_ALLOC    =   600_000_000_000 ether; // 60%
    uint256 public constant LP_ALLOC      =   300_000_000_000 ether; // 30%
    uint256 public constant RESERVE_ALLOC =   100_000_000_000 ether; // 10%

    // ---- Mint Parameters (First 1,000 lots free: max 1 free/wallet; paid 0.002 BNB / lot, max 10 lots/wallet) ----
    uint256 public constant LOT_PRICE            = 0.002 ether;
    uint256 public constant MAX_LOTS_PER_WALLET  = 10;
    uint256 public constant TOTAL_LOTS           = 10_000;
    uint256 public constant FREE_LOTS            = 1_000;
    uint256 public constant FREE_LOTS_PER_WALLET = 1;
    uint256 public constant TOKENS_PER_LOT       = 60_000_000 ether;

    // ---- Tax Parameters (3% buy / 3% sell -> 1.5% BNB dividends + 1.5% community) ----
    uint256 public constant TAX_BPS = 300;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    uint256 public immutable MINT_START_TIME;
    address public immutable AGENT_ID_REGISTRY;
    ZhuZhuDividendTracker public immutable dividendTracker;
    IPancakeRouter02 public immutable router;
    address public immutable communityWallet;

    address public pair;
    bool public tradingLive;
    uint256 public lotsMinted;
    uint256 public freeLotsMinted;
    uint256 public raisedBnb;
    uint256 public swapThreshold = 50_000_000 ether;

    mapping(address => uint256) public mintedLots;
    mapping(address => bool) public hasClaimedFree;
    mapping(address => bool) public isExempt;

    bool private _inSwap;

    event Minted(address indexed account, uint256 lots, uint256 bnbPaid, uint256 tokensOut);
    event Launched(uint256 lpTokens, uint256 lpBnb, address indexed pair);
    event TaxDistributed(uint256 tokensSwapped, uint256 dividendBnb, uint256 communityBnb);

    constructor(
        address _router,
        address _agentIdRegistry,
        address _communityWallet,
        uint256 _mintStartTime
    ) ERC20("ZhuZhu", "ZHUZHU") Ownable(msg.sender) {
        require(
            block.chainid == 56 || block.chainid == 97 || block.chainid == 31337,
            "BSC chain only"
        );
        require(_router != address(0), "zero router");
        require(_agentIdRegistry != address(0), "zero registry");
        require(_communityWallet != address(0), "zero community");

        router = IPancakeRouter02(_router);
        AGENT_ID_REGISTRY = _agentIdRegistry;
        communityWallet = _communityWallet;
        MINT_START_TIME = _mintStartTime == 0 ? block.timestamp : _mintStartTime;

        dividendTracker = new ZhuZhuDividendTracker(address(this));
        dividendTracker.excludeFromDividends(address(this), true);
        dividendTracker.excludeFromDividends(DEAD, true);
        dividendTracker.excludeFromDividends(_communityWallet, true);

        isExempt[address(this)] = true;
        isExempt[DEAD] = true;
        isExempt[_communityWallet] = true;

        _mint(address(this), MINT_ALLOC + LP_ALLOC);
        _mint(_communityWallet, RESERVE_ALLOC);
    }

    // ================= View Interface =================

    function DIVIDEND_TRACKER() external view returns (address) {
        return address(dividendTracker);
    }

    function agentHandleOf(address account) public view returns (string memory) {
        if (AGENT_ID_REGISTRY == address(0)) return "";
        try IAgentIdRegistry(AGENT_ID_REGISTRY).handleOf(account) returns (string memory h) {
            return h;
        } catch {
            return "";
        }
    }

    function hasAgentId(address account) public view returns (bool) {
        return bytes(agentHandleOf(account)).length > 0;
    }

    function mintOpen() public view returns (bool) {
        return !tradingLive && block.timestamp >= MINT_START_TIME && lotsMinted < TOTAL_LOTS;
    }

    function totalBurned() external view returns (uint256) {
        return balanceOf(DEAD) + (TOTAL_SUPPLY - totalSupply());
    }

    function canClaimFree(address account) public view returns (bool) {
        return freeLotsMinted < FREE_LOTS && !hasClaimedFree[account];
    }

    function quoteMintCost(address account, uint256 lots)
        public
        view
        returns (uint256 costWei, uint256 freeLotsUsed)
    {
        if (lots == 0) return (0, 0);
        if (canClaimFree(account)) {
            freeLotsUsed = 1;
        }
        uint256 paidLots = lots - freeLotsUsed;
        costWei = paidLots * LOT_PRICE;
    }

    // ================= Community Mint =================

    function mint(uint256 lots) external payable nonReentrant {
        require(mintOpen(), "mint closed");
        require(hasAgentId(msg.sender), "Binance AI Agent ID (.ai) required");
        require(lots > 0 && lots <= MAX_LOTS_PER_WALLET, "invalid lots");
        require(mintedLots[msg.sender] + lots <= MAX_LOTS_PER_WALLET, "wallet cap reached");
        require(lotsMinted + lots <= TOTAL_LOTS, "exceeds total lots");
        if (msg.value == 0 && hasClaimedFree[msg.sender]) {
            revert("already claimed 1 free lot");
        }

        (uint256 costWei, uint256 freeLotsUsed) = quoteMintCost(msg.sender, lots);
        require(msg.value == costWei, "incorrect BNB amount");

        if (freeLotsUsed > 0) {
            hasClaimedFree[msg.sender] = true;
            freeLotsMinted += freeLotsUsed;
        }

        lotsMinted += lots;
        mintedLots[msg.sender] += lots;
        raisedBnb += msg.value;

        uint256 tokenAmount = lots * TOKENS_PER_LOT;
        _transfer(address(this), msg.sender, tokenAmount);
        emit Minted(msg.sender, lots, msg.value, tokenAmount);

        if (lotsMinted == TOTAL_LOTS) {
            _launch();
        }
    }

    // ================= Auto-LP Launch & Burn =================

    /// @notice Allows owner to finalize LP & open trading on testnet/early finish.
    function launch() external onlyOwner nonReentrant {
        _launch();
    }

    function _launch() internal {
        require(!tradingLive, "already launched");

        if (lotsMinted == 0 || raisedBnb == 0) {
            uint256 rem = balanceOf(address(this));
            if (rem > 0) {
                super._update(address(this), DEAD, rem);
            }
            tradingLive = true;
            emit Launched(0, 0, address(0));
            return;
        }

        uint256 lpTokens = (LP_ALLOC * lotsMinted) / TOTAL_LOTS;
        uint256 unsoldMint = (TOTAL_LOTS - lotsMinted) * TOKENS_PER_LOT;
        uint256 unusedLp = LP_ALLOC - lpTokens;
        uint256 toBurn = unsoldMint + unusedLp;
        if (toBurn > 0) {
            super._update(address(this), DEAD, toBurn);
        }

        IPancakeFactory factory = IPancakeFactory(router.factory());
        address wbnb = router.WETH();
        address p = factory.getPair(address(this), wbnb);
        if (p == address(0)) {
            p = factory.createPair(address(this), wbnb);
        }
        pair = p;
        dividendTracker.excludeFromDividends(p, true);

        uint256 bnbForLp = raisedBnb;
        raisedBnb = 0;
        tradingLive = true;

        super._update(address(this), p, lpTokens);
        IWBNB(wbnb).deposit{value: bnbForLp}();
        require(IWBNB(wbnb).transfer(p, bnbForLp), "wbnb transfer failed");
        IPancakePair(p).mint(DEAD);
        IPancakePair(p).sync();

        emit Launched(lpTokens, bnbForLp, p);
    }

    // ================= Admin & Tax Operations =================

    function flushTax() external nonReentrant {
        require(tradingLive && pair != address(0), "trading not live");
        uint256 bal = balanceOf(address(this));
        require(bal > 0, "no tax tokens");
        _swapAndDistribute(bal);
    }

    function setSwapThreshold(uint256 newThreshold) external onlyOwner {
        require(
            newThreshold >= 1_000_000 ether && newThreshold <= 1_000_000_000 ether,
            "invalid threshold"
        );
        swapThreshold = newThreshold;
    }

    function _swapAndDistribute(uint256 tokenAmount) internal {
        _inSwap = true;
        _approve(address(this), address(router), tokenAmount);

        address[] memory path = new address[](2);
        path[0] = address(this);
        path[1] = router.WETH();

        uint256 bnbBefore = address(this).balance;
        try
            router.swapExactTokensForETHSupportingFeeOnTransferTokens(
                tokenAmount,
                0,
                path,
                address(this),
                block.timestamp
            )
        {
            uint256 bnbReceived = address(this).balance - bnbBefore;
            if (bnbReceived > 0) {
                uint256 divPart = bnbReceived / 2;
                uint256 mktPart = bnbReceived - divPart;
                if (divPart > 0) {
                    dividendTracker.distributeDividends{value: divPart}();
                }
                if (mktPart > 0) {
                    (bool ok, ) = payable(communityWallet).call{value: mktPart}("");
                    ok;
                }
                emit TaxDistributed(tokenAmount, divPart, mktPart);
            }
        } catch {}

        _inSwap = false;
    }

    // ================= ERC20 Transfer & Dividend Hook =================

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            if (from != address(0)) {
                try dividendTracker.setBalance(from, balanceOf(from)) {} catch {}
            }
            if (to != address(0)) {
                try dividendTracker.setBalance(to, balanceOf(to)) {} catch {}
            }
            return;
        }

        if (!tradingLive) {
            require(from == address(this) || to == address(this), "trading not live");
        }

        bool isBuy = (pair != address(0) && from == pair);
        bool isSell = (pair != address(0) && to == pair);

        if (
            tradingLive &&
            !_inSwap &&
            isSell &&
            balanceOf(address(this)) >= swapThreshold
        ) {
            _swapAndDistribute(swapThreshold);
        }

        uint256 fee;
        if (
            tradingLive &&
            !_inSwap &&
            (isBuy || isSell) &&
            !isExempt[from] &&
            !isExempt[to]
        ) {
            fee = (value * TAX_BPS) / 10_000;
        }

        if (fee > 0) {
            super._update(from, address(this), fee);
            value -= fee;
        }

        super._update(from, to, value);

        try dividendTracker.setBalance(from, balanceOf(from)) {} catch {}
        try dividendTracker.setBalance(to, balanceOf(to)) {} catch {}
    }

    receive() external payable {}
}
