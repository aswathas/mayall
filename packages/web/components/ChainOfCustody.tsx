'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Download, Link2, ShieldCheck, Terminal } from 'lucide-react';
import { formatDateTime, formatInt } from '../lib/format';
import { EmptyState, Panel, SubBlock } from './Panel';
import type { BundleManifestData } from './EvidenceWorkbenchLoader';

export interface ChainOfCustodyProps {
  custody: BundleManifestData | null;
  bundleHref: string;
}

export function ChainOfCustody({ custody, bundleHref }: ChainOfCustodyProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const copyText = useCallback(async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
    }
  }, []);

  if (!custody) {
    return (
      <Panel title="Chain of custody" subtitle="provenance · hash chain · tool versions">
        <EmptyState
          title="No chain of custody recorded"
          hint="Run a local Foundry simulation to seal the artifact hashes, execution timestamps and toolchain versions."
        />
      </Panel>
    );
  }

  const cocJsonString = JSON.stringify(
    {
      caseRef: custody.caseRef,
      scenario: custody.scenario,
      command: custody.command,
      startedAt: custody.startedAt,
      durationMs: custody.durationMs,
      ok: custody.ok,
      generatedAt: custody.generatedAt,
      rootChainHash: custody.rootChainHash,
      environment: custody.environment,
      files: custody.files.map((f) => ({
        path: f.path,
        sha256: f.sha256,
        bytes: f.bytes,
        chainHash: f.chainHash,
      })),
    },
    null,
    2,
  );

  const verifyScript = `# 1. Unzip the downloaded forensic bundle
Expand-Archive -Path ./${custody.filename} -DestinationPath ./verified-bundle -Force

# 2. Recompute SHA-256 for every file listed in chain-of-custody.json
$coc = Get-Content ./verified-bundle/chain-of-custody.json | ConvertFrom-Json
foreach ($entry in $coc.files) {
  $actual = (Get-FileHash "./verified-bundle/$($entry.path)" -Algorithm SHA256).Hash.ToLower()
  if ($actual -ne $entry.sha256) { throw "TAMPER DETECTED: $($entry.path)" }
  Write-Output "OK  $($entry.sha256)  $($entry.path)"
}`;

  return (
    <Panel
      title="Chain of custody"
      subtitle={`case ${custody.caseRef} · generated ${formatDateTime(custody.generatedAt)} · ${custody.ok ? 'simulation passed' : 'simulation incomplete'}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void copyText('coc-json', cocJsonString)}
            className="btn min-h-[44px] px-3 text-xs sm:min-h-[36px]"
          >
            {copiedId === 'coc-json' ? (
              <Check className="h-3.5 w-3.5 text-mint" aria-hidden="true" />
            ) : (
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {copiedId === 'coc-json' ? 'Copied JSON' : 'Copy chain-of-custody.json'}
          </button>
          <a
            href={bundleHref}
            download
            className="btn btn-primary min-h-[44px] px-3 text-xs sm:min-h-[36px]"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download bundle (.zip)
          </a>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <SubBlock title="Execution & generation provenance">
            <dl className="flex flex-col divide-y divide-edge rounded-[9px] border border-edge bg-abyss/40 px-3.5 py-2 text-xs">
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Case reference</dt>
                <dd className="mono text-ink">{custody.caseRef}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Scenario ID</dt>
                <dd className="mono text-ink-dim">{custody.scenario}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Simulation verdict</dt>
                <dd>
                  <span className={`chip ${custody.ok ? 'chip-safe' : 'chip-threat'}`}>
                    <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                    {custody.ok ? 'PASS · local Foundry run' : 'INCOMPLETE'}
                  </span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Simulation started (UTC)</dt>
                <dd className="mono tabular-nums text-ink-dim">{custody.startedAt}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Bundle sealed (UTC)</dt>
                <dd className="mono tabular-nums text-ink-dim">{custody.generatedAt}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Execution duration</dt>
                <dd className="mono tabular-nums text-ink">{formatInt(custody.durationMs)} ms</dd>
              </div>
            </dl>
          </SubBlock>

          <SubBlock title="Toolchain & environment versions">
            <dl className="flex flex-col divide-y divide-edge rounded-[9px] border border-edge bg-abyss/40 px-3.5 py-2 text-xs">
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Foundry (forge)</dt>
                <dd className="mono truncate text-ink" title={custody.environment.forge}>
                  {custody.environment.forge}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Solidity compiler (solc)</dt>
                <dd className="mono tabular-nums text-ink-dim">{custody.environment.solc}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Node.js runtime</dt>
                <dd className="mono tabular-nums text-ink-dim">{custody.environment.node}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Host platform</dt>
                <dd className="mono text-ink-dim">
                  {custody.environment.os} · {custody.environment.arch}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Forensic engine</dt>
                <dd className="mono text-ink-dim">Mayall (@helix/forensic-engine v{custody.environment.engineVersion})</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 py-2">
                <dt className="text-ink-faint">Hash algorithm</dt>
                <dd className="mono text-mint">SHA-256 (FIPS 180-4)</dd>
              </div>
            </dl>
          </SubBlock>
        </div>

        <SubBlock title="Captured execution command">
          <div className="flex items-center gap-2 rounded-[9px] border border-edge bg-abyss/60 px-3.5 py-2.5">
            <Terminal className="h-3.5 w-3.5 shrink-0 text-arterial" aria-hidden="true" />
            <code className="mono min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-xs text-ink">
              {custody.command}
            </code>
            <button
              type="button"
              onClick={() => void copyText('cmd', custody.command)}
              aria-label="Copy execution command"
              className="btn btn-ghost min-h-[44px] px-2.5 text-[0.68rem] sm:min-h-[30px]"
            >
              {copiedId === 'cmd' ? (
                <Check className="h-3 w-3 text-mint" aria-hidden="true" />
              ) : (
                <Copy className="h-3 w-3" aria-hidden="true" />
              )}
              {copiedId === 'cmd' ? 'Copied' : 'Copy'}
            </button>
          </div>
        </SubBlock>

        <hr className="rule" />

        <SubBlock title="Sequential SHA-256 hash chain (H_i = sha256(H_{i-1} : leaf_sha256))">
          <div className="overflow-x-auto rounded-[9px] border border-edge">
            <table className="data-table min-w-[820px]">
              <thead>
                <tr>
                  <th scope="col" className="w-14">
                    Link
                  </th>
                  <th scope="col">Artifact path</th>
                  <th scope="col">Leaf SHA-256 (file digest)</th>
                  <th scope="col">Cumulative chain SHA-256 (H_i)</th>
                </tr>
              </thead>
              <tbody>
                {custody.files.map((file, idx) => {
                  const isFinal = idx === custody.files.length - 1;
                  return (
                    <tr key={file.path} className={isFinal ? 'bg-arterial/[0.05]' : ''}>
                      <td className="mono whitespace-nowrap text-[0.66rem] tabular-nums text-ink-faint">
                        <span className="inline-flex items-center gap-1">
                          <Link2 className={`h-3 w-3 ${isFinal ? 'text-arterial' : 'text-ink-faint'}`} aria-hidden="true" />
                          #{String(idx + 1).padStart(2, '0')}
                        </span>
                      </td>
                      <td className="mono whitespace-nowrap text-[0.72rem] text-ink">{file.path}</td>
                      <td className="mono text-[0.65rem] text-ink-dim" title={file.sha256}>
                        {file.sha256.slice(0, 18)}…{file.sha256.slice(-10)}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span
                            className={`mono text-[0.65rem] ${isFinal ? 'font-medium text-arterial' : 'text-ink'}`}
                            title={file.chainHash}
                          >
                            {file.chainHash.slice(0, 22)}…{file.chainHash.slice(-12)}
                          </span>
                          {isFinal ? <span className="chip chip-threat !py-0 text-[0.55rem]">root</span> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SubBlock>

        <SubBlock title="Client verification procedure">
          <div className="relative rounded-[9px] border border-edge bg-abyss/60 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="mono text-[0.6rem] uppercase tracking-[0.14em] text-ink-faint">
                PowerShell verification script · zero trust required
              </span>
              <button
                type="button"
                onClick={() => void copyText('verify-script', verifyScript)}
                aria-label="Copy verification script"
                className="btn btn-ghost min-h-[44px] px-2.5 text-[0.68rem] sm:min-h-[28px]"
              >
                {copiedId === 'verify-script' ? (
                  <Check className="h-3 w-3 text-mint" aria-hidden="true" />
                ) : (
                  <Copy className="h-3 w-3" aria-hidden="true" />
                )}
                {copiedId === 'verify-script' ? 'Copied script' : 'Copy script'}
              </button>
            </div>
            <pre className="scroll-y overflow-x-auto font-mono text-[0.68rem] leading-relaxed text-ink-dim">
              {verifyScript}
            </pre>
          </div>
        </SubBlock>
      </div>
    </Panel>
  );
}
