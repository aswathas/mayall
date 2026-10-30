/**
 * Real measured data only. Every number here is read from
 * `artifacts/summary.json`, `artifacts/reentrancy.json`, the replay bundle's
 * `evidence/trace.txt`, or the registry in `packages/core/src/incidents.ts`.
 * Nothing is invented and nothing is randomised at render time.
 */

export interface TraceFrame {
  depth: number;
  contract: string;
  fn: string;
  gas: number;
  kind: 'root' | 'call' | 'withdraw' | 'receive';
}

/** The re-entrant withdrawal ladder, exactly as `forge -vvvv` emitted it. */
export const TRACE_LADDER: TraceFrame[] = [
  { depth: 0, contract: 'ReentrancyExploitTest', fn: 'testExploit', gas: 2098601, kind: 'root' },
  { depth: 1, contract: 'ReentrancyVault', fn: 'deposit', gas: 67065, kind: 'call' },
  { depth: 1, contract: 'ReentrancyAttacker', fn: 'attack', gas: 195418, kind: 'call' },
  { depth: 2, contract: 'ReentrancyVault', fn: 'deposit', gas: 28901, kind: 'call' },
  { depth: 2, contract: 'ReentrancyVault', fn: 'withdraw', gas: 110836, kind: 'withdraw' },
  { depth: 3, contract: 'ReentrancyAttacker', fn: 'receive', gas: 101728, kind: 'receive' },
  { depth: 3, contract: 'ReentrancyVault', fn: 'withdraw', gas: 80999, kind: 'withdraw' },
  { depth: 4, contract: 'ReentrancyAttacker', fn: 'receive', gas: 71891, kind: 'receive' },
  { depth: 4, contract: 'ReentrancyVault', fn: 'withdraw', gas: 71062, kind: 'withdraw' },
  { depth: 5, contract: 'ReentrancyAttacker', fn: 'receive', gas: 61954, kind: 'receive' },
  { depth: 5, contract: 'ReentrancyVault', fn: 'withdraw', gas: 61125, kind: 'withdraw' },
  { depth: 6, contract: 'ReentrancyAttacker', fn: 'receive', gas: 52017, kind: 'receive' },
  { depth: 6, contract: 'ReentrancyVault', fn: 'withdraw', gas: 51188, kind: 'withdraw' },
  { depth: 7, contract: 'ReentrancyAttacker', fn: 'receive', gas: 42080, kind: 'receive' },
  { depth: 7, contract: 'ReentrancyVault', fn: 'withdraw', gas: 41251, kind: 'withdraw' },
  { depth: 8, contract: 'ReentrancyAttacker', fn: 'receive', gas: 32143, kind: 'receive' },
  { depth: 8, contract: 'ReentrancyVault', fn: 'withdraw', gas: 31314, kind: 'withdraw' },
  { depth: 9, contract: 'ReentrancyAttacker', fn: 'receive', gas: 306, kind: 'receive' },
];

export const WITHDRAW_FRAMES = TRACE_LADDER.filter((node) => node.kind === 'withdraw');
export const WITHDRAW_COUNT = WITHDRAW_FRAMES.length; // 7
export const TRACE_NODE_COUNT = 82;
export const TARGET_GAS = 195418;
export const DEPTH_MAX = 9;

/** The twelve lines the parser sees, copied verbatim from evidence/trace.txt. */
export const RAW_LINES: string[] = [
  '  [2098601] ReentrancyExploitTest::testExploit()',
  '    ├─ [67065] ReentrancyVault::deposit{value: 10000000000000000000}()',
  '    ├─ [195418] ReentrancyAttacker::attack(6)',
  '    │   ├─ [28901] ReentrancyVault::deposit{value: 1000000000000000000}()',
  '    │   ├─ [110836] ReentrancyVault::withdraw()',
  '    │   │   ├─ [101728] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   ├─ [80999] ReentrancyVault::withdraw()',
  '    │   │   │   │   ├─ [71891] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   ├─ [71062] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   ├─ [61954] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   ├─ [61125] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   ├─ [52017] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   ├─ [51188] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   │   │   ├─ [42080] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   │   │   ├─ [41251] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   ├─ [32143] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   │   ├─ [31314] ReentrancyVault::withdraw()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   │   │   ├─ [306] ReentrancyAttacker::receive{value: 1000000000000000000}()',
  '    │   │   │   │   │   │   │   │   │   │   │   │   │   │   │   └─ ← [Stop]',
  '    │   │   │   │   │   │   │   │   │   │   │   │   │   │   ├─ emit Withdrawal(who: ReentrancyAttacker: [0x2e234DAe75C793f67A35089C9d99245E1C58470b], amount: 1000000000000000000 [1e18])',
];

