import type { Incident, Severity } from '@helix/core';

export interface HelixStatus {
  foundry: boolean;
  scenarios: number;
  artifacts: number;
  version: string;
}

export interface OverviewData {
  totals: {
    incidents: number;
    lossUsd: number;
    reproducible: number;
    chains: number;
    vectors: number;
  };
  byVector: { id: string; label: string; count: number; lossUsd: number }[];
  byChain: { chain: string; count: number; lossUsd: number }[];
  timeline: { month: string; lossUsd: number; count: number }[];
  severity: { severity: Severity; count: number }[];
  topIncidents: Incident[];
}

export interface IncidentResponse {
  incident: Incident | null;
}

export interface RunAllResponse {
  results: import('@helix/core').SimulationResult[];
  totalMs: number;
}
