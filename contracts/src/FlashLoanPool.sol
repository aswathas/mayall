// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlashLoanPool
 * @notice Flash-lending pool with 10 bps fee. Sends the principal to the
 *         borrower, then requires principal + fee back inside the same
 *         transaction.
 */
contract FlashLoanPool {
    uint256 public constant FEE_BPS = 10;
    uint256 public liquidity;

    function addLiquidity() external payable {
        liquidity += msg.value;
    }

    function flashLoan(uint256 amount, address borrower) external {
        require(amount <= liquidity, "insufficient liquidity");
        uint256 fee = (amount * FEE_BPS) / 10000;
        liquidity -= amount;
        (bool ok,) = borrower.call{gas: 900000, value: amount}("");
        require(ok, "loan failed");
        require(address(this).balance >= amount + fee, "not repaid");
        liquidity += amount + fee;
    }

    receive() external payable {}
}