/** The ten heuristic detectors, in registry order. */
export const DETECTORS = [
  'Reentrancy',
  'Flash Loan',
  'Oracle Manipulation',
  'Access Control Failure',
  'Delegate Call Injection',
  'Self Destruct / Forced Transfer',
  'Arithmetic / Precision Fault',
  'Ordering / Front Running',
  'Bridge / Cross-Chain Verification Failure',
  'Invariant / Logic Error',
] as const;

export interface ScenarioFact {
  id: string;
  title: string;
  vectorId: string;
  chain: string;
  lossEth: number;
  traceNodes: number;
  detections: number;
  topDetection: string;
  confidence: number;
}

/** `artifacts/summary.json`, one row per scenario. */
export const SCENARIO_FACTS: ScenarioFact[] = [
  {
    id: 'reentrancy',
    title: 'Re-entrant Withdrawal Drain',
    vectorId: 'reentrancy',
    chain: 'Ethereum',
    lossEth: 6,
    traceNodes: 82,
    detections: 1,
    topDetection: 'Reentrancy',
    confidence: 0.97,
  },
  {
    id: 'oracle-manipulation',
    title: 'Spot-Price Oracle Manipulation',
    vectorId: 'oracle-manipulation',
    chain: 'Ethereum',
    lossEth: 40,
    traceNodes: 90,
    detections: 4,
    topDetection: 'Oracle Manipulation',
    confidence: 0.9,
  },
  {
    id: 'access-control',
    title: 'Unguarded Privileged Mint',
    vectorId: 'access-control',
    chain: 'Ethereum',
    lossEth: 50,
    traceNodes: 59,
    detections: 3,
    topDetection: 'Access Control Failure',
    confidence: 0.82,
  },
  {
    id: 'flash-loan',
    title: 'Flash-Loan Price Inflation',
    vectorId: 'flash-loan',
    chain: 'Ethereum',
    lossEth: 250,
    traceNodes: 107,
    detections: 3,
    topDetection: 'Oracle Manipulation',
    confidence: 0.9,
  },
  {
    id: 'delegatecall',
    title: 'Delegatecall Implementation Injection',
    vectorId: 'delegatecall-injection',
    chain: 'Ethereum',
    lossEth: 50,
    traceNodes: 61,
    detections: 2,
    topDetection: 'Delegate Call Injection',
    confidence: 0.93,
  },
  {
    id: 'selfdestruct',
    title: 'Forced-Transfer Vault Destruction',
    vectorId: 'self-destruct',
    chain: 'Ethereum',
    lossEth: 60,
    traceNodes: 58,
    detections: 3,
    topDetection: 'Self Destruct / Forced Transfer',
    confidence: 0.92,
  },
];

/** Registry totals derived from packages/core/src/incidents.ts. */
export const REGISTRY = {
  incidents: 17,
  lossUsd: '$8.69B',
  chains: 5,
  vectors: 16,
  detectors: 10,
  reproductions: 6,
} as const;

/** Real balance rails from artifacts/reentrancy.json. */
export const REENTRANCY_BALANCE = {
  victim: { label: 'ReentrancyVault', before: 10, after: 4 },
  attacker: { label: 'ReentrancyAttacker', before: 1, after: 7 },
  lossEth: 6,
} as const;
