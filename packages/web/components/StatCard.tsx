import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { MicroLabel } from './Panel';

type Accent = 'signal' | 'threat' | 'safe' | 'amber' | 'violet';

const ACCENT_TEXT: Record<Accent, string> = {
  signal: 'text-signal',
  threat: 'text-threat',
  safe: 'text-safe',
  amber: 'text-amber-alert',
  violet: 'text-violet',
};

const ACCENT_BG: Record<Accent, string> = {
  signal: 'bg-signal/10 text-signal border-signal/25',
  threat: 'bg-threat/10 text-threat border-threat/25',
  safe: 'bg-safe/10 text-safe border-safe/25',
  amber: 'bg-amber-alert/10 text-amber-alert border-amber-alert/25',
  violet: 'bg-violet/10 text-violet border-violet/25',
};

interface StatCardProps {
  label: string;
  value: string;
  hint?: ReactNode;
  icon?: LucideIcon;
  accent?: Accent;
}

export function StatCard({ label, value, hint, icon: Icon, accent = 'signal' }: StatCardProps) {
  return (
    <div className="panel flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <MicroLabel>{label}</MicroLabel>
        {Icon ? (
          <span className={`flex h-7 w-7 items-center justify-center rounded-md border ${ACCENT_BG[accent]}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        ) : null}
      </div>
      <div className={`stat-value text-2xl leading-none sm:text-[1.7rem] ${ACCENT_TEXT[accent]}`}>{value}</div>
      {hint ? <div className="text-[0.7rem] leading-snug text-ink-faint">{hint}</div> : null}
    </div>
  );
}
