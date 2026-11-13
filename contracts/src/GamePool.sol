// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GamePool
 * @notice Holds 20% Game Pool allocation + tax refills; only PigBadge distributor can payout.
 */
contract GamePool is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public token;
    address public distributor;

    event Initialized(address indexed token, address indexed distributor);
    event PaidOut(address indexed to, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /// @notice One-time initialization. Recommend renouncing ownership after calling.
    function init(address _token, address _distributor) external onlyOwner {
        require(address(token) == address(0), "inited");
        require(_token != address(0) && _distributor != address(0), "zero addr");
        token = IERC20(_token);
        distributor = _distributor;
        emit Initialized(_token, _distributor);
    }

    function payout(address to, uint256 amount) external returns (uint256 paid) {
        require(msg.sender == distributor, "not distributor");
        uint256 bal = token.balanceOf(address(this));
        paid = amount > bal ? bal : amount;
        if (paid > 0) {
            token.safeTransfer(to, paid);
            emit PaidOut(to, paid);
        }
    }
}
