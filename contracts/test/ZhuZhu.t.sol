// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentWalletRegistry} from "../src/AgentWalletRegistry.sol";
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
    constructor(address _f, address _w) { factory = _f; WETH = _w; }
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256, address[] calldata, address, uint256
    ) external payable {}
}

contract ZhuZhuTest is Test {
    AgentWalletRegistry registry;
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
    address normie = makeAddr("normie");
    address marketing = makeAddr("marketing");
    address team = makeAddr("team");
    uint256 verifierPk = 0xA11CE;
    address verifier;

    function setUp() public {
        verifier = vm.addr(verifierPk);
        wbnb = new MockWBNB();
        factory = new MockFactory();
        router = new MockRouter(address(factory), address(wbnb));

        registry = new AgentWalletRegistry(verifier, false);
        pool = new GamePool();
        vesting = new TeamVesting(team, uint64(block.timestamp), 90 days, 365 days);
        token = new ZhuZhuToken(
            address(router),
            address(pool),
            address(vesting),
            marketing,
            address(registry)
        );
        badge = new PigBadge(
            address(token),
            address(pool),
            address(registry),
            verifier,
            ""
        );

        pool.init(address(token), address(badge));
        pool.renounceOwnership();

        vm.prank(alice);
        registry.activateAgentWallet("alice.ai", 0, "");
        vm.prank(bob);
        registry.activateAgentWallet("bob.ai", 0, "");
        vm.prank(agent);
        registry.activateAgentWallet("bot.ai", 0, "");

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(normie, 10 ether);
    }

    function test_PackMintAndReferral() public {
        vm.prank(alice);
        token.mintPacks{value: 0.02 ether}(2, address(0));
        assertEq(token.balanceOf(alice), 2_000 ether);
        assertEq(token.packsOf(alice), 2);
        assertEq(token.opsBnb(), 0.001 ether);     // 5% of 0.02
        assertEq(token.buybackBnb(), 0.003 ether); // 10% + 5% = 15% of 0.02

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

        vm.startPrank(alice);
        token.approve(address(badge), type(uint256).max);
        uint256 id = badge.mint();
        assertEq(token.balanceOf(alice), 9_500 ether);
        badge.assignAgent(id, agent);
        vm.stopPrank();

        // Cannot work before tradingOpen
        vm.prank(agent);
        vm.expectRevert("trading not open");
        badge.work(id);

        // Fast-forward past 72h mint window and launch
        vm.warp(block.timestamp + 73 hours);
        token.launch();
        assertTrue(token.tradingOpen());
        assertTrue(MockPair(token.pair()).balanceOf(token.DEAD()) > 0);

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
        assertGt(token.balanceOf(alice), 9_500 ether);

        // Alice levels up to Lv2 (rebalanced: burns 300 ZHUZHU)
        uint256 balBeforeUpgrade = token.balanceOf(alice);
        vm.prank(alice);
        badge.levelUp(id);
        assertEq(balBeforeUpgrade - token.balanceOf(alice), 300 ether);
        (lvl, xp, , , , , ) = badge.badges(id);
        assertEq(lvl, 2);
        assertEq(xp, 0);

        // Transferring badge revokes agent
        vm.prank(alice);
        badge.transferFrom(alice, bob, id);
        (, , , , , assigned, ) = badge.badges(id);
        assertEq(assigned, address(0));
    }

    function test_TeamVestingCliffSchedule() public {
        uint256 start = block.timestamp;
        vm.warp(start + 89 days);
        assertEq(vesting.releasable(address(token)), 0);

        vm.warp(start + 90 days);
        assertEq(vesting.releasable(address(token)), 0);

        vm.warp(start + 90 days + 182 days + 12 hours);
        assertApproxEqRel(vesting.releasable(address(token)), 500_000 ether, 1e15);

        vm.warp(start + 90 days + 365 days);
        assertEq(vesting.releasable(address(token)), 1_000_000 ether);
    }

    function test_AssignAgentWithSigAndReplayProtection() public {
        vm.prank(alice);
        token.mintPacks{value: 0.01 ether}(1, address(0));

        vm.startPrank(alice);
        token.approve(address(badge), type(uint256).max);
        uint256 id = badge.mint();
        vm.stopPrank();

        bytes32 agentIdHash = keccak256("bot.ai");
        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = badge.nonces(id);

        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256("PigBadge"),
                keccak256("1"),
                block.chainid,
                address(badge)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(badge.ASSIGN_TYPEHASH(), id, alice, agent, agentIdHash, nonce, deadline)
        );
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(verifierPk, digest);
        bytes memory sig = abi.encodePacked(r, s, v);

        vm.prank(alice);
        badge.assignAgentWithSig(id, agent, agentIdHash, deadline, sig);

        (, , , , , address assigned, bool verified) = badge.badges(id);
        assertEq(assigned, agent);
        assertTrue(verified);
        assertEq(badge.nonces(id), 1);

        vm.prank(alice);
        vm.expectRevert("bad sig");
        badge.assignAgentWithSig(id, agent, agentIdHash, deadline, sig);
    }

    function test_OnChainTokenURIAndGetAgentBadges() public {
        vm.prank(alice);
        token.mintPacks{value: 0.01 ether}(1, address(0));

        vm.startPrank(alice);
        token.approve(address(badge), type(uint256).max);
        uint256 id = badge.mint();
        badge.assignAgent(id, agent);
        vm.stopPrank();

        string memory uri = badge.tokenURI(id);
        assertTrue(_startsWith(uri, "data:application/json;base64,"));

        (bool readyZero, uint256 nextZero) = badge.canWork(999);
        assertFalse(readyZero);
        assertEq(nextZero, 0);

        vm.warp(block.timestamp + 73 hours);
        token.launch();

        (uint256[] memory ids, bool[] memory readyList, ) = badge.getAgentBadges(agent);
        assertEq(ids.length, 1);
        assertEq(ids[0], id);
        assertTrue(readyList[0]);
    }

    function test_RevertWhenNonAgentWalletParticipates() public {
        // Non-agent wallet cannot mintPacks
        vm.prank(normie);
        vm.expectRevert("only BSC AI Agent Wallet");
        token.mintPacks{value: 0.01 ether}(1, address(0));

        // Alice mints pack & badge, cannot delegate to non-agent wallet
        vm.prank(alice);
        token.mintPacks{value: 0.01 ether}(1, address(0));
        vm.startPrank(alice);
        token.approve(address(badge), type(uint256).max);
        uint256 id = badge.mint();
        vm.expectRevert("agent must be AI Agent Wallet");
        badge.assignAgent(id, normie);
        vm.stopPrank();

        // Non-.ai suffix is rejected
        vm.prank(normie);
        vm.expectRevert("must end with .ai");
        registry.activateAgentWallet("normie.com", 0, "");

        // After activating normie.ai, normie can mintPacks
        vm.prank(normie);
        registry.activateAgentWallet("normie.ai", 0, "");
        vm.prank(normie);
        token.mintPacks{value: 0.01 ether}(1, address(0));
        assertEq(token.balanceOf(normie), 1_000 ether);
    }

    function test_LaunchZeroPacksDoesNotLock() public {
        vm.warp(block.timestamp + 73 hours);
        token.launch();
        assertTrue(token.tradingOpen());
        assertEq(token.pair(), address(0));
    }

    function _startsWith(string memory full, string memory prefix) internal pure returns (bool) {
        bytes memory f = bytes(full);
        bytes memory p = bytes(prefix);
        if (f.length < p.length) return false;
        for (uint256 i = 0; i < p.length; i++) {
            if (f[i] != p[i]) return false;
        }
        return true;
    }
}
