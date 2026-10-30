import { LoadingBlock, Skeleton } from '../../components/Loading';
import { Panel } from '../../components/Panel';

export default function TraceLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading trace pipeline explainer">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-full max-w-2xl" />
      </div>
      <Panel title="Trace pipeline instrument">
        <LoadingBlock label="Preparing 5-stage trace pipeline" rows={6} />
      </Panel>
    </div>
  );
}
