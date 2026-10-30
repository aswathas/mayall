// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DelegateVault
 * @notice Deliberately vulnerable vault. execute() delegatecalls into an
 *         implementation address supplied by the caller with no allowlist and
 *         no validation, so any attacker can run arbitrary code against the
 *         vault's own storage and ETH.
 *
 * Vulnerability class: unvalidated delegatecall (arbitrary implementation).
 */
contract DelegateVault {
    address public owner; // slot 0
    mapping(address => uint256) public balances; // slot 1

    constructor() {
        owner = msg.sender;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    /// @dev VULNERABLE: caller-supplied target, no allowlist, no owner check.
    function execute(address implementation, bytes calldata data) external {
        (bool ok,) = implementation.delegatecall(data);
        require(ok, "delegatecall failed");
    }

    function withdraw() external {
        uint256 b = balances[msg.sender];
        balances[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: b}("");
        require(ok, "transfer failed");
    }
}
