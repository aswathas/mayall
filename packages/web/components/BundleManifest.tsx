'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, FileCode2, FileSpreadsheet, FileText, ShieldCheck } from 'lucide-react';
import { formatInt } from '../lib/format';
import { EmptyState, Panel, SubBlock } from './Panel';
import type { BundleFileEntry, BundleManifestData } from './EvidenceWorkbenchLoader';

export interface BundleManifestProps {
  manifest: BundleManifestData | null;
  bundleHref: string;
}

const CATEGORY_BADGE: Record<BundleFileEntry['category'], { label: string; className: string }> = {
  report: { label: 'report', className: 'chip' },
  evidence: { label: 'evidence', className: 'chip chip-threat' },
  custody: { label: 'custody', className: 'chip chip-safe' },
};

function FileIcon({ path }: { path: string }) {
  if (path.endsWith('.csv')) return <FileSpreadsheet className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />;
  if (path.endsWith('.json')) return <FileCode2 className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />;
  if (path.includes('chain-of-custody')) return <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-mint" aria-hidden="true" />;
  return <FileText className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden="true" />;
}

export function BundleManifest({ manifest, bundleHref }: BundleManifestProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copyValue = useCallback(async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setCopiedKey(null);
    }
  }, []);

  if (!manifest || !manifest.files.length) {
    return (
      <Panel title="Bundle manifest" subtitle="chain-of-custody.json · sha256 file index">
        <EmptyState
          title="No bundle manifest available"
          hint="Run a local Foundry simulation for this case to build the forensic ZIP and compute SHA-256 digests for each evidence file."
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="Bundle manifest"
      subtitle={`${manifest.filename} · ${formatInt(manifest.files.length)} files · ${formatInt(manifest.totalBytes)} bytes uncompressed`}
      action={
        <a
          href={bundleHref}
          download
          className="btn btn-primary min-h-[44px] px-3.5 text-xs sm:min-h-[36px]"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Download forensic bundle (.zip)
        </a>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-3 rounded-[9px] border border-edge bg-abyss/50 p-3.5 sm:grid-cols-3">
          <div>
            <p className="label-micro">Archive filename</p>
            <p className="mono mt-1 truncate text-xs text-ink" title={manifest.filename}>
              {manifest.filename}
            </p>
            <p className="mono mt-0.5 text-[0.62rem] tabular-nums text-ink-faint">
              {formatInt(manifest.bundleBytes)} bytes (DEFLATE) · {formatInt(manifest.totalBytes)} bytes raw
            </p>
          </div>

          <div>
            <p className="label-micro">Manifest digest (chain-of-custody.json)</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="mono truncate text-xs text-ink-dim" title={manifest.chainOfCustodySha256}>
                {manifest.chainOfCustodySha256.slice(0, 16)}…{manifest.chainOfCustodySha256.slice(-12)}
              </span>
              <button
                type="button"
                onClick={() => void copyValue('coc-sha', manifest.chainOfCustodySha256)}
                aria-label="Copy chain-of-custody.json SHA-256 digest"
                className="btn btn-ghost min-h-[44px] min-w-[44px] !p-0 sm:min-h-[28px] sm:min-w-[28px]"
              >
                {copiedKey === 'coc-sha' ? (
                  <Check className="h-3 w-3 text-mint" aria-hidden="true" />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mono mt-0.5 text-[0.62rem] text-ink-faint">SHA-256 of the signed manifest entry</p>
          </div>

          <div>
            <p className="label-micro">Root chain hash</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="mono truncate text-xs text-arterial" title={manifest.rootChainHash}>
                {manifest.rootChainHash.slice(0, 16)}…{manifest.rootChainHash.slice(-12)}
              </span>
              <button
                type="button"
                onClick={() => void copyValue('root-sha', manifest.rootChainHash)}
                aria-label="Copy cumulative root chain SHA-256 hash"
                className="btn btn-ghost min-h-[44px] min-w-[44px] !p-0 sm:min-h-[28px] sm:min-w-[28px]"
              >
                {copiedKey === 'root-sha' ? (
                  <Check className="h-3 w-3 text-mint" aria-hidden="true" />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden="true" />
                )}
              </button>
            </div>
            <p className="mono mt-0.5 text-[0.62rem] text-ink-faint">
              Sequential SHA-256 across all {formatInt(manifest.files.length)} files
            </p>
          </div>
        </div>

        <SubBlock title="Files sealed inside the forensic bundle">
          <div className="overflow-x-auto rounded-[9px] border border-edge">
            <table className="data-table min-w-[880px]">
              <thead>
                <tr>
                  <th scope="col">Path in bundle</th>
                  <th scope="col">Category</th>
                  <th scope="col">What it proves</th>
                  <th scope="col" className="text-right">
                    Bytes
                  </th>
                  <th scope="col">SHA-256 digest</th>
                </tr>
              </thead>
              <tbody>
                {manifest.files.map((entry) => {
                  const badge = CATEGORY_BADGE[entry.category];
                  const copyId = `file-${entry.path}`;
                  const isCopied = copiedKey === copyId;
                  return (
                    <tr key={entry.path}>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <FileIcon path={entry.path} />
                          <span className="mono text-[0.74rem] text-ink">{entry.path}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className={badge.className}>{badge.label}</span>
                      </td>
                      <td className="max-w-[340px] text-xs leading-relaxed text-ink-dim">
                        {entry.description}
                      </td>
                      <td className="mono whitespace-nowrap text-right text-[0.72rem] tabular-nums text-ink-dim">
                        {formatInt(entry.bytes)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span
                            className="mono block max-w-[300px] truncate text-[0.66rem] text-ink-dim xl:max-w-none"
                            title={entry.sha256}
                          >
                            {entry.sha256}
                          </span>
                          <button
                            type="button"
                            onClick={() => void copyValue(copyId, entry.sha256)}
                            aria-label={`Copy SHA-256 hash for ${entry.path}`}
                            className="btn btn-ghost ml-auto min-h-[44px] min-w-[44px] shrink-0 !p-0 sm:min-h-[28px] sm:min-w-[28px]"
                          >
                            {isCopied ? (
                              <Check className="h-3 w-3 text-mint" aria-hidden="true" />
                            ) : (
                              <Copy className="h-3 w-3" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SubBlock>

        <p className="font-mono text-[0.58rem] uppercase tracking-[0.12em] text-ink-faint">
          Built by buildForensicBundle (packages/forensic-engine/src/bundle.ts) · Local Foundry simulation evidence · Not mainnet state
        </p>
      </div>
    </Panel>
  );
}
