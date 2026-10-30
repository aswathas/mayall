/**
 * HELIX — Web3 Exploit Forensics
 * Core domain model. Pure types + taxonomy, zero runtime dependencies.
 */

/* ─────────────────────────── Chains ─────────────────────────── */

export type Chain =
  | 'Ethereum'
  | 'Arbitrum'
  | 'Optimism'
  | 'Polygon'
  | 'BSC'
  | 'Base'
  | 'Avalanche'
  | 'Solana';

export const CHAIN_COLORS: Record<Chain, string> = {
  Ethereum: '#627eea',
  Arbitrum: '#28a0f0',
  Optimism: '#ff0420',
  Polygon: '#8247e5',
  BSC: '#f0b90b',
  Base: '#0052ff',
  Avalanche: '#e84142',
  Solana: '#14f195',
};

/* ─────────────────────── Attack vector taxonomy ─────────────────────── */

export type AttackVectorId =
  | 'flash-loan'
  | 'reentrancy'
  | 'oracle-manipulation'
  | 'access-control'
  | 'arithmetic-overflow'
  | 'front-running'
  | 'delegatecall-injection'
  | 'self-destruct'
  | 'logic-error'
  | 'bridge-exploit'
  | 'signature-replay'
  | 'price-impact'
  | 'integer-truncation'
  | 'unchecked-call'
  | 'gas-griefing'
  | 'liquidation-abuse';

export interface AttackVector {
  id: AttackVectorId;
  label: string;
  /** What an investigator should look for. */
  signature: string;
  /** Base severity weighting, 0..1. */
  severityWeight: number;
  category: 'Value Extraction' | 'Access & Control' | 'Oracle & Market' | 'Logic & Math' | 'Infrastructure';
}

export const ATTACK_VECTORS: Record<AttackVectorId, AttackVector> = {
  'flash-loan': {
    id: 'flash-loan',
    label: 'Flash Loan',
    signature: 'Atomic flash-borrow amplifying a price or liquidity assumption within one transaction.',
    severityWeight: 0.9,
    category: 'Value Extraction',
  },
  reentrancy: {
    id: 'reentrancy',
    label: 'Reentrancy',
    signature: 'External call made before the guarding state update, allowing re-entry.',
    severityWeight: 0.95,
    category: 'Logic & Math',
  },
  'oracle-manipulation': {
    id: 'oracle-manipulation',
    label: 'Oracle Manipulation',
    signature: 'Collateral valuation derived from a spot value the attacker can move.',
    severityWeight: 0.9,
    category: 'Oracle & Market',
  },
  'access-control': {
    id: 'access-control',
    label: 'Access Control',
    signature: 'Privileged path reachable by an untrusted caller (missing or bypassable modifier).',
    severityWeight: 0.85,
    category: 'Access & Control',
  },
  'arithmetic-overflow': {
    id: 'arithmetic-overflow',
    label: 'Arithmetic Overflow',
    signature: 'Unchecked or wrong-width arithmetic producing an inflated balance or price.',
    severityWeight: 0.8,
    category: 'Logic & Math',
  },
  'front-running': {
    id: 'front-running',
    label: 'Front Running',
    signature: 'Attacker transaction ordered ahead of the victim within the same block.',
    severityWeight: 0.6,
    category: 'Oracle & Market',
  },
  'delegatecall-injection': {
    id: 'delegatecall-injection',
    label: 'Delegate Call Injection',
    signature: 'delegatecall to an attacker-controlled implementation mutating host storage.',
    severityWeight: 0.9,
    category: 'Access & Control',
  },
  'self-destruct': {
    id: 'self-destruct',
    label: 'Self Destruct',
    signature: 'Contract destroyed, force-transferring its balance to a chosen recipient.',
    severityWeight: 0.75,
    category: 'Infrastructure',
  },
  'logic-error': {
    id: 'logic-error',
    label: 'Logic Error',
    signature: 'Intended invariant not enforced; funds leave through a path the design assumed safe.',
    severityWeight: 0.7,
    category: 'Logic & Math',
  },
  'bridge-exploit': {
    id: 'bridge-exploit',
    label: 'Bridge Exploit',
    signature: 'Trust assumption in the cross-chain message verification broken.',
    severityWeight: 0.95,
    category: 'Infrastructure',
  },
  'signature-replay': {
    id: 'signature-replay',
    label: 'Signature Replay',
    signature: 'Signed authorisation accepted more than once or on the wrong chain/domain.',
    severityWeight: 0.8,
    category: 'Access & Control',
  },
  'price-impact': {
    id: 'price-impact',
    label: 'Price Impact',
    signature: 'Loss driven by executing against thin liquidity in a single swap.',
    severityWeight: 0.55,
    category: 'Oracle & Market',
  },
  'integer-truncation': {
    id: 'integer-truncation',
    label: 'Integer Truncation',
    signature: 'Division or downcast silently discarding a fractional remainder.',
    severityWeight: 0.6,
    category: 'Logic & Math',
  },
  'unchecked-call': {
    id: 'unchecked-call',
    label: 'Unchecked Call',
    signature: 'Low-level call whose return value is ignored, masking a failed transfer.',
    severityWeight: 0.65,
    category: 'Logic & Math',
  },
  'gas-griefing': {
    id: 'gas-griefing',
    label: 'Gas Griefing',
    signature: 'Attacker forces a victim transaction to run out of gas, blocking progress.',
    severityWeight: 0.5,
    category: 'Infrastructure',
  },
  'liquidation-abuse': {
    id: 'liquidation-abuse',
    label: 'Liquidation Abuse',
    signature: 'Liquidation executed at a manipulated price, seizing collateral unfairly.',
    severityWeight: 0.7,
    category: 'Oracle & Market',
  },
};

