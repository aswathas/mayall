/**
 * The Binance $6.3B breach (29–30 October 2026) — the flagship live case.
 *
 * This module is DATA, not prose: the verified facts as published, the
 * attack-chain stages, the affected-asset summary, the responder actions and
 * the typed shells that the forensic engine fills with Mayall's analysis.
 *
 * Everything here comes from the Cointelegraph coverage listed in `sources`.
 * No transaction hash, block number, wallet address or token amount is
 * invented. If a figure is not in the verified record, it is not here.
 */
import type { AttackVectorId, Chain, Severity } from './index.js';

export const LIVE_CASE_ID = 'binance-7702';
export const LIVE_CASE_INCIDENT_SLUG = 'binance-7702-breach';

/* ─────────────────────────── Sources ─────────────────────────── */

export interface LiveCaseSource {
  id: string;
  /** Headline as published. */
  label: string;
  publisher: string;
  /** ISO publication date. */
  date: string;
  url: string;
}

export const LIVE_CASE_SOURCES: LiveCaseSource[] = [
  {
    id: 'ct-alert',
    label: 'Binance-linked wallet faces possible exploit, blockchain researcher warns',
    publisher: 'Cointelegraph',
    date: '2026-10-29',
    url: 'https://cointelegraph.com/news/binance-linked-wallet-faces-possible-exploit-blockchain-researcher-warns',
  },
  {
    id: 'ct-live',
    label: 'Live updates: Binance $6.3B hack linked to North Korea’s TraderTraitor',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/live-updates-binance-63b-hack-linked-to-north-koreas-tradertraitor',
  },
  {
    id: 'ct-7702',
    label: 'Binance hack: security experts weigh Ethereum EIP-7702 role',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/binance-hack-security-ethereum-eip-7702-role',
  },
  {
    id: 'ct-blockaid',
    label: 'Binance hack may involve private-key misuse, not theft — Blockaid CEO',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/binance-hack-may-involve-private-key-misuse-not-theft-blockaid-ceo',
  },
  {
    id: 'ct-attribution',
    label: 'North Korea linked to $6.3B Binance hack by crypto investigators',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/north-korea-linked-to-63b-binance-hack-by-crypto-investigators',
  },
  {
    id: 'ct-fbi',
    label: 'Binance, FBI recover assets after hack',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/binance-fbi-recover-assets-hack',
  },
  {
    id: 'ct-5b',
    label: 'Binance has $5 billion in replacement crypto in custody',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/binance-5-billion-replacement-crypto-in-custody',
  },
  {
    id: 'ct-btc',
    label: 'Binance hacker’s Bitcoin holdings exceed Coinbase’s BTC treasury',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/binance-hacker-bitcoin-holdings-exceed-coinbase-btc-treasury',
  },
  {
    id: 'ct-recap',
    label: 'Recap: how Binance’s record $6.3B hack unfolded',
    publisher: 'Cointelegraph',
    date: '2026-10-30',
    url: 'https://cointelegraph.com/news/recap-binances-record-63b-hack-unfolded',
  },
];

/* ─────────────────────────── Facts ─────────────────────────── */

export type LiveCaseFactTone = 'threat' | 'warn' | 'safe' | 'default';

export interface LiveCaseFact {
  id: string;
  label: string;
  value: string;
  detail: string;
  sourceIds: string[];
  tone?: LiveCaseFactTone;
}

export interface LiveCaseTimelineEntry {
  id: string;
  /** ISO date. The coverage gives dates, not clock times, so none are invented. */
  date: string;
  kind:
    | 'alert'
    | 'disclosure'
    | 'root-cause'
    | 'amplifier'
    | 'attribution'
    | 'freeze'
    | 'law-enforcement'
    | 'market'
    | 'holdings'
    | 'response'
    | 'follow-up';
  title: string;
  description: string;
  sourceIds: string[];
}

export interface LiveCaseAsset {
  id: string;
  label: string;
  amount: string;
  note: string;
  sourceIds: string[];
}

export interface LiveCaseResponder {
  id: string;
  actor: string;
  action: string;
  sourceIds: string[];
}

export interface LiveCaseAttribution {
  actor: string;
  /** The analyst's own wording, kept verbatim. */
  confidence: string;
  confidenceSource: string;
  detail: string;
  corroboration: string;
  sourceIds: string[];
}

