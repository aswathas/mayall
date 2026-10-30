import { TraceExplainer } from '../../components/TraceExplainer';
import { loadCaseEvidence } from '../../components/EvidenceWorkbenchLoader';

export const dynamic = 'force-dynamic';

export default async function TracePage({
  searchParams,
}: {
  searchParams?: Promise<{ scenario?: string }>;
}) {
  const resolved = searchParams ? await searchParams : {};
  const scenarioId = resolved?.scenario || 'reentrancy';
  const initialEvidence = await loadCaseEvidence(scenarioId, scenarioId);

  return <TraceExplainer initialEvidence={initialEvidence} />;
}
