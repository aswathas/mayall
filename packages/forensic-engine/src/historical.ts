import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type {
  AttackVectorId,
  Incident,
  PatternDetection,
  Severity,
} from '@helix/core';
import { ATTACK_VECTORS } from '@helix/core';
import { INCIDENTS } from '@helix/core/incidents';
import { DETECTOR_CATALOG, runDetectors } from './detectors.js';
import { repoRoot } from './foundry.js';
import { artifactsDir } from './simulator.js';

/**
 * Historical analysis runs the Mayall detector *taxonomy* over the public
 * record of an incident. It is deliberately explicit about what it is:
 * a retrospective classification of published metadata, not a reading of a
 * mainnet trace. Nothing in this module claims that a Bible signal was
 * observed on-chain — `observed` only ever means "the published narrative
 * names this mechanism".
 */
export const HISTORICAL_METHOD = 'retrospective-classification' as const;
export type HistoricalMethod = typeof HISTORICAL_METHOD;

export const HISTORICAL_DISCLAIMER =
  'Retrospective classification over public incident records. No mainnet trace was analysed. ' +
  'Detector results come from local Foundry reproductions of the same attack vector, not from the historic transaction.';

export const REPORT_SECTION_HEADINGS = [
  '1. Case header',
  '2. Executive summary',
  '3. Attack sequence',
  '4. Evidence reconstruction',
  '5. Detection analysis',
  '6. Remediation',
  '7. Client action plan',
] as const;

export type BibleSignalStatus = 'observed' | 'expected' | 'notApplicable';

export interface HistoricalBibleSignal {
  /** Signal name exactly as it appears in Bible sheet 03. */
  name: string;
  status: BibleSignalStatus;
  /** The signal family from sheet 03, when the signal is defined there. */
  family: string | null;
  /** Confidence weight from sheet 03 (e.g. "Weight 3 — Hard Evidence"). */
  weight: string | null;
  /** Why this status was assigned. */
  note: string;
}

export interface HistoricalReproduction {
  scenarioId: string;
  href: string;
}

export interface HistoricalFinding {
  id: string;
  incidentSlug: string;
  vector: AttackVectorId;
  vectorLabel: string;
  confidence: number;
  severity: Severity;
  /** Matching attack name from Bible sheet 04. */
  biblePattern: string;
  /** Which attack family sheet 04 assigns to that pattern. */
  bibleFamily: string;
  /** Signals from sheet 03 that would prove the pattern. */
  bibleSignals: HistoricalBibleSignal[];
  /** Transaction hashes and public references from the registry. */
  evidenceRefs: string[];
  /** A live local Foundry reproduction when one exists. */
  reproduction: HistoricalReproduction | null;
  /** The detector's own limitation text, quoted verbatim from DETECTOR_CATALOG. */
  limitations: string;
  /** Why the classifier assigned this vector and confidence. */
  rationale: string;
  method: HistoricalMethod;
}

export interface HistoricalSignalCounts {
  observed: number;
  expected: number;
  notApplicable: number;
}

export interface HistoricalIncidentAnalysis {
  slug: string;
  id: string;
  name: string;
  chain: Incident['chain'];
  date: string;
  lossUsd: number;
  lossAmount: string | null;
  lossAsset: string | null;
  target: string;
  severity: Severity;
  topConfidence: number;
  reproducible: boolean;
  scenarioId: string | null;
  recovered: boolean;
  vectors: AttackVectorId[];
  bibleFamilies: string[];
  findings: HistoricalFinding[];
  signalCounts: HistoricalSignalCounts;
  evidenceRefs: string[];
  method: HistoricalMethod;
}

export interface HistoricalVectorSummary {
  vectorId: AttackVectorId;
  label: string;
  count: number;
  incidentCount: number;
  lossUsd: number;
  reproducibleCount: number;
  meanConfidence: number;
}

export interface HistoricalFamilySummary {
  family: string;
  count: number;
  incidentCount: number;
  lossUsd: number;
  meanConfidence: number;
}

export interface HistoricalConfidenceBucket {
  label: string;
  min: number;
  max: number;
  count: number;
}

export interface HistoricalCoverage {
  incidents: number;
  reproducible: number;
  retrospectiveOnly: number;
  reproduciblePct: number;
  reproducedVectors: string[];
  retrospectiveVectors: string[];
}

export interface HistoricalTotals {
  incidents: number;
  findings: number;
  reproducible: number;
  retrospectiveOnly: number;
  lossUsd: number;
  signalsObserved: number;
  signalsExpected: number;
  signalsNotApplicable: number;
}

export interface HistoricalAnalysis {
  generatedAt: string;
  method: HistoricalMethod;
  disclaimer: string;
  totals: HistoricalTotals;
  coverage: HistoricalCoverage;
  confidence: {
    min: number;
    max: number;
    mean: number;
    buckets: HistoricalConfidenceBucket[];
  };
  byVector: HistoricalVectorSummary[];
  byFamily: HistoricalFamilySummary[];
  incidents: HistoricalIncidentAnalysis[];
}

