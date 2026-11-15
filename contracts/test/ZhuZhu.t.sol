// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AgentIdRegistry} from "../src/AgentIdRegistry.sol";
import {ZhuZhuToken} from "../src/ZhuZhuToken.sol";
import {ZhuZhuDividendTracker} from "../src/ZhuZhuDividendTracker.sol";

contract MockWBNB {
    mapping(address => uint256) public balanceOf;
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}

contract MockPair {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    function mint(address to) external returns (uint256 liq) {
        liq = 1000 ether;
        totalSupply += liq;
        balanceOf[to] += liq;
    }
    function sync() external {}
}

contract MockFactory {
    mapping(address => mapping(address => address)) public getPair;
    function createPair(address a, address b) external returns (address p) {
        p = address(new MockPair());
        getPair[a][b] = p;
        getPair[b][a] = p;
    }
}

contract MockRouter {
    address public immutable factory;
    address public immutable WETH;
    uint256 public swapPayoutBnb = 0.2 ether;

    constructor(address _f, address _w) {
        factory = _f;
        WETH = _w;
    }

    receive() external payable {}

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint256 amountIn,
        uint256,
        address[] calldata path,
        address to,
        uint256
    ) external {
        address p = MockFactory(factory).getPair(path[0], path[1]);
        IERC20(path[0]).transferFrom(msg.sender, p, amountIn);
        (bool ok, ) = payable(to).call{value: swapPayoutBnb}("");
        require(ok, "mock payout fail");
    }
}

