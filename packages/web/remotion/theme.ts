/**
 * Style as numbers. The intro and trace pieces are films, so they carry the
 * Red Room palette as literal hex values — the same values as the tokens in
 * `app/globals.css`, kept in exactly one place so the video and the console
 * never drift. Nothing else in the app may use these constants for styling.
 */
import { Easing } from 'remotion';

export const COLORS = {
  void: '#090607',
  abyss: '#0c0809',
  panel: '#110b0d',
  panel2: '#170f12',
  elevated: '#1e1417',
  edge: '#2b1a1e',
  edgeStrong: '#3d2429',
  ink: '#f7eded',
  inkDim: '#c3a7aa',
  inkFaint: '#8f7276',
  arterial: '#ff3b30',
  arterialDeep: '#b31f18',
  ember: '#ff7a45',
  amber: '#f5b942',
  mint: '#46d39a',
  bone: '#efe6e4',
} as const;

export const FONTS = {
  display: '"Familjen Grotesk", ui-sans-serif, sans-serif',
  sans: '"Public Sans", ui-sans-serif, system-ui, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
} as const;

/** 5% safe margin at 1920×1080. */
export const SAFE = 96;

export const EASE = {
  /** Entrances. */
  out: Easing.bezier(0.16, 1, 0.3, 1),
  /** On-screen movement, value travel settle. */
  inOut: Easing.bezier(0.4, 0, 0.2, 1),
  /** Long linear travel. */
  linear: (t: number) => t,
} as const;

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value;

export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;

/** Mulberry32 — tiny, seeded, identical on every render. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean.slice(0, 6);
  const n = Number.parseInt(value, 16);
  if (!Number.isFinite(n)) return hex;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
