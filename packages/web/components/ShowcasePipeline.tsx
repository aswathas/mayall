import {
  Database,
  FileText,
  GitBranch,
  Package,
  Play,
  ScanSearch,
  type LucideIcon,
} from 'lucide-react';

interface Stage {
  name: string;
  icon: LucideIcon;
  does: string;
  produces: string;
}

const STAGES: Stage[] = [
  {
    name: 'Reproduce',
    icon: Play,
    does: 'Forge executes the exploit against the compiled Solidity in a local EVM.',
    produces: 'testExploit() · PASS · 2,079,467 gas',
  },
  {
    name: 'Capture',
    icon: GitBranch,
    does: 'The trace parser walks the depth-indented call tree, frame by frame.',
    produces: '82 nodes · 7 × withdraw()',
  },
  {
    name: 'Diff',
    icon: Database,
    does: 'Every storage slot and balance is read before and after execution.',
    produces: '2 slots changed · −6.0000 ETH',
  },
  {
    name: 'Detect',
    icon: ScanSearch,
    does: 'Ten pattern detectors score the trace and the artifact it wrote.',
    produces: 'Reentrancy · 0.97 confidence',
  },
  {
    name: 'Write',
    icon: FileText,
    does: 'A case report is assembled from the evidence, not from a template.',
    produces: '7 sections · root cause + fix',
  },
  {
    name: 'Export',
    icon: Package,
    does: 'The execution, trace, findings and artifact are packaged for handoff.',
    produces: 'forensic bundle · json',
  },
];

export function ShowcasePipeline() {
  return (
    <section aria-labelledby="pipeline-heading" className="mt-24 border-t border-edge pt-10 sm:mt-32">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h2
            id="pipeline-heading"
            className="display text-[2rem] font-medium leading-none tracking-[-0.03em] text-ink sm:text-[2.6rem]"
          >
            One pass, six machines.
          </h2>
          <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-ink-dim">
            Each stage consumes the evidence the previous one produced. Nothing is inferred
            twice, and every stage leaves a file you can inspect.
          </p>
        </div>
        <p className="mono shrink-0 text-[0.58rem] uppercase tracking-[0.14em] text-ink-dim">
          forge · parser · diff · detectors · report · bundle
        </p>
      </div>

      <ol className="mt-10 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-4 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const Icon = stage.icon;
          return (
            <li
              key={stage.name}
              className="relative flex min-w-0 flex-col border-t border-edge pt-5"
            >
              <span aria-hidden="true" className="absolute -top-px left-0 h-px w-7 bg-ink-dim" />
              <Icon className="h-4 w-4 text-ink-dim" strokeWidth={1.6} aria-hidden="true" />
              <h3 className="display mt-3 text-[1.05rem] font-medium tracking-[-0.01em] text-ink">
                {stage.name}
              </h3>
              <p className="mt-1.5 text-[0.78rem] leading-relaxed text-ink-dim">{stage.does}</p>
              <div className="mt-auto pt-4">
                <span className="label-micro block">produces</span>
                <span className="mono mt-1.5 block min-h-[2.7em] break-words text-[0.66rem] leading-relaxed text-ink">
                  {stage.produces}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
