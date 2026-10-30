import type { Severity } from '@helix/core';
import { SEVERITY_COLORS } from '@helix/core';

interface SeverityChipProps {
  severity: Severity;
  className?: string;
  compact?: boolean;
}

export function SeverityChip({ severity, className = '', compact = false }: SeverityChipProps) {
  const color = SEVERITY_COLORS[severity] ?? '#64748b';
  return (
    <span
      className={`chip ${compact ? '!px-1.5 !py-0.5 !text-[0.6rem]' : ''} ${className}`}
      style={{ color, borderColor: `${color}66`, background: `${color}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {severity.toUpperCase()}
    </span>
  );
}