contract ZhuZhuTest is Test {
    AgentIdRegistry registry;
    ZhuZhuToken token;
    ZhuZhuDividendTracker tracker;
    MockWBNB wbnb;
    MockFactory factory;
    MockRouter router;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address smallHolder = makeAddr("smallHolder");
    address normie = makeAddr("normie");
    address community = makeAddr("community");
    address userWallet = 0x7B3024717969CA7C3dcd5aA681FAFF7B335Da1B8;

    function setUp() public {
        wbnb = new MockWBNB();
        factory = new MockFactory();
        router = new MockRouter(address(factory), address(wbnb));
        vm.deal(address(router), 20 ether);

        registry = new AgentIdRegistry();
        address[] memory accts = new address[](3);
        string[] memory handles = new string[](3);
        accts[0] = userWallet;
        handles[0] = "zhuzhu-7b30";
        accts[1] = alice;
        handles[1] = "alice";
        accts[2] = bob;
        handles[2] = "bob";
        registry.setHandlesBatch(accts, handles);

        token = new ZhuZhuToken(
            address(router),
            address(registry),
            community,
            0
        );
        tracker = ZhuZhuDividendTracker(payable(token.DIVIDEND_TRACKER()));

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(normie, 10 ether);
        vm.deal(userWallet, 10 ether);
    }

    function test_AgentIdVerificationAndSelfRegister() public {
        assertTrue(token.hasAgentId(userWallet));
        assertEq(token.agentHandleOf(userWallet), "zhuzhu-7b30");
        assertEq(registry.handleOf(alice), "alice");
        assertFalse(token.hasAgentId(normie));

        vm.prank(normie);
        vm.expectRevert("Binance AI Agent ID (.ai) required");
        token.mint{value: 0}(1);

        vm.prank(normie);
        registry.register("normie-bot");
        assertTrue(token.hasAgentId(normie));
        assertEq(registry.handleOf(normie), "normie-bot");

        vm.prank(normie);
        token.mint{value: 0}(1);
        assertEq(token.balanceOf(normie), 60_000_000 ether);
        assertTrue(token.hasClaimedFree(normie));
        assertEq(token.freeLotsMinted(), 1);
    }

    function test_MintPricingAndWalletCap() public {
        assertEq(token.LOT_PRICE(), 0.002 ether);
        assertEq(token.MAX_LOTS_PER_WALLET(), 10);
        assertEq(token.TOTAL_LOTS(), 10_000);
        assertEq(token.FREE_LOTS(), 1_000);
        assertEq(token.FREE_LOTS_PER_WALLET(), 1);
        assertEq(token.TOKENS_PER_LOT(), 60_000_000 ether);
        assertEq(token.totalSupply(), 1_000_000_000_000 ether);
        assertEq(token.balanceOf(community), 100_000_000_000 ether);

        // Wrong BNB reverts (first 4 lots on fresh wallet = 1 free + 3 paid = 0.006 BNB)
        vm.prank(alice);
        vm.expectRevert("incorrect BNB amount");
        token.mint{value: 0.008 ether}(4);

        // Mint 4 lots = 0.006 BNB (1st lot free, 3 paid lots) -> 240M ZHUZHU
        vm.prank(alice);
        token.mint{value: 0.006 ether}(4);
        assertEq(token.mintedLots(alice), 4);
        assertEq(token.lotsMinted(), 4);
        assertEq(token.freeLotsMinted(), 1);
        assertTrue(token.hasClaimedFree(alice));
        assertEq(token.balanceOf(alice), 240_000_000 ether);

        // Trying another free 0 BNB lot on same wallet reverts
        vm.prank(alice);
        vm.expectRevert("already claimed 1 free lot");
        token.mint{value: 0}(1);

        // Mint remaining 6 paid lots -> 10 lots total = 0.018 BNB -> 600M ZHUZHU
        vm.prank(alice);
        token.mint{value: 0.012 ether}(6);
        assertEq(token.mintedLots(alice), 10);
        assertEq(token.balanceOf(alice), 600_000_000 ether);

        // 11th lot reverts
        vm.prank(alice);
        vm.expectRevert("wallet cap reached");
        token.mint{value: 0.002 ether}(1);
    }

    function test_FreeCapStopsAt1000AndChargesFullPriceAfter() public {
        for (uint256 i = 0; i < 1_000; i++) {
            address minter = address(uint160(0x20000 + i));
            vm.prank(minter);
            registry.register(string(abi.encodePacked("free-", vm.toString(i))));
            vm.prank(minter);
            token.mint{value: 0}(1);
        }

        assertEq(token.freeLotsMinted(), 1_000);
        assertEq(token.lotsMinted(), 1_000);
        assertEq(token.raisedBnb(), 0);
        assertFalse(token.canClaimFree(alice));

        (uint256 costWei, uint256 freeUsed) = token.quoteMintCost(alice, 1);
        assertEq(costWei, 0.002 ether);
        assertEq(freeUsed, 0);

        vm.prank(alice);
        vm.expectRevert("incorrect BNB amount");
        token.mint{value: 0}(1);

        vm.prank(alice);
        token.mint{value: 0.002 ether}(1);
        assertEq(token.balanceOf(alice), 60_000_000 ether);
    }

    function test_AutoLaunchAt10000LotsAndLpBurned() public {
        // 1,000 wallets x 10 lots (1 free + 9 paid = 0.018 BNB each) = 10,000 lots = 18 BNB
        for (uint256 i = 0; i < 1_000; i++) {
            address minter = address(uint160(0x10000 + i));
            vm.deal(minter, 1 ether);
            vm.prank(minter);
            registry.register(string(abi.encodePacked("agent-", vm.toString(i))));
            vm.prank(minter);
            token.mint{value: 0.018 ether}(10);
        }

        assertEq(token.lotsMinted(), 10_000);
        assertEq(token.freeLotsMinted(), 1_000);
        assertTrue(token.tradingLive());
        assertFalse(token.mintOpen());
        assertEq(token.raisedBnb(), 0);

        address pair = token.pair();
        assertTrue(pair != address(0));
        assertEq(token.balanceOf(pair), 300_000_000_000 ether);
        assertEq(wbnb.balanceOf(pair), 18 ether);
        assertEq(MockPair(pair).balanceOf(token.DEAD()), 1000 ether);
    }

    function test_ManualLaunchPartialMintBurnsUnsold() public {
        // 2 lots on fresh Alice: 1 free + 1 paid = 0.002 BNB
        vm.prank(alice);
        token.mint{value: 0.002 ether}(2);

        token.launch();
        assertTrue(token.tradingLive());
        address pair = token.pair();
        uint256 expectedLpTokens = (token.LP_ALLOC() * 2) / 10_000;
        assertEq(token.balanceOf(pair), expectedLpTokens);
        assertEq(wbnb.balanceOf(pair), 0.002 ether);
        assertGt(token.balanceOf(token.DEAD()), 0);

        // Minting after launch reverts
        vm.prank(bob);
        vm.expectRevert("mint closed");
        token.mint{value: 0}(1);
    }

    function test_TaxSwapAndHoldToEarnDividends() public {
        // Alice mints 10 lots (0.018 BNB), Bob mints 10 lots (0.018 BNB)
        vm.prank(alice);
        token.mint{value: 0.018 ether}(10);
        vm.prank(bob);
        token.mint{value: 0.018 ether}(10);

        token.launch();
        address pair = token.pair();

        // Bob transfers 500k ZHUZHU (< 1M threshold) to smallHolder -> not eligible
        vm.prank(bob);
        token.transfer(smallHolder, 500_000 ether);
        assertFalse(tracker.isEligible(smallHolder));
        assertTrue(tracker.isEligible(alice));

        // Lower swap threshold for 20-lot test pool and simulate two 100M buys (3% = 3M tax each)
        token.setSwapThreshold(5_000_000 ether);

        vm.prank(pair);
        token.transfer(bob, 100_000_000 ether);
        assertEq(token.balanceOf(address(token)), 3_000_000 ether);

        vm.prank(pair);
        token.transfer(bob, 100_000_000 ether);
        assertEq(token.balanceOf(address(token)), 6_000_000 ether);

        uint256 communityBnbBefore = community.balance;

        // Alice sells 50M ZHUZHU to pair -> triggers auto swap of 5M tax tokens for 0.2 BNB!
        // Split 50/50: 0.1 BNB to DividendTracker, 0.1 BNB to communityWallet
        vm.prank(alice);
        token.transfer(pair, 50_000_000 ether);

        assertEq(community.balance - communityBnbBefore, 0.1 ether);
        assertApproxEqAbs(tracker.totalDistributed(), 0.1 ether, 1e12);
        assertEq(tracker.withdrawable(smallHolder), 0);

        uint256 aliceWithdrawable = tracker.withdrawable(alice);
        uint256 bobWithdrawable = tracker.withdrawable(bob);
        assertGt(aliceWithdrawable, 0);
        assertGt(bobWithdrawable, 0);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(alice);
        tracker.claim();
        assertEq(alice.balance - aliceBalBefore, aliceWithdrawable);
        assertEq(tracker.withdrawable(alice), 0);
    }

    function test_PendingDividendsBeforeEligibleHolder() public {
        // Send 0.05 BNB while eligibleSupply == 0
        (bool ok, ) = payable(address(tracker)).call{value: 0.05 ether}("");
        assertTrue(ok);
        assertEq(tracker.pendingDividends(), 0.05 ether);

        // First eligible minter receives queued dividends once eligibleSupply > 0
        vm.prank(alice);
        token.mint{value: 0}(1);
        assertEq(tracker.pendingDividends(), 0);
        assertApproxEqAbs(tracker.withdrawable(alice), 0.05 ether, 1e12);
    }
}
