import { readFileSync } from 'node:fs';
import path from 'node:path';
import { repoRoot } from '@helix/forensic-engine';
import { heading, pad, padLeft, truncate } from './ui.js';

export type Sheet = string[][];

export interface Bible {
  path: string;
  sheets: { name: string; rows: Sheet }[];
}

export function biblePath(): string {
  return path.join(repoRoot(), 'data', 'bible', 'forensic-bible.json');
}

export function loadBible(): Bible {
  const file = biblePath();
  const raw = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, Sheet>;
  return {
    path: file,
    sheets: Object.entries(raw).map(([name, rows]) => ({ name, rows: Array.isArray(rows) ? rows : [] })),
  };
}

function cleanCell(value: unknown): string {
  return (value ?? '').toString().replace(/\s+/g, ' ').trim();
}

function titleOf(rows: Sheet): string {
  const first = rows.find((row) => row.some((cell) => cleanCell(cell).length > 8));
  return first ? truncate(cleanCell(first[0]), 66) : '';
}

function headerRow(rows: Sheet): { index: number; cells: string[] } {
  for (let i = 0; i < rows.length; i += 1) {
    const cells = rows[i].map(cleanCell);
    const nonEmpty = cells.filter(Boolean);
    if (nonEmpty.length >= 3) return { index: i, cells };
  }
  return { index: -1, cells: [] };
}

function dataRows(rows: Sheet): Sheet {
  const { index } = headerRow(rows);
  if (index === -1) return [];
  return rows.slice(index + 1).filter((row) => row.some((cell) => cleanCell(cell).length > 0));
}

function sheetByName(bible: Bible, prefix: string): { name: string; rows: Sheet } | undefined {
  return bible.sheets.find((sheet) => sheet.name.toLowerCase().startsWith(prefix.toLowerCase()));
}

export interface BibleSummary {
  sheets: number;
  attacks: number;
  families: { name: string; count: number }[];
  signals: number;
  glossary: number;
}

export function summariseBible(bible: Bible): BibleSummary {
  const patterns = sheetByName(bible, '04') ?? sheetByName(bible, 'attack pattern');
  const signals = sheetByName(bible, '03') ?? sheetByName(bible, 'detection signal');
  const glossary = sheetByName(bible, '11') ?? sheetByName(bible, 'glossary');

  const families: { name: string; count: number }[] = [];
  let attacks = 0;
  if (patterns) {
    const header = headerRow(patterns.rows);
    const familyIndex = Math.max(0, header.cells.findIndex((c) => /^family$/i.test(c)));
    const nameIndex = Math.max(1, header.cells.findIndex((c) => /^attack name$/i.test(c)));
    const counts = new Map<string, number>();
    // Family cells are merged in the source sheet: a blank cell continues the
    // family above it, so forward-fill while counting named attacks.
    let currentFamily = '';
    for (const row of dataRows(patterns.rows)) {
      const familyCell = cleanCell(row[familyIndex]);
      if (familyCell && !/^family$/i.test(familyCell)) currentFamily = familyCell;
      const attackName = cleanCell(row[nameIndex]);
      if (!attackName || /^attack name$/i.test(attackName) || !currentFamily) continue;
      counts.set(currentFamily, (counts.get(currentFamily) ?? 0) + 1);
      attacks += 1;
    }
    for (const [name, count] of [...counts.entries()].sort((a, b) => b[1] - a[1])) {
      families.push({ name, count });
    }
  }

  return {
    sheets: bible.sheets.length,
    attacks,
    families,
    signals: signals ? dataRows(signals.rows).length : 0,
    glossary: glossary ? dataRows(glossary.rows).length : 0,
  };
}

function printSheet(sheet: { name: string; rows: Sheet }, limit: number): void {
  const { index, cells } = headerRow(sheet.rows);
  console.log('');
  if (index === -1) {
    for (const row of sheet.rows.slice(0, limit)) console.log(`  ${cleanCell(row[0])}`);
    return;
  }

  const data = sheet.rows
    .slice(index + 1)
    .filter((row) => row.some((cell) => cleanCell(cell).length > 0));
  const labelWidth = Math.min(26, Math.max(...cells.map((cell) => cleanCell(cell).length), 10));

  for (const row of data.slice(0, limit)) {
    const family = cleanCell(row[0]);
    const name = cleanCell(row[1]);
    const title = [family, name].filter(Boolean).join(' · ') || cleanCell(row[0]) || 'row';
    console.log(`  ── ${title} ${'─'.repeat(Math.max(2, 74 - title.length))}`);
    for (let i = 0; i < cells.length; i += 1) {
      const value = cleanCell(row[i]);
      if (!value) continue;
      const label = cleanCell(cells[i]) || `column ${i + 1}`;
      console.log(`  ${pad(truncate(label, labelWidth), labelWidth)}  ${truncate(value, 88)}`);
    }
    console.log('');
  }

  const total = data.length;
  if (total > limit) console.log(`  … ${total - limit} more row(s). Use --rows ${total} to print all.`);
}

export function bibleCommand(opts: { sheet?: string; rows?: number }): number {
  let bible: Bible;
  try {
    bible = loadBible();
  } catch (error) {
    console.error(`Could not read the Forensic Bible at ${biblePath()}: ${(error as Error).message}`);
    return 1;
  }

  const summary = summariseBible(bible);

  if (opts.sheet) {
    const sheet = sheetByName(bible, opts.sheet);
    if (!sheet) {
      console.error(`No sheet matching "${opts.sheet}".`);
      console.error(`Sheets: ${bible.sheets.map((s) => s.name.split(' ')[0]).join(', ')}`);
      return 1;
    }
    for (const line of heading('forensic bible', sheet.name)) console.log(line);
    printSheet(sheet, opts.rows ?? 12);
    console.log('');
    return 0;
  }

  for (const line of heading('forensic bible', 'the knowledge base behind the detectors')) console.log(line);
  console.log(`  ${path.relative(repoRoot(), bible.path).split(path.sep).join('/')}`);
  console.log(
    `  ${summary.sheets} sheets · ${summary.attacks} attack patterns · ${summary.signals} detection signals · ${summary.glossary} glossary terms`,
  );
  console.log('');
  console.log(`  ${pad('SHEET', 34)}${padLeft('ROWS', 5)}  TITLE`);
  console.log(`  ${'─'.repeat(34)}${'─'.repeat(5)}  ${'─'.repeat(36)}`);
  for (const sheet of bible.sheets) {
    console.log(`  ${pad(truncate(sheet.name, 34), 34)}${padLeft(String(sheet.rows.length), 5)}  ${titleOf(sheet.rows)}`);
  }
  console.log('');
  console.log('  ATTACK FAMILIES (sheet 04)');
  console.log(`  ${'─'.repeat(52)}`);
  for (const family of summary.families) {
    console.log(`  ${pad(truncate(family.name, 40), 40)}${padLeft(String(family.count), 4)} attacks`);
  }
  console.log('');
  console.log('  Read one sheet:  mayall bible --sheet 04 [--rows 20]');
  console.log('');
  return 0;
}
