'use client';

import type { ReactNode } from 'react';

/**
 * A deliberately small markdown renderer for the forensic report bodies. It
 * covers the structures the report writer emits: paragraphs, ordered and
 * unordered lists, tables, fenced code and H3/H4 subheadings. Mermaid blocks
 * are skipped because the page renders them with MermaidDiagram.
 */

type Block =
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'code'; lang: string; body: string }
  | { type: 'heading'; level: number; text: string }
  | { type: 'hr' };

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let index = 0;
  INLINE.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyBase}-${index}`;
    index += 1;

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={key} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      nodes.push(
        <code
          key={key}
          className="mono break-words rounded-[4px] bg-panel-2 px-1 py-0.5 text-[0.86em] text-ink"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link) {
        nodes.push(
          <a
            key={key}
            href={link[2]}
            target="_blank"
            rel="noreferrer noopener"
            className="text-arterial underline decoration-arterial/40 underline-offset-2 transition-colors duration-100 hover:decoration-arterial"
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

  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

const SPECIAL = /^(\||```|#{3,4}\s|[-*]\s|\d+\.\s|---+$)/;

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push({ type: 'code', lang, body: body.join('\n') });
      continue;
    }

    if (/^#{3,4}\s+/.test(trimmed)) {
      const level = (trimmed.match(/^#+/) ?? ['###'])[0].length;
      blocks.push({ type: 'heading', level, text: trimmed.replace(/^#+\s+/, '') });
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i += 1;
      continue;
    }

    if (trimmed.startsWith('|')) {
      const rows: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(lines[i].trim());
        i += 1;
      }
      const cells = rows.map((row) =>
        row
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim()),
      );
      if (cells.length >= 2) {
        blocks.push({ type: 'table', head: cells[0], rows: cells.slice(2) });
      }
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, '').trim());
        i += 1;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() && !SPECIAL.test(lines[i].trim())) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    if (paragraph.length) blocks.push({ type: 'p', text: paragraph.join(' ') });
    else i += 1;
  }

  return blocks;
}

function Table({ head, rows, index }: { head: string[]; rows: string[][]; index: number }) {
  return (
    <div className="scroll-y min-w-0 max-w-full overflow-x-auto">
      <table className="data-table min-w-[520px]">
        <thead>
          <tr>
            {head.map((cell, cellIndex) => (
              <th key={`h-${index}-${cellIndex}`} scope="col">
                {renderInline(cell, `th-${index}-${cellIndex}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={`r-${index}-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td
                  key={`c-${index}-${rowIndex}-${cellIndex}`}
                  className="break-words align-top text-[0.8rem] leading-relaxed"
                >
                  {renderInline(cell, `td-${index}-${rowIndex}-${cellIndex}`)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function HistoricalMarkdown({ source, className = '' }: { source: string; className?: string }) {
  const blocks = parse(source);

  return (
    <div className={`flex min-w-0 flex-col gap-3 ${className}`}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case 'p':
            return (
              <p key={`p-${index}`} className="max-w-[78ch] break-words text-[0.86rem] leading-relaxed text-ink-dim">
                {renderInline(block.text, `p-${index}`)}
              </p>
            );
          case 'ul':
            return (
              <ul key={`ul-${index}`} className="flex max-w-[80ch] flex-col gap-2">
                {block.items.map((item, itemIndex) => (
                  <li key={`li-${index}-${itemIndex}`} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mt-[0.55rem] h-1 w-1 shrink-0 rounded-full bg-arterial/80"
                    />
                    <span className="min-w-0 break-words text-[0.86rem] leading-relaxed text-ink-dim">
                      {renderInline(item, `li-${index}-${itemIndex}`)}
                    </span>
                  </li>
                ))}
              </ul>
            );
          case 'ol':
            return (
              <ol key={`ol-${index}`} className="flex max-w-[80ch] flex-col gap-2">
                {block.items.map((item, itemIndex) => (
                  <li key={`oli-${index}-${itemIndex}`} className="flex items-start gap-2.5">
                    <span
                      aria-hidden="true"
                      className="mono mt-[0.1rem] w-4 shrink-0 text-right text-[0.62rem] tabular-nums text-ink-faint"
                    >
                      {itemIndex + 1}.
                    </span>
                    <span className="min-w-0 break-words text-[0.86rem] leading-relaxed text-ink-dim">
                      {renderInline(item, `oli-${index}-${itemIndex}`)}
                    </span>
                  </li>
                ))}
              </ol>
            );
          case 'table':
            return <Table key={`t-${index}`} head={block.head} rows={block.rows} index={index} />;
          case 'code':
            if (block.lang.toLowerCase() === 'mermaid') return null;
            return (
              <pre
                key={`code-${index}`}
                className="scroll-y min-w-0 max-w-full max-h-72 overflow-auto rounded-[9px] border border-edge bg-panel-2 p-3 font-mono text-[0.68rem] leading-relaxed text-ink-dim"
              >
                {block.body}
              </pre>
            );
          case 'heading':
            return block.level <= 3 ? (
              <h3 key={`h-${index}`} className="display mt-2 text-[0.98rem] font-medium text-ink">
                {renderInline(block.text, `h-${index}`)}
              </h3>
            ) : (
              <h4 key={`h-${index}`} className="display mt-1 text-[0.9rem] font-medium text-ink">
                {renderInline(block.text, `h-${index}`)}
              </h4>
            );
          case 'hr':
            return <hr key={`hr-${index}`} className="rule my-1" />;
          default:
            return null;
        }
      })}
    </div>
  );
}
