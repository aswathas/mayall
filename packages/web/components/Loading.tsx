'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return <div className={`animate-pulse rounded-[4px] bg-elevated ${className}`} aria-hidden />;
}

/** A skeleton that follows the shape of the panel or table it stands in for. */
export function LoadingBlock({ label = 'Loading evidence', rows = 4 }: { label?: string; rows?: number }) {
  const count = Math.max(1, Math.min(12, rows));
  return (
    <div className="flex flex-col gap-3" role="status" aria-busy="true" aria-label={label}>
      <span className="sr-only">{label}</span>
      <div className="flex items-center gap-3">
        <Skeleton className="h-2 w-28" />
        <Skeleton className="ml-auto h-2 w-16" />
      </div>
      <div className="flex flex-col gap-2.5">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex items-center gap-3">
            <Skeleton className="h-3 w-[36%]" />
            <Skeleton className="h-3 w-[18%]" />
            <Skeleton className="ml-auto h-3 w-[14%]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function describeError(message: string): { title: string; recovery: string } {
  const text = message.toLowerCase();
  if (/foundry|forge|enoent|not recognized|command not found/.test(text)) {
    return {
      title: 'Foundry not found',
      recovery: 'Install the local toolchain with `npm run setup:foundry`, then run the simulation again.',
    };
  }
  if (/timeout|timed out|aborted/.test(text)) {
    return {
      title: 'Simulation timed out',
      recovery: 'Retry the run; if it repeats, execute the scenario with `forge test -vvvv` and inspect the output.',
    };
  }
  if (/fetch|network|load failed|econnrefused/.test(text)) {
    return {
      title: 'Engine unreachable',
      recovery: 'Start the console with `npm run dev`, confirm `/api/status` reports Foundry online, then retry.',
    };
  }
  if (/500|internal server/.test(text)) {
    return {
      title: 'Simulation endpoint failed',
      recovery: 'Check the dev server log and that the Foundry toolchain is installed, then retry the run.',
    };
  }
  return {
    title: 'Request failed',
    recovery: 'Retry the request; if it repeats, check the server log for the failing route.',
  };
}

export function ErrorBlock({
  message,
  recovery,
  onRetry,
}: {
  message: string;
  recovery?: string;
  onRetry?: () => void;
}) {
  const described = describeError(message);
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-[9px] border border-edge bg-panel-2 p-4">
      <div className="flex items-center gap-2 text-arterial">
        <AlertTriangle className="h-4 w-4" aria-hidden />
        <span className="font-mono text-[0.66rem] uppercase tracking-[0.16em]">{described.title}</span>
      </div>
      <p className="text-xs leading-relaxed text-ink-dim">{message}</p>
      <p className="text-xs leading-relaxed text-ink-faint">{recovery ?? described.recovery}</p>
      {onRetry ? (
        <button type="button" className="btn py-1.5 text-xs" onClick={onRetry}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry
        </button>
      ) : null}
    </div>
  );
}
