'use client';

import type { SimulationResult } from '@helix/core';
import { ATTACK_VECTORS } from '@helix/core';
import { formatEthAmount, formatGas, formatInt, formatPct } from '../lib/format';
import { MetricStrip, type MetricItem } from './MetricStrip';
import { VectorChip } from './VectorChip';

interface SimSummaryProps {
  result: SimulationResult;
  scenarioTitle?: string;
}

export function SimSummary({ result, scenarioTitle }: SimSummaryProps) {
  const artifact = result.artifact;
  const vector = ATTACK_VECTORS[result.attackVector];
  const totalGas = result.flame.reduce((sum, node) => sum + node.gasUsed, 0);
  const top = [...result.detections].sort((a, b) => b.confidence - a.confidence)[0] ?? null;

  const items: MetricItem[] = [
    {
      label: 'Scenario',
      value: result.scenario,
      hint: scenarioTitle ?? result.id,
    },
    {
      label: 'Vector',
      value: vector?.category ?? 'classification',
      hint: <VectorChip vectorId={result.attackVector} />,
    },
    {
      label: 'Extracted',
      value: formatEthAmount(artifact?.lossEth ?? '0', 4),
      hint: artifact ? `${artifact.contractName} · local simulation` : 'no artifact',
      tone: 'threat',
    },
    {
      label: 'Duration',
      value: `${formatInt(result.durationMs)} ms`,
      hint: `${formatGas(totalGas)} gas in ${result.flame.length} frames`,
    },
    {
      label: 'Verdict',
      value: result.ok ? 'PASS' : 'FAIL',
      hint: result.ok ? 'forge test passed' : 'forge test failed',
      tone: result.ok ? 'safe' : 'threat',
    },
    {
      label: 'Top pattern',
      value: top ? formatPct(top.confidence, 0) : '—',
      hint: top ? top.label : 'no detector fired',
    },
  ];

  return <MetricStrip items={items} />;
}
