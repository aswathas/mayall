import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Database,
  Download,
  FileText,
  Fingerprint,
  FlaskConical,
  GitBranch,
  History,
  Info,
  Layers,
  Play,
  Radar,
  ScanSearch,
  ShieldCheck,
  Terminal,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AttackVectorId } from '@helix/core';
import { MetricStrip } from '../../components/MetricStrip';
import { Panel } from '../../components/Panel';
import { VectorChip } from '../../components/VectorChip';
import { IntroPlayer } from '../../components/IntroPlayer';
import { SCENARIO_FACTS, REGISTRY } from '../../remotion/data';
import { INTRO_MP4_SRC } from '../../remotion/constants';

export const metadata: Metadata = {
  title: 'Mayall — the trace is the evidence',
  description:
    'Mayall runs real Foundry exploit simulations, parses the forge call trace, runs ten heuristic detectors, and emits a forensic report and a SHA-256 evidence bundle.',
};

const METRIC_CLASS =
  'grid-flow-row grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:grid-cols-6 ' +
  '[&>div]:border-l-0 [&>div]:border-t [&>div:first-child]:border-t-0 ' +
  'sm:[&>div:nth-child(2)]:border-t-0 ' +
  'lg:[&>div]:border-t-0 lg:[&>div]:border-l lg:[&>div:first-child]:border-l-0';

interface Step {
  icon: LucideIcon;
  label: string;
  title: string;
  body: string;
  meta: string;
}

const PIPELINE: Step[] = [
  {
    icon: Terminal,
    label: 'Raw',
    title: 'Local Foundry run',
    body: 'A Solidity test executes the exploit against the contract in this repository. The real stdout and -vvvv call trace are captured.',
    meta: 'forge test -vvvv',
  },
  {
    icon: GitBranch,
    label: 'Parsed',
    title: 'Call tree rebuilt',
    body: 'The trace parser reconstructs every frame, its depth, gas attribution and value movement. The re-entrancy reproduction yields 83 nodes.',
    meta: '83 nodes · reentrancy',
  },
  {
    icon: ScanSearch,
    label: 'Detectors',
    title: 'Ten heuristics score it',
    body: 'Recursion, value flow, storage mutation, privileged calls, delegatecall and more are scored against the trace and the artifact.',
    meta: '10 detectors',
  },
  {
    icon: FileText,
    label: 'Report',
    title: 'Forensic narrative',
    body: 'Findings carry evidence pointers, severity, confidence and a mermaid attack flow. The report is written for a reader, not a terminal.',
    meta: 'root cause · evidence',
  },
  {
    icon: Download,
    label: 'Bundle',
    title: 'Court-ready package',
    body: 'Report, trace, artifact, storage diff, balance timeline and raw output are zipped with a SHA-256 digest for every file.',
    meta: 'chain-of-custody.json',
  },
];

interface Capability {
  icon: LucideIcon;
  title: string;
  body: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: FlaskConical,
    title: 'Real Foundry simulations',
    body: 'Six exploit reproductions are Solidity tests executed by forge on this machine. No fixture stands in for the run.',
  },
  {
    icon: GitBranch,
    title: 'Real parsed traces',
    body: 'The call tree, gas attribution and storage diff come from forge output. The deepest re-entrant withdrawal is seven frames down.',
  },
  {
    icon: ScanSearch,
    title: 'Ten heuristic detectors',
    body: 'Reentrancy, flash loan, oracle manipulation, access control, delegatecall, self-destruct, arithmetic, ordering, bridge and logic error.',
  },
  {
    icon: FileText,
    title: 'A forensic report',
    body: 'Root cause, evidence pointers, severity and confidence, plus an attack-flow diagram and a readable narrative.',
  },
  {
    icon: Fingerprint,
    title: 'A verifiable evidence bundle',
    body: 'Every file in the bundle carries a SHA-256 digest in chain-of-custody.json, alongside the command and timestamps.',
  },
];

interface RouteLink {
  href: string;
  label: string;
  body: string;
  icon: LucideIcon;
}