export const ATTACK_VECTOR_LIST = Object.values(ATTACK_VECTORS);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const VECTOR_ALIASES: Record<string, AttackVectorId> = {
  'unsafe-delegatecall': 'delegatecall-injection',
  delegatecall: 'delegatecall-injection',
  'delegate-call-injection': 'delegatecall-injection',
  selfdestruct: 'self-destruct',
  'self-destruct-forced-transfer': 'self-destruct',
  'oracle-manipulation-spot-price': 'oracle-manipulation',
  'flash-loan-price-inflation': 'flash-loan',
  'access-control-failure': 'access-control',
  'unguarded-privileged-mint': 'access-control',
  'reentrant-withdrawal-drain': 'reentrancy',
};

/**
 * Accepts either a canonical vector id ("oracle-manipulation") or a free-form
 * label ("Oracle Manipulation", "Unsafe Delegatecall") and returns the
 * canonical id. Simulation artifacts are produced by Solidity and use labels,
 * so the boundary between the contract layer and the domain model has to be
 * tolerant here.
 */
export function resolveAttackVectorId(value: string | undefined | null): AttackVectorId {
  if (!value) return 'logic-error';
  const slug = slugify(value);
  if (slug in ATTACK_VECTORS) return slug as AttackVectorId;
  if (VECTOR_ALIASES[slug]) return VECTOR_ALIASES[slug];
  for (const v of ATTACK_VECTOR_LIST) {
    if (slugify(v.label) === slug) return v.id;
  }
  for (const v of ATTACK_VECTOR_LIST) {
    const label = slugify(v.label);
    if (label && (slug.includes(label) || label.includes(slug))) return v.id;
  }
  return 'logic-error';
}

/* ─────────────────────────── Severity ─────────────────────────── */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export const SEVERITY_COLORS: Record<Severity, string> = {
  critical: '#ff3b5c',
  high: '#ff8a3d',
  medium: '#ffc53d',
  low: '#3ddc97',
};

/* ─────────────────────────── Incidents ─────────────────────────── */

