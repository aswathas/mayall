// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {SpotOracle} from "./SpotOracle.sol";

/**
 * @title CollateralVault
 * @notice Deliberately vulnerable lending vault. Holds lender ETH and values
 *         borrower collateral at the SpotOracle price, which can be inflated
 *         with a flash loan and unwound before the transaction ends.
 */
contract CollateralVault {
    SpotOracle public immutable oracle;

    mapping(address => uint256) public collateral; // wei deposited
    mapping(address => uint256) public debt;

    uint256 public lenderFunds;
    uint256 public constant LTV_BPS = 5000; // 50%

    constructor(SpotOracle oracle_) {
        oracle = oracle_;
    }

    function fund() external payable {
        lenderFunds += msg.value;
    }

    function deposit() external payable {
        collateral[msg.sender] += msg.value;
    }

    function maxBorrow(address who) public view returns (uint256) {
        uint256 units = collateral[who] / 1e18;
        return (units * oracle.price() * LTV_BPS) / 10000;
    }

    function borrow(uint256 amount) external {
        require(amount <= maxBorrow(msg.sender), "exceeds ltv");
        debt[msg.sender] += amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
    }
}
