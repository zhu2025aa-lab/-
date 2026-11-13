// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IPancakeRouter02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable;
}

interface IPancakeFactory {
    function getPair(address tokenA, address tokenB) external view returns (address);
    function createPair(address tokenA, address tokenB) external returns (address);
}

interface IPancakePair {
    function mint(address to) external returns (uint256 liquidity);
}

interface IWBNB {
    function deposit() external payable;
    function transfer(address to, uint256 value) external returns (bool);
}

/**
 * @title ZhuZhuToken ($ZHUZHU)
 * @notice BSC Meme + DeFAI token: Pack Mint, auto LP burn on launch, buy/sell tax, buyback & burn.
 */
contract ZhuZhuToken is ERC20, ERC20Burnable, Ownable, ReentrancyGuard {
    // ---- Tokenomics (Total: 20,000,000) ----
    uint256 public constant MINT_ALLOC = 10_000_000 ether;
    uint256 public constant LP_ALLOC   =  4_000_000 ether;
    uint256 public constant GAME_ALLOC =  4_000_000 ether;
    uint256 public constant TEAM_ALLOC =  1_000_000 ether;
    uint256 public constant MKT_ALLOC  =  1_000_000 ether;

    // ---- Pack Mint ----
    uint256 public constant TOKENS_PER_PACK = 1_000 ether;
    uint256 public constant PACK_PRICE = 0.01 ether;
    uint256 public constant MAX_PACKS = 10_000;
    uint256 public constant MAX_PACKS_PER_WALLET = 10;
    uint256 public constant REF_BPS = 500;      // 5%
    uint256 public constant LP_BPS = 8000;      // 80%
    uint256 public constant BUYBACK_BPS = 1000; // 10%, remaining 5% (or 10% if no ref) -> ops

    // ---- Tax ----
    uint256 public constant MAX_TAX_BPS = 500;
    uint256 public buyTaxBps = 100;  // 1%
    uint256 public sellTaxBps = 300; // 3%
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    IPancakeRouter02 public immutable router;
    address public immutable gamePool;
    address public pair;
    uint256 public immutable mintEnd;
    bool public tradingOpen;

    uint256 public packsSold;
    uint256 public lpBnb;
    uint256 public buybackBnb;
    uint256 public opsBnb;

    mapping(address => uint256) public packsOf;
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public refRewards;
    mapping(address => bool) public isExempt;

    event PacksMinted(address indexed user, uint256 packs, address indexed ref);
    event RefRewardClaimed(address indexed user, uint256 amount);
    event Launched(uint256 tokens, uint256 bnb, address pair);
    event BuybackBurn(uint256 bnbIn);
    event TaxesLowered(uint256 buyBps, uint256 sellBps);

    constructor(
        address _router,
        address _gamePool,
        address _teamVesting,
        address _marketing
    ) ERC20("ZhuZhu Coin", "ZHUZHU") Ownable(msg.sender) {
        require(_router != address(0) && _gamePool != address(0), "zero addr");
        require(_teamVesting != address(0) && _marketing != address(0), "zero addr");

        router = IPancakeRouter02(_router);
        gamePool = _gamePool;
        mintEnd = block.timestamp + 72 hours;

        _mint(address(this), MINT_ALLOC + LP_ALLOC);
        _mint(_gamePool, GAME_ALLOC);
        _mint(_teamVesting, TEAM_ALLOC);
        _mint(_marketing, MKT_ALLOC);

        isExempt[address(this)] = true;
        isExempt[_gamePool] = true;
        isExempt[_marketing] = true;
    }

    // ================= Pack Mint =================

    function mintPacks(uint256 packs, address ref) external payable nonReentrant {
        require(!tradingOpen && block.timestamp < mintEnd, "mint closed");
        require(packs > 0, "zero");
        require(packsSold + packs <= MAX_PACKS, "sold out");
        require(packsOf[msg.sender] + packs <= MAX_PACKS_PER_WALLET, "wallet cap");
        require(msg.value == packs * PACK_PRICE, "bad value");

        if (
            referrerOf[msg.sender] == address(0) &&
            ref != address(0) &&
            ref != msg.sender &&
            packsOf[ref] > 0
        ) {
            referrerOf[msg.sender] = ref;
        }

        address r = referrerOf[msg.sender];
        uint256 refCut = r == address(0) ? 0 : (msg.value * REF_BPS) / 10_000;
        uint256 lpCut = (msg.value * LP_BPS) / 10_000;
        uint256 bbCut = (msg.value * BUYBACK_BPS) / 10_000;

        if (refCut > 0) {
            refRewards[r] += refCut;
        }
        lpBnb += lpCut;
        buybackBnb += bbCut;
        opsBnb += msg.value - refCut - lpCut - bbCut;

        packsSold += packs;
        packsOf[msg.sender] += packs;

        _transfer(address(this), msg.sender, packs * TOKENS_PER_PACK);
        emit PacksMinted(msg.sender, packs, r);
    }

    function claimRefReward() external nonReentrant {
        uint256 amt = refRewards[msg.sender];
        require(amt > 0, "none");
        refRewards[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amt}("");
        require(ok, "transfer failed");
        emit RefRewardClaimed(msg.sender, amt);
    }

    // ================= Launch =================

    /**
     * @notice Anyone can trigger launch once sold out or mint window ends.
     *         Directly transfers token + WBNB into the pair and mints LP to DEAD
     *         to prevent pair-donation frontrunning attacks.
     */
    function launch() external nonReentrant {
        require(!tradingOpen, "launched");
        require(packsSold == MAX_PACKS || block.timestamp >= mintEnd, "not yet");
        require(packsSold > 0, "no mint");

        uint256 lpTokens = (LP_ALLOC * packsSold) / MAX_PACKS;
        uint256 unsold = (MAX_PACKS - packsSold) * TOKENS_PER_PACK + (LP_ALLOC - lpTokens);
        if (unsold > 0) {
            _burn(address(this), unsold);
        }

        IPancakeFactory factory = IPancakeFactory(router.factory());
        address wbnb = router.WETH();
        address p = factory.getPair(address(this), wbnb);
        if (p == address(0)) {
            p = factory.createPair(address(this), wbnb);
        }
        pair = p;

        uint256 bnb = lpBnb;
        lpBnb = 0;

        tradingOpen = true;

        // Direct pair mint to DEAD (immune to dust donation DoS)
        super._update(address(this), p, lpTokens);
        IWBNB(wbnb).deposit{value: bnb}();
        require(IWBNB(wbnb).transfer(p, bnb), "wbnb transfer failed");
        IPancakePair(p).mint(DEAD);

        emit Launched(lpTokens, bnb, p);
    }

    // ================= Buyback & Ops =================

    function buybackAndBurn(uint256 bnbAmount, uint256 minOut) external onlyOwner nonReentrant {
        require(tradingOpen && bnbAmount > 0 && bnbAmount <= buybackBnb, "invalid");
        buybackBnb -= bnbAmount;

        address[] memory path = new address[](2);
        path[0] = router.WETH();
        path[1] = address(this);

        router.swapExactETHForTokensSupportingFeeOnTransferTokens{value: bnbAmount}(
            minOut,
            path,
            DEAD,
            block.timestamp
        );
        emit BuybackBurn(bnbAmount);
    }

    function withdrawOps(address to) external onlyOwner nonReentrant {
        require(to != address(0), "zero");
        uint256 amt = opsBnb;
        require(amt > 0, "none");
        opsBnb = 0;
        (bool ok, ) = to.call{value: amt}("");
        require(ok, "transfer failed");
    }

    /// @notice Taxes can only be lowered, never raised.
    function setTaxes(uint256 buyBps, uint256 sellBps) external onlyOwner {
        require(buyBps <= buyTaxBps && sellBps <= sellTaxBps, "only lower");
        buyTaxBps = buyBps;
        sellTaxBps = sellBps;
        emit TaxesLowered(buyBps, sellBps);
    }

    // ================= View Helpers =================

    function totalBurned() external view returns (uint256) {
        uint256 initial = MINT_ALLOC + LP_ALLOC + GAME_ALLOC + TEAM_ALLOC + MKT_ALLOC;
        uint256 deadBal = balanceOf(DEAD);
        return (initial - totalSupply()) + deadBal;
    }

    // ================= Transfer Hook =================

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0)) {
            super._update(from, to, value);
            return;
        }
        if (!tradingOpen) {
            require(isExempt[from] || isExempt[to], "pig pen closed");
        }

        uint256 fee;
        bool isBuy = (from == pair && pair != address(0));
        bool isSell = (to == pair && pair != address(0));

        if (tradingOpen && !isExempt[from] && !isExempt[to]) {
            if (isBuy) {
                fee = (value * buyTaxBps) / 10_000;
            } else if (isSell) {
                fee = (value * sellTaxBps) / 10_000;
            }
        }

        if (fee > 0) {
            if (isSell) {
                uint256 burnPart = fee / 2;
                super._update(from, address(0), burnPart);
                super._update(from, gamePool, fee - burnPart);
            } else {
                super._update(from, gamePool, fee);
            }
            value -= fee;
        }

        super._update(from, to, value);
    }

    receive() external payable {}
}
