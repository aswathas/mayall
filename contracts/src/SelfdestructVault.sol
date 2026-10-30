// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SelfdestructVault
 * @notice Deliberately vulnerable escrow. setOwner() is missing its onlyOwner
 *         modifier, so any address can become owner and then call destroy(),
 *         which selfdestructs to the owner and force-sends the escrow balance.
 *
 * Vulnerability class: broken access control escalating to forced ETH transfer.
 */
contract SelfdestructVault {
    address public owner;
    mapping(address => uint256) public balances;

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    function deposit() external payable {
        balances[msg.sender] += msg.value;
    }

    /// @dev VULNERABLE: the onlyOwner modifier is missing on this setter.
    function setOwner(address newOwner) external {
        owner = newOwner;
    }

    function destroy() external onlyOwner {
        selfdestruct(payable(owner));
    }
}
