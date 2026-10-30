import Link from 'next/link';
import { Check, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { ATTACK_VECTOR_LIST } from '@helix/core';
import { EvidencePipelineFigure } from '../../components/EvidencePipelineFigure';
import { SeverityChip } from '../../components/SeverityChip';

/* Mirrors packages/forensic-engine/src/detectors.ts */
const DETECTORS: { name: string; vector: string; severity: 'critical' | 'high' | 'medium' | 'low'; fires: string }[] = [
  {
    name: 'Reentrancy',
    vector: 'reentrancy',
    severity: 'critical',
    fires: 'The same contract::function pair appears more than once in one trace, or the trace makes repeated value-bearing calls.',
  },
  {
    name: 'Flash Loan',
    vector: 'flash-loan',
    severity: 'critical',
    fires: 'A flash-borrow primitive is referenced, or a single atomic value transfer exceeds 10^15 wei inside the exploit transaction.',
  },
  {
    name: 'Oracle Manipulation',
    vector: 'oracle-manipulation',
    severity: 'critical',
    fires: 'A price-bearing storage slot mutates during the exploit, or a recorded step explicitly pushes a quoted price before extraction.',
  },
  {
    name: 'Access Control Failure',
    vector: 'access-control',
    severity: 'high',
    fires: 'An authority slot is rewritten, or a privileged entry point (mint, owner, upgrade, destroy) is reached from an untrusted caller.',
  },
  {
    name: 'Delegate Call Injection',
    vector: 'delegatecall-injection',
    severity: 'critical',
    fires: 'A delegatecall frame appears in the trace, or a recorded step installs a caller-supplied implementation.',
  },
  {
    name: 'Self Destruct / Forced Transfer',
    vector: 'self-destruct',
    severity: 'high',
    fires: 'A SELFDESTRUCT path is present and a victim balance moves during the destruction.',
  },
  {
    name: 'Arithmetic / Precision Fault',
    vector: 'arithmetic-overflow',
    severity: 'high',
    fires: 'An overflow, underflow, truncation or panic signature is matched together with an accounting slot mutation.',
  },
  {
    name: 'Ordering / Front Running',
    vector: 'front-running',
    severity: 'medium',
    fires: 'The artifact steps reference block ordering, a sandwich, or mempool positioning around the victim transaction.',
  },
  {
    name: 'Bridge / Cross-Chain Verification Failure',
    vector: 'bridge-exploit',
    severity: 'critical',
    fires: 'A cross-chain verification surface is referenced and the domain or chain binding is shown to be circumvented.',
  },
  {
    name: 'Invariant / Logic Error',
    vector: 'logic-error',
    severity: 'high',
    fires: 'The residual detector: a victim loses value and no more specific mechanism explains the movement.',
  },
];

/* Mirrors the seven sections assembled by report.ts */
const REPORT_SECTIONS = [
  'Scope: case reference, scenario, vector, chain, target, execution command and time.',
  'Attack sequence: every recorded step with gas, value and transaction hash.',
  'State mutations: the storage diff, before and after, per slot and label.',
  'Balance movements: before, after and delta for every tracked account.',
  'Pattern findings: each detector hit with confidence, severity, rationale and evidence pointers.',
  'Root cause and remediation: the asserted cause plus the vector-specific fix.',
  'Evidence index: artifact path, trace line count, gas flame nodes, detector count, reporter.',
];

const STAGES = [
  {
    label: 'Intake',
    body: 'A scenario runs through Forge. The run produces stdout, a structured artifact and the raw trace text. Nothing is inferred before this exists.',
  },
  {
    label: 'Read',
    body: 'The trace parser flattens the call frames into nodes: depth, contract, function, gas, value and whether the frame is external or a value transfer.',
  },
  {
    label: 'Weigh',
    body: 'Ten detectors score the trace, the artifact steps, the storage diff and the balance deltas. Each hit carries named evidence and a 0–1 confidence.',
  },
  {
    label: 'Balance',
    body: 'Balance movements and storage writes are reconciled against the scenario: what the victim held, what it holds now, and which slot changed.',
  },
  {
    label: 'Press',
    body: 'The report writer assembles seven sections and an executive summary, either deterministic or authored through the operator override.',
  },
  {
    label: 'Seal',
    body: 'The bundle zips the report, the artifact, the trace and a sha256 chain-of-custody manifest, then drops into the tray for download.',
  },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-edge pt-8">
      <h2 className="display text-[1.5rem] font-medium leading-tight text-ink">{title}</h2>
      <div className="mt-3 flex flex-col gap-3 text-sm leading-relaxed text-ink-dim [&>p]:max-w-[74ch] [&>ol]:max-w-[74ch]">{children}</div>
    </section>
  );
}

