import type { AttackVectorId } from '@helix/core';
import { ATTACK_VECTORS } from '@helix/core';

interface VectorChipProps {
  vectorId: AttackVectorId;
  className?: string;
  withLabel?: boolean;
}

export function VectorChip({ vectorId, className = '', withLabel = true }: VectorChipProps) {
  const vector = ATTACK_VECTORS[vectorId];
  const label = vector?.label ?? vectorId;
  return (
    <span
      className={`chip text-violet ${className}`}
      style={{ borderColor: '#a78bfa44', background: '#a78bfa12' }}
      title={vector?.signature}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-violet" />
      {withLabel ? label : null}
    </span>
  );
}
