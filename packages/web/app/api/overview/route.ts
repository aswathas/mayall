import { NextResponse } from 'next/server';
import type { AttackVectorId, Chain, Incident, Severity } from '@helix/core';
import { engine, errorResponse } from '../_lib';

export const dynamic = 'force-dynamic';

/**
 * Severity rule: >= $100M -> critical, >= $10M -> high, >= $1M -> medium,
 * everything else -> low.
 */
function severityFromLoss(lossUsd: number): Severity {
  if (lossUsd >= 100_000_000) return 'critical';
  if (lossUsd >= 10_000_000) return 'high';
  if (lossUsd >= 1_000_000) return 'medium';
  return 'low';
}

interface VectorAggregate {
  id: AttackVectorId;
  label: string;
  count: number;
  lossUsd: number;
}

interface ChainAggregate {
  chain: Chain;
  count: number;
  lossUsd: number;
}

interface TimelinePoint {
  month: string;
  lossUsd: number;
  count: number;
}

export async function GET(): Promise<NextResponse> {
  try {
    const { ATTACK_VECTORS, INCIDENTS, SEVERITY_ORDER } = engine();

    const vectorMap = new Map<AttackVectorId, VectorAggregate>();
    const chainMap = new Map<Chain, ChainAggregate>();
    const monthMap = new Map<string, TimelinePoint>();
    const severityMap = new Map<Severity, number>(SEVERITY_ORDER.map((s) => [s, 0]));
    const chains = new Set<Chain>();
    const vectors = new Set<AttackVectorId>();

    let lossUsd = 0;
    let reproducible = 0;

    for (const incident of INCIDENTS) {
      lossUsd += incident.lossUsd;
      if (incident.reproducible) reproducible += 1;
      chains.add(incident.chain);

      // An incident counts once per distinct vector it carries, and its loss is
      // summed into each of those vectors.
      for (const vectorId of new Set<AttackVectorId>(incident.vectors)) {
        vectors.add(vectorId);
        const entry = vectorMap.get(vectorId) ?? {
          id: vectorId,
          label: ATTACK_VECTORS[vectorId].label,
          count: 0,
          lossUsd: 0,
        };
        entry.count += 1;
        entry.lossUsd += incident.lossUsd;
        vectorMap.set(vectorId, entry);
      }

      const chainEntry = chainMap.get(incident.chain) ?? { chain: incident.chain, count: 0, lossUsd: 0 };
      chainEntry.count += 1;
      chainEntry.lossUsd += incident.lossUsd;
      chainMap.set(incident.chain, chainEntry);

      const month = incident.date.slice(0, 7);
      const monthEntry = monthMap.get(month) ?? { month, lossUsd: 0, count: 0 };
      monthEntry.count += 1;
      monthEntry.lossUsd += incident.lossUsd;
      monthMap.set(month, monthEntry);

      const severity = severityFromLoss(incident.lossUsd);
      severityMap.set(severity, (severityMap.get(severity) ?? 0) + 1);
    }

    const topIncidents: Incident[] = [...INCIDENTS]
      .sort((a, b) => b.lossUsd - a.lossUsd)
      .slice(0, 6);

    return NextResponse.json({
      totals: {
        incidents: INCIDENTS.length,
        lossUsd,
        reproducible,
        chains: chains.size,
        vectors: vectors.size,
      },
      byVector: [...vectorMap.values()].sort((a, b) => b.lossUsd - a.lossUsd || b.count - a.count),
      byChain: [...chainMap.values()].sort((a, b) => b.lossUsd - a.lossUsd),
      timeline: [...monthMap.values()].sort((a, b) => a.month.localeCompare(b.month)),
      severity: SEVERITY_ORDER.map((severity) => ({ severity, count: severityMap.get(severity) ?? 0 })),
      topIncidents,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
