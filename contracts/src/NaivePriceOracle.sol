// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title NaivePriceOracle
 * @notice Deliberately vulnerable price feed. The quote reserve that backs the
 *         reported price can be rewritten by ANY address, with no access
 *         control, no bond and no timelock.
 *
 * Vulnerability class: oracle manipulation (unauthenticated price input).
 */
contract NaivePriceOracle {
    uint256 public constant BASE_UNITS = 100;
    uint256 public quoteReserve;
    uint256 public pushedAt;

    /// @dev VULNERABLE: anyone can move the quote reserve in one call.
    function push(uint256 newQuote) external {
        quoteReserve = newQuote;
        pushedAt = block.timestamp;
    }

    function price() public view returns (uint256) {
        return quoteReserve == 0 ? 1e18 : (quoteReserve * 1e18) / BASE_UNITS;
    }
}
