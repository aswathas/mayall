import { ATTACK_VECTORS, type AttackVectorId, type Severity } from '@helix/core';

/**
 * Incidents carry a vector list rather than an explicit severity, so derive a
 * representative severity from the strongest attack vector weighting.
 */
export function severityFromVectors(vectors: AttackVectorId[]): Severity {
  if (!vectors.length) return 'low';
  const weights = vectors.map((id) => ATTACK_VECTORS[id]?.severityWeight ?? 0.5);
  const max = Math.max(...weights);
  if (max >= 0.9) return 'critical';
  if (max >= 0.8) return 'high';
  if (max >= 0.6) return 'medium';
  return 'low';
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case 'critical':
      return 0;
    case 'high':
      return 1;
    case 'medium':
      return 2;
    default:
      return 3;
  }
}
