import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { DETECTORS, RAW_LINES, TRACE_LADDER, TRACE_NODE_COUNT, WITHDRAW_COUNT } from './data';
import { useMayallFonts } from './fonts';
import { Ground, Micro, Rule } from './ui';
import { COLORS, EASE, FONTS, clamp, lerp } from './theme';

const T = {
  raw: 33,
  tree: 40,
  detectors: 198,
  plate: 252,
} as const;

const RAW_LEFT = 96;
const RAW_WIDTH = 760;
const TREE_LEFT = 940;
const TREE_RIGHT = 1600;
const TREE_TOP = 176;
const ROW = 44;

function gasWidth(gas: number): number {
  const max = TRACE_LADDER[0].gas;
  return 3 + 9 * Math.sqrt(clamp(gas / max, 0, 1));
}

export function MayallTrace() {
  useMayallFonts();
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();

  const at = (start: number, duration: number, easing = EASE.out): number =>
    interpolate(frame, [start, start + duration], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing,
    });

  const headerIn = at(0, 14);
  const rawDim = 1 - 0.62 * at(T.plate, 14);

  const sweep = interpolate(frame, [T.detectors - 4, 244], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.inOut,
  });
  const sweepY = lerp(TREE_TOP - 10, 900, sweep);

  const plateIn = at(T.plate, 16);
  const detectorFire = at(222, 16);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.void, color: COLORS.ink }}>
      <Ground step={96} opacity={0.05} />

      {/* column headers */}
      <div style={{ position: 'absolute', left: RAW_LEFT, top: 104, opacity: headerIn }}>
        <Micro>raw · forge -vvvv</Micro>
      </div>
      <div style={{ position: 'absolute', left: TREE_LEFT, top: 104, opacity: headerIn }}>
        <Micro>parsed · trace</Micro>
      </div>
      <Rule left={RAW_LEFT} top={138} width={TREE_RIGHT - RAW_LEFT} opacity={0.9} />
      <div style={{ position: 'absolute', left: 878, top: 104, width: 1, height: 820, backgroundColor: COLORS.edge, opacity: 0.8 * headerIn }} />

      {/* raw trace lines, typed from the real forge output */}
      <div style={{ position: 'absolute', left: RAW_LEFT, top: 166, width: RAW_WIDTH, opacity: rawDim }}>
        {RAW_LINES.map((line, index) => {
          const start = T.raw + index * 6.5;
          const reveal = interpolate(frame, [start, start + 6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE.linear,
          });
          return (
            <div
              key={index}
              style={{
                height: 26,
                lineHeight: '26px',
                fontFamily: FONTS.mono,
                fontSize: 12.5,
                whiteSpace: 'pre',
                overflow: 'hidden',
                color: line.includes('withdraw()') ? COLORS.arterial : COLORS.inkDim,
                opacity: 0.55 + 0.45 * reveal,
                clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
                maxWidth: RAW_WIDTH,
              }}
            >
              {line}
            </div>
          );
        })}
        <div style={{ marginTop: 14, fontFamily: FONTS.mono, fontSize: 11, letterSpacing: '0.12em', color: COLORS.inkFaint }}>
          {RAW_LINES.length} of {TRACE_NODE_COUNT} frames shown
        </div>
      </div>

      {/* the parsed ladder */}
      <div style={{ position: 'absolute', left: TREE_LEFT, top: TREE_TOP, width: TREE_RIGHT - TREE_LEFT }}>
        {TRACE_LADDER.map((node, index) => {
          if (index === 0) return null;
          const start = T.tree + (index - 1) * 7;
          const appear = interpolate(frame, [start, start + 12], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
            easing: EASE.out,
          });
          if (appear <= 0) return null;
          const y = (index - 1) * ROW;
          const indent = node.depth * 16;
          const withdraw = node.kind === 'withdraw';
          const radius = gasWidth(node.gas);
          return (
            <div key={index} style={{ position: 'absolute', left: 0, top: y, width: '100%', opacity: appear }}>
              <span
                style={{
                  position: 'absolute',
                  left: indent - 30,
                  top: 4,
                  fontFamily: FONTS.mono,
                  fontSize: 11,
                  color: withdraw ? COLORS.arterial : COLORS.inkFaint,
                }}
              >
                d{node.depth}
              </span>
              <span
                style={{
                  position: 'absolute',
                  left: indent,
                  top: 12,
                  width: radius * 2,
                  height: radius * 2,
                  borderRadius: withdraw ? 0 : 999,
                  border: `1px solid ${withdraw ? COLORS.arterial : COLORS.inkDim}`,
                  opacity: withdraw ? 0.9 : 0.5,
                  transform: withdraw ? 'rotate(45deg)' : undefined,
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  left: indent + 26,
                  top: 4,
                  fontFamily: FONTS.mono,
                  fontSize: 15,
                  color: withdraw ? COLORS.ink : COLORS.inkDim,
                  letterSpacing: '0.01em',
                }}
              >
                {node.contract}
                <span style={{ color: COLORS.inkFaint }}>::</span>
                {node.fn}
              </span>
              <span
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 5,
                  fontFamily: FONTS.mono,
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                  color: withdraw ? COLORS.arterial : COLORS.inkFaint,
                }}
              >
                {node.gas.toLocaleString('en-US')} gas
              </span>
            </div>
          );
        })}

        {/* the scan that reads the tree once */}
        <div
          style={{
            position: 'absolute',
            left: -24,
            top: sweepY - TREE_TOP,
            width: TREE_RIGHT - TREE_LEFT + 48,
            height: 1,
            backgroundColor: COLORS.arterial,
            opacity: 0.16 * sweep * (1 - at(T.plate, 10)),
          }}
        />
      </div>

      {/* detector ticks */}
      <div style={{ position: 'absolute', right: 96, top: TREE_TOP, width: 186 }}>
        {DETECTORS.map((detector, index) => {
          const active = index === 0;
          const appear = at(T.detectors + index * 2.4, 10);
          const fire = active ? detectorFire : 0;
          return (
            <div
              key={detector}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: 8,
                height: 44,
                opacity: appear * (active ? 1 : 0.38),
                transform: `translateX(${lerp(10, 0, appear)}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: 10.5,
                  letterSpacing: '0.03em',
                  color: active ? COLORS.arterial : COLORS.inkFaint,
                  textAlign: 'right',
                  maxWidth: 152,
                  lineHeight: 1.2,
                }}
              >
                {detector}
              </span>
              <span
                style={{
                  width: active ? 6 + 5 * fire : 4,
                  height: active ? 6 + 5 * fire : 4,
                  borderRadius: 999,
                  backgroundColor: active ? COLORS.arterial : COLORS.edgeStrong,
                  flexShrink: 0,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* the verdict plate replaces the raw column */}
      <Sequence from={T.plate} durationInFrames={48} layout="none">
        <VerdictPlate frame={frame - T.plate} />
      </Sequence>

      <div
        style={{
          position: 'absolute',
          left: RAW_LEFT,
          top: 962,
          fontFamily: FONTS.mono,
          fontSize: 11,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: COLORS.inkFaint,
          opacity: headerIn * 0.82,
        }}
      >
        local Foundry simulation · not mainnet evidence
      </div>
    </AbsoluteFill>
  );
}

function VerdictPlate({ frame }: { frame: number }) {
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, durationInFrames: 16, config: { damping: 200 } });
  const rule = interpolate(frame, [2, 16], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.out,
  });

  return (
    <div
      style={{
        position: 'absolute',
        left: RAW_LEFT,
        top: 742,
        width: RAW_WIDTH,
        opacity: enter,
        transform: `translateY(${lerp(16, 0, enter)}px)`,
        backgroundColor: COLORS.panel,
        border: `1px solid ${COLORS.edgeStrong}`,
        borderRadius: 14,
        padding: '22px 26px',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: COLORS.arterial }} />
        <Micro style={{ color: COLORS.inkDim }}>detector · det-reentrancy · 0.97</Micro>
      </div>
      <div
        style={{
          marginTop: 10,
          fontFamily: FONTS.display,
          fontSize: 44,
          fontWeight: 600,
          lineHeight: 1,
          letterSpacing: '-0.01em',
          color: COLORS.ink,
        }}
      >
        REENTRANCY
      </div>
      <div style={{ width: RAW_WIDTH - 52, height: 1, backgroundColor: COLORS.edge, margin: '18px 0', transformOrigin: 'left center', transform: `scaleX(${rule})` }} />
      <div style={{ display: 'flex', gap: 34 }}>
        {[
          { label: 'confidence', value: '97%', tone: COLORS.arterial },
          { label: 'severity', value: 'critical', tone: COLORS.ember },
          { label: 'nested calls', value: `×${WITHDRAW_COUNT}`, tone: COLORS.ink },
          { label: 'loss', value: '6 ETH', tone: COLORS.arterial },
        ].map((item) => (
          <div key={item.label}>
            <Micro style={{ fontSize: 10.5 }}>{item.label}</Micro>
            <div
              style={{
                marginTop: 5,
                fontFamily: FONTS.mono,
                fontSize: 17,
                color: item.tone,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
