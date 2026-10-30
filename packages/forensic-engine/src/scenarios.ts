import type { AttackVectorId, Chain } from '@helix/core';

export interface ScenarioSpec {
  id: string;
  title: string;
  vectorId: AttackVectorId;
  /** Test file relative to contracts/ */
  testFile: string;
  contractName: string;
  chain: Chain;
  description: string;
  /** What an investigator should look for in the evidence. */
  lookFor: string[];
}

export const SCENARIOS: ScenarioSpec[] = [
  {
    id: 'reentrancy',
    title: 'Re-entrant Withdrawal Drain',
    vectorId: 'reentrancy',
    testFile: 'test/ReentrancyExploit.t.sol',
    contractName: 'ReentrancyVault',
    chain: 'Ethereum',
    description:
      'A withdrawal function sends ETH to the caller before decrementing their balance. The attacker re-enters through a malicious receiver and drains the vault in a single transaction.',
    lookFor: [
      'The same withdraw() selector appearing more than once in one trace',
      'Victim balance reaching zero while the attacker balance grows',
      'Storage slot for the user balance written only after the value transfer',
    ],
  },
  {
    id: 'oracle-manipulation',
    title: 'Spot-Price Oracle Manipulation',
    vectorId: 'oracle-manipulation',
    testFile: 'test/OracleExploit.t.sol',
    contractName: 'OracleLendingPool',
    chain: 'Ethereum',
    description:
      'Collateral is priced from a naive on-chain reserve ratio that any address can push. The attacker skews the oracle and then borrows far above the true collateral value.',
    lookFor: [
      'A reserve or price storage slot mutated within the exploit transaction',
      'A borrow executed immediately after the price mutation',
      'Borrower debt exceeding the deposited collateral',
    ],
  },
  {
    id: 'access-control',
    title: 'Unguarded Privileged Mint',
    vectorId: 'access-control',
    testFile: 'test/AccessControlExploit.t.sol',
    contractName: 'AccessControlVault',
    chain: 'Ethereum',
    description:
      'The emergency mint path was added without the owner modifier, so any caller can mint an unbounded amount of share tokens to itself.',
    lookFor: [
      'A privileged function reached from an untrusted caller',
      'Share-token supply slot written without an authorisation check',
      'Attacker token balance growing from zero in a single call',
    ],
  },
  {
    id: 'flash-loan',
    title: 'Flash-Loan Price Inflation',
    vectorId: 'flash-loan',
    testFile: 'test/FlashLoanExploit.t.sol',
    contractName: 'FlashLoanPool',
    chain: 'Ethereum',
    description:
      'A flash-borrowed balance inflates the collateral price used by the lending market. The attacker takes the loan, pushes the price, borrows against the inflated collateral, repays, and keeps the difference.',
    lookFor: [
      'A large atomic value transfer at the start of the transaction',
      'Collateral price rising before the borrow step',
      'Loan repayment inside the same transaction with residual profit at the attacker',
    ],
  },
  {
    id: 'delegatecall',
    title: 'Delegatecall Implementation Injection',
    vectorId: 'delegatecall-injection',
    testFile: 'test/DelegatecallExploit.t.sol',
    contractName: 'DelegateVault',
    chain: 'Ethereum',
    description:
      'The vault forwards execution to a caller-supplied implementation via delegatecall without validating it, so the attacker writes directly into the vault storage.',
    lookFor: [
      'A delegatecall frame in the trace',
      'Balance slot of the vault written by an implementation contract',
      'Attacker balance credited without a matching deposit',
    ],
  },
  {
    id: 'selfdestruct',
    title: 'Forced-Transfer Vault Destruction',
    vectorId: 'self-destruct',
    testFile: 'test/SelfdestructExploit.t.sol',
    contractName: 'SelfdestructVault',
    chain: 'Ethereum',
    description:
      'The emergency destroy path trusts a mutable owner slot. The attacker rewrites ownership, then destroys the contract so the escrow balance is force-transferred to them.',
    lookFor: [
      'The owner slot rewritten before the destruction call',
      'A SELFDESTRUCT path in the trace',
      'Victim escrow balance moved to the attacker address',
    ],
  },
];

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));