/* ───────────────────────────── Bible loading ───────────────────────────── */

export interface BibleSignalDefinition {
  name: string;
  family: string;
  detects: string;
  weight: string;
}

export interface BibleAttackPattern {
  name: string;
  family: string;
  simpleMeaning: string;
  attackType: string;
  threshold: string;
  /** Signal names listed in the "Correlated Signals" column of sheet 04. */
  signals: string[];
  derivedLogs: string[];
  rawFoundation: string[];
  realWorldExample: string;
}

interface BibleIndex {
  patterns: Map<string, BibleAttackPattern>;
  signals: Map<string, BibleSignalDefinition>;
}

let bibleCache: BibleIndex | null = null;

function biblePath(): string {
  return path.join(repoRoot(), 'data', 'bible', 'forensic-bible.json');
}

function splitCell(value: string | undefined): string[] {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readSheet(book: Record<string, string[]>, sheet: string): string[][] {
  const rows = book[sheet];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? '')) : []))
    .filter((row) => row.length > 0);
}

function headerIndex(rows: string[][], first: string, second: string): number {
  return rows.findIndex((row) => row[0]?.trim() === first && row[1]?.trim() === second);
}

/** Parses the two Bible sheets this module depends on, once per process. */
export function loadBible(): BibleIndex {
  if (bibleCache) return bibleCache;

  const patterns = new Map<string, BibleAttackPattern>();
  const signals = new Map<string, BibleSignalDefinition>();

  try {
    const book = JSON.parse(readFileSync(biblePath(), 'utf-8')) as Record<string, string[]>;

    const signalRows = readSheet(book, '03 Detection Signals');
    const signalStart = headerIndex(signalRows, 'Family', 'Signal Name');
    if (signalStart >= 0) {
      let family = '';
      for (const row of signalRows.slice(signalStart + 1)) {
        if (row[0]?.trim()) family = row[0].trim();
        const name = row[1]?.trim();
        if (!name) continue;
        signals.set(name, {
          name,
          family,
          detects: row[2]?.trim() ?? '',
          weight: row[8]?.trim() ?? '',
        });
      }
    }

    const patternRows = readSheet(book, '04 Attack Pattern Catalog');
    const patternStart = headerIndex(patternRows, 'Family', 'Attack Name');
    if (patternStart >= 0) {
      let family = '';
      for (const row of patternRows.slice(patternStart + 1)) {
        if (row[0]?.trim()) family = row[0].trim();
        const name = row[1]?.trim();
        if (!name) continue;
        patterns.set(name, {
          name,
          family,
          simpleMeaning: row[2]?.trim() ?? '',
          attackType: row[3]?.trim() ?? '',
          threshold: row[4]?.trim() ?? '',
          signals: splitCell(row[5]),
          derivedLogs: splitCell(row[6]),
          rawFoundation: splitCell(row[7]),
          realWorldExample: row[8]?.trim() ?? '',
        });
      }
    }
  } catch {
    // The Bible is optional at runtime: analysis degrades to the taxonomy and
    // registry data rather than failing the route.
    bibleCache = { patterns, signals };
    return bibleCache;
  }

  bibleCache = { patterns, signals };
  return bibleCache;
}

export function biblePattern(name: string): BibleAttackPattern | null {
  return loadBible().patterns.get(name) ?? null;
}

export function bibleSignalsForPattern(name: string): BibleSignalDefinition[] {
  const pattern = biblePattern(name);
  if (!pattern) return [];
  const index = loadBible().signals;
  return pattern.signals.map(
    (signal) =>
      index.get(signal) ?? {
        name: signal,
        family: pattern.family,
        detects: '',
        weight: '',
      },
  );
}

/* ─────────────────────────── Pattern mapping ─────────────────────────── */

const DEFAULT_PATTERN: Record<AttackVectorId, string> = {
  'flash-loan': 'Classic Flash Loan Exploit',
  reentrancy: 'Classic Reentrancy',
  'oracle-manipulation': 'AMM Spot Price Manipulation',
  'access-control': 'Ownership Hijack + Drain',
  'arithmetic-overflow': 'Integer Overflow Exploit',
  'front-running': 'Frontrunning',
  'delegatecall-injection': 'Delegatecall Privilege Escalation',
  'self-destruct': 'Selfdestruct Drain',
  'logic-error': 'Ownership Hijack + Drain',
  'bridge-exploit': 'Signature Replay Attack',
  'signature-replay': 'Signature Replay Attack',
  'price-impact': 'AMM Spot Price Manipulation',
  'integer-truncation': 'Integer Overflow Exploit',
  'unchecked-call': 'Classic Reentrancy',
  'gas-griefing': 'Frontrunning',
  'liquidation-abuse': 'Liquidation Manipulation',
};

