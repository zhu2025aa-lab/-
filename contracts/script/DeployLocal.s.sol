// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {GamePool} from "../src/GamePool.sol";
import {TeamVesting} from "../src/TeamVesting.sol";
import {ZhuZhuToken} from "../src/ZhuZhuToken.sol";
import {PigBadge} from "../src/PigBadge.sol";

contract LocalMockWBNB {
    mapping(address => uint256) public balanceOf;
    function deposit() external payable { balanceOf[msg.sender] += msg.value; }
    function transfer(address to, uint256 value) external returns (bool) {
        balanceOf[msg.sender] -= value;
        balanceOf[to] += value;
        return true;
    }
}

contract LocalMockPair {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    function mint(address to) external returns (uint256 liq) {
        liq = 1000 ether;
        totalSupply += liq;
        balanceOf[to] += liq;
    }
}

contract LocalMockFactory {
    mapping(address => mapping(address => address)) public getPair;
    function createPair(address a, address b) external returns (address p) {
        p = address(new LocalMockPair());
        getPair[a][b] = p;
        getPair[b][a] = p;
    }
}

contract LocalMockRouter {
    address public immutable factory;
    address public immutable WETH;
    constructor(address _f, address _w) { factory = _f; WETH = _w; }
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256, address[] calldata, address, uint256
    ) external payable {}
}

contract DeployLocalScript is Script {
    function run() external {
        // Default Anvil account #0 private key (publicly known dev key, never use on mainnet)
        uint256 pk = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
        address deployer = vm.addr(pk);

        vm.startBroadcast(pk);

        LocalMockWBNB wbnb = new LocalMockWBNB();
        LocalMockFactory factory = new LocalMockFactory();
        LocalMockRouter router = new LocalMockRouter(address(factory), address(wbnb));

        GamePool pool = new GamePool();
        TeamVesting vesting = new TeamVesting(deployer, uint64(block.timestamp), 90 days, 365 days);
        ZhuZhuToken token = new ZhuZhuToken(address(router), address(pool), address(vesting), deployer);
        PigBadge badge = new PigBadge(address(token), address(pool), address(0), "https://zhuzhu.xyz/api/badge/");

        pool.init(address(token), address(badge));
        pool.renounceOwnership();

        vm.stopBroadcast();

        console2.log("ZHUZHU_TOKEN=", address(token));
        console2.log("PIG_BADGE=", address(badge));
        console2.log("GAME_POOL=", address(pool));
    }
}
