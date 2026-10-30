'use client';

import { useMemo, useState } from 'react';
import { RotateCw } from 'lucide-react';

/**
 * "The evidence bench" — the pipeline as a physical instrument.
 *
 * The specimen (a transaction trace) enters at the left, travels the rail past
 * a reader, a weighing stage with a detector dial, and a balance, then reaches
 * the press that writes the report. The signed bundle drops into the tray.
 *
 * Motion is CSS only: one class (`is-live`) starts three eased movements —
 * carriage advance, needle settle, bundle drop. Numbers on the object come
 * from the same model that positions the carriage.
 */

const KX = 0.8660254;
const KY = 0.5;
const OX = 190;
const OY = 120;

/** Carriage stops in world units along the rail. Six stops = six scenarios. */
const STOPS = [80, 220, 370, 510, 630, 700];
const START = STOPS[0];
const FINAL = STOPS[STOPS.length - 1];

type Pt = [number, number];

function iso(x: number, y: number, z: number): Pt {
  return [OX + (x - y) * KX, OY + (x + y) * KY - z];
}

/** The dial sits on the weighing stage; its needle is generated from it. */
const GAUGE: Pt = iso(504, 48, 192);
const NEEDLE_READING = 120;

function poly(points: Array<[number, number, number]>): string {
  return points
    .map(([x, y, z]) => {
      const [sx, sy] = iso(x, y, z);
      return `${sx.toFixed(2)},${sy.toFixed(2)}`;
    })
    .join(' ');
}

function faces(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  return {
    top: poly([
      [x0, y0, z1],
      [x1, y0, z1],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
    right: poly([
      [x1, y0, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x1, y0, z1],
    ]),
    left: poly([
      [x0, y1, z0],
      [x1, y1, z0],
      [x1, y1, z1],
      [x0, y1, z1],
    ]),
  };
}

interface BoxProps {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  top?: string;
  right?: string;
  left?: string;
}

function Box({ x0, x1, y0, y1, z0, z1, top = 't1', right = 't2', left = 't3' }: BoxProps) {
  const f = faces(x0, x1, y0, y1, z0, z1);
  return (
    <g className="f-edge">
      <polygon points={f.left} className={left} />
      <polygon points={f.right} className={right} />
      <polygon points={f.top} className={top} />
    </g>
  );
}

function Cylinder({
  x,
  y,
  r,
  z0,
  z1,
  body = 't3',
  cap = 't1',
}: {
  x: number;
  y: number;
  r: number;
  z0: number;
  z1: number;
  body?: string;
  cap?: string;
}) {
  const [cx, cyTop] = iso(x, y, z1);
  const [, cyBot] = iso(x, y, z0);
  return (
    <g className="f-edge">
      <path
        d={`M ${cx - r} ${cyTop} L ${cx - r} ${cyBot} A ${r} ${r * 0.5} 0 0 0 ${cx + r} ${cyBot} L ${cx + r} ${cyTop} Z`}
        className={body}
      />
      <ellipse cx={cx} cy={cyTop} rx={r} ry={r * 0.5} className={cap} />
    </g>
  );
}

function Knob({ x, y, z, r = 13 }: { x: number; y: number; z: number; r?: number }) {
  const [cx, cy] = iso(x, y, z);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} className="t2 f-edge" />
      {Array.from({ length: 14 }).map((_, index) => {
        const angle = (index / 14) * Math.PI * 2;
        return (
          <line
            key={index}
            x1={cx + Math.cos(angle) * (r - 4)}
            y1={cy + Math.sin(angle) * (r - 4)}
            x2={cx + Math.cos(angle) * r}
            y2={cy + Math.sin(angle) * r}
            className="tick"
          />
        );
      })}
      <circle cx={cx} cy={cy} r={Math.max(2, r * 0.3)} className="chrome" opacity={0.75} />
    </g>
  );
}

function Callout({
  x,
  y,
  text,
  to,
  anchor = 'start',
}: {
  x: number;
  y: number;
  text: string;
  to: Pt;
  anchor?: 'start' | 'middle' | 'end';
}) {
  return (
    <g>
      <line x1={x} y1={y + 4} x2={to[0]} y2={to[1]} className="leader" />
      <circle cx={to[0]} cy={to[1]} r={2} className="signal" />
      <text x={x} y={y} textAnchor={anchor} className="engrave">
        {text}
      </text>
    </g>
  );
}

