import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import {
  DEPTH_MAX,
  RAW_LINES,
  REENTRANCY_BALANCE,
  REGISTRY,
  TARGET_GAS,
  TRACE_NODE_COUNT,
  WITHDRAW_COUNT,
  WITHDRAW_FRAMES,
} from './data';
import { useMayallFonts } from './fonts';
import { Ground, Micro, Rule } from './ui';
import { COLORS, EASE, FONTS, clamp, lerp, mulberry32, rgba } from './theme';

const OUTER = { x: 820, y: 200, w: 940, h: 660 };
const INSET = 21;
const FRAME_COUNT = 14;

const T = {
  target: 42,
  tree: 114,
  value: 246,
  verdict: 324,
  mark: 408,
} as const;

const LEFT = 120;
const LEFT_W = 560;

const RECEIVE_GAS = [101728, 71891, 61954, 52017, 42080, 32143, 306];

interface FrameRect {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: 'withdraw' | 'receive';
  depth: number;
  gas: number;
}

const FRAMES: FrameRect[] = Array.from({ length: FRAME_COUNT }, (_, index) => {
  const inset = (index + 1) * INSET;
  const kind = index % 2 === 0 ? 'withdraw' : 'receive';
  const slot = Math.floor(index / 2);
  return {
    index,
    x: OUTER.x + inset,
    y: OUTER.y + inset,
    w: OUTER.w - inset * 2,
    h: OUTER.h - inset * 2,
    kind,
    depth: kind === 'withdraw' ? slot + 1 : slot + 2,
    gas: kind === 'withdraw' ? WITHDRAW_FRAMES[slot].gas : RECEIVE_GAS[slot],
  };
});

const INNER = FRAMES[FRAMES.length - 1];
const INNER_CENTER = { x: INNER.x + INNER.w / 2, y: INNER.y + INNER.h / 2 };

const TICKS = (() => {
  const rng = mulberry32(0x51ed);
  return Array.from({ length: 7 }, () => ({ s: rng(), j: (rng() - 0.5) * 14 }));
})();

function bezierPoint(u: number): { x: number; y: number; dx: number; dy: number } {
  const x0 = INNER_CENTER.x;
  const y0 = INNER_CENTER.y;
  const cx = 1120;
  const cy = 760;
  const x1 = LEFT + LEFT_W;
  const y1 = 678;
  const mt = 1 - u;
  return {
    x: mt * mt * x0 + 2 * mt * u * cx + u * u * x1,
    y: mt * mt * y0 + 2 * mt * u * cy + u * u * y1,
    dx: 2 * mt * (cx - x0) + 2 * u * (x1 - cx),
    dy: 2 * mt * (cy - y0) + 2 * u * (y1 - cy),
  };
}

function Wordmark({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, durationInFrames: 14, config: { damping: 200 } });
  const sub = interpolate(frame, [4, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.out,
  });
  const rule = interpolate(frame, [2, 14], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.out,
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        opacity: enter,
        transform: `translateY(${lerp(12, 0, enter)}px)`,
      }}
    >
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: 136,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '0.16em',
          paddingLeft: '0.16em',
          color: COLORS.ink,
        }}
      >
        MAYALL
      </div>
      <div style={{ width: 420 * rule, height: 1, backgroundColor: COLORS.edgeStrong, marginTop: 30 }} />
      <div
        style={{
          marginTop: 26,
          fontFamily: FONTS.sans,
          fontSize: 27,
          letterSpacing: '0.01em',
          color: COLORS.inkDim,
          opacity: sub,
        }}
      >
        Web3 exploit forensics
      </div>
      <div
        style={{
          marginTop: 26,
          fontFamily: FONTS.mono,
          fontSize: 14,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: COLORS.inkFaint,
          opacity: sub,
        }}
      >
        {REGISTRY.incidents} incidents · {REGISTRY.lossUsd} tracked · {REGISTRY.chains} chains ·{' '}
        {REGISTRY.reproductions} reproductions
      </div>
    </AbsoluteFill>
  );
}