export interface Incident {
  id: string;
  slug: string;
  name: string;
  chain: Chain;
  date: string; // ISO date
  /** Reported loss in USD. */
  lossUsd: number;
  /** Loss expressed in the native asset when known. */
  lossAmount?: string;
  lossAsset?: string;
  vectors: AttackVectorId[];
  /** Target protocol / contract label. */
  target: string;
  /** Root-cause paragraph shown on the case page. */
  rootCause: string;
  /** Short narrative of the attack sequence. */
  summary: string;
  /** Attacker-controlled or involved addresses. */
  actors: { address: string; label: string; role: 'attacker' | 'victim' | 'intermediary' }[];
  /** Transaction hashes, when known. */
  txs: string[];
  /** Reference links. */
  references: { label: string; url: string }[];
  /** Whether HELIX has a live local Foundry reproduction for this case. */
  reproducible: boolean;
  /** For reproducible cases: the scenario id in the local Foundry lab. */
  scenarioId?: string;
  recovered?: boolean;
}

/* ─────────────────────────── Cases ─────────────────────────── */

export interface CaseFile {
  id: string;
  title: string;
  incidentSlug: string;
  status: 'open' | 'analysing' | 'closed';
  severity: Severity;
  openedAt: string;
  investigator: string;
  tags: string[];
}

/* ─────────────────────── Simulation / forensics ─────────────────────── */

export interface TraceNode {
  /** Stable id, path-based. */
  id: string;
  depth: number;
  /** Contract address. */
  address: string;
  contractName: string;
  /** Function name if resolvable. */
  fn: string;
  /** 4-byte selector when known. */
  selector?: string;
  gasUsed: number;
  /** Raw one-line rendering from the forge trace. */
  raw: string;
  children: TraceNode[];
  /** True when this node is a call into an externally-owned or unknown address. */
  isExternalCall: boolean;
  /** True when the node is a value transfer. */
  isValueTransfer: boolean;
}

export interface StorageWrite {
  contract: string;
  contractName: string;
  slot: string;
  label: string;
  before: string;
  after: string;
  kind: 'balance' | 'state' | 'flag';
  /** True when the before != after. */
  changed: boolean;
}

export interface BalanceDelta {
  address: string;
  label: string;
  beforeWei: string;
  afterWei: string;
  deltaWei: string;
}

export interface AttackStep {
  n: number;
  title: string;
  description: string;
  txHash: string;
  gasUsed: number;
  valueWei: string;
}

export interface PatternDetection {
  id: string;
  vectorId: AttackVectorId;
  label: string;
  /** 0..1 */
  confidence: number;
  severity: Severity;
  /** Evidence pointers into the trace / artifact. */
  evidence: string[];
  rationale: string;
  /** Mermaid attack-flow diagram source. */
  mermaid: string;
}

export interface GasFlameNode {
  id: string;
  label: string;
  gasUsed: number;
  /** Fraction of total gas, 0..1 */
  share: number;
  depth: number;
}

export interface SimulationArtifact {
  scenario: string;
  attackVector: AttackVectorId;
  chain: Chain;
  contractName: string;
  target: string;
  attacker: string;
  exploited: boolean;
  lossWei: string;
  lossEth: string;
  rootCause: string;
  severity: Severity;
  steps: AttackStep[];
  balances: BalanceDelta[];
  storageWrites: StorageWrite[];
  logs: { contract: string; name: string; args: string }[];
}

export interface SimulationResult {
  id: string;
  scenario: string;
  attackVector: AttackVectorId;
  startedAt: string;
  durationMs: number;
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  artifact: SimulationArtifact | null;
  trace: TraceNode | null;
  flame: GasFlameNode[];
  detections: PatternDetection[];
  /** Raw trace text, kept for the evidence bundle. */
  traceText: string;
  logs: string[];
}

/* ─────────────────────────── Reports ─────────────────────────── */

export interface ReportSection {
  heading: string;
  body: string;
}

export interface ForensicReport {
  id: string;
  title: string;
  generatedAt: string;
  caseRef: string;
  severity: Severity;
  /** Narrative written by MiniMax Code. */
  executiveSummary: string;
  sections: ReportSection[];
  findings: PatternDetection[];
  lossUsd: number;
  lossEth: string;
  confidence: number;
  chain: Chain;
  evidenceCount: number;
}
