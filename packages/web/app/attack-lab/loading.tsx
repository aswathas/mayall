import { Skeleton } from '../../components/Loading';

/**
 * Route-level loading state for /attack-lab. Mirrors the console layout: a
 * control column and the live execution panel, so the page does not jump when
 * the real instrument mounts.
 */
export default function AttackLabLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading the custom attack lab">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-[66ch]" />
        <Skeleton className="h-3 w-56" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-28" />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <div className="panel flex flex-col gap-4 p-5">
          <Skeleton className="h-4 w-32" />
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14 w-full" />
          ))}
          <Skeleton className="h-9 w-full" />
        </div>
        <div className="panel flex flex-col gap-3 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[380px] w-full" />
        </div>
      </div>
    </div>
  );
}
