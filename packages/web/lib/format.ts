const USD_COMPACT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 2,
});

const USD_FULL = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const INT = new Intl.NumberFormat('en-US');

export function formatUsdCompact(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return USD_COMPACT.format(value);
}

export function formatUsdFull(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  return USD_FULL.format(value);
}

export function formatInt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return INT.format(value);
}

export function formatGas(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return INT.format(Math.round(value));
}

/** Converts a base-10 wei string to ETH with up to `decimals` places. */
export function weiToEth(wei: string | undefined, decimals = 6): string {
  if (!wei) return '0';
  let value: bigint;
  try {
    value = BigInt(wei);
  } catch {
    return wei;
  }
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** 18n;
  const whole = abs / base;
  const fraction = (abs % base)
    .toString()
    .padStart(18, '0')
    .slice(0, Math.max(0, decimals))
    .replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole.toString()}${fraction ? `.${fraction}` : ''}`;
}

export function formatEth(wei: string | undefined, decimals = 4): string {
  return `${weiToEth(wei, decimals)} ETH`;
}

/** Formats an already-decimal ETH amount (e.g. SimulationArtifact.lossEth). */
export function formatEthAmount(value: string | number | undefined, decimals = 4): string {
  if (value === undefined || value === '') return '0 ETH';
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return `${String(value)} ETH`;
  return `${numeric.toLocaleString('en-US', { maximumFractionDigits: decimals })} ETH`;
}

export function truncateAddress(address: string, head = 6, tail = 4): string {
  if (!address) return '';
  if (address.length <= head + tail + 2) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
}

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  timeZone: 'UTC',
});

const DATETIME_FMT = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

const RELATIVE_FMT = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return DATE_FMT.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return DATETIME_FMT.format(date);
}

export function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1_000],
  ];
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') {
      return RELATIVE_FMT.format(Math.round(diffMs / ms), unit);
    }
  }
  return 'now';
}

export function formatPct(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '0%';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDateMonth(month: string): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(date);
}

export function signedEth(deltaWei: string, decimals = 4): string {
  if (!deltaWei) return '0 ETH';
  const negative = deltaWei.startsWith('-');
  const numeric = negative ? deltaWei.slice(1) : deltaWei;
  const eth = weiToEth(numeric, decimals);
  const isZero = /^0+(\.0+)?$/.test(eth);
  if (isZero) return '0 ETH';
  return `${negative ? '-' : '+'}${eth} ETH`;
}

export function isPositiveWei(deltaWei: string): boolean {
  try {
    return BigInt(deltaWei) > 0n;
  } catch {
    return false;
  }
}

export function isNegativeWei(deltaWei: string): boolean {
  try {
    return BigInt(deltaWei) < 0n;
  } catch {
    return false;
  }
}