function incidentText(incident: Incident): string {
  // Deliberately excludes `incident.vectors`: a registry vector id is a label,
  // not evidence of the mechanism. Including it let the string
  // "delegatecall-injection" steer an unrelated access-control finding toward
  // the delegatecall pattern.
  return [
    incident.name,
    incident.target,
    incident.chain,
    incident.rootCause,
    incident.summary,
    ...incident.actors.map((actor) => `${actor.label} ${actor.role}`),
    ...incident.references.map((reference) => reference.label),
  ].join('\n');
}

/**
 * Signal confirmation is scored only against what the record actually says
 * about the incident, not against its title or registry labels. A target
 * called "Ronin Bridge" must not, on its own, count as a bridge fund trail.
 */
function evidenceTextOf(incident: Incident): string {
  return [incident.rootCause, incident.summary, ...incident.references.map((reference) => reference.label)].join(
    '\n',
  );
}

/**
 * Chooses the nearest Bible attack pattern for one vector of one incident.
 * The Bible has no generic "logic error" row, so the residual vector is mapped
 * by the mechanism that the public record names. The chosen name always comes
 * from sheet 04 — the mapping never invents a pattern.
 */
export function resolveBiblePattern(incident: Incident, vector: AttackVectorId): string {
  const text = incidentText(incident);

  const preferred = (): string => {
    switch (vector) {
      case 'reentrancy':
        if (/read[- ]?only|stale (price|state)|price.*during|liquidat/i.test(text)) {
          return 'Read-Only Reentrancy';
        }
        if (/cross[- ]function|deposit.*withdraw|two functions?/i.test(text)) {
          return 'Cross-Function Reentrancy';
        }
        if (/erc777|hook|tokensreceived/i.test(text)) return 'ERC777 Hook Reentrancy';
        return 'Classic Reentrancy';

      case 'flash-loan':
        if (/governance|proposal|vote|supermajority/i.test(text)) {
          return 'Flash Loan + Governance Attack';
        }
        if (/oracle|price|twap|spot/i.test(text)) return 'Flash Loan + Oracle Manipulation';
        if (/multi-pool|chained|multiple pools/i.test(text)) return 'Multi-Pool Chained Flash Loan';
        return 'Classic Flash Loan Exploit';

      case 'oracle-manipulation':
        if (/twap|time[- ]weighted|multiple blocks|over days/i.test(text)) return 'TWAP Manipulation';
        if (/multi[- ]oracle|multiple oracles|two oracles|aggregat/i.test(text)) {
          return 'Multi-Oracle Inconsistency Exploit';
        }
        return 'AMM Spot Price Manipulation';

      case 'access-control':
        if (/delegatecall|delegate call|facet/i.test(text)) return 'Delegatecall Privilege Escalation';
        if (/selfdestruct|self[- ]destruct|destroy/i.test(text)) return 'Selfdestruct Drain';
        if (/initiali[sz]|uninitiali[sz]ed|root contract/i.test(text)) return 'Uninitialized Proxy Exploit';
        return 'Ownership Hijack + Drain';

      case 'delegatecall-injection':
        return 'Delegatecall Privilege Escalation';
      case 'self-destruct':
        return 'Selfdestruct Drain';
      case 'arithmetic-overflow':
      case 'integer-truncation':
        return 'Integer Overflow Exploit';
      case 'front-running':
        if (/governance|proposal|vote/i.test(text)) return 'Governance Manipulation';
        return 'Frontrunning';
      case 'bridge-exploit':
        if (/delegatecall|facet|proxy/i.test(text)) return 'Delegatecall Privilege Escalation';
        if (/signature|guardian|forg(ed|ery)|replay/i.test(text)) return 'Signature Replay Attack';
        return 'Ownership Hijack + Drain';
      case 'signature-replay':
        return 'Signature Replay Attack';
      case 'price-impact':
        return 'AMM Spot Price Manipulation';
      case 'unchecked-call':
        return 'Classic Reentrancy';
      case 'gas-griefing':
        return 'Frontrunning';
      case 'liquidation-abuse':
        return 'Liquidation Manipulation';
      case 'logic-error':
        if (/donat/i.test(text)) return 'Donation Attack';
        if (/initiali[sz]|uninitiali[sz]ed|root contract/i.test(text)) return 'Uninitialized Proxy Exploit';
        if (/governance|proposal|vote/i.test(text)) return 'Governance Manipulation';
        if (/signature|guardian|forg(ed|ery)|replay/i.test(text)) return 'Signature Replay Attack';
        if (/oracle|price|spot|twap|liquidat/i.test(text)) return 'AMM Spot Price Manipulation';
        if (/owner|ownership|private key|multisig|admin|privileged/i.test(text)) {
          return 'Ownership Hijack + Drain';
        }
        return DEFAULT_PATTERN['logic-error'];
      default:
        return DEFAULT_PATTERN[vector] ?? 'Ownership Hijack + Drain';
    }
  };

  const candidate = preferred();
  const index = loadBible();
  if (index.patterns.size === 0 || index.patterns.has(candidate)) return candidate;

  // The Bible could not be loaded or the name drifted: fall back to the vector
  // default if it exists, otherwise keep the name so the gap is visible.
  const fallback = DEFAULT_PATTERN[vector];
  return index.patterns.has(fallback) ? fallback : candidate;
}

