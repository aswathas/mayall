function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[3px] bg-elevated ${className}`} />;
}

const STRIP_CELLS = [
  { label: 'w-24', value: 'w-14' },
  { label: 'w-24', value: 'w-10' },
  { label: 'w-28', value: 'w-8' },
  { label: 'w-32', value: 'w-8' },
];

/**
 * The index skeleton: the same header, metric band, orientation block and
 * grouped table, drawn as hairlines and bars — not a spinner.
 */
export default function BibleLoading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-busy="true" aria-label="Loading the Forensic Bible">
      <span className="sr-only">Loading the Forensic Bible index</span>

      <header aria-hidden="true" className="flex flex-col gap-3">
        <Bar className="h-9 w-[min(22rem,72%)]" />
        <Bar className="h-3 w-full max-w-[62rem]" />
        <Bar className="h-3 w-full max-w-[54rem]" />
      </header>

      <div aria-hidden="true" className="metric-strip grid-flow-row grid-cols-1 sm:grid-cols-2 lg:grid-flow-col lg:grid-cols-4 [&>div]:border-l-0 [&>div]:border-t [&>div:first-child]:border-t-0 sm:[&>div:nth-child(2)]:border-t-0 lg:[&>div]:border-t-0 lg:[&>div]:border-l lg:[&>div:first-child]:border-l-0">
        {STRIP_CELLS.map((cell, index) => (
          <div key={index} className="metric-cell">
            <Bar className={`h-2 ${cell.label}`} />
            <Bar className={`mt-2.5 h-7 ${cell.value}`} />
            <Bar className="mt-2 h-2 w-20" />
          </div>
        ))}
      </div>

      <section aria-hidden="true" className="border-y border-edge py-4">
        <Bar className="h-4 w-40" />
        <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="flex flex-col gap-2">
              <Bar className="h-2 w-24" />
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-5/6" />
            </div>
          ))}
        </div>
      </section>

      <div aria-hidden="true" className="panel flex min-w-0 flex-col">
        <div className="panel-header">
          <Bar className="h-2.5 w-28" />
          <Bar className="h-2.5 w-40" />
        </div>
        <div className="flex flex-col">
          {Array.from({ length: 2 }).map((_, group) => (
            <div key={group}>
              <div className="flex items-baseline justify-between border-y border-edge bg-panel-2 px-[0.9rem] py-2">
                <Bar className="h-3.5 w-36" />
                <Bar className="h-2 w-16" />
              </div>
              {Array.from({ length: group === 0 ? 4 : 3 }).map((_, row) => (
                <div
                  key={row}
                  className="flex items-center gap-4 border-b border-edge/60 px-[0.9rem] py-3"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <Bar className="h-3 w-32" />
                    <Bar className="h-2 w-4/5" />
                  </div>
                  <Bar className="hidden h-2.5 w-24 md:block" />
                  <Bar className="hidden h-2.5 w-16 sm:block" />
                  <Bar className="hidden h-2.5 w-24 md:block" />
                  <Bar className="h-4 w-12 shrink-0" />
                </div>
              ))}
            </div>
          ))}
          <div className="px-[0.9rem] py-3">
            <Bar className="h-3 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}
