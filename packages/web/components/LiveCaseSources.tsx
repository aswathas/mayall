import { ExternalLink } from 'lucide-react';
import type { LiveCase } from '../../forensic-engine/src/live-case';
import { formatDate } from '../lib/format';
import { Panel } from './Panel';

export function LiveCaseAssets({ liveCase }: { liveCase: LiveCase }) {
  return (
    <Panel title="Affected assets" subtitle="Published figures only · nothing derived">
      <ul className="flex flex-col divide-y divide-edge/70">
        {liveCase.assets.map((asset, index) => (
          <li key={asset.id} className={`flex flex-col gap-0.5 py-2.5 ${index === 0 ? 'pt-0' : ''}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-xs text-ink-dim">{asset.label}</span>
              <span className="display text-[0.98rem] tabular-nums text-ink">{asset.amount}</span>
            </div>
            <p className="text-[0.66rem] leading-relaxed text-ink-faint">{asset.note}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function LiveCaseResponders({ liveCase }: { liveCase: LiveCase }) {
  return (
    <Panel title="Responder actions" subtitle="What each party said or did, as reported">
      <ul className="flex flex-col divide-y divide-edge/70">
        {liveCase.responders.map((responder, index) => (
          <li key={responder.id} className={`py-2.5 ${index === 0 ? 'pt-0' : ''}`}>
            <p className="mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">{responder.actor}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-dim">{responder.action}</p>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function LiveCaseSources({ liveCase }: { liveCase: LiveCase }) {
  return (
    <Panel title="Sources" subtitle="Every published report cited by this dossier">
      <ul className="flex flex-col divide-y divide-edge/70">
        {liveCase.sources.map((source) => (
          <li key={source.id} className="py-2.5 first:pt-0 last:pb-0">
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              className="group flex min-h-11 items-start gap-2 py-1 sm:min-h-0 sm:py-0"
            >
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-sm leading-relaxed text-ink-dim transition-colors duration-100 group-hover:text-arterial group-hover:underline group-hover:underline-offset-2">
                  {source.label}
                </span>
                <span className="mono mt-0.5 block text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
                  {source.publisher} · {formatDate(source.date)}
                </span>
                <span className="mono mt-0.5 block break-all text-[0.56rem] leading-relaxed text-ink-faint">
                  {source.url}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function LiveCaseMethod({ liveCase }: { liveCase: LiveCase }) {
  return (
    <div className="flex flex-col gap-4">
      <Panel title="Method and limits" subtitle="What this dossier does and does not claim">
        <ul className="flex list-disc flex-col gap-2 pl-4 text-xs leading-relaxed text-ink-dim">
          <li>
            Retrospective classification over public reporting. No mainnet call trace of the incident was
            analysed, because none is in the record.
          </li>
          <li>
            No transaction hash, block number, wallet address, contract name or token amount is invented.
            Every figure on this page is a published figure.
          </li>
          <li>
            The only local execution is the delegatecall scenario. It is the closest analogue, not a
            reproduction of the Binance breach.
          </li>
          <li>
            Bible patterns and signals are read from sheets 04 and 03 of the Forensic Bible; thresholds and
            weights are quoted verbatim.
          </li>
          <li>
            Attribution keeps the analyst’s wording: “{liveCase.attribution.confidenceSource}:{' '}
            {liveCase.attribution.confidence}”.
          </li>
        </ul>
      </Panel>

      <Panel title="Prior context, not this incident" subtitle="Kept visibly separate from the verified facts">
        <ul className="flex flex-col divide-y divide-edge/70">
          {liveCase.priorContext.map((entry, index) => (
            <li key={entry.id} className={`py-2.5 ${index === 0 ? 'pt-0' : ''}`}>
              <p className="mono text-[0.58rem] uppercase tracking-[0.12em] text-amber">{entry.label}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-dim">{entry.detail}</p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
