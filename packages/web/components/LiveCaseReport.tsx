import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import type { LiveCaseReport } from '../../forensic-engine/src/live-case';
import { formatDateTime } from '../lib/format';
import { Panel } from './Panel';
import { ErrorBlock, LoadingBlock } from './Loading';
import { MermaidDiagram } from './MermaidDiagram';

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function inline(text: string, prefix: string): ReactNode[] {
  const clean = text.replace(/\\"/g, '"').replace(/\\'/g, "'");
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;

  INLINE.lastIndex = 0;
  while ((match = INLINE.exec(clean)) !== null) {
    if (match.index > last) nodes.push(clean.slice(last, match.index));
    const token = match[0];

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${prefix}-b-${index++}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${prefix}-c-${index++}`} className="mono text-[0.86em] text-ink">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (link) {
        nodes.push(
          <a
            key={`${prefix}-a-${index++}`}
            href={link[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="break-words text-arterial underline underline-offset-2"
          >
            {link[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    last = match.index + token.length;
  }

  if (last < clean.length) nodes.push(clean.slice(last));
  return nodes;
}

function MarkdownTable({ lines }: { lines: string[] }) {
  const rows = lines.map((line) =>
    line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim()),
  );
  const [head, ...rest] = rows;
  const body = rest.filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)));
  if (!head || !body.length) return null;

  // Seven-column Bible tables are unreadable as tables in a dossier column.
  // Render wide records as labelled blocks; keep narrow tables as tables.
  if (head.length >= 5) {
    return (
      <div className="flex flex-col">
        {body.map((row, rowIndex) => (
          <div
            key={`record-${rowIndex}`}
            className="border-t border-edge py-3 first:border-t-0 first:pt-0"
          >
            <dl className="grid gap-x-5 gap-y-2 sm:grid-cols-2">
              {head.map((label, cellIndex) => (
                <div
                  key={`record-${rowIndex}-${cellIndex}`}
                  className={
                    cellIndex === 0 || cellIndex === head.length - 1 ? 'sm:col-span-2' : ''
                  }
                >
                  <dt className="label-micro">{label || 'field'}</dt>
                  <dd
                    className={`mt-0.5 break-words leading-relaxed text-ink-dim ${
                      cellIndex === 0 ? 'text-[0.82rem] font-medium text-ink' : 'text-[0.78rem]'
                    }`}
                  >
                    {inline(row[cellIndex] ?? '—', `record-${rowIndex}-${cellIndex}`)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[9px] border border-edge">
      <table className="data-table">
        <thead>
          <tr>
            {head.map((cell, cellIndex) => (
              <th key={`th-${cellIndex}`}>{inline(cell, `th-${cellIndex}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`tr-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`td-${rowIndex}-${cellIndex}`} className="text-[0.78rem] leading-relaxed text-ink-dim">
                  {inline(cell, `td-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MarkdownBody({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const language = fence[1].toLowerCase();
      const content: string[] = [];
      i += 1;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        content.push(lines[i]);
        i += 1;
      }
      i += 1;
      const body = content.join('\n');
      if (language === 'mermaid') {
        const caption = /^\s*sequenceDiagram\b/.test(body) ? 'funds flow' : 'attack flow';
        blocks.push(<MermaidDiagram key={`mermaid-${key++}`} chart={body} caption={caption} />);
      } else {
        blocks.push(
          <pre
            key={`code-${key++}`}
            className="scroll-y overflow-x-auto rounded-[9px] border border-edge bg-panel-2 p-3 font-mono text-[0.66rem] leading-relaxed text-ink-dim"
          >
            {body}
          </pre>,
        );
      }
      continue;
    }

    if (line.trim().startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i += 1;
      }
      blocks.push(<MarkdownTable key={`table-${key++}`} lines={tableLines} />);
      continue;
    }

    const heading = /^(#{3,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(
        <h4 key={`h-${key++}`} className="display mt-2 text-[0.98rem] font-medium text-ink">
          {inline(heading[2], `h-${key}`)}
        </h4>,
      );
      i += 1;
      continue;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul key={`ul-${key++}`} className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-dim">
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>{inline(item, `li-${key}-${itemIndex}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ol
          key={`ol-${key++}`}
          className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed text-ink-dim"
        >
          {items.map((item, itemIndex) => (
            <li key={`li-${itemIndex}`}>{inline(item, `ol-${key}-${itemIndex}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote key={`quote-${key++}`} className="border-l border-edge pl-3 text-sm italic leading-relaxed text-ink-dim">
          {inline(items.join(' '), `quote-${key}`)}
        </blockquote>,
      );
      continue;
    }

    if (/^\s*-{3,}\s*$/.test(line)) {
      blocks.push(<hr key={`hr-${key++}`} className="rule" />);
      i += 1;
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !lines[i].trim().startsWith('|') &&
      !/^#{3,6}\s/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\s*>\s?/.test(lines[i]) &&
      !/^\s*-{3,}\s*$/.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    blocks.push(
      <p key={`p-${key++}`} className="max-w-[86ch] text-sm leading-relaxed text-ink-dim">
        {inline(paragraph.join(' '), `p-${key}`)}
      </p>,
    );
  }

  return <div className="flex flex-col gap-3">{blocks}</div>;
}

export function LiveCaseReportBody({ report }: { report: LiveCaseReport }) {
  return (
    <div className="flex flex-col gap-6">
      {report.sections.map((section) => (
        <section key={section.heading} className="flex flex-col gap-2">
          <h3 className="display text-lg font-medium leading-snug text-ink">{section.heading}</h3>
          <MarkdownBody text={section.body} />
        </section>
      ))}
    </div>
  );
}

export function LiveCaseReportPanel({
  report,
  loading,
  error,
  onRetry,
}: {
  report: LiveCaseReport | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <Panel
      title="Forensic report"
      subtitle="Seven sections · the stored narrative is served as written"
      action={
        <a
          href="/api/live/report?format=markdown"
          download
          className="btn btn-ghost h-11 px-3 text-xs sm:h-9"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Markdown
        </a>
      }
    >
      {loading && !report ? <LoadingBlock label="Loading the forensic report" rows={6} /> : null}

      {error && !report ? (
        <ErrorBlock message={`The forensic report did not load — ${error}`} onRetry={onRetry} />
      ) : null}

      {report ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={report.generatedBy === 'minimax-code' ? 'chip chip-threat' : 'chip chip-amber'}>
              {report.generatedBy === 'minimax-code' ? 'AI · MINIMAX CODE' : 'DETERMINISTIC'}
            </span>
            {report.model ? <span className="chip">{report.model}</span> : null}
            <span className="chip">{report.sections.length} sections</span>
            <span className="chip">{report.mermaidBlocks.length} mermaid diagrams</span>
            <span className="mono ml-auto text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
              generated {formatDateTime(report.generatedAt)} UTC
            </span>
          </div>
          <p className="max-w-[86ch] text-xs leading-relaxed text-ink-dim">{report.note}</p>
          <LiveCaseReportBody report={report} />
        </div>
      ) : null}
    </Panel>
  );
}
