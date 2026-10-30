This report covers a local reproduction, not a live deployment exploit. Within a simulated 200-transaction session, transaction index 137 carried a reentrancy attack that drained 6 ETH from SessionVault.

The flaw sits in SessionVault (0x5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f), in withdraw(). It sends ETH to msg.sender before zeroing balances[msg.sender].

That ordering made the attack possible. The attacker contract (0xF62849F9A0B5Bf2913b396098F7c7019b51A820a) deposited 1 ETH to open a withdrawable balance, then called withdraw(). Because the vault pays out before updating state, receive() re-entered withdraw() six times inside the same transaction. Every nested call passed the same balance check, so the vault paid the same balance out seven times in one transaction.

SessionVault fell from 905750000000000000000 wei to 899750000000000000000 wei, a loss of 6000000000000000000 wei (6 ETH), while the attacker contract rose from 1000000000000000000 to 7000000000000000000 wei. Detection confidence is 97%.

The most urgent action is to pause the vault and fix withdraw() to follow checks-effects-interactions: zero the balance before any external transfer, and add a reentrancy guard.