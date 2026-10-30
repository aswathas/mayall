// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {NaivePriceOracle} from "./NaivePriceOracle.sol";

/**
 * @title OracleLendingPool
 * @notice Deliberately vulnerable lending market. Collateral is valued at the
 *         NaivePriceOracle spot price, which any caller can inflate, so a small
 *         deposit can support an arbitrarily large borrow.
 *
 * Vulnerability class: oracle manipulation leading to under-collateralised debt.
 */
contract OracleLendingPool {
    NaivePriceOracle public immutable oracle;

    mapping(address => uint256) public collateral; // wei deposited
    mapping(address => uint256) public debt;

    uint256 public constant LTV_BPS = 5000; // 50%

    constructor(NaivePriceOracle oracle_) {
        oracle = oracle_;
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
