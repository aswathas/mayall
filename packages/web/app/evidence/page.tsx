import { EvidenceWorkbench } from '../../components/EvidenceWorkbench';
import {
  listEvidenceCases,
  loadCaseEvidence,
} from '../../components/EvidenceWorkbenchLoader';

export const dynamic = 'force-dynamic';

export default async function EvidencePage({
  searchParams,
}: {
  searchParams?: Promise<{ case?: string; scenario?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const requestedCase = resolvedParams?.case || resolvedParams?.scenario || 'reentrancy';
  const [{ cases }, initialEvidence] = await Promise.all([
    listEvidenceCases(),
    loadCaseEvidence(requestedCase, resolvedParams?.scenario ?? null),
  ]);

  return <EvidenceWorkbench initialCases={cases} initialEvidence={initialEvidence} />;
}
