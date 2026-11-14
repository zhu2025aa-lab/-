// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title ZhuZhuDividendTracker
 * @notice Hold-to-Earn BNB dividend tracker (`withdrawable(address)` + `claim()`).
 *         Holders with balance >= 1,000,000 $ZHUZHU automatically share BNB dividends
 *         funded from the 1.5% buy/sell tax share.
 */
contract ZhuZhuDividendTracker is Ownable, ReentrancyGuard {
    uint256 internal constant MAGNITUDE = 2 ** 128;
    uint256 public constant MIN_BALANCE = 1_000_000 ether;

    address public immutable token;
    uint256 public eligibleSupply;
    uint256 public totalDistributed;
    uint256 public pendingDividends;

    uint256 internal magnifiedDividendPerShare;
    mapping(address => uint256) public shares;
    mapping(address => int256) internal magnifiedDividendCorrections;
    mapping(address => uint256) public withdrawn;
    mapping(address => bool) public excludedFromDividends;

    event DividendsDistributed(address indexed sender, uint256 amount);
    event DividendClaimed(address indexed account, uint256 amount);
    event ExcludedFromDividends(address indexed account, bool excluded);
    event PendingDividendStored(uint256 amount);

    modifier onlyToken() {
        require(msg.sender == token, "only token");
        _;
    }

    constructor(address _token) Ownable(msg.sender) {
        require(_token != address(0), "zero token");
        token = _token;
    }

    receive() external payable {
        _distribute(msg.value);
    }

    function distributeDividends() external payable {
        _distribute(msg.value);
    }

    function excludeFromDividends(address account, bool excluded) external onlyToken {
        excludedFromDividends[account] = excluded;
        if (excluded) {
            _updateShare(account, 0);
        }
        emit ExcludedFromDividends(account, excluded);
    }

    function setBalance(address account, uint256 newBalance) external onlyToken {
        if (excludedFromDividends[account]) {
            _updateShare(account, 0);
            return;
        }
        uint256 nextShare = newBalance >= MIN_BALANCE ? newBalance : 0;
        _updateShare(account, nextShare);

        if (pendingDividends > 0 && eligibleSupply > 0) {
            _distribute(0);
        }
    }

    function isEligible(address account) external view returns (bool) {
        return !excludedFromDividends[account] && shares[account] >= MIN_BALANCE;
    }

    function accumulativeDividendOf(address account) public view returns (uint256) {
        int256 acc = int256(magnifiedDividendPerShare * shares[account]) +
            magnifiedDividendCorrections[account];
        if (acc <= 0) return 0;
        return uint256(acc) / MAGNITUDE;
    }

    function withdrawable(address account) public view returns (uint256) {
        uint256 acc = accumulativeDividendOf(account);
        uint256 w = withdrawn[account];
        return acc > w ? acc - w : 0;
    }

    function claim() external nonReentrant returns (uint256) {
        return _withdrawDividend(msg.sender);
    }

    function claimFor(address account) external nonReentrant returns (uint256) {
        require(
            msg.sender == account || msg.sender == token || msg.sender == owner(),
            "unauthorized"
        );
        return _withdrawDividend(account);
    }

    function _updateShare(address account, uint256 newShare) internal {
        uint256 oldShare = shares[account];
        if (newShare == oldShare) return;

        if (newShare > oldShare) {
            uint256 diff = newShare - oldShare;
            magnifiedDividendCorrections[account] -= int256(magnifiedDividendPerShare * diff);
            eligibleSupply += diff;
        } else {
            uint256 diff = oldShare - newShare;
            magnifiedDividendCorrections[account] += int256(magnifiedDividendPerShare * diff);
            eligibleSupply -= diff;
        }

        shares[account] = newShare;
    }

    function _distribute(uint256 amount) internal {
        if (amount == 0 && pendingDividends == 0) return;

        if (eligibleSupply == 0) {
            pendingDividends += amount;
            emit PendingDividendStored(amount);
            return;
        }

        uint256 totalAmount = amount + pendingDividends;
        pendingDividends = 0;

        magnifiedDividendPerShare += (totalAmount * MAGNITUDE) / eligibleSupply;
        totalDistributed += totalAmount;
        emit DividendsDistributed(msg.sender, totalAmount);
    }

    function _withdrawDividend(address account) internal returns (uint256) {
        uint256 amount = withdrawable(account);
        require(amount > 0, "no dividends");

        withdrawn[account] += amount;
        (bool ok, ) = payable(account).call{value: amount}("");
        require(ok, "BNB transfer failed");

        emit DividendClaimed(account, amount);
        return amount;
    }
}
