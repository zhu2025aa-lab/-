// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {VestingWallet} from "@openzeppelin/contracts/finance/VestingWallet.sol";

/**
 * @title TeamVesting
 * @notice 5% team allocation: 3-month cliff, then 12-month linear vesting after cliff.
 */
contract TeamVesting is VestingWallet {
    uint64 public immutable cliff;

    constructor(
        address beneficiary,
        uint64 startTimestamp,
        uint64 cliffSeconds,
        uint64 durationSeconds
    ) VestingWallet(beneficiary, startTimestamp + cliffSeconds, durationSeconds) {
        cliff = startTimestamp + cliffSeconds;
    }
}
