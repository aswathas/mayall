import { Skeleton } from '../../components/Loading';

export default function ShowcaseLoading() {
  return (
    <div
      className="flex flex-col gap-16"
      role="status"
      aria-busy="true"
      aria-label="Loading the showcase"
    >
      <span className="sr-only">Loading the showcase</span>

      <div className="grid grid-cols-12 gap-x-6 gap-y-12">
        <div className="col-span-12 lg:col-span-7">
          <Skeleton className="h-24 w-[68%]" />
          <Skeleton className="mt-8 h-3 w-40" />
          <Skeleton className="mt-8 h-9 w-[86%]" />
          <Skeleton className="mt-3 h-9 w-[62%]" />
          <Skeleton className="mt-6 h-3 w-full max-w-[46ch]" />
          <Skeleton className="mt-2 h-3 w-full max-w-[40ch]" />
          <div className="mt-8 flex gap-2.5">
            <Skeleton className="h-11 w-44" />
            <Skeleton className="h-11 w-52" />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-5 lg:pt-24">
          <Skeleton className="h-72 w-full" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-x-6 gap-y-10 border-t border-edge pt-10">
        <div className="col-span-12 lg:col-span-4">
          <Skeleton className="h-10 w-[92%]" />
          <Skeleton className="mt-5 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-5/6" />
        </div>
        <div className="col-span-12 lg:col-span-8">
          <div className="grid gap-5 sm:grid-cols-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="border-t border-edge pt-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="mt-2 h-3 w-full" />
                <Skeleton className="mt-1.5 h-3 w-4/5" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
