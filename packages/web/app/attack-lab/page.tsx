import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AttackLabConsole } from '../../components/AttackLabConsole';
import { Skeleton } from '../../components/Loading';

export const metadata: Metadata = {
  title: 'Custom Attack Lab — Mayall',
  description:
    'Parameterise a real Foundry exploit — family, attacker transactions, drain amount and noise seed — and read the trace, detectors, storage diff and forensic bundle as they are produced.',
};

function ConsoleFallback() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-full max-w-[66ch]" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,330px)_minmax(0,1fr)]">
        <div className="panel flex flex-col gap-3 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
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

export default function AttackLabPage() {
  return (
    <Suspense fallback={<ConsoleFallback />}>
      <AttackLabConsole />
    </Suspense>
  );
}