export interface LiveCaseMarketImpact {
  bnb: string;
  bitcoin: string;
  liquidations: string;
  equities: string;
  sourceIds: string[];
}

export interface LiveCasePriorContext {
  id: string;
  label: string;
  detail: string;
  sourceIds: string[];
}

export type LiveCaseStatus = 'active-investigation' | 'recovery-in-progress' | 'closed';

export interface LiveCase {
  id: string;
  incidentSlug: string;
  name: string;
  shortName: string;
  chain: Chain;
  severity: Severity;
  status: LiveCaseStatus;
  statusLabel: string;
  statusDetail: string;
  /** First signal in public coverage. */
  firstSignalledAt: string;
  /** Public disclosure date. */
  disclosedAt: string;
  /** Date of the newest source in the record — not a live clock. */
  lastUpdated: string;
  lossUsd: number;
  frozenUsd: number;
  attribution: LiveCaseAttribution;
  summary: string;
  facts: LiveCaseFact[];
  timeline: LiveCaseTimelineEntry[];
  assets: LiveCaseAsset[];
  responders: LiveCaseResponder[];
  marketImpact: LiveCaseMarketImpact;
  priorContext: LiveCasePriorContext[];
  sources: LiveCaseSource[];
  scopeNote: string;
}

/* ─────────────────────── Analysis shape ─────────────────────── */

export type LiveCaseSignalStatus = 'observed' | 'expected' | 'notApplicable';
export type LiveCasePatternRole = 'primary' | 'contributing' | 'context';
export type LiveCaseCoverageStatus = 'fired' | 'not-fired' | 'out-of-scope';

export interface LiveCaseClassification {
  vectorId: AttackVectorId;
  label: string;
  role: 'primary' | 'contributing';
  /** 0..1 — classification confidence from the public record, not trace evidence. */
  confidence: number;
  mechanism: string;
  rationale: string;
  biblePattern: string;
  bibleFamily: string;
}

export interface LiveCaseBibleSignal {
  /** Signal name exactly as it appears in Bible sheet 03. */
  name: string;
  /** Sheet 04 pattern this signal was mapped through. */
  pattern: string;
  family: string;
  /** Sheet 03 confidence weight, verbatim (e.g. "Weight 3 — Hard Evidence"). */
  weight: string;
  /** Sheet 03 threshold text, quoted verbatim. */
  threshold: string;
  status: LiveCaseSignalStatus;
  note: string;
}

export interface LiveCaseBiblePattern {
  name: string;
  family: string;
  role: LiveCasePatternRole;
  /** Sheet 04 attack type, verbatim. */
  attackType: string;
  /** Sheet 04 minimum-signal and confidence threshold, verbatim. */
  threshold: string;
  thresholdMet: boolean;
  note: string;
}

export interface LiveCaseDetectorCoverage {
  id: string;
  label: string;
  vectorId: AttackVectorId;
  status: LiveCaseCoverageStatus;
  reason: string;
  /** The detector's own limitation string, quoted from DETECTOR_CATALOG. */
  limitation: string;
}

export interface LiveCaseAnalogue {
  scenarioId: string;
  title: string;
  route: string;
  lossEth: string;
  detectorId: string;
  detectorLabel: string;
  confidence: number;
  artifactSource: string;
  reproduces: string;
  doesNotReproduce: string[];
  note: string;
}

export interface LiveCaseActionGroup {
  window: string;
  items: string[];
}

export interface LiveCaseSignalCounts {
  observed: number;
  expected: number;
  notApplicable: number;
}

export interface LiveCaseAnalysis {
  caseId: string;
  method: string;
  methodNote: string;
  classification: LiveCaseClassification[];
  biblePatterns: LiveCaseBiblePattern[];
  signals: LiveCaseBibleSignal[];
  signalCounts: LiveCaseSignalCounts;
  coverage: LiveCaseDetectorCoverage[];
  analogue: LiveCaseAnalogue;
  actionPlan: LiveCaseActionGroup[];
  scopeNote: string;
}

export type LiveCaseGeneratedBy = 'minimax-code' | 'deterministic';

export interface LiveCaseReportSection {
  heading: string;
  body: string;
}

