import type { ForensicReport, Severity } from '@helix/core';

const SEVERITY_COLOR: Record<Severity, string> = {
  critical: '#ff3b30',
  high: '#ff7a45',
  medium: '#f5b942',
  low: '#46d39a',
};

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((block) => `<p class="body">${esc(block)}</p>`)
    .join('\n');
}

/**
 * Renders the forensic report as a self-contained HTML document in the
 * "Red Room" design language. No external CSS, fonts or scripts; prints to A4.
 */
export function renderReportHtml(report: ForensicReport): string {
  const sevColor = SEVERITY_COLOR[report.severity] ?? '#ff3b30';
  const findings = report.findings
    .map((f) => {
      const color = SEVERITY_COLOR[f.severity] ?? '#ff3b30';
      const pct = Math.round(f.confidence * 100);
      const evidence = f.evidence.map((e) => `<li>${esc(e)}</li>`).join('');
      return `<article class="finding">
        <div class="finding-head">
          <span class="finding-title">${esc(f.label)}</span>
          <span class="badge" style="--badge:${color}">${esc(f.severity)}</span>
        </div>
        <div class="meter"><span style="width:${pct}%;background:${color}"></span></div>
        <div class="confidence">${pct}% confidence · ${esc(f.vectorId)}</div>
        <p class="body">${esc(f.rationale)}</p>
        <ul class="evidence">${evidence}</ul>
      </article>`;
    })
    .join('\n');

  const sections = report.sections
    .map(
      (s) => `<section class="panel">
        <h2>${esc(s.heading)}</h2>
        ${paragraphs(s.body)}
      </section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(report.title)}</title>
<style>
  :root {
    --ground: #090607;
    --panel: #110b0d;
    --hairline: #2b1a1e;
    --ink: #f7eded;
    --ink-dim: #c3a7aa;
    --arterial: #ff3b30;
    --ember: #ff7a45;
    --amber: #f5b942;
    --mint: #46d39a;
    --bone: #efe6e4;
    --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    --sans: "Inter", "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif;
  }
  * { box-sizing: border-box; }
  html { background: var(--ground); }
  body {
    margin: 0;
    padding: 48px 24px 72px;
    background: var(--ground);
    color: var(--ink);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.65;
    -webkit-font-smoothing: antialiased;
  }
  .sheet { max-width: 860px; margin: 0 auto; }
  .eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--arterial);
    margin: 0 0 14px;
  }
  h1 {
    font-size: 34px;
    line-height: 1.15;
    letter-spacing: -0.02em;
    margin: 0 0 22px;
    color: var(--bone);
  }
  .meta {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1px;
    background: var(--hairline);
    border: 1px solid var(--hairline);
    margin: 0 0 34px;
  }
  .meta div { background: var(--panel); padding: 12px 14px; }
  .meta dt {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-dim);
    margin: 0 0 4px;
  }
  .meta dd { margin: 0; font-family: var(--mono); font-size: 14px; color: var(--ink); }
  .severity { color: ${sevColor}; font-weight: 600; letter-spacing: 0.06em; }
  .panel {
    background: var(--panel);
    border: 1px solid var(--hairline);
    border-left: 2px solid var(--arterial);
    padding: 22px 24px;
    margin: 0 0 18px;
    break-inside: avoid;
  }
  h2 {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ember);
    margin: 0 0 14px;
    font-weight: 600;
  }
  .body {
    white-space: pre-wrap;
    margin: 0 0 12px;
    color: var(--ink);
  }
  .body:last-child { margin-bottom: 0; }
  .summary { border-left-color: var(--amber); }
  .summary .body { font-size: 16px; color: var(--bone); }
  .findings { display: grid; gap: 16px; margin-top: 6px; }
  .finding {
    background: var(--panel);
    border: 1px solid var(--hairline);
    padding: 18px 20px;
    break-inside: avoid;
  }
  .finding-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .finding-title { font-size: 17px; color: var(--bone); font-weight: 600; }
  .badge {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--badge);
    border: 1px solid var(--badge);
    padding: 2px 8px;
    border-radius: 999px;
  }
  .meter { height: 3px; background: var(--hairline); margin: 14px 0 8px; }
  .meter span { display: block; height: 100%; }
  .confidence { font-family: var(--mono); font-size: 11px; color: var(--ink-dim); letter-spacing: 0.08em; }
  .evidence { margin: 10px 0 0; padding-left: 18px; color: var(--ink-dim); font-size: 13px; }
  .evidence li { margin-bottom: 4px; }
  footer {
    margin-top: 40px;
    padding-top: 16px;
    border-top: 1px solid var(--hairline);
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.08em;
    color: var(--ink-dim);
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  @media print {
    @page { size: A4; margin: 14mm; }
    html, body { background: var(--ground) !important; }
    body { padding: 0; font-size: 11.5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { max-width: none; }
    h1 { font-size: 24px; }
    .meta { margin-bottom: 20px; }
    .panel, .finding { page-break-inside: avoid; break-inside: avoid; }
    .summary, h1, .meta { page-break-after: avoid; }
    a { color: var(--ink); text-decoration: none; }
  }
</style>
</head>
<body>
<div class="sheet">
  <p class="eyebrow">Mayall · Web3 Exploit Forensics · Case ${esc(report.caseRef)}</p>
  <h1>${esc(report.title)}</h1>
  <dl class="meta">
    <div><dt>Severity</dt><dd class="severity">${esc(report.severity.toUpperCase())}</dd></div>
    <div><dt>Confidence</dt><dd>${Math.round(report.confidence * 100)}%</dd></div>
    <div><dt>Chain</dt><dd>${esc(report.chain)}</dd></div>
    <div><dt>Loss</dt><dd>${esc(report.lossEth)} ETH</dd></div>
    <div><dt>Evidence items</dt><dd>${report.evidenceCount}</dd></div>
    <div><dt>Generated</dt><dd>${esc(report.generatedAt)}</dd></div>
  </dl>
  <section class="panel summary">
    <h2>Executive summary</h2>
    ${paragraphs(report.executiveSummary)}
  </section>
  ${sections}
  <section class="panel">
    <h2>Pattern findings</h2>
    <div class="findings">${findings || '<p class="body">No pattern crossed the detection threshold.</p>'}</div>
  </section>
  <footer>
    <span>Mayall forensic engine · Foundry simulation</span>
    <span>${esc(report.caseRef)}</span>
  </footer>
</div>
</body>
</html>
`;
}
