import { CHAIN_COLORS, type Chain } from '@helix/core';

interface ChainChipProps {
  chain: Chain | string;
  className?: string;
}

export function ChainChip({ chain, className = '' }: ChainChipProps) {
  const color = (CHAIN_COLORS as Record<string, string>)[chain] ?? '#64748b';
  return (
    <span
      className={`chip ${className}`}
      style={{ color, borderColor: `${color}55`, background: `${color}14` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {chain}
    </span>
  );
}