function SubHead({ children }: { children: ReactNode }) {
  return <h3 className="mt-1 font-mono text-[0.66rem] uppercase tracking-[0.16em] text-ink">{children}</h3>;
}

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-[74ch]">
        <h1 className="display text-[2.2rem] font-medium leading-[1.05] text-ink sm:text-[2.8rem]">
          How Mayall works
        </h1>
        <p className="mt-3 text-base leading-relaxed text-ink-dim">
          Mayall is a forensic instrument for reading a crime scene inside the EVM. It keeps two kinds of record apart:
          what the public reported, and what a local Foundry execution can actually show. This page explains the
          pipeline, the taxonomy, the detectors, and the exact limits of the evidence.
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-8">
          <Section id="what" title="What Mayall is">
            <p>
              The console has an incident registry and a live lab. The registry is a curated set of publicly reported
              exploits: loss, chain, actors, transactions and references, each cited back to the public record. The lab
              is different. It runs exploit reproductions against contracts in this repository, on a local EVM, and
              captures the execution.
            </p>
            <p>
              Those two records never merge silently. A case page shows the reported loss and the public narrative; a
              live panel shows a fresh simulation of a reproduction. When a case has no local proof-of-concept, the page
              says so and shows only what the public record contains. The distinction is the product.
            </p>
            <dl className="mt-2 grid gap-4 border-y border-edge py-4 sm:grid-cols-3">
              <div>
                <dt className="label-micro">Registry</dt>
                <dd className="mt-1 text-xs leading-relaxed text-ink-dim">
                  16 incidents, documented loss, actors and references. Context, not captured evidence.
                </dd>
              </div>
              <div>
                <dt className="label-micro">Lab</dt>
                <dd className="mt-1 text-xs leading-relaxed text-ink-dim">
                  Six Foundry scenarios executed locally, with trace, gas, storage and balance capture.
                </dd>
              </div>
              <div>
                <dt className="label-micro">Report</dt>
                <dd className="mt-1 text-xs leading-relaxed text-ink-dim">
                  Seven sections, detector findings and a hash-manifested bundle for a reproducible case.
                </dd>
              </div>
            </dl>
          </Section>

          <Section id="bench" title="The evidence bench">
            <p>
              The pipeline is one physical pass, not a menu of features. A trace has to be read before it can be
              weighed, and weighed before a report can be pressed from it. The figure below is the same model the
              documentation describes: six stations, ten detectors, seven report sections.
            </p>

            <EvidencePipelineFigure detectors={10} reportSections={REPORT_SECTIONS.length} />

            <SubHead>Stations</SubHead>
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {STAGES.map((stage) => (
                <div key={stage.label} className="border-t border-edge pt-2.5">
                  <dt className="mono text-[0.62rem] uppercase tracking-[0.14em] text-ink">{stage.label}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-ink-dim">{stage.body}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section id="taxonomy" title="The attack-vector taxonomy">
            <p>
              Every incident and every scenario is indexed by at least one vector from a fixed taxonomy of sixteen.
              The vector is a class of defect, not a label for a person or a protocol. Each vector carries a severity
              weight used to rank cases and to make an indicative loss split when per-vector loss is not published.
            </p>

            <div className="overflow-x-auto rounded-[14px] border border-edge">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col" className="w-[20%]">Vector</th>
                    <th scope="col" className="w-[15%]">Category</th>
                    <th scope="col" className="w-[53%]">What an investigator looks for</th>
                    <th scope="col" className="w-[12%] text-right">
                      Weight
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ATTACK_VECTOR_LIST.map((vector) => (
                    <tr key={vector.id}>
                      <td className="whitespace-nowrap text-[0.8rem] text-ink">{vector.label}</td>
                      <td className="mono whitespace-nowrap text-[0.6rem] uppercase tracking-[0.08em] text-ink-faint">
                        {vector.category}
                      </td>
                      <td className="text-[0.76rem] leading-relaxed text-ink-dim">{vector.signature}</td>
                      <td className="text-right">
                        <span className="mono text-[0.7rem] text-ink-dim">{vector.severityWeight.toFixed(2)}</span>
                        <span className="mt-1 block h-[3px] w-16 overflow-hidden rounded-full bg-elevated">
                          <span
                            className="block h-full rounded-full bg-arterial"
                            style={{ width: `${Math.round(vector.severityWeight * 100)}%` }}
                          />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-faint">
              Weight is a ranking input, not a measured probability. It never replaces the reported loss figure.
            </p>
          </Section>

          <Section id="detectors" title="The detectors">
            <p>
              Detectors are rule-based readers, not models. Each one inspects the trace nodes, the artifact steps, the
              storage diff and the balance deltas, and returns either no finding or a confidence between 0 and 1 with
              named evidence. A finding below the threshold is not printed. Findings are sorted by confidence; the
              first one sets the report&apos;s headline classification.
            </p>

            <div className="overflow-x-auto rounded-[14px] border border-edge">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col" className="w-[22%]">Detector</th>
                    <th scope="col" className="w-[14%]">Vector</th>
                    <th scope="col" className="w-[13%]">Base severity</th>
                    <th scope="col" className="w-[51%]">Fires when</th>
                  </tr>
                </thead>
                <tbody>
                  {DETECTORS.map((detector) => (
                    <tr key={detector.name}>
                      <td className="whitespace-nowrap text-[0.8rem] text-ink">{detector.name}</td>
                      <td className="mono whitespace-nowrap text-[0.62rem] text-ink-faint">{detector.vector}</td>
                      <td>
                        <SeverityChip severity={detector.severity} compact />
                      </td>
                      <td className="text-[0.76rem] leading-relaxed text-ink-dim">{detector.fires}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-faint">
              The last detector is a residual: it only reports when value moved and no specific detector explains why.
            </p>
          </Section>

          <Section id="run" title="Running a simulation">
            <p>
              A simulation is a Forge test run with full tracing. The lab posts a scenario id, the engine locates the
              test file in <span className="mono text-ink">contracts/</span>, runs it, parses the output and returns a
              result object. Results are cached as artifacts, so a second request can reuse a fresh run instead of
              paying for another execution.
            </p>

            <ol className="flex flex-col gap-3">
              {[
                'Open the live lab and pick a scenario. Read its look-for checklist first — it tells you what the evidence should show.',
                'Run it. The engine executes forge test with -vvvv against the local harness and returns the trace, gas flame, storage diff, balances and detector findings.',
                'Inspect the evidence. Each finding names the trace lines, slots or balance movements that produced it.',
                'Generate the forensic report. Seven sections are assembled from the captured artifact, not retyped by hand.',
                'Download the bundle: the zip contains the report, the artifact, the trace and a sha256 manifest.',
              ].map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="mono mt-[2px] shrink-0 text-[0.62rem] text-arterial">{String(index + 1).padStart(2, '0')}</span>
                  <span className="text-sm leading-relaxed text-ink-dim">{step}</span>
                </li>
              ))}
            </ol>

            <SubHead>From the command line</SubHead>
            <pre className="scroll-y overflow-x-auto rounded-[9px] border border-edge bg-abyss p-3.5 font-mono text-[0.68rem] leading-relaxed text-ink-dim">
{`# start the console
npm run dev

# execute one scenario
curl -X POST http://localhost:3000/api/simulate \\
  -H 'content-type: application/json' \\
  -d '{"scenarioId":"reentrancy"}'

# build the report for a case
curl 'http://localhost:3000/api/report/curve-v2-reentrancy?scenario=reentrancy'

# download the evidence bundle
curl -OJ 'http://localhost:3000/api/bundle/curve-v2-reentrancy?scenario=reentrancy'`}
            </pre>
            <p>
              The harness needs Foundry on the machine. If forge is missing, the engine reports the failure by name;
              the recovery is <span className="mono text-ink">npm run setup:foundry</span>.
            </p>
          </Section>

          <Section id="limits" title="What the evidence does and does not prove">
            <p>
              This is the part that matters most. A forensic console that overstates its evidence is worse than no
              console at all. Read every result on this site through the split below.
            </p>

            <div className="grid gap-6 sm:grid-cols-2">
              <div>
                <SubHead>It does prove</SubHead>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {[
                    'The contract logic in this repository can be driven down the path the scenario describes, under the test harness that exercises it.',
                    'The state transition happened inside the local EVM: a balance moved, a storage slot changed, gas was spent, a trace was emitted.',
                    'A detector finding is traceable to named evidence — a frame, a slot, a delta, a step — and its confidence is reproducible from that evidence.',
                    'The report and the bundle are byte-for-byte what the engine produced; the manifest hashes the files that were shipped.',
                  ].map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-dim">
                      <Check className="mt-[3px] h-3 w-3 shrink-0 text-mint" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <SubHead>It does not prove</SubHead>
                <ul className="mt-2 flex flex-col gap-2.5">
                  {[
                    'That the deployed contract at a mainnet address is the same bytecode as the reproduction. The scenarios are reconstructions, not forks of the live protocol.',
                    'That a real attacker took this path, or that the reported loss figure came from this execution. The loss on a case page is the publicly reported amount.',
                    'That the public record is complete. Transaction lists and actor addresses are only as good as the disclosure they came from.',
                    'That a confidence score is a legal conclusion. It is a similarity score over trace evidence, not a finding of fact.',
                  ].map((item) => (
                    <li key={item} className="flex gap-2 text-xs leading-relaxed text-ink-dim">
                      <Minus className="mt-[3px] h-3 w-3 shrink-0 text-ink-faint" aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <p className="border-t border-edge pt-3">
              One sentence to carry away: this console reproduces exploit mechanics locally and documents incidents
              carefully, but it never claims to have observed the original crime.
            </p>
          </Section>

          <Section id="glossary" title="Reading the measurements">
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
              {[
                ['Trace', 'The call tree emitted by Forge with -vvvv, parsed into frames with depth, gas and value.'],
                ['Gas flame', 'Gas spent per frame, as a share of the transaction. A repeated heavy frame is a structural tell.'],
                ['Storage diff', 'Every slot that changed, with its label, before and after. The state evidence.'],
                ['Balance delta', 'Before and after balances for each tracked account, in wei. Where the value went.'],
                ['Confidence', 'A 0–1 score from a detector, derived from how many independent signals agreed. Not a probability of guilt.'],
                ['Artifact', 'The structured JSON a run leaves behind: steps, balances, writes, logs and root cause.'],
                ['Bundle', 'A zip of report, artifact, trace and a sha256 manifest. The unit you hand to someone else.'],
                ['Scenario', 'A Foundry test that reproduces one exploit. Six exist; each maps to a vector in the taxonomy.'],
              ].map(([term, definition]) => (
                <div key={term} className="border-t border-edge pt-2.5">
                  <dt className="mono text-[0.62rem] uppercase tracking-[0.14em] text-ink">{term}</dt>
                  <dd className="mt-1 text-xs leading-relaxed text-ink-dim">{definition}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <div className="flex flex-wrap items-center gap-3 border-t border-edge pt-6">
            <Link href="/lab" className="btn btn-primary h-11 px-3 text-xs sm:h-9">
              Open the live lab
            </Link>
            <Link href="/incidents" className="btn h-11 px-3 text-xs sm:h-9">
              Browse the registry
            </Link>
            <span className="mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
              local Foundry simulation · not mainnet evidence
            </span>
          </div>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-24 flex flex-col gap-2">
            <p className="label-micro">On this page</p>
            <nav aria-label="Documentation sections" className="flex flex-col">
              {[
                ['what', 'What Mayall is'],
                ['bench', 'The evidence bench'],
                ['taxonomy', 'Attack-vector taxonomy'],
                ['detectors', 'The detectors'],
                ['run', 'Running a simulation'],
                ['limits', 'What it proves'],
                ['glossary', 'Measurements'],
              ].map(([id, label]) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="border-l border-edge py-1.5 pl-3 text-xs text-ink-faint transition-colors duration-100 hover:border-arterial hover:text-ink-dim"
                >
                  {label}
                </a>
              ))}
            </nav>
            <p className="mt-4 border-t border-edge pt-3 text-[0.66rem] leading-relaxed text-ink-faint">
              Every number on this page is a fact about the pipeline in this repository, not a performance claim.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
