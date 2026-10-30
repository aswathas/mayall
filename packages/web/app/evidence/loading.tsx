import { LoadingBlock, Skeleton } from '../../components/Loading';
import { Panel } from '../../components/Panel';

export default function EvidenceLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading evidence workbench">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Panel title="Case selector">
        <LoadingBlock label="Loading scenarios and custom runs" rows={3} />
      </Panel>
      <Panel title="Raw evidence — verbatim forge trace">
        <LoadingBlock label="Loading raw forge trace" rows={6} />
      </Panel>
    </div>
  );
}
