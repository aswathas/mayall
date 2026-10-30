'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { MayallStatus } from '../lib/types';
import { formatInt } from '../lib/format';

/**
 * Live engine readout. Fetches `/api/status` itself; the optional `compact`
 * flag is what the app shell renders in the mobile top bar.
 */
export function EngineStatus({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<MayallStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load(signal: AbortSignal) {
      try {
        const response = await fetch('/api/status', { signal, cache: 'no-store' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const payload = (await response.json()) as Partial<MayallStatus>;
        setStatus({
          foundry: Boolean(payload.foundry),
          scenarios: Number(payload.scenarios ?? 0),
          artifacts: Number(payload.artifacts ?? 0),
          version: String(payload.version ?? 'dev'),
        });
        setFailed(false);
      } catch (error) {
        if (signal.aborted) return;
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      }
    }

    void load(controller.signal);
    const timer = setInterval(() => void load(controller.signal), 30_000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const online = status?.foundry === true;
  const unreachable = failed && status === null;

  if (compact) {
    const text = unreachable ? 'NO LINK' : online ? 'ENGINE ONLINE' : 'FOUNDRY MISSING';
    return (
      <span
        className="chip"
        title={unreachable ? 'Status feed unreachable' : online ? 'Foundry engine online' : 'Foundry not installed'}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            unreachable ? 'bg-ink-faint' : online ? 'live-dot bg-mint' : 'bg-ember'
          }`}
          aria-hidden="true"
        />
        <span className={unreachable ? 'text-ink-faint' : online ? 'text-mint' : 'text-ember'}>{text}</span>
      </span>
    );
  }

  if (!status && !failed) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Reading engine status">
        <div className="animate-pulse h-5 w-36 rounded-md bg-elevated" />
        <div className="grid grid-cols-2 gap-3">
          <div className="animate-pulse h-10 rounded-md bg-elevated" />
          <div className="animate-pulse h-10 rounded-md bg-elevated" />
        </div>
      </div>
    );
  }

  if (unreachable) {
    return (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-ember">
          <span className="h-2 w-2 rounded-full bg-ember" aria-hidden="true" />
          Status feed unreachable
        </p>
        <p className="text-xs leading-relaxed text-ink-dim">
          The console could not read <span className="mono text-ink">/api/status</span> from the local server.
        </p>
        <button type="button" onClick={reload} className="btn btn-ghost h-9 w-fit px-3 text-xs">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Retry status
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${online ? 'live-dot bg-mint' : 'bg-ember'}`}
          aria-hidden="true"
        />
        <p className={`text-sm ${online ? 'text-ink' : 'text-ember'}`}>
          {online ? 'Engine online' : 'Foundry not installed'}
        </p>
        <span className="mono ml-auto text-[0.6rem] text-ink-faint">mayall {status?.version}</span>
      </div>

      <dl className="grid grid-cols-2 divide-x divide-edge border-y border-edge">
        <div className="min-w-0 py-2 pr-4">
          <dt className="label-micro">Scenarios</dt>
          <dd className="mono mt-0.5 text-base text-ink">{formatInt(status?.scenarios ?? 0)}</dd>
        </div>
        <div className="min-w-0 py-2 pl-4">
          <dt className="label-micro">Artifacts</dt>
          <dd className="mono mt-0.5 text-base text-ink">{formatInt(status?.artifacts ?? 0)}</dd>
        </div>
      </dl>

      {online ? (
        <p className="text-xs leading-relaxed text-ink-dim">
          Local Foundry toolchain detected. Reproductions run against the scenario suite on this machine.
        </p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-xs leading-relaxed text-ink-dim">
            Foundry not found — run <span className="mono text-ink">npm run setup:foundry</span> in the repository
            root, then reload.
          </p>
          <button type="button" onClick={reload} className="btn btn-ghost mt-1 h-9 w-fit px-3 text-xs">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Recheck
          </button>
        </div>
      )}
    </div>
  );
}
