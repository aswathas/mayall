// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SpotOracle
 * @notice Deliberately vulnerable quote bond. The reported price is derived
 *         from the total ETH bond in the contract, and a depositor can unwind
 *         its bond IMMEDIATELY — there is no unbonding delay and no TWAP. A
 *         flash loan therefore buys an arbitrarily large price move for the
 *         duration of a single transaction.
 *
 * Vulnerability class: spot-price oracle with instant bond unwind.
 */
contract SpotOracle {
    uint256 public constant BASE_UNITS = 100;

    mapping(address => uint256) public bonds;
    uint256 public totalBond;

    function push() external payable {
        require(msg.value > 0, "no bond");
        bonds[msg.sender] += msg.value;
        totalBond += msg.value;
    }

    /// @dev VULNERABLE: the bond can be withdrawn in the same block, or even
    /// the same transaction, as the price move it created.
    function unwind() external {
        uint256 amt = bonds[msg.sender];
        bonds[msg.sender] = 0;
        totalBond -= amt;
        (bool ok,) = msg.sender.call{value: amt}("");
        require(ok, "unwind failed");
    }

    function price() public view returns (uint256) {
        return totalBond == 0 ? 1e18 : (totalBond * 1e18) / BASE_UNITS;
    }
}
