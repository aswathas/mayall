export default function IntroLoading() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the Mayall intro">
      <div className="h-[68vh] animate-pulse rounded-[14px] border border-edge bg-panel/60" />
      <div className="metric-strip grid grid-flow-row grid-cols-2 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="metric-cell">
            <div className="h-2.5 w-20 animate-pulse rounded bg-elevated" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-elevated" />
            <div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-elevated" />
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-12">
        <div className="h-56 animate-pulse rounded-[14px] border border-edge bg-panel/60 lg:col-span-7" />
        <div className="h-56 animate-pulse rounded-[14px] border border-edge bg-panel/60 lg:col-span-5" />
      </div>
    </div>
  );
}
