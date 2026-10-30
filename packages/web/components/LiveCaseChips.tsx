import type {
  LiveCaseCoverageStatus,
  LiveCasePatternRole,
  LiveCaseSignalStatus,
} from '../../forensic-engine/src/live-case';

const COVERAGE: Record<LiveCaseCoverageStatus, { label: string; className: string }> = {
  fired: { label: 'FIRED', className: 'chip chip-threat' },
  'not-fired': { label: 'NOT FIRED', className: 'chip' },
  'out-of-scope': { label: 'OUT OF SCOPE', className: 'chip chip-amber' },
};

export function CoverageChip({ status }: { status: LiveCaseCoverageStatus }) {
  const entry = COVERAGE[status];
  return <span className={entry.className}>{entry.label}</span>;
}

const SIGNAL: Record<LiveCaseSignalStatus, { label: string; className: string }> = {
  observed: { label: 'OBSERVED', className: 'chip chip-threat' },
  expected: { label: 'EXPECTED', className: 'chip chip-amber' },
  notApplicable: { label: 'NOT APPLICABLE', className: 'chip' },
};

export function SignalChip({ status }: { status: LiveCaseSignalStatus }) {
  const entry = SIGNAL[status];
  return <span className={entry.className}>{entry.label}</span>;
}

const ROLE: Record<LiveCasePatternRole, { label: string; className: string }> = {
  primary: { label: 'PRIMARY', className: 'chip chip-threat' },
  contributing: { label: 'AMPLIFIER', className: 'chip chip-amber' },
  context: { label: 'CONTEXT', className: 'chip' },
};

export function PatternRoleChip({ role }: { role: LiveCasePatternRole }) {
  const entry = ROLE[role];
  return <span className={entry.className}>{entry.label}</span>;
}
