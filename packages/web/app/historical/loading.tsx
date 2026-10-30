import { Skeleton } from '../../components/Loading';

export default function HistoricalLoading() {
  return (
    <div className="flex flex-col gap-5" role="status" aria-busy="true" aria-label="Loading historical analysis">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-2xl" />
        <Skeleton className="h-4 w-3/4 max-w-xl" />
      </div>
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-edge bg-edge sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="bg-panel p-4">
            <Skeleton className="h-2 w-20" />
            <Skeleton className="mt-3 h-7 w-24" />
            <Skeleton className="mt-2 h-3 w-28" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full rounded-[14px]" />
        <Skeleton className="h-64 w-full rounded-[14px]" />
      </div>
      <Skeleton className="h-80 w-full rounded-[14px]" />
    </div>
  );
}
