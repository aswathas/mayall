import type { CSSProperties, ReactNode } from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { COLORS, FONTS } from './theme';

/** The measuring surface: a 96 px grid, faint enough to read as ground. */
export function Ground({ step = 96, opacity = 0.05 }: { step?: number; opacity?: number }) {
  const { width, height } = useVideoConfig();
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = 0; x <= width; x += step) xs.push(x);
  for (let y = 0; y <= height; y += step) ys.push(y);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.void }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {xs.map((x) => (
          <line key={`x${x}`} x1={x} y1={0} x2={x} y2={height} stroke={COLORS.ink} strokeOpacity={opacity} strokeWidth={1} />
        ))}
        {ys.map((y) => (
          <line key={`y${y}`} x1={0} y1={y} x2={width} y2={y} stroke={COLORS.ink} strokeOpacity={opacity} strokeWidth={1} />
        ))}
      </svg>
    </AbsoluteFill>
  );
}

export function Micro({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        fontFamily: FONTS.mono,
        fontSize: 13,
        lineHeight: 1.4,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: COLORS.inkFaint,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Rule({
  left,
  top,
  width,
  color = COLORS.edge,
  opacity = 1,
}: {
  left: number;
  top: number;
  width: number;
  color?: string;
  opacity?: number;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left,
        top,
        width,
        height: 1,
        backgroundColor: color,
        opacity,
      }}
    />
  );
}

/** A labelled readout: micro label above a display value. */
export function Readout({
  left,
  top,
  label,
  value,
  tone = COLORS.ink,
  opacity = 1,
  translateY = 0,
  valueSize = 54,
}: {
  left: number;
  top: number;
  label: string;
  value: ReactNode;
  tone?: string;
  opacity?: number;
  translateY?: number;
  valueSize?: number;
}) {
  return (
    <div style={{ position: 'absolute', left, top, opacity, transform: `translateY(${translateY}px)` }}>
      <Micro>{label}</Micro>
      <div
        style={{
          marginTop: 8,
          fontFamily: FONTS.display,
          fontSize: valueSize,
          lineHeight: 1,
          letterSpacing: '-0.025em',
          fontVariantNumeric: 'tabular-nums',
          color: tone,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function Dot({ size, color }: { size: number; color: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: 999,
        backgroundColor: color,
      }}
    />
  );
}
