// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {GamePool} from "../src/GamePool.sol";
import {TeamVesting} from "../src/TeamVesting.sol";
import {ZhuZhuToken} from "../src/ZhuZhuToken.sol";
import {PigBadge} from "../src/PigBadge.sol";

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
    constructor(address _f, address _w) { factory = _f; WETH = _w; }
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256, address[] calldata, address, uint256
    ) external payable {}
}

contract ZhuZhuTest is Test {
    GamePool pool;
    TeamVesting vesting;
    ZhuZhuToken token;
    PigBadge badge;
    MockWBNB wbnb;
    MockFactory factory;
    MockRouter router;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address agent = makeAddr("agent");
    address marketing = makeAddr("marketing");
    address team = makeAddr("team");

    function setUp() public {
        wbnb = new MockWBNB();
        factory = new MockFactory();
        router = new MockRouter(address(factory), address(wbnb));

        pool = new GamePool();
        vesting = new TeamVesting(team, uint64(block.timestamp), 90 days, 365 days);
        token = new ZhuZhuToken(address(router), address(pool), address(vesting), marketing);
        badge = new PigBadge(address(token), address(pool), address(0), "https://zhuzhu.xyz/api/badge/");

        pool.init(address(token), address(badge));
        pool.renounceOwnership();

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function test_PackMintAndReferral() public {
        vm.prank(alice);
        token.mintPacks{value: 0.02 ether}(2, address(0));
        assertEq(token.balanceOf(alice), 2_000 ether);
        assertEq(token.packsOf(alice), 2);

        vm.prank(bob);
        token.mintPacks{value: 0.01 ether}(1, alice);
        assertEq(token.refRewards(alice), 0.0005 ether);

        uint256 beforeBal = alice.balance;
        vm.prank(alice);
        token.claimRefReward();
        assertEq(alice.balance - beforeBal, 0.0005 ether);
    }

    function test_LaunchAndPigBadgeWorkflow() public {
        vm.prank(alice);
        token.mintPacks{value: 0.1 ether}(10, address(0)); // 10,000 ZHUZHU

        // Fast-forward past 72h mint window
        vm.warp(block.timestamp + 73 hours);
        token.launch();
        assertTrue(token.tradingOpen());
        assertTrue(MockPair(token.pair()).balanceOf(token.DEAD()) > 0);

        // Alice approves & mints badge (burns 500 ZHUZHU)
        vm.startPrank(alice);
        token.approve(address(badge), type(uint256).max);
        uint256 id = badge.mint();
        assertEq(token.balanceOf(alice), 9_500 ether);
        badge.assignAgent(id, agent);
        vm.stopPrank();

        // Agent works 10 times (8h cooldown each) -> 100 XP
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(agent);
            badge.work(id);
            vm.warp(block.timestamp + 8 hours);
        }

        (uint8 lvl, uint32 xp, uint32 pigs, , , address assigned, ) = badge.badges(id);
        assertEq(lvl, 1);
        assertEq(xp, 100);
        assertEq(pigs, 11); // 1 initial + 10 works
        assertEq(assigned, agent);
        assertGt(token.balanceOf(alice), 9_500 ether); // earned ZHUZHU rewards

        // Alice levels up to Lv2 (burns 1,000 ZHUZHU)
        uint256 balBeforeUpgrade = token.balanceOf(alice);
        vm.prank(alice);
        badge.levelUp(id);
        assertEq(balBeforeUpgrade - token.balanceOf(alice), 1_000 ether);
        (lvl, xp, , , , , ) = badge.badges(id);
        assertEq(lvl, 2);
        assertEq(xp, 0);

        // Transferring badge revokes agent
        vm.prank(alice);
        badge.transferFrom(alice, bob, id);
        (, , , , , assigned, ) = badge.badges(id);
        assertEq(assigned, address(0));
    }
}
