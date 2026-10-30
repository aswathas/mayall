export default function TrackerLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the live attack tracker">
      <div className="flex flex-col gap-2">
        <div className="h-8 w-64 animate-pulse rounded bg-elevated" />
        <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-elevated" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="h-[420px] animate-pulse rounded-[14px] border border-edge bg-panel/60" />
        <div className="flex flex-col gap-4">
          <div className="h-[360px] animate-pulse rounded-[14px] border border-edge bg-panel/60" />
          <div className="h-[140px] animate-pulse rounded-[14px] border border-edge bg-panel/60" />
          <div className="h-[220px] animate-pulse rounded-[14px] border border-edge bg-panel/60" />
        </div>
      </div>
    </div>
  );
}
