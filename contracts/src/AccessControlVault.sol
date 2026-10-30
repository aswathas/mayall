// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AccessControlVault
 * @notice Deliberately vulnerable custodial vault. The owner path is correctly
 *         guarded, but the emergency path that moves ETH out of the contract
 *         was shipped WITHOUT the onlyOwner modifier.
 *
 * Vulnerability class: broken access control (missing modifier on a fund-moving
 * entry point).
 */
contract AccessControlVault {
    address public owner;
    mapping(address => uint256) public balances;

    event EmergencyWithdraw(address indexed to, uint256 amount);
    event OwnerWithdraw(address indexed to, uint256 amount);

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

    /// @dev VULNERABLE: the onlyOwner modifier is missing on this function.
    function emergencyWithdraw(address payable to, uint256 amount) external {
        require(amount <= address(this).balance, "insufficient");
        balances[to] += amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit EmergencyWithdraw(to, amount);
    }

    /// @dev Correctly guarded control path, for contrast.
    function ownerWithdraw(address payable to, uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "insufficient");
        balances[to] += amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit OwnerWithdraw(to, amount);
    }
}