const ROUTES: RouteLink[] = [
  { href: '/attack-lab', label: 'Attack lab', body: 'Write and run a custom exploit against the local harness.', icon: Play },
  { href: '/tracker', label: 'Live attack tracker', body: 'Watch one run in flight: gas, depth, balances and trace feed.', icon: Radar },
  { href: '/lab', label: 'Live lab', body: 'Run any of the six reproductions and inspect the evidence.', icon: FlaskConical },
  { href: '/historical', label: 'Historical incidents', body: 'Public exploits, the loss and the attack classes.', icon: History },
  { href: '/bible', label: 'Exploit bible', body: 'The attack-vector taxonomy and what an investigator looks for.', icon: BookOpen },
  { href: '/showcase', label: 'Showcase', body: 'The pipeline and the evidence, end to end.', icon: Layers },
  { href: '/docs', label: 'Documentation', body: 'How the engine works and what the evidence does not prove.', icon: Boxes },
];

export default function IntroPage() {
  return (
    <div className="flex flex-col">
      {/* ── hero ── */}
      <section className="relative -mx-4 -mt-5 overflow-hidden border-b border-edge bg-abyss/40 sm:-mx-6 lg:-mx-8 lg:-mt-8">
        <div className="mx-auto w-full max-w-[1500px] px-5 pb-8 pt-10 sm:px-8 lg:px-12 lg:pb-10 lg:pt-14">
          <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,auto)] lg:gap-12">
            <div className="min-w-0">
              <h1 className="display text-[clamp(3.2rem,7.4vw,6.4rem)] font-semibold uppercase leading-[0.9] tracking-[0.13em] text-ink">
                Mayall
              </h1>
              <p className="mt-5 max-w-[24ch] text-[clamp(1.35rem,2.1vw,1.85rem)] font-medium leading-snug tracking-[-0.01em] text-ink">
                The trace is the evidence.
              </p>
              <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-dim">
                A forensic console for Web3 exploits: real Foundry simulations, the parsed{' '}
                <span className="mono text-[0.92em] text-ink">forge -vvvv</span> call trace, ten heuristic
                detectors, a forensic report, and a downloadable evidence bundle with a SHA-256 chain of custody.
              </p>
            </div>

            <div className="flex min-w-0 flex-col items-start gap-4 lg:items-end">
              <div className="flex flex-wrap items-center gap-2">
                <Link href="/attack-lab" className="btn btn-primary h-11 px-5 text-sm">
                  <Play className="h-4 w-4" aria-hidden="true" />
                  Run a live simulation
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link href="/tracker" className="btn h-11 px-5 text-sm">
                  <Radar className="h-4 w-4" aria-hidden="true" />
                  Live attack tracker
                </Link>
              </div>

              <div className="flex w-full items-start gap-2.5 rounded-[9px] border border-edge bg-panel px-3.5 py-2.5 lg:max-w-[420px]">
                <Info className="mt-[2px] h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
                <p className="text-xs leading-relaxed text-ink-dim">
                  Local Foundry simulation, not mainnet evidence. Every reproduction runs against the
                  contracts in this repository.
                </p>
              </div>

              <nav aria-label="Intro routes" className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {[
                  { href: '/lab', label: 'Lab' },
                  { href: '/historical', label: 'Historical' },
                  { href: '/bible', label: 'Bible' },
                  { href: '/showcase', label: 'Showcase' },
                  { href: '/docs', label: 'Docs' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="inline-flex min-h-11 items-center gap-1 text-[0.78rem] text-ink-dim transition-colors duration-100 hover:text-arterial"
                  >
                    {item.label}
                    <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                ))}
                <a
                  href="/api/bundle/lab-reentrancy?scenario=reentrancy"
                  download
                  className="inline-flex min-h-11 items-center gap-1 text-[0.78rem] text-ink-dim transition-colors duration-100 hover:text-arterial"
                >
                  Evidence bundle
                  <Download className="h-3 w-3" aria-hidden="true" />
                </a>
              </nav>
            </div>
          </div>

          {/* the film */}
          <figure className="mt-9 min-w-0 lg:mt-11">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="mono flex items-center gap-2 text-[0.58rem] uppercase tracking-[0.14em] text-ink-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-arterial" aria-hidden="true" />
                Remotion composition · MayallIntro
              </span>
              <span className="mono text-[0.58rem] tabular-nums text-ink-faint">
                1920 × 1080 · 30 fps · 15.0 s · loops
              </span>
            </div>

            <div className="overflow-hidden rounded-[14px] border border-edge bg-void">
              <IntroPlayer />
            </div>

            <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <span className="mono text-[0.56rem] uppercase tracking-[0.12em] text-ink-faint">
                Fourteen nested call frames · 7 withdrawals · 6 ETH
              </span>
              <a
                href={INTRO_MP4_SRC}
                download
                className="inline-flex min-h-11 items-center gap-1.5 text-[0.72rem] text-ink-dim transition-colors duration-100 hover:text-arterial"
              >
                <Download className="h-3 w-3" aria-hidden="true" />
                Download the film · MP4
              </a>
            </figcaption>
          </figure>
        </div>
      </section>

      <div className="flex flex-col gap-5 pt-6">
        {/* ── the real numbers ── */}
        <MetricStrip
          className={METRIC_CLASS}
          items={[
            { label: 'Tracked loss', value: REGISTRY.lossUsd, hint: 'reported at disclosure', tone: 'threat' },
            { label: 'Incidents', value: String(REGISTRY.incidents), hint: 'in the registry' },
            { label: 'Chains', value: String(REGISTRY.chains), hint: 'execution environments' },
            { label: 'Attack vectors', value: String(REGISTRY.vectors), hint: 'in the taxonomy' },
            { label: 'Detectors', value: String(REGISTRY.detectors), hint: 'heuristics on every trace' },
            {
              label: 'Reproductions',
              value: String(REGISTRY.reproductions),
              hint: 'live local Foundry runs',
              tone: 'safe',
            },
          ]}
        />

        {/* ── pipeline ── */}
        <Panel
          title="What the pipeline does"
          subtitle="raw → parsed trace → detectors → report → bundle"
          flush
          action={
            <Link
              href="/docs"
              className="mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-dim transition-colors duration-100 hover:text-arterial"
            >
              Read the docs
            </Link>
          }
        >
          <ol className="grid grid-cols-1 md:grid-cols-5">
            {PIPELINE.map((step, index) => {
              const Icon = step.icon;
              return (
                <li
                  key={step.label}
                  className={`flex min-w-0 flex-col p-4 sm:p-5 ${
                    index > 0 ? 'border-t border-edge md:border-l md:border-t-0' : ''
                  }`}
                >
                  <Icon className="h-4 w-4 text-arterial" aria-hidden="true" />
                  <p className="label-micro mt-3">{step.label}</p>
                  <h3 className="display mt-1.5 text-[0.95rem] font-medium leading-snug text-ink">{step.title}</h3>
                  <p className="mt-2 text-[0.74rem] leading-relaxed text-ink-dim">{step.body}</p>
                  <p className="mono mt-3 text-[0.58rem] tracking-[0.04em] text-ink-faint">{step.meta}</p>
                </li>
              );
            })}
          </ol>
        </Panel>

        {/* ── scenarios ── */}
        <Panel
          title="Six local reproductions"
          subtitle="Measured by the local engine · artifacts/summary.json"
          flush
          action={
            <Link
              href="/lab"
              className="mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-dim transition-colors duration-100 hover:text-arterial"
            >
              Open the lab
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th>Vector</th>
                  <th className="text-right">Loss</th>
                  <th>Top detector</th>
                  <th className="text-right">Confidence</th>
                  <th className="text-right">Trace nodes</th>
                  <th scope="col">
                    <span className="sr-only">Run</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {SCENARIO_FACTS.map((scenario) => (
                  <tr key={scenario.id}>
                    <td>
                      <span className="block text-[0.85rem] leading-snug text-ink">{scenario.title}</span>
                      <span className="mono mt-0.5 block text-[0.6rem] text-ink-faint">
                        {scenario.id} · {scenario.chain}
                      </span>
                    </td>
                    <td>
                      <VectorChip vectorId={scenario.vectorId as AttackVectorId} />
                    </td>
                    <td className="mono text-right tabular-nums text-arterial">{scenario.lossEth} ETH</td>
                    <td className="text-ink-dim">{scenario.topDetection}</td>
                    <td className="mono text-right tabular-nums text-ink">{Math.round(scenario.confidence * 100)}%</td>
                    <td className="mono text-right tabular-nums text-ink-dim">{scenario.traceNodes}</td>
                    <td className="text-right">
                      <Link
                        href={`/lab?scenario=${scenario.id}`}
                        className="mono inline-flex min-h-11 items-center gap-1 whitespace-nowrap px-2 text-[0.62rem] uppercase tracking-[0.1em] text-ink-dim transition-colors duration-100 hover:text-arterial"
                        aria-label={`Run ${scenario.title} in the lab`}
                      >
                        Run
                        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-edge px-4 py-3">
            <p className="text-xs leading-relaxed text-ink-dim">
              Loss is the amount the local harness records leaving the target contract, not a replayed mainnet
              transaction.
            </p>
            <a
              href="/api/bundle/lab-flash-loan?scenario=flash-loan"
              download
              className="btn btn-ghost h-11 px-3 text-xs"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Flash-loan evidence bundle
            </a>
          </div>
        </Panel>

        {/* ── capabilities + routes ── */}
        <div className="grid gap-4 lg:grid-cols-12">
          <Panel title="What is real here" className="lg:col-span-7" bodyClassName="pt-1">
            <dl className="divide-y divide-edge">
              {CAPABILITIES.map((capability) => {
                const Icon = capability.icon;
                return (
                  <div key={capability.title} className="flex gap-3 py-3.5 first:pt-0 last:pb-0">
                    <span className="mt-[2px] flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-edge bg-abyss">
                      <Icon className="h-3.5 w-3.5 text-arterial" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-sm font-medium text-ink">{capability.title}</dt>
                      <dd className="mt-1 text-[0.78rem] leading-relaxed text-ink-dim">{capability.body}</dd>
                    </div>
                  </div>
                );
              })}
            </dl>
          </Panel>

          <Panel title="Where to go next" className="lg:col-span-5" flush>
            <ul className="divide-y divide-edge">
              {ROUTES.map((route) => {
                const Icon = route.icon;
                return (
                  <li key={route.href}>
                    <Link
                      href={route.href}
                      className="group flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors duration-100 hover:bg-elevated/50"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-edge bg-abyss">
                        <Icon className="h-3.5 w-3.5 text-ink-dim" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[0.84rem] font-medium text-ink">{route.label}</span>
                        <span className="mt-0.5 block text-[0.7rem] leading-snug text-ink-faint">{route.body}</span>
                      </span>
                      <ArrowUpRight
                        className="h-3.5 w-3.5 shrink-0 text-ink-faint transition-colors duration-100 group-hover:text-arterial"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {/* ── evidence + honesty ── */}
        <Panel title="The evidence bundle" subtitle="What leaves the lab with the report">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)]">
            <div className="min-w-0">
              <p className="max-w-[62ch] text-sm leading-relaxed text-ink-dim">
                A bundle is a zip of the report, the structured artifact, the raw trace, the storage diff, the
                balance timeline, the detector findings and the forge output. A{' '}
                <span className="mono text-[0.92em] text-ink">chain-of-custody.json</span> records the command,
                the timestamps, the byte length and a SHA-256 digest for every file.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <a
                  href="/api/bundle/lab-reentrancy?scenario=reentrancy"
                  download
                  className="btn btn-primary h-11 px-4 text-sm"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download the reentrancy bundle
                </a>
                <Link href="/docs" className="btn btn-ghost h-11 px-4 text-sm">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  What the evidence proves
                </Link>
              </div>
            </div>

            <div className="min-w-0 border-t border-edge pt-4 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
              <p className="label-micro">Bundle contents</p>
              <ul className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2">
                {[
                  { icon: FileText, label: 'report/report.md' },
                  { icon: FileText, label: 'report/report.json' },
                  { icon: Database, label: 'evidence/artifact.json' },
                  { icon: Terminal, label: 'evidence/trace.txt' },
                  { icon: Layers, label: 'evidence/storage-diff.csv' },
                  { icon: Layers, label: 'evidence/balance-timeline.csv' },
                  { icon: ScanSearch, label: 'evidence/patterns.json' },
                  { icon: Fingerprint, label: 'chain-of-custody.json' },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.label} className="flex items-center gap-2">
                      <Icon className="h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span className="mono truncate text-[0.64rem] text-ink-dim">{item.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </Panel>

        <footer className="border-t border-edge pt-4">
          <p className="max-w-[105ch] text-xs leading-relaxed text-ink-dim">
            Every figure on this page comes from the local engine and the artifacts it wrote. Mayall reconstructs
            exploit logic in a local Foundry harness; it does not replay, index or attest mainnet transactions.
            Registry losses are public disclosures rounded at the time of reporting.
          </p>
        </footer>
      </div>
    </div>
  );
}