/* ────────────────────────── Signal classification ────────────────────────── */

/**
 * A signal is only applicable when the record describes the variant it belongs
 * to. Signals absent from this map are treated as generally applicable.
 */
const SIGNAL_APPLICABILITY: Record<string, RegExp> = {
  cross_function_reentry: /cross[- ]function|deposit.*withdraw|two functions?/i,
  hook_callback_detected: /erc777|hook|tokensreceived/i,
  initialize_on_live_contract: /initiali[sz]/i,
  governance_instant_execution: /governance|proposal|vote/i,
  permit_used_before_owner_approval: /permit|eip[- ]?2612/i,
  eip712_replay_detected: /eip[- ]?712|signature|replay/i,
  nonce_gap_detected: /nonce/i,
  twap_drift_detected: /twap|time[- ]weighted/i,
  multi_oracle_divergence: /multi[- ]oracle|multiple oracles|two oracles|aggregat/i,
  donation_balance_inflation: /donat/i,
  vault_share_price_spike: /share price|vault|erc[- ]?4626|collateral/i,
  fee_on_transfer_discrepancy: /fee[- ]on[- ]transfer/i,
  rebasing_balance_manipulation: /rebas/i,
  integer_overflow_detected: /overflow|underflow|truncat/i,
  liquidity_removal_spike: /liquidity (remov|rug)|remove.*liquidity|rug/i,
  mint_to_dump_ratio: /mint.*(dump|sell|market)|mint and dump/i,
  approval_for_max_amount: /approv/i,
  fund_dispersion_post_attack: /disperse|split|launder|tornado|mixer/i,
  value_dispersion: /disperse|split|launder|tornado|mixer/i,
  mixer_interaction_detected: /tornado|mixer|launder/i,
  bridge_interaction_detected: /bridge|cross[- ]chain/i,
  multi_hop_fund_trail: /hop|launder|trail/i,
  address_cluster_identified: /cluster|same entity|common fund/i,
  contract_creator_linked: /deployer/i,
  address_funded_before_attack: /funded|fresh wallet|staging/i,
  contract_deployed_before_attack: /deploy.*contract|attack contract|exploit contract/i,
  high_gas_anomaly: /gas|front[- ]run|sandwich/i,
  failed_attempts_before_success: /failed|probe/i,
};

/**
 * Vocabulary that lets the public record itself confirm a signal's mechanism.
 * This is a text match, not a log observation; the status note says so.
 */
