// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AgentIdRegistry} from "../src/AgentIdRegistry.sol";
import {ZhuZhuToken} from "../src/ZhuZhuToken.sol";
import {ZhuZhuDividendTracker} from "../src/ZhuZhuDividendTracker.sol";

contract DeployScript is Script {
    address constant OFFICIAL_MAINNET_AGENT_REGISTRY =
        0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address constant USER_DEMO_WALLET =
        0x7B3024717969CA7C3dcd5aA681FAFF7B335Da1B8;
    address constant AGENT_WORKER_WALLET =
        0xE7FcffFf2786851A1Db2429D3785c84b17415C58;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address router = block.chainid == 97
            ? vm.envOr(
                "PANCAKE_TESTNET_ROUTER",
                address(0xD99D1c33F9fC3444f8101754aBC46c52416550D1)
            )
            : vm.envOr(
                "PANCAKE_ROUTER",
                address(0x10ED43C718714eb63d5aA57B78B54704E256024E)
            );

        address communityWallet = vm.envOr("MARKETING_WALLET", deployer);
        uint256 mintStartTime = vm.envOr("MINT_START_TIME", uint256(0));

        vm.startBroadcast(pk);

        address agentRegistry;
        if (block.chainid == 56) {
            agentRegistry = vm.envOr(
                "MAINNET_AGENT_REGISTRY",
                OFFICIAL_MAINNET_AGENT_REGISTRY
            );
        } else {
            AgentIdRegistry reg = new AgentIdRegistry();
            address[] memory accts = new address[](3);
            string[] memory handles = new string[](3);
            accts[0] = USER_DEMO_WALLET;
            handles[0] = "zhuzhu-7b30";
            accts[1] = deployer;
            handles[1] = "zhuzhu-admin";
            accts[2] = AGENT_WORKER_WALLET;
            handles[2] = "zhuzhu-agent";
            reg.setHandlesBatch(accts, handles);
            agentRegistry = address(reg);
        }

        ZhuZhuToken token = new ZhuZhuToken(
            router,
            agentRegistry,
            communityWallet,
            mintStartTime
        );

        address tracker = token.DIVIDEND_TRACKER();

        // On Testnet / Anvil, seed 1 initial mint (0.02 BNB) + 0.005 BNB dividend pool for live preview
        if (block.chainid != 56) {
            token.mint{value: 0.02 ether}(1);
            ZhuZhuDividendTracker(payable(tracker)).distributeDividends{value: 0.005 ether}();
        }

        vm.stopBroadcast();

        console2.log("Chain ID         :", block.chainid);
        console2.log("Deployer         :", deployer);
        console2.log("AGENT_REGISTRY   :", agentRegistry);
        console2.log("ZHUZHU_TOKEN     :", address(token));
        console2.log("DIVIDEND_TRACKER :", tracker);
    }
}
