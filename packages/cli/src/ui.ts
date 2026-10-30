export const RULE_WIDTH = 78;

export function rule(char = '─'): string {
  return char.repeat(RULE_WIDTH);
}

export function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

export function padLeft(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

export function truncate(value: string, width: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length <= width ? clean : `${clean.slice(0, Math.max(0, width - 1))}…`;
}

export function bytes(count: number): string {
  if (count < 1024) return `${count} B`;
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`;
  return `${(count / (1024 * 1024)).toFixed(1)} MB`;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)} s`;
}

export function kv(label: string, value: string, labelWidth = 12): string {
  return `  ${pad(label.toUpperCase(), labelWidth)}  ${value}`;
}

export function heading(title: string, subtitle?: string): string[] {
  const out = ['', rule('━')];
  out.push(`  MAYALL · ${title.toUpperCase()}`);
  if (subtitle) out.push(`  ${subtitle}`);
  out.push(rule('━'));
  return out;
}

export function eth(wei: string): string {
  const value = BigInt(wei);
  const whole = value / 10n ** 18n;
  const fraction = (value % 10n ** 18n).toString().padStart(18, '0').replace(/0+$/, '');
  return `${whole}${fraction ? `.${fraction}` : ''}`;
}

export function weiToEth(value: string): string {
  try {
    return eth(value);
  } catch {
    return value;
  }
}

export function table(headers: string[], rows: string[][], align: ('left' | 'right')[] = []): string[] {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length)));
  const line = (cells: string[]): string =>
    cells
      .map((cell, i) => (align[i] === 'right' ? padLeft(cell, widths[i]) : pad(cell, widths[i])))
      .join('  ')
      .trimEnd();
  return [line(headers), widths.map((w) => '─'.repeat(w)).join('  '), ...rows.map(line)];
}
