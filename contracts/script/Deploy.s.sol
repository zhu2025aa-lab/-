// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {GamePool} from "../src/GamePool.sol";
import {TeamVesting} from "../src/TeamVesting.sol";
import {ZhuZhuToken} from "../src/ZhuZhuToken.sol";
import {PigBadge} from "../src/PigBadge.sol";

contract DeployScript is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address defaultRouter = block.chainid == 97
            ? address(0xD99D1c33F9fC3444f8101754aBC46c52416550D1) // BSC Testnet Pancake V2 Router
            : address(0x10ED43C718714eb63d5aA57B78B54704E256024E); // BSC Mainnet Pancake V2 Router

        address router = vm.envOr("PANCAKE_ROUTER", defaultRouter);
        if (block.chainid == 97) {
            router = vm.envOr("PANCAKE_TESTNET_ROUTER", defaultRouter);
        }

        address teamBeneficiary = vm.envOr("TEAM_BENEFICIARY", deployer);
        address marketing = vm.envOr("MARKETING_WALLET", deployer);
        address verifier = vm.envOr("AGENT_VERIFIER_SIGNER", address(0));
        string memory baseURI = vm.envOr("BADGE_BASE_URI", string("https://zhuzhu.xyz/api/badge/"));

        vm.startBroadcast(pk);

        // 1. Deploy GamePool
        GamePool pool = new GamePool();

        // 2. Deploy TeamVesting (90d cliff, 365d linear after start)
        TeamVesting vesting = new TeamVesting(
            teamBeneficiary,
            uint64(block.timestamp),
            90 days,
            365 days
        );

        // 3. Deploy ZhuZhuToken
        ZhuZhuToken token = new ZhuZhuToken(
            router,
            address(pool),
            address(vesting),
            marketing
        );

        // 4. Deploy PigBadge
        PigBadge badge = new PigBadge(
            address(token),
            address(pool),
            verifier,
            baseURI
        );

        // 5. Initialize GamePool & renounce ownership
        pool.init(address(token), address(badge));
        pool.renounceOwnership();

        vm.stopBroadcast();

        console2.log("Chain ID   :", block.chainid);
        console2.log("Deployer   :", deployer);
        console2.log("GamePool   :", address(pool));
        console2.log("TeamVesting:", address(vesting));
        console2.log("ZhuZhuToken:", address(token));
        console2.log("PigBadge   :", address(badge));
    }
}
