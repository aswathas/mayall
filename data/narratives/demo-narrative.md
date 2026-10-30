An attacker contract drained 6 ETH from ReentrancyVault (0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f) in a local reproduction of case demo-narrative. The attacker contract (0x2e234DAe75C793f67A35089C9d99245E1C58470b) deposited 1 ETH, then triggered seven nested calls to withdraw() inside one transaction. The vault paid out 7 ETH in total, falling from 10 ETH to 4 ETH; the attacker contract rose from 1 ETH to 7 ETH, and the victim EOA balance was unchanged. This was a local test environment, not the live deployment.

The flaw is in ReentrancyVault.withdraw(). It transfers ETH to msg.sender before zeroing balances[msg.sender], so the external transfer hands control to the attacker's receive(), which calls withdraw() again before the first call completes.

Because the balance is only cleared after the external call returns, each nested call passes the same balance check and is paid again. The trace records withdraw() entered seven times and receive() invoked seven times within a single transaction, at 97% confidence.

The urgent action is to zero balances[msg.sender] before the transfer, and add a reentrancy guard to withdraw() and any other function that makes an external call.