const SIGNAL_EVIDENCE: Record<string, RegExp> = {
  recursive_depth_pattern: /re[- ]?entr|re[- ]?enter|reentrant|recursive/i,
  value_drain_per_depth:
    /(value|funds|eth|tokens?|balance) .* (out|move|moved|drain)|drained? .* (at each|per|across|through)/i,
  storage_update_delay:
    /before (the )?(state|balance).*(update|zero|decrement)|zeroing (the )?balance|state .* not updated|before decrementing/i,
  deposit_withdraw_same_tx: /deposit .* withdraw|withdraw .* deposit|deposit\(\) inside withdraw/i,
  price_read_during_callback: /re[- ]?entrant read|price.*(during|while)|stale (price|state)|read.*price.*(callback|mid)/i,
  cross_contract_state_dependency: /stale (price|state)|dependent protocol|cross[- ]contract|read .* state/i,
  flashloan_bracket_detected: /flash[- ]?loan|flash[- ]?borrow/i,
  large_value_inflow_spike:
    /flash[- ]?loan|large .* (value|transfer|inflow|capital)|borrow(ed|ing)? .* (large|against)/i,
  drain_ratio_exceeded:
    /drain(ed)? (the|all|its|entire)|(near )?zero|95%|100%|full balance|entire (balance|reserve)/i,
  spot_price_manipulation: /manipulat.*price|price.*manipulat|skew|spot price|priced? .* (below|artificial)/i,
  reserve_ratio_spike: /reserve ratio|pool reserve|thin liquidity|skew(ed)? .* pool|move .* pool/i,
  twap_drift_detected: /twap|time[- ]weighted/i,
  multi_oracle_divergence: /multi[- ]oracle|multiple oracles|two oracles|aggregat/i,
  price_before_after_mismatch: /price .* (before|after|mismatch|artificial)|artificial (price|profit)/i,
  ownership_transfer_then_drain:
    /owner(ship)? .* (transfer|rewrit|chang)|rewrote .* owner|compromised .* (key|wallet|signer)|private key .* (compromised|used)/i,
  event_order_violation:
    /before .* (update|zeroing|state)|order(ed|ing)|same block|immediately (after|execute)/i,
  delegatecall_storage_write: /delegatecall|delegate call|facet/i,
  proxy_implementation_change: /proxy .* (implementation|change)|implementation .* (slot|change)|facet|upgrade .* (proxy|implementation)/i,
  selfdestruct_detected: /selfdestruct|self[- ]destruct|destroy(ed|s)? (the )?(vault|contract)/i,
  net_negative_contract_balance: /force[- ]?transfer|balance .* (zero|emptied|drained)|drained .* balance/i,
  governance_instant_execution:
    /governance|vote|proposal/i,
  integer_overflow_detected: /overflow|underflow|truncat/i,
  event_parameter_mismatch: /mismatch|accounting (error|bug)|balance .* (differs|wrong)/i,
  donation_balance_inflation: /donat/i,
  vault_share_price_spike: /share price|vault|erc[- ]?4626|donation/i,
  initialize_on_live_contract: /initiali[sz]/i,
  eip712_replay_detected: /replay|forg(ed|ery)|signature/i,
  permit_used_before_owner_approval: /permit/i,
  nonce_gap_detected: /nonce/i,
  liquidation_cascade_trigger: /liquidation cascade|cascading liquidat|liquidat.*(across|multiple|batch)/i,
  approval_for_max_amount: /approv/i,
  mint_to_dump_ratio: /mint.*(dump|sell|market)|mint and dump/i,
  liquidity_removal_spike: /liquidity (remov|rug)|remove.*liquidity|rug/i,
  value_concentration: /concentrat|accumulat/i,
  high_gas_anomaly: /high gas|gas .* (anomal|spike)|front[- ]?run|sandwich/i,
  new_address_first_interaction: /fresh (wallet|eoa)|new address/i,
  failed_attempts_before_success: /failed (tx|transaction|attempt)|probe/i,
  fund_dispersion_post_attack: /disperse|split|launder|tornado|mixer/i,
  value_dispersion: /disperse|split|launder|tornado|mixer/i,
  mixer_interaction_detected: /tornado|mixer|launder/i,
  bridge_interaction_detected: /(funds|proceeds|assets) .* bridge|routed .* bridge|bridge .* (launder|hop)/i,
  multi_hop_fund_trail: /hop|launder|trail/i,
  address_cluster_identified: /cluster|same entity|common fund/i,
  contract_creator_linked: /same deployer|deployer/i,
  address_funded_before_attack: /funded (from|by)|fresh wallet|staging/i,
  contract_deployed_before_attack: /deployed? .* (contract|exploit)|attack contract|exploit contract/i,
  missing_expected_event: /no event|missing event|unchecked call/i,
  rebasing_balance_manipulation: /rebas/i,
  fee_on_transfer_discrepancy: /fee[- ]on[- ]transfer/i,
};

function classifySignal(
  signalName: string,
  pattern: string,
  text: string,
): HistoricalBibleSignal {
  const definition = loadBible().signals.get(signalName) ?? null;

  if (!definition) {
    return {
      name: signalName,
      status: 'notApplicable',
      family: null,
      weight: null,
      note:
        'Named in Bible sheet 04 as a correlated input, but not defined as a signal in sheet 03; ' +
        'Mayall does not claim it as a detection signal.',
    };
  }

  const applicability = SIGNAL_APPLICABILITY[signalName];
  if (applicability && !applicability.test(text)) {
    return {
      name: signalName,
      status: 'notApplicable',
      family: definition.family,
      weight: definition.weight,
      note: `The published record does not describe the variant this signal belongs to (pattern: ${pattern}).`,
    };
  }

  const evidence = SIGNAL_EVIDENCE[signalName];
  if (evidence && evidence.test(text)) {
    return {
      name: signalName,
      status: 'observed',
      family: definition.family,
      weight: definition.weight,
      note: 'The published narrative names this mechanism. It is a record-level statement, not a log observation.',
    };
  }

  return {
    name: signalName,
    status: 'expected',
    family: definition.family,
    weight: definition.weight,
    note: 'Would be required to prove the pattern from a trace; no raw log for this incident is in the registry.',
  };
}

/* ─────────────────────────── Confidence model ─────────────────────────── */