function carriageKeyframes(): string {
  const frames: string[] = [];
  STOPS.forEach((stop, index) => {
    const dx = ((stop - START) * KX).toFixed(1);
    const dy = ((stop - START) * KY).toFixed(1);
    const arrive = (4 + index * 13).toFixed(1);
    const hold = (4 + index * 13 + 3.4).toFixed(1);
    frames.push(`${arrive}% { transform: translate(${dx}px, ${dy}px); }`);
    frames.push(`${hold}% { transform: translate(${dx}px, ${dy}px); }`);
  });
  const fx = ((FINAL - START) * KX).toFixed(1);
  const fy = ((FINAL - START) * KY).toFixed(1);
  frames.push(`100% { transform: translate(${fx}px, ${fy}px); }`);
  return `@keyframes hx-carriage { 0% { transform: translate(0px, 0px); } ${frames.join(' ')} }`;
}

export interface EvidencePipelineFigureProps {
  /** Number of detector findings the weighing stage can report. */
  detectors?: number;
  /** Number of sections the press writes. */
  reportSections?: number;
}

export function EvidencePipelineFigure({
  detectors = 10,
  reportSections = 7,
}: EvidencePipelineFigureProps) {
  const [runId, setRunId] = useState(0);

  const gauge = GAUGE;
  const needleAngle = NEEDLE_READING;
  const finalDx = ((FINAL - START) * KX).toFixed(1);
  const finalDy = ((FINAL - START) * KY).toFixed(1);

  const css = useMemo(() => {
    return `
${carriageKeyframes()}
@keyframes hx-needle {
  0%, 34% { transform: rotate(-120deg); }
  46% { transform: rotate(132deg); }
  54% { transform: rotate(112deg); }
  62%, 100% { transform: rotate(${needleAngle}deg); }
}
@keyframes hx-bundle {
  0%, 76% { opacity: 0; transform: translateY(-54px); }
  88%, 100% { opacity: 1; transform: translateY(0); }
}
@keyframes hx-seal {
  0%, 88% { opacity: 0; }
  94%, 100% { opacity: 1; }
}
.hx-fig { width: 100%; height: auto; display: block; overflow: visible; }
.hx-fig .f-edge {
  stroke: color-mix(in srgb, var(--hx-ink) 40%, transparent);
  stroke-width: 0.9;
  stroke-linejoin: round;
}
.hx-fig .t1 { fill: color-mix(in srgb, var(--hx-ink) 56%, var(--hx-panel)); }
.hx-fig .t2 { fill: color-mix(in srgb, var(--hx-ink) 43%, var(--hx-panel)); }
.hx-fig .t3 { fill: color-mix(in srgb, var(--hx-ink) 31%, var(--hx-panel)); }
.hx-fig .t4 { fill: color-mix(in srgb, var(--hx-ink) 20%, var(--hx-panel)); }
.hx-fig .chrome { fill: var(--hx-bone); }
.hx-fig .signal { fill: var(--hx-arterial); }
.hx-fig .sig-stroke { stroke: var(--hx-arterial); stroke-width: 1.2; fill: none; stroke-linecap: round; }
.hx-fig .line { stroke: color-mix(in srgb, var(--hx-ink) 38%, transparent); stroke-width: 0.9; fill: none; }
.hx-fig .tick { stroke: color-mix(in srgb, var(--hx-ink) 55%, transparent); stroke-width: 0.9; }
.hx-fig .leader {
  stroke: color-mix(in srgb, var(--hx-ink) 38%, transparent);
  stroke-width: 0.8;
  stroke-dasharray: 2 3;
}
.hx-fig .engrave {
  fill: color-mix(in srgb, var(--hx-ink) 74%, transparent);
  font-family: var(--font-mono);
  font-size: 11.5px;
  letter-spacing: 0.14em;
}
.hx-fig .engrave-dim { fill: color-mix(in srgb, var(--hx-ink) 44%, transparent); }
.hx-fig .needle {
  transform-box: view-box;
  transform-origin: ${gauge[0].toFixed(1)}px ${gauge[1].toFixed(1)}px;
}
.hx-fig.is-live .carriage { animation: hx-carriage 7.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
.hx-fig.is-live .needle { animation: hx-needle 7.4s cubic-bezier(0.4, 0, 0.2, 1) both; }
.hx-fig.is-live .bundle { animation: hx-bundle 7.4s cubic-bezier(0.16, 1, 0.3, 1) both; }
.hx-fig.is-live .seal { animation: hx-seal 7.4s linear both; }
@media (prefers-reduced-motion: reduce) {
  .hx-fig.is-live .carriage,
  .hx-fig.is-live .needle,
  .hx-fig.is-live .bundle,
  .hx-fig.is-live .seal { animation: none; }
}
.hx-fig .dial-ticks line { stroke: color-mix(in srgb, var(--hx-ink) 60%, transparent); stroke-width: 1; }
`;
  }, [gauge, needleAngle]);

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-2">
        <p className="mono text-[0.58rem] uppercase tracking-[0.16em] text-ink-faint">
          evidence bench · {STOPS.length} stations · {detectors} detectors · {reportSections} report sections
        </p>
        <button
          type="button"
          className="btn h-11 px-3 text-[0.7rem] sm:h-8"
          onClick={() => setRunId((value) => value + 1)}
        >
          <RotateCw className="h-3 w-3" aria-hidden="true" /> Replay the bench
        </button>
      </div>

      <div className="relative rounded-[14px] border border-edge bg-abyss/40 px-2 py-2 sm:px-4 sm:py-3">
        <style>{css}</style>
        <svg
          key={runId}
          viewBox="0 0 1120 800"
          className="hx-fig is-live"
          role="img"
          aria-labelledby="bench-title bench-desc"
        >
          <title id="bench-title">The Mayall evidence bench</title>
          <desc id="bench-desc">
            An isometric instrument: a specimen carriage travels a ticked rail over a trace reader, a detector dial
            that settles at {detectors}, and a balance, into a press that writes {reportSections} report sections. A
            signed evidence bundle drops into the tray at the right.
          </desc>

          {/* contact shadow: the base footprint, offset once */}
          <g transform="translate(8 16)">
            <polygon
              points={poly([
                [40, 0, 0],
                [1000, 0, 0],
                [1000, 230, 0],
                [40, 230, 0],
              ])}
              fill="var(--hx-abyss)"
              opacity={0.55}
            />
          </g>

          {/* feet */}
          <Cylinder x={72} y={42} r={17} z0={-18} z1={0} body="t4" cap="t2" />
          <Cylinder x={968} y={42} r={17} z0={-18} z1={0} body="t4" cap="t2" />
          <Cylinder x={72} y={188} r={17} z0={-18} z1={0} body="t4" cap="t2" />
          <Cylinder x={968} y={188} r={17} z0={-18} z1={0} body="t4" cap="t2" />

          {/* base */}
          <Box x0={40} x1={1000} y0={0} y1={230} z0={0} z1={44} top="t2" right="t2" left="t3" />
          <Box x0={30} x1={1010} y0={-10} y1={240} z0={44} z1={56} top="t1" right="t2" left="t3" />
          <polygon
            points={poly([
              [40, 0, 56.3],
              [1000, 0, 56.3],
              [1000, 230, 56.3],
              [40, 230, 56.3],
            ])}
            fill="none"
            stroke="var(--hx-edge-strong)"
            strokeWidth={0.8}
          />
          <Box x0={60} x1={980} y0={230} y1={236} z0={6} z1={30} top="t2" right="t2" left="t3" />

          {/* rails */}
          <Box x0={80} x1={940} y0={74} y1={86} z0={56} z1={66} top="t1" right="t2" left="t3" />
          <Box x0={60} x1={80} y0={68} y1={162} z0={56} z1={74} top="t1" right="t2" left="t3" />
          <Box x0={940} x1={958} y0={68} y1={162} z0={56} z1={74} top="t1" right="t2" left="t3" />
          <Box x0={80} x1={940} y0={144} y1={156} z0={56} z1={66} top="t1" right="t2" left="t3" />

          {/* rail ruler */}
          {Array.from({ length: 41 }).map((_, index) => {
            const x = 90 + index * 21;
            const major = index % 5 === 0;
            const [x1, y1] = iso(x, 156, 66);
            const [x2, y2] = iso(x, 156, 66 + (major ? 8 : 4));
            return <line key={index} x1={x1} y1={y1} x2={x2} y2={y2} className="tick" />;
          })}
          {[0, 25, 50, 75, 100].map((label, index) => {
            const [x, y] = iso(90 + index * 210, 160, 54);
            return (
              <text key={label} x={x} y={y + 8} textAnchor="middle" className="engrave engrave-dim">
                {label}
              </text>
            );
          })}

          {/* sample trays */}
          <Box x0={120} x1={200} y0={172} y1={214} z0={56} z1={62} top="t3" right="t3" left="t4" />
          <Box x0={120} x1={124} y0={172} y1={214} z0={62} z1={68} top="t2" right="t2" left="t3" />
          <Box x0={196} x1={200} y0={172} y1={214} z0={62} z1={68} top="t2" right="t2" left="t3" />
          <Box x0={124} x1={196} y0={210} y1={214} z0={62} z1={68} top="t2" right="t2" left="t3" />
          <Box x0={136} x1={184} y0={182} y1={204} z0={62} z1={64} top="t1" right="t2" left="t3" />
          <Box x0={420} x1={492} y0={172} y1={214} z0={56} z1={62} top="t3" right="t3" left="t4" />
          <Box x0={420} x1={424} y0={172} y1={214} z0={62} z1={68} top="t2" right="t2" left="t3" />
          <Box x0={488} x1={492} y0={172} y1={214} z0={62} z1={68} top="t2" right="t2" left="t3" />
          <Box x0={424} x1={488} y0={210} y1={214} z0={62} z1={68} top="t2" right="t2" left="t3" />

          {/* reader gantry */}
          <Box x0={232} x1={248} y0={52} y1={68} z0={56} z1={206} top="t2" right="t2" left="t3" />
          <Box x0={232} x1={248} y0={152} y1={168} z0={56} z1={206} top="t2" right="t2" left="t3" />
          <Box x0={224} x1={346} y0={44} y1={176} z0={196} z1={214} top="t1" right="t2" left="t3" />
          <Box x0={258} x1={312} y0={92} y1={128} z0={128} z1={196} top="t2" right="t2" left="t3" />
          {[0, 1, 2, 3].map((index) => (
            <Box
              key={`fin-${index}`}
              x0={254}
              x1={316}
              y0={88}
              y1={132}
              z0={136 + index * 13}
              z1={141 + index * 13}
              top="t1"
              right="t2"
              left="t3"
            />
          ))}
          {[
            [250, 60],
            [250, 160],
            [320, 60],
            [320, 160],
          ].map(([x, y], index) => {
            const [cx, cy] = iso(x, y, 214.5);
            return <circle key={`beam-bolt-${index}`} cx={cx} cy={cy} r={2.4} className="chrome" opacity={0.5} />;
          })}
          {(() => {
            const [cx, cy] = iso(312, 110, 158);
            return (
              <g>
                <circle cx={cx} cy={cy} r={12} className="t1 f-edge" />
                <circle cx={cx} cy={cy} r={7.5} className="t4" stroke="var(--hx-arterial)" strokeWidth={1.4} />
              </g>
            );
          })()}

          {/* weighing platform + detector dial */}
          <Box x0={394} x1={492} y0={78} y1={142} z0={56} z1={62} top="t3" right="t3" left="t4" />
          <Box x0={400} x1={486} y0={84} y1={136} z0={62} z1={72} top="t1" right="t2" left="t3" />
          <Box x0={488} x1={522} y0={34} y1={62} z0={56} z1={62} top="t2" right="t2" left="t3" />
          <Box x0={496} x1={512} y0={42} y1={58} z0={62} z1={150} top="t2" right="t2" left="t3" />
          <Box x0={486} x1={522} y0={30} y1={66} z0={150} z1={206} top="t2" right="t2" left="t3" />

          <g>
            <circle cx={gauge[0]} cy={gauge[1]} r={44} className="t3 f-edge" />
            <circle cx={gauge[0]} cy={gauge[1]} r={37} fill="none" stroke="var(--hx-edge-strong)" strokeWidth={0.8} />
            <g className="dial-ticks">
              {Array.from({ length: detectors + 1 }).map((_, index) => {
                const angle = (-120 + (240 * index) / detectors) * (Math.PI / 180);
                const inner = index === 0 || index === detectors ? 31 : 34;
                return (
                  <line
                    key={`tick-${index}`}
                    x1={gauge[0] + Math.sin(angle) * inner}
                    y1={gauge[1] - Math.cos(angle) * inner}
                    x2={gauge[0] + Math.sin(angle) * 40}
                    y2={gauge[1] - Math.cos(angle) * 40}
                  />
                );
              })}
            </g>
            <text
              x={gauge[0] + Math.sin((-120 * Math.PI) / 180) * 24}
              y={gauge[1] - Math.cos((-120 * Math.PI) / 180) * 24}
              textAnchor="middle"
              className="engrave engrave-dim"
              dominantBaseline="middle"
            >
              0
            </text>
            <text
              x={gauge[0] + Math.sin((120 * Math.PI) / 180) * 24}
              y={gauge[1] - Math.cos((120 * Math.PI) / 180) * 24}
              textAnchor="middle"
              className="engrave"
              dominantBaseline="middle"
            >
              {detectors}
            </text>
            <text x={gauge[0]} y={gauge[1] + 60} textAnchor="middle" className="engrave">
              DETECTORS
            </text>
            <g
              className="needle"
              transform={`rotate(${needleAngle} ${gauge[0].toFixed(1)} ${gauge[1].toFixed(1)})`}
            >
              <path
                d={`M ${gauge[0].toFixed(1)} ${(gauge[1] + 6).toFixed(1)} L ${(gauge[0] - 2.6).toFixed(1)} ${gauge[1].toFixed(1)} L ${gauge[0].toFixed(1)} ${(gauge[1] - 33).toFixed(1)} L ${(gauge[0] + 2.6).toFixed(1)} ${gauge[1].toFixed(1)} Z`}
                className="signal"
              />
              <circle cx={gauge[0]} cy={gauge[1]} r={4} className="chrome" />
            </g>
          </g>

          {/* balance stage */}
          <Box x0={580} x1={620} y0={88} y1={116} z0={56} z1={62} top="t2" right="t2" left="t3" />
          <Box x0={592} x1={608} y0={92} y1={112} z0={62} z1={168} top="t2" right="t2" left="t3" />
          <Box x0={548} x1={652} y0={96} y1={108} z0={168} z1={176} top="t1" right="t2" left="t3" />
          {[
            [550, 102, 168, 132],
            [554, 102, 168, 132],
            [646, 102, 168, 132],
            [650, 102, 168, 132],
          ].map(([x, y, z0, z1], index) => {
            const a = iso(x, y, z0);
            const b = iso(x, y, z1);
            return <line key={`pan-line-${index}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="line" />;
          })}
          {(() => {
            const [cx, cy] = iso(552, 102, 128);
            return (
              <g>
                <ellipse cx={cx} cy={cy} rx={25} ry={11} className="t2 f-edge" />
                <ellipse cx={cx} cy={cy - 1.5} rx={19} ry={8} className="t4" />
              </g>
            );
          })()}
          {(() => {
            const [cx, cy] = iso(648, 102, 128);
            return (
              <g>
                <ellipse cx={cx} cy={cy} rx={25} ry={11} className="t2 f-edge" />
                <ellipse cx={cx} cy={cy - 1.5} rx={19} ry={8} className="t4" />
              </g>
            );
          })()}
          <Box x0={636} x1={646} y0={96} y1={108} z0={128} z1={137} top="t1" right="t2" left="t3" />
          <Box x0={650} x1={660} y0={96} y1={108} z0={128} z1={142} top="t1" right="t2" left="t3" />
          <g>
            <circle cx={iso(600, 102, 178)[0]} cy={iso(600, 102, 178)[1]} r={6} className="t2 f-edge" />
            <circle cx={iso(600, 102, 178)[0]} cy={iso(600, 102, 178)[1]} r={2} className="chrome" opacity={0.7} />
          </g>

          {/* press */}
          <Box x0={768} x1={796} y0={10} y1={42} z0={56} z1={244} top="t1" right="t2" left="t3" />
          <Box x0={768} x1={796} y0={188} y1={220} z0={56} z1={244} top="t1" right="t2" left="t3" />
          <Box x0={864} x1={892} y0={10} y1={42} z0={56} z1={244} top="t1" right="t2" left="t3" />
          <Box x0={864} x1={892} y0={188} y1={220} z0={56} z1={244} top="t1" right="t2" left="t3" />
          <Box x0={758} x1={902} y0={4} y1={226} z0={244} z1={262} top="t1" right="t2" left="t3" />
          {[
            [784, 26],
            [876, 26],
            [784, 204],
            [876, 204],
          ].map(([x, y], index) => {
            const [cx, cy] = iso(x, y, 262.5);
            return <circle key={`press-bolt-${index}`} cx={cx} cy={cy} r={3} className="chrome" opacity={0.45} />;
          })}
          <Cylinder x={830} y={116} r={12} z0={176} z1={246} body="t2" cap="t1" />
          {[1, 2, 3, 4, 5].map((index) => {
            const [, top] = iso(830, 116, 246);
            const [, bottom] = iso(830, 116, 176);
            const y = top + ((bottom - top) * index) / 6;
            const [left] = iso(830 - 10, 116, 0);
            return <line key={`thread-${index}`} x1={left} y1={y} x2={left + 20} y2={y} className="tick" />;
          })}
          <Box x0={780} x1={880} y0={54} y1={178} z0={152} z1={158} top="t2" right="t2" left="t3" />
          <Box x0={786} x1={874} y0={60} y1={172} z0={158} z1={180} top="t1" right="t2" left="t3" />
          <Box x0={792} x1={868} y0={66} y1={166} z0={56} z1={64} top="t3" right="t3" left="t4" />

          {/* output tray + signed bundle */}
          <Box x0={918} x1={996} y0={86} y1={204} z0={56} z1={62} top="t3" right="t3" left="t4" />
          <Box x0={918} x1={922} y0={86} y1={204} z0={62} z1={70} top="t2" right="t2" left="t3" />
          <Box x0={992} x1={996} y0={86} y1={204} z0={62} z1={70} top="t2" right="t2" left="t3" />
          <Box x0={922} x1={992} y0={200} y1={204} z0={62} z1={70} top="t2" right="t2" left="t3" />
          <g className="bundle">
            <Box x0={930} x1={986} y0={112} y1={186} z0={62} z1={66} top="t1" right="t2" left="t3" />
            <Box x0={934} x1={982} y0={116} y1={182} z0={66} z1={69} top="t2" right="t2" left="t3" />
            <Box x0={938} x1={978} y0={120} y1={178} z0={69} z1={72} top="t1" right="t2" left="t3" />
            <Box x0={950} x1={966} y0={118} y1={180} z0={72} z1={74} top="t2" right="t2" left="t3" />
            <g className="seal">
              <circle cx={iso(958, 150, 76)[0]} cy={iso(958, 150, 76)[1]} r={5.5} className="signal" />
              <circle
                cx={iso(958, 150, 76)[0]}
                cy={iso(958, 150, 76)[1]}
                r={2.2}
                fill="none"
                stroke="var(--hx-bone)"
                strokeWidth={1}
              />
            </g>
          </g>

          {/* the travelling carriage */}
          <g className="carriage" transform={`translate(${finalDx} ${finalDy})`}>
            <Box x0={86} x1={148} y0={68} y1={90} z0={62} z1={74} top="t1" right="t2" left="t3" />
            <Box x0={86} x1={148} y0={140} y1={162} z0={62} z1={74} top="t1" right="t2" left="t3" />
            <Box x0={82} x1={146} y0={92} y1={148} z0={74} z1={106} top="t1" right="t2" left="t3" />
            <Box x0={88} x1={140} y0={98} y1={142} z0={106} z1={110} top="t2" right="t2" left="t3" />
            <Box x0={106} x1={120} y0={108} y1={124} z0={110} z1={170} top="t2" right="t2" left="t3" />
            <Box x0={120} x1={156} y0={112} y1={122} z0={160} z1={166} top="t1" right="t2" left="t3" />
            <Box x0={140} x1={160} y0={100} y1={132} z0={132} z1={162} top="t1" right="t2" left="t3" />
            <Box x0={144} x1={158} y0={106} y1={128} z0={106} z1={134} top="t1" right="t2" left="t3" />
            {[112, 119, 126].map((z) => {
              const a = iso(144, 128, z);
              const b = iso(158, 128, z);
              return <line key={`specimen-${z}`} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className="sig-stroke" />;
            })}
            <Knob x={113} y={124} z={122} r={5} />
          </g>

          {/* knurled leveling knobs on the front apron */}
          <Knob x={200} y={240} z={18} r={12} />
          <Knob x={560} y={240} z={18} r={12} />
          <Knob x={700} y={240} z={18} r={12} />

          {/* callouts */}
          <Callout x={196} y={52} text="TRACE READER" to={[332, 94]} />
          <Callout x={646} y={158} text={`PATTERN DETECTORS · ${detectors}`} to={[622, 186]} />
          <Callout x={662} y={252} text="BALANCE" to={[634, 288]} />
          <Callout x={876} y={286} text={`REPORT PRESS · ${reportSections} SECTIONS`} to={[828, 320]} />
          <Callout x={1102} y={556} text="SIGNED BUNDLE" to={[930, 590]} anchor="end" />
        </svg>
      </div>

      <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs leading-relaxed text-ink-dim">
        <span className="text-ink">One specimen, one pass.</span>
        <span>
          A trace specimen enters at the left and travels the rail: it is read, weighed against {detectors}{' '}
          detectors, balanced against the value that moved, then pressed into a {reportSections}-section report and
          sealed into a signed bundle.
        </span>
      </figcaption>
    </figure>
  );
}
