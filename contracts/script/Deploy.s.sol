// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {SongStudyMarket} from "../src/SongStudyMarket.sol";

/// Usage (from contracts/, with .env loaded):
///   forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast
contract Deploy is Script {
    /// Arc testnet USDC ERC-20 interface (6 decimals).
    address constant ARC_USDC = 0x3600000000000000000000000000000000000000;

    function run() external returns (SongStudyMarket market) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address usdc = vm.envOr("USDC_ADDRESS", ARC_USDC);

        vm.startBroadcast(pk);
        market = new SongStudyMarket(usdc);
        vm.stopBroadcast();

        console2.log("SongStudyMarket deployed at", address(market));
    }
}