const VECTOR_EVIDENCE: Record<AttackVectorId, RegExp> = {
  'flash-loan': /flash[- ]?loan|flash[- ]?borrow/i,
  reentrancy: /re[- ]?entr|re[- ]?enter|reentrant/i,
  'oracle-manipulation': /oracle|price|twap|spot/i,
  'access-control': /owner|ownership|private key|multisig|admin|privileged|key/i,
  'arithmetic-overflow': /overflow|underflow|arithmetic/i,
  'front-running': /front[- ]?run|ordering|same block|mem pool|mempool/i,
  'delegatecall-injection': /delegatecall|delegate call|facet|implementation/i,
  'self-destruct': /selfdestruct|self[- ]destruct|destroy/i,
  'logic-error': /logic|invariant|uninitiali[sz]ed|initiali[sz]ation|design|flawed/i,
  'bridge-exploit': /bridge|cross[- ]chain|relayer|guardian/i,
  'signature-replay': /signature|signed|replay|forg(ed|ery)/i,
  'price-impact': /thin liquidity|price impact|single swap/i,
  'integer-truncation': /truncat|rounding|precision/i,
  'unchecked-call': /unchecked|low[- ]level call|return value/i,
  'gas-griefing': /grief|out of gas|gas/i,
  'liquidation-abuse': /liquidat/i,
};

const DETECTOR_BY_VECTOR: Partial<Record<AttackVectorId, string>> = {
  reentrancy: 'det-reentrancy',
  'flash-loan': 'det-flash-loan',
  'oracle-manipulation': 'det-oracle',
  'access-control': 'det-access-control',
  'delegatecall-injection': 'det-delegatecall',
  'self-destruct': 'det-selfdestruct',
  'arithmetic-overflow': 'det-arithmetic',
  'integer-truncation': 'det-arithmetic',
  'front-running': 'det-front-running',
  'bridge-exploit': 'det-bridge',
  'logic-error': 'det-logic',
};

export function detectorForVector(vector: AttackVectorId): string | null {
  return DETECTOR_BY_VECTOR[vector] ?? null;
}

export function detectorLimitation(vector: AttackVectorId): string {
  const detectorId = detectorForVector(vector);
  if (!detectorId) {
    const label = ATTACK_VECTORS[vector]?.label ?? vector;
    return `No Mayall detector covers ${label}; this classification rests on the public record alone.`;
  }
  const rule = DETECTOR_CATALOG.find((entry) => entry.id === detectorId);
  return rule?.limitation ?? 'No published limitation for this detector.';
}

function severityFromVector(vector: AttackVectorId): Severity {
  const weight = ATTACK_VECTORS[vector]?.severityWeight ?? 0.5;
  if (weight >= 0.9) return 'critical';
  if (weight >= 0.8) return 'high';
  if (weight >= 0.6) return 'medium';
  return 'low';
}

function severityFromVectors(vectors: AttackVectorId[]): Severity {
  const order: Severity[] = ['critical', 'high', 'medium', 'low'];
  let best: Severity = 'low';
  for (const vector of vectors) {
    const severity = severityFromVector(vector);
    if (order.indexOf(severity) < order.indexOf(best)) best = severity;
  }
  return best;
}

function clampConfidence(value: number): number {
  return Number(Math.max(0.35, Math.min(0.94, value)).toFixed(2));
}

function confidenceFor(incident: Incident, vector: AttackVectorId, text: string): number {
  let confidence = 0.58;

  if (VECTOR_EVIDENCE[vector]?.test(text)) confidence += 0.14;
  if (incident.txs.length > 0) confidence += 0.06;
  if (incident.reproducible) confidence += 0.08;
  if (incident.rootCause.length >= 90) confidence += 0.04;

  const position = incident.vectors.indexOf(vector);
  if (position > 0) confidence -= 0.06 * position;

  return clampConfidence(confidence);
}

/* ───────────────────────── Local detection evidence ───────────────────────── */

export interface LocalDetectorEvidence {
  scenarioId: string | null;
  available: boolean;
  /** The artifact the detections were run against, relative to the repo. */
  source: string | null;
  note: string;
  detections: PatternDetection[];
}

/**
 * Runs the real Mayall detector suite against the local Foundry artifact for
 * this incident's scenario. For non-reproducible incidents there is no
 * artifact and the result is explicitly empty.
 */
export function localDetectionsFor(incident: Incident): LocalDetectorEvidence {
  if (!incident.reproducible || !incident.scenarioId) {
    return {
      scenarioId: null,
      available: false,
      source: null,
      note:
        'No local Foundry reproduction exists for this incident. No detector was executed; ' +
        'the detection analysis below is a Bible-signal mapping only.',
      detections: [],
    };
  }

  const source = `artifacts/${incident.scenarioId}.json`;
  const artifactPath = path.join(artifactsDir(), `${incident.scenarioId}.json`);

  if (!existsSync(artifactPath)) {
    return {
      scenarioId: incident.scenarioId,
      available: false,
      source,
      note: `The scenario ${incident.scenarioId} is registered for this incident but ${source} is missing. Run the lab to produce it.`,
      detections: [],
    };
  }

  try {
    const artifact = JSON.parse(readFileSync(artifactPath, 'utf-8'));
    const detections = runDetectors({
      artifact,
      nodes: [],
      rawLines: [],
      traceText: '',
    });
    return {
      scenarioId: incident.scenarioId,
      available: true,
      source,
      note:
        'Detections were executed against the local Foundry artifact for the same attack vector. ' +
        'They describe the reproduction, not the historic mainnet transaction.',
      detections,
    };
  } catch (error) {
    return {
      scenarioId: incident.scenarioId,
      available: false,
      source,
      note: `The artifact could not be read: ${error instanceof Error ? error.message : 'unknown error'}.`,
      detections: [],
    };
  }
}