export interface LiveCaseReport {
  caseId: string;
  title: string;
  generatedAt: string;
  generatedBy: LiveCaseGeneratedBy;
  model: string | null;
  markdown: string;
  mermaid: string | null;
  mermaidBlocks: string[];
  sections: LiveCaseReportSection[];
  analysis: LiveCaseAnalysis;
  source: 'stored' | 'deterministic-fallback';
  note: string;
}

/* ─────────────────────────── The case ─────────────────────────── */

export const BINANCE_LIVE_CASE: LiveCase = {
  id: LIVE_CASE_ID,
  incidentSlug: LIVE_CASE_INCIDENT_SLUG,
  name: 'The Binance $6.3B breach',
  shortName: 'Binance $6.3B breach',
  chain: 'Ethereum',
  severity: 'critical',
  status: 'active-investigation',
  statusLabel: 'Active investigation',
  statusDetail: 'Recovery in progress · about $3 billion frozen',
  firstSignalledAt: '2026-10-29',
  disclosedAt: '2026-10-30',
  lastUpdated: '2026-10-30',
  lossUsd: 6_300_000_000,
  frozenUsd: 3_000_000_000,
  attribution: {
    actor: "North Korea's TraderTraitor",
    confidence: 'high confidence',
    confidenceSource: 'TRM Labs',
    detail:
      'TRM Labs said it has high confidence in the attribution to North Korea’s TraderTraitor. The wording is the analyst’s own.',
    corroboration:
      'ZachXBT identified stolen funds from the Binance and Bitget hacks converging at the same address.',
    sourceIds: ['ct-attribution', 'ct-live'],
  },
  summary:
    'On 29–30 October 2026, Binance disclosed a $6.3 billion loss — reported as the largest hack in cryptocurrency history. Binance and Blockaid’s CEO attribute it to a compromised DevOps engineer’s laptop and private-key misuse, not a smart-contract exploit. About $3 billion was frozen by Binance and its partners, the FBI and Secret Service joined the response, and TRM Labs attributed the theft to North Korea’s TraderTraitor with high confidence.',
  facts: [
    {
      id: 'loss',
      label: 'Reported loss',
      value: '$6.3 billion',
      detail:
        'Reported as the largest hack in cryptocurrency history. First signalled 2026-10-29; disclosed publicly 2026-10-30.',
      sourceIds: ['ct-alert', 'ct-live', 'ct-recap'],
      tone: 'threat',
    },
    {
      id: 'root-cause',
      label: 'Root cause',
      value: 'Private-key misuse',
      detail:
        'Attackers gained access to a compromised DevOps engineer’s laptop. Binance and Blockaid’s CEO describe private-key misuse, not a smart-contract exploit.',
      sourceIds: ['ct-blockaid', 'ct-live'],
      tone: 'threat',
    },
    {
      id: 'eip-7702',
      label: 'EIP-7702 role',
      value: 'Amplifier, not cause',
      detail:
        'Security experts said EIP-7702 did not cause the hack — attackers could have drained the wallets without it — but the Ethereum upgrade may have amplified the losses by helping bypass withdrawal safeguards.',
      sourceIds: ['ct-7702'],
      tone: 'warn',
    },
    {
      id: 'attribution',
      label: 'Attribution',
      value: 'TRM Labs: high confidence',
      detail:
        'Linked to North Korea’s TraderTraitor. ZachXBT identified stolen funds from the Binance and Bitget hacks converging at the same address.',
      sourceIds: ['ct-attribution', 'ct-live'],
      tone: 'warn',
    },
    {
      id: 'freeze',
      label: 'Frozen',
      value: 'About $3 billion',
      detail: 'Binance and its partners froze roughly $3 billion in assets.',
      sourceIds: ['ct-fbi', 'ct-live'],
      tone: 'safe',
    },
    {
      id: 'cover',
      label: 'Loss cover',
      value: 'More than $6.34 billion',
      detail:
        'Binance pledged to cover all losses, said it set aside more than $6.34 billion, and said it holds $5 billion in matching tokens to cover the shortfall in its next proof-of-reserves report.',
      sourceIds: ['ct-5b', 'ct-live'],
      tone: 'safe',
    },
    {
      id: 'law-enforcement',
      label: 'Law enforcement',
      value: 'FBI and Secret Service',
      detail: 'US agencies joined the response, are investigating the theft and are helping trace stolen assets.',
      sourceIds: ['ct-fbi'],
      tone: 'default',
    },
    {
      id: 'holdings',
      label: 'Attacker holdings',
      value: '18,270 BTC · >500,000 ETH',
      detail:
        'Early on 2026-10-30 the attacker held 18,270 BTC — more than Coinbase’s reported corporate treasury — and a stash exceeding 500,000 ETH.',
      sourceIds: ['ct-btc', 'ct-live'],
      tone: 'threat',
    },
    {
      id: 'market',
      label: 'Market impact',
      value: 'BNB about -8%',
      detail:
        'Bitcoin traded near $77,000, roughly $1.6 billion in liquidations followed, and crypto-linked equities (Circle, Strategy, Coinbase) sold off.',
      sourceIds: ['ct-live', 'ct-recap'],
      tone: 'warn',
    },
    {
      id: 'follow-up',
      label: 'Secondary finding',
      value: 'Additional breaches',
      detail: 'Reporters noted that investigators had uncovered additional breaches.',
      sourceIds: ['ct-live'],
      tone: 'warn',
    },
  ],
  timeline: [
    {
      id: 'signal',
      date: '2026-10-29',
      kind: 'alert',
      title: 'Onchain alert: a Binance-linked wallet',
      description:
        'A blockchain researcher warned that a Binance-linked wallet faced a possible exploit. This is the first public signal in the record.',
      sourceIds: ['ct-alert', 'ct-recap'],
    },
    {
      id: 'disclosure',
      date: '2026-10-30',
      kind: 'disclosure',
      title: 'Public disclosure: $6.3 billion',
      description:
        'Binance disclosed a $6.3 billion loss, reported as the largest hack in cryptocurrency history.',
      sourceIds: ['ct-live', 'ct-recap'],
    },
    {
      id: 'root-cause',
      date: '2026-10-30',
      kind: 'root-cause',
      title: 'Root cause: a compromised DevOps laptop',
      description:
        'Binance and Blockaid’s CEO attributed the loss to a compromised DevOps engineer’s laptop and private-key misuse, not a smart-contract exploit.',
      sourceIds: ['ct-blockaid', 'ct-live'],
    },
    {
      id: 'eip-7702',
      date: '2026-10-30',
      kind: 'amplifier',
      title: 'EIP-7702 assessed as an amplifier',
      description:
        'Security experts said EIP-7702 did not cause the hack — the wallets could have been drained without it — but may have amplified the losses by helping bypass withdrawal safeguards.',
      sourceIds: ['ct-7702'],
    },
    {
      id: 'attribution',
      date: '2026-10-30',
      kind: 'attribution',
      title: 'Attribution: TraderTraitor, high confidence',
      description:
        'Investigators linked the theft to North Korea’s TraderTraitor. TRM Labs said it has high confidence in the attribution; ZachXBT reported Binance and Bitget funds converging at one address.',
      sourceIds: ['ct-attribution', 'ct-live'],
    },
    {
      id: 'freeze',
      date: '2026-10-30',
      kind: 'freeze',
      title: 'About $3 billion frozen',
      description: 'Binance and its partners froze roughly $3 billion in assets.',
      sourceIds: ['ct-fbi', 'ct-live'],
    },
    {
      id: 'law-enforcement',
      date: '2026-10-30',
      kind: 'law-enforcement',
      title: 'FBI and Secret Service join',
      description:
        'The FBI and Secret Service joined the response; US agencies are investigating the theft and helping trace stolen assets.',
      sourceIds: ['ct-fbi'],
    },
    {
      id: 'holdings',
      date: '2026-10-30',
      kind: 'holdings',
      title: 'Attacker holdings observed',
      description:
        'Early on 30 October the attacker held 18,270 BTC — more than Coinbase’s reported corporate treasury — and a stash exceeding 500,000 ETH.',
      sourceIds: ['ct-btc', 'ct-live'],
    },
    {
      id: 'cover',
      date: '2026-10-30',
      kind: 'response',
      title: 'Binance pledges to cover all losses',
      description:
        'Binance said it set aside more than $6.34 billion and holds $5 billion in matching tokens for the shortfall, to be included in its next proof-of-reserves report.',
      sourceIds: ['ct-5b', 'ct-live'],
    },
    {
      id: 'market',
      date: '2026-10-30',
      kind: 'market',
      title: 'Market repricing',
      description:
        'BNB fell about 8%, Bitcoin traded near $77,000, roughly $1.6 billion in liquidations followed, and crypto-linked equities including Circle, Strategy and Coinbase sold off.',
      sourceIds: ['ct-live', 'ct-recap'],
    },
    {
      id: 'follow-up',
      date: '2026-10-30',
      kind: 'follow-up',
      title: 'Additional breaches reported',
      description: 'Reporters noted that investigators had uncovered additional breaches.',
      sourceIds: ['ct-live'],
    },
  ],
  assets: [
    {
      id: 'loss',
      label: 'Reported loss',
      amount: '$6.3 billion',
      note: 'largest hack in cryptocurrency history',
      sourceIds: ['ct-live', 'ct-recap'],
    },
    {
      id: 'frozen',
      label: 'Frozen by Binance and partners',
      amount: 'About $3 billion',
      note: 'recovery in progress',
      sourceIds: ['ct-fbi', 'ct-live'],
    },
    {
      id: 'set-aside',
      label: 'Cover set aside',
      amount: 'More than $6.34 billion',
      note: 'Binance pledged to cover all losses',
      sourceIds: ['ct-5b', 'ct-live'],
    },
    {
      id: 'matching',
      label: 'Matching tokens held',
      amount: '$5 billion',
      note: 'to cover the shortfall in the next proof-of-reserves',
      sourceIds: ['ct-5b'],
    },
    {
      id: 'btc',
      label: 'Attacker BTC',
      amount: '18,270 BTC',
      note: 'more than Coinbase’s reported corporate treasury',
      sourceIds: ['ct-btc', 'ct-live'],
    },
    {
      id: 'eth',
      label: 'Attacker ETH',
      amount: 'More than 500,000 ETH',
      note: 'a stash reported early on 2026-10-30',
      sourceIds: ['ct-live'],
    },
  ],
  responders: [
    {
      id: 'binance-freeze',
      actor: 'Binance and partners',
      action: 'Froze about $3 billion in assets.',
      sourceIds: ['ct-fbi', 'ct-live'],
    },
    {
      id: 'binance-cover',
      actor: 'Binance',
      action:
        'Pledged to cover all losses, set aside more than $6.34 billion, and holds $5 billion in matching tokens for the shortfall in its next proof-of-reserves report.',
      sourceIds: ['ct-5b', 'ct-live'],
    },
    {
      id: 'us-agencies',
      actor: 'FBI and Secret Service',
      action: 'Joined the response; US agencies are investigating the theft and helping trace stolen assets.',
      sourceIds: ['ct-fbi'],
    },
    {
      id: 'trm',
      actor: 'TRM Labs',
      action: 'Assessed the attribution to North Korea’s TraderTraitor as high confidence.',
      sourceIds: ['ct-attribution'],
    },
    {
      id: 'zachxbt',
      actor: 'ZachXBT',
      action: 'Identified stolen funds from the Binance and Bitget hacks converging at the same address.',
      sourceIds: ['ct-attribution', 'ct-live'],
    },
  ],
  marketImpact: {
    bnb: 'BNB fell about 8%.',
    bitcoin: 'Bitcoin traded near $77,000.',
    liquidations: 'Roughly $1.6 billion in liquidations followed.',
    equities: 'Crypto-linked equities (Circle, Strategy, Coinbase) sold off.',
    sourceIds: ['ct-live', 'ct-recap'],
  },
  priorContext: [
    {
      id: 'bitget',
      label: 'Prior context — Bitget',
      detail:
        'ZachXBT linked the same actor family to the earlier Bitget hack, and reported funds from both incidents converging at one address. The Bitget incident is context for the actor, not part of this incident.',
      sourceIds: ['ct-attribution'],
    },
    {
      id: 'thorchain',
      label: 'Prior context — THORChain laundering',
      detail:
        'THORChain laundering routes were observed in earlier Bybit and Bitget cases. That pattern is prior context for tracing, not a verified fact of this incident.',
      sourceIds: ['ct-attribution', 'ct-recap'],
    },
  ],
  sources: LIVE_CASE_SOURCES,
  scopeNote:
    'This is a retrospective analysis of a publicly reported incident. Mayall did not replay the Binance transactions, holds no incident trace, and publishes no invented hash, address or block number. The local Foundry reproduction on this page is the closest analogue — the delegatecall scenario — not a reproduction of the breach.',
};