export function MayallIntro() {
  useMayallFonts();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const at = (start: number, duration: number, easing = EASE.out): number =>
    interpolate(frame, [start, start + duration], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing,
    });

  /* shot 1 — the signal */
  const signalIn = at(0, 8);
  const pulse = at(2, 22);
  const lineIn = at(8, 26, EASE.inOut);

  /* shot 2 — the target */
  const targetIn = at(T.target, 20);
  const targetLabel = at(T.target + 8, 16);
  const reticle = at(T.target + 4, 22);

  /* shot 3 — the call tree descends */
  const nodes = Math.round(TRACE_NODE_COUNT * at(T.tree, T.value - T.tree - 2, EASE.inOut));
  const counterIn = at(T.target, 16);
  const repeatIn = at(170, 16);
  const treeDim = 1 - 0.45 * at(T.verdict + 6, 18);

  /* shot 4 — the drain */
  const travel = at(T.value + 4, 66, EASE.inOut);
  const lossIn = at(T.value + 2, 16);
  const lossValue = REENTRANCY_BALANCE.lossEth * travel;
  const victimNow = lerp(REENTRANCY_BALANCE.victim.before, REENTRANCY_BALANCE.victim.after, travel);
  const attackerNow = lerp(REENTRANCY_BALANCE.attacker.before, REENTRANCY_BALANCE.attacker.after, travel);

  /* shot 5 — the detector fires */
  const plateIn = at(T.verdict, 16);

  /* shot 6 — the wordmark takes the frame */
  const dim = 1 - 0.78 * at(T.mark, 12);

  const pathVisible = at(T.value + 2, 14);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.void, color: COLORS.ink }}>
      <div style={{ position: 'absolute', inset: 0, opacity: dim }}>
        <Ground step={96} opacity={0.05} />

        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0 }}>
          {/* the arterial point */}
          <circle cx={300} cy={530} r={26 * pulse} fill="none" stroke={COLORS.arterial} strokeOpacity={0.35 * (1 - pulse)} strokeWidth={1} />
          <circle cx={300} cy={530} r={11 * pulse} fill="none" stroke={COLORS.arterial} strokeOpacity={0.55 * (1 - pulse)} strokeWidth={1} />
          <circle cx={300} cy={530} r={4} fill={COLORS.arterial} opacity={signalIn} />

          {/* signal → target */}
          {lineIn > 0 ? (
            <line
              x1={300}
              y1={530}
              x2={lerp(300, OUTER.x, lineIn)}
              y2={530}
              stroke={COLORS.arterial}
              strokeOpacity={0.8}
              strokeWidth={1}
            />
          ) : null}

          {/* target frame */}
          <rect
            x={OUTER.x}
            y={OUTER.y}
            width={OUTER.w}
            height={OUTER.h}
            pathLength={1}
            strokeDasharray="1 1"
            strokeDashoffset={1 - targetIn}
            stroke={COLORS.edgeStrong}
            strokeWidth={1}
            fill="none"
          />

          {/* reticle ticks */}
          {[
            { x: OUTER.x + OUTER.w / 2, y: OUTER.y },
            { x: OUTER.x + OUTER.w / 2, y: OUTER.y + OUTER.h },
            { x: OUTER.x, y: OUTER.y + OUTER.h / 2 },
            { x: OUTER.x + OUTER.w, y: OUTER.y + OUTER.h / 2 },
          ].map((tick, index) => {
            const horizontal = index < 2;
            const out = 8 + 16 * reticle;
            return (
              <line
                key={index}
                x1={tick.x + (horizontal ? 0 : index === 2 ? -out : out)}
                y1={tick.y + (horizontal ? (index === 0 ? -out : out) : 0)}
                x2={tick.x + (horizontal ? 0 : index === 2 ? -8 : 8)}
                y2={tick.y + (horizontal ? (index === 0 ? -8 : 8) : 0)}
                stroke={COLORS.arterial}
                strokeOpacity={0.55}
                strokeWidth={1}
              />
            );
          })}

          {/* nested call frames */}
          <g opacity={treeDim}>
          {FRAMES.map((item) => {
            const start = T.tree + item.index * 2.1;
            const draw = interpolate(frame, [start, start + 14], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
              easing: EASE.out,
            });
            if (draw <= 0) return null;
            const withdraw = item.kind === 'withdraw';
            return (
              <rect
                key={item.index}
                x={item.x}
                y={item.y}
                width={item.w}
                height={item.h}
                pathLength={1}
                strokeDasharray="1 1"
                strokeDashoffset={1 - draw}
                stroke={withdraw ? COLORS.arterial : COLORS.inkDim}
                strokeOpacity={(withdraw ? 0.72 : 0.34) * draw}
                strokeWidth={withdraw ? 1.25 : 1}
                fill="none"
              />
            );
          })}
          </g>

          {/* the value path */}
          {pathVisible > 0 ? (
            <path
              d={`M ${INNER_CENTER.x} ${INNER_CENTER.y} Q 1120 760 ${LEFT + LEFT_W} 678`}
              stroke={COLORS.arterial}
              strokeOpacity={0.2 * pathVisible}
              strokeWidth={1}
              strokeDasharray="3 7"
              fill="none"
            />
          ) : null}

          {/* value ticks, one per re-entrant withdrawal */}
          {TICKS.map((tick, index) => {
            const u = clamp((travel - index * 0.035) / 0.8, 0, 1);
            if (u <= 0 || u >= 1) return null;
            const point = bezierPoint(u);
            const length = Math.hypot(point.dx, point.dy) || 1;
            const nx = -point.dy / length;
            const ny = point.dx / length;
            const alpha = Math.sin(Math.PI * u) * 0.95;
            return (
              <line
                key={index}
                x1={point.x + nx * tick.j * 0.4 - nx * 4}
                y1={point.y + ny * tick.j * 0.4 - ny * 4}
                x2={point.x + nx * tick.j * 0.4 + nx * 4}
                y2={point.y + ny * tick.j * 0.4 + ny * 4}
                stroke={COLORS.arterial}
                strokeOpacity={alpha}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>

        {/* target label, next to the frame it names */}
        <div style={{ position: 'absolute', left: OUTER.x, top: OUTER.y - 52, opacity: targetLabel }}>
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 27,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: COLORS.ink,
            }}
          >
            ReentrancyVault
          </div>
          <div style={{ marginTop: 6, fontFamily: FONTS.mono, fontSize: 13, color: COLORS.inkFaint }}>
            0x5615…b72f · {TARGET_GAS.toLocaleString('en-US')} gas
          </div>
        </div>

        {/* depth badges and gas attribution, per nested frame */}
        {FRAMES.map((item) => {
          const start = T.tree + item.index * 2.1;
          const appear = interpolate(frame, [start + 7, start + 18], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE.out,
          });
          if (appear <= 0) return null;
          const withdraw = item.kind === 'withdraw';
          return (
            <div key={item.index} style={{ position: 'absolute', left: item.x, top: item.y, width: item.w, height: item.h, opacity: appear * treeDim }}>
              {withdraw ? (
                <span
                  style={{
                    position: 'absolute',
                    left: 12,
                    top: 8,
                    fontFamily: FONTS.mono,
                    fontSize: 12.5,
                    letterSpacing: '0.1em',
                    color: COLORS.arterial,
                  }}
                >
                  D{item.depth}
                </span>
              ) : null}
              <span
                style={{
                  position: 'absolute',
                  right: 12,
                  top: 8,
                  fontFamily: FONTS.mono,
                  fontSize: 12.5,
                  fontVariantNumeric: 'tabular-nums',
                  color: withdraw ? COLORS.inkDim : COLORS.inkFaint,
                }}
              >
                {item.gas.toLocaleString('en-US')} gas
              </span>
            </div>
          );
        })}

        {/* innermost stop */}
        <div
          style={{
            position: 'absolute',
            left: INNER.x,
            top: INNER.y + INNER.h / 2 - 8,
            width: INNER.w,
            textAlign: 'center',
            fontFamily: FONTS.mono,
            fontSize: 11,
            letterSpacing: '0.1em',
            color: COLORS.inkFaint,
            opacity: at(150, 14) * treeDim,
          }}
        >
          ← Stop
        </div>

        {/* ── left column: the readings ── */}
        <div style={{ position: 'absolute', left: LEFT, top: 120, opacity: 1 }}>
          <Micro>local foundry simulation · run 001</Micro>
        </div>

        <div style={{ position: 'absolute', left: LEFT, top: 180, width: LEFT_W, opacity: counterIn }}>
          <Micro>parsed trace</Micro>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 62,
                fontWeight: 500,
                lineHeight: 1,
                letterSpacing: '-0.03em',
                fontVariantNumeric: 'tabular-nums',
                color: COLORS.ink,
              }}
            >
              {nodes}
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 14, letterSpacing: '0.14em', color: COLORS.inkFaint }}>
              NODES
            </span>
          </div>
        </div>

        <Rule left={LEFT} top={292} width={LEFT_W} opacity={counterIn} />

        <div style={{ position: 'absolute', left: LEFT, top: 320, opacity: lossIn }}>
          <Micro>loss</Micro>
          <div
            style={{
              marginTop: 10,
              fontFamily: FONTS.display,
              fontSize: 58,
              fontWeight: 500,
              lineHeight: 1,
              letterSpacing: '-0.03em',
              fontVariantNumeric: 'tabular-nums',
              color: COLORS.arterial,
            }}
          >
            {lossValue.toFixed(0)} ETH
          </div>
          <div style={{ marginTop: 10, fontFamily: FONTS.mono, fontSize: 12, color: COLORS.inkFaint }}>
            extracted in one transaction
          </div>
        </div>

        <div style={{ position: 'absolute', left: LEFT, top: 440, opacity: repeatIn }}>
          <Micro>deepest repeat</Micro>
          <div
            style={{
              marginTop: 10,
              fontFamily: FONTS.display,
              fontSize: 34,
              fontWeight: 500,
              lineHeight: 1.1,
              color: COLORS.ink,
            }}
          >
            withdraw() ×{WITHDRAW_COUNT}
          </div>
          <div style={{ marginTop: 8, fontFamily: FONTS.mono, fontSize: 12, color: COLORS.inkFaint }}>
            nested calls · depth {DEPTH_MAX}
          </div>
        </div>

        <Rule left={LEFT} top={548} width={LEFT_W} opacity={lossIn} />

        {/* ── balance rails ── */}
        <div style={{ position: 'absolute', left: LEFT, top: 576, width: LEFT_W, opacity: lossIn }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Micro>vault · {REENTRANCY_BALANCE.victim.label}</Micro>
            <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: COLORS.inkDim }}>
              {REENTRANCY_BALANCE.victim.before.toFixed(3)} → {victimNow.toFixed(3)} ETH
            </span>
          </div>
          <div style={{ position: 'relative', height: 3, marginTop: 8, backgroundColor: COLORS.edge }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${(1 - travel * 0.6) * 100}%`,
                backgroundColor: COLORS.arterial,
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 22 }}>
            <Micro>attacker · {REENTRANCY_BALANCE.attacker.label}</Micro>
            <span style={{ fontFamily: FONTS.mono, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: COLORS.inkDim }}>
              {REENTRANCY_BALANCE.attacker.before.toFixed(3)} → {attackerNow.toFixed(3)} ETH
            </span>
          </div>
          <div style={{ position: 'relative', height: 3, marginTop: 8, backgroundColor: COLORS.edge }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                width: `${lerp(1 / 7, 1, travel) * 100}%`,
                backgroundColor: COLORS.mint,
              }}
            />
          </div>
        </div>

        {/* ── detector plate ── */}
        <div
          style={{
            position: 'absolute',
            left: LEFT,
            top: 772,
            width: LEFT_W,
            height: 160,
            opacity: plateIn,
            transform: `translateX(${lerp(40, 0, plateIn)}px)`,
            backgroundColor: COLORS.panel,
            border: `1px solid ${COLORS.edgeStrong}`,
            borderRadius: 14,
            padding: '18px 22px',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: COLORS.arterial }} />
            <Micro style={{ color: COLORS.inkDim }}>detector · det-reentrancy</Micro>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
            <span
              style={{
                fontFamily: FONTS.display,
                fontSize: 38,
                fontWeight: 600,
                lineHeight: 1,
                letterSpacing: '-0.01em',
                color: COLORS.ink,
              }}
            >
              REENTRANCY
            </span>
            <span style={{ fontFamily: FONTS.mono, fontSize: 15, color: COLORS.arterial }}>97% confidence</span>
          </div>
          <div style={{ marginTop: 9, fontFamily: FONTS.mono, fontSize: 12.5, color: COLORS.inkDim }}>
            critical · withdraw() ×{WITHDRAW_COUNT} nested · {TRACE_NODE_COUNT}-node trace
          </div>
        </div>

        <div
          style={{
            position: 'absolute',
            left: LEFT,
            top: 958,
            fontFamily: FONTS.mono,
            fontSize: 11,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: COLORS.inkFaint,
            opacity: 0.8,
          }}
        >
          local Foundry simulation · not mainnet evidence
        </div>

        <div style={{ position: 'absolute', right: 96, top: 120, textAlign: 'right', opacity: counterIn }}>
          <Micro>evidence / reentrancy</Micro>
          <div
            style={{
              marginTop: 8,
              fontFamily: FONTS.mono,
              fontSize: 12.5,
              color: COLORS.inkFaint,
              maxWidth: 300,
              lineHeight: 1.6,
            }}
          >
            {RAW_LINES.length} raw frames · {treeDim > 0.8 ? 'parsing' : 'parsed'}
          </div>
        </div>
      </div>

      <Sequence from={T.mark} durationInFrames={42} layout="none">
        <Wordmark frame={frame - T.mark} />
      </Sequence>
    </AbsoluteFill>
  );
}