/* ───────────────────────────── Per incident ───────────────────────────── */

function evidenceRefsOf(incident: Incident): string[] {
  const refs = [...incident.txs];
  for (const reference of incident.references) refs.push(reference.label);
  return refs;
}

export function analyzeIncident(incident: Incident): HistoricalIncidentAnalysis {
  const text = incidentText(incident);
  const evidenceText = evidenceTextOf(incident);
  const findings: HistoricalFinding[] = incident.vectors.map((vector) => {
    const patternName = resolveBiblePattern(incident, vector);
    const pattern = biblePattern(patternName);
    const signals = bibleSignalsForPattern(patternName).map((signal) =>
      classifySignal(signal.name, patternName, evidenceText),
    );
    const confidence = confidenceFor(incident, vector, text);
    const reproduction =
      incident.reproducible && incident.scenarioId
        ? {
            scenarioId: incident.scenarioId,
            href: `/lab?scenario=${encodeURIComponent(incident.scenarioId)}`,
          }
        : null;

    // Some registry entries carry a vector that the narrative explicitly rules
    // out (Binance 2026: delegatecall-injection, but "key misuse, not theft").
    // Say so rather than letting the label stand as a proven mechanism.
    const contradiction =
      vector === 'delegatecall-injection' &&
      /not a (smart[- ])?contract exploit|key misuse|private[- ]key misuse|did not cause/i.test(text)
        ? ' The published record describes key misuse and expressly not a contract exploit, so this vector is a registry label that the narrative does not corroborate.'
        : '';

    return {
      id: `${incident.slug}:${vector}`,
      incidentSlug: incident.slug,
      vector,
      vectorLabel: ATTACK_VECTORS[vector]?.label ?? vector,
      confidence,
      severity: severityFromVector(vector),
      biblePattern: patternName,
      bibleFamily: pattern?.family ?? 'Unknown',
      bibleSignals: signals,
      evidenceRefs: evidenceRefsOf(incident),
      reproduction,
      limitations: detectorLimitation(vector),
      rationale:
        `${ATTACK_VECTORS[vector]?.label ?? vector} is recorded for this incident. ` +
        `Confidence reflects how explicitly the public record names the mechanism ` +
        `(${Math.round(confidence * 100)}%), not trace evidence.${contradiction}`,
      method: HISTORICAL_METHOD,
    };
  });

  const signalCounts: HistoricalSignalCounts = { observed: 0, expected: 0, notApplicable: 0 };
  for (const finding of findings) {
    for (const signal of finding.bibleSignals) signalCounts[signal.status] += 1;
  }

  const topConfidence = findings.reduce((max, finding) => Math.max(max, finding.confidence), 0);
  const families = [...new Set(findings.map((finding) => finding.bibleFamily))].sort();

  return {
    slug: incident.slug,
    id: incident.id,
    name: incident.name,
    chain: incident.chain,
    date: incident.date,
    lossUsd: incident.lossUsd,
    lossAmount: incident.lossAmount ?? null,
    lossAsset: incident.lossAsset ?? null,
    target: incident.target,
    severity: severityFromVectors(incident.vectors),
    topConfidence,
    reproducible: incident.reproducible,
    scenarioId: incident.scenarioId ?? null,
    recovered: Boolean(incident.recovered),
    vectors: [...incident.vectors],
    bibleFamilies: families,
    findings,
    signalCounts,
    evidenceRefs: evidenceRefsOf(incident),
    method: HISTORICAL_METHOD,
  };
}

/* ───────────────────────────── Aggregation ───────────────────────────── */

const BUCKETS: { label: string; min: number; max: number }[] = [
  { label: '0.35–0.54', min: 0.35, max: 0.5499 },
  { label: '0.55–0.69', min: 0.55, max: 0.6999 },
  { label: '0.70–0.84', min: 0.7, max: 0.8499 },
  { label: '0.85–0.94', min: 0.85, max: 0.94 },
];

function mean(values: number[]): number {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

export function buildHistoricalAnalysis(incidents: Incident[] = INCIDENTS): HistoricalAnalysis {
  const analyses = incidents
    .map((incident) => analyzeIncident(incident))
    .sort((a, b) => b.lossUsd - a.lossUsd);

  const findings = analyses.flatMap((analysis) => analysis.findings);
  const confidences = findings.map((finding) => finding.confidence);

  const byVectorMap = new Map<
    AttackVectorId,
    { count: number; incidentSlugs: Set<string>; lossUsd: number; reproducible: number; confidences: number[] }
  >();

  for (const analysis of analyses) {
    for (const finding of analysis.findings) {
      const entry =
        byVectorMap.get(finding.vector) ??
        { count: 0, incidentSlugs: new Set<string>(), lossUsd: 0, reproducible: 0, confidences: [] };
      entry.count += 1;
      entry.incidentSlugs.add(analysis.slug);
      entry.lossUsd += analysis.lossUsd;
      if (analysis.reproducible) entry.reproducible += 1;
      entry.confidences.push(finding.confidence);
      byVectorMap.set(finding.vector, entry);
    }
  }

  const byVector: HistoricalVectorSummary[] = [...byVectorMap.entries()]
    .map(([vectorId, entry]) => ({
      vectorId,
      label: ATTACK_VECTORS[vectorId]?.label ?? vectorId,
      count: entry.count,
      incidentCount: entry.incidentSlugs.size,
      lossUsd: entry.lossUsd,
      reproducibleCount: entry.reproducible,
      meanConfidence: mean(entry.confidences),
    }))
    .sort((a, b) => b.count - a.count || b.lossUsd - a.lossUsd);

  const byFamilyMap = new Map<
    string,
    { count: number; incidentSlugs: Set<string>; lossUsd: number; confidences: number[] }
  >();
  for (const analysis of analyses) {
    for (const finding of analysis.findings) {
      const entry =
        byFamilyMap.get(finding.bibleFamily) ??
        { count: 0, incidentSlugs: new Set<string>(), lossUsd: 0, confidences: [] };
      entry.count += 1;
      entry.incidentSlugs.add(analysis.slug);
      entry.lossUsd += analysis.lossUsd;
      entry.confidences.push(finding.confidence);
      byFamilyMap.set(finding.bibleFamily, entry);
    }
  }

  const byFamily: HistoricalFamilySummary[] = [...byFamilyMap.entries()]
    .map(([family, entry]) => ({
      family,
      count: entry.count,
      incidentCount: entry.incidentSlugs.size,
      lossUsd: entry.lossUsd,
      meanConfidence: mean(entry.confidences),
    }))
    .sort((a, b) => b.count - a.count || b.lossUsd - a.lossUsd);

  const reproducible = analyses.filter((analysis) => analysis.reproducible);
  const retrospectiveOnly = analyses.filter((analysis) => !analysis.reproducible);
  const totalLoss = analyses.reduce((sum, analysis) => sum + analysis.lossUsd, 0);

  const signalCounts = analyses.reduce(
    (acc, analysis) => ({
      observed: acc.observed + analysis.signalCounts.observed,
      expected: acc.expected + analysis.signalCounts.expected,
      notApplicable: acc.notApplicable + analysis.signalCounts.notApplicable,
    }),
    { observed: 0, expected: 0, notApplicable: 0 },
  );

  return {
    generatedAt: new Date().toISOString(),
    method: HISTORICAL_METHOD,
    disclaimer: HISTORICAL_DISCLAIMER,
    totals: {
      incidents: analyses.length,
      findings: findings.length,
      reproducible: reproducible.length,
      retrospectiveOnly: retrospectiveOnly.length,
      lossUsd: totalLoss,
      signalsObserved: signalCounts.observed,
      signalsExpected: signalCounts.expected,
      signalsNotApplicable: signalCounts.notApplicable,
    },
    coverage: {
      incidents: analyses.length,
      reproducible: reproducible.length,
      retrospectiveOnly: retrospectiveOnly.length,
      reproduciblePct: analyses.length ? reproducible.length / analyses.length : 0,
      reproducedVectors: [...new Set(reproducible.flatMap((analysis) => analysis.vectors))].sort(),
      retrospectiveVectors: [...new Set(retrospectiveOnly.flatMap((analysis) => analysis.vectors))].sort(),
    },
    confidence: {
      min: confidences.length ? Math.min(...confidences) : 0,
      max: confidences.length ? Math.max(...confidences) : 0,
      mean: mean(confidences),
      buckets: BUCKETS.map((bucket) => ({
        ...bucket,
        count: confidences.filter((value) => value >= bucket.min && value <= bucket.max).length,
      })),
    },
    byVector,
    byFamily,
    incidents: analyses,
  };
}

export function historicalIncidentBySlug(slug: string): HistoricalIncidentAnalysis | null {
  const incident = INCIDENTS.find((entry) => entry.slug === slug);
  return incident ? analyzeIncident(incident) : null;
}
