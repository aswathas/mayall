import { Composition } from 'remotion';
import { MayallIntro } from './MayallIntro';
import { MayallTrace } from './MayallTrace';
import {
  INTRO_COMPOSITION_ID,
  INTRO_DURATION,
  INTRO_FPS,
  INTRO_HEIGHT,
  INTRO_WIDTH,
  TRACE_COMPOSITION_ID,
  TRACE_DURATION,
  TRACE_FPS,
  TRACE_HEIGHT,
  TRACE_WIDTH,
} from './constants';

/**
 * The two registered compositions. The player on `/intro` mounts
 * `MayallIntro` directly; this root exists so the Remotion CLI can enumerate
 * and render both pieces.
 */
export function RemotionRoot() {
  return (
    <>
      <Composition
        id={INTRO_COMPOSITION_ID}
        component={MayallIntro}
        durationInFrames={INTRO_DURATION}
        fps={INTRO_FPS}
        width={INTRO_WIDTH}
        height={INTRO_HEIGHT}
      />
      <Composition
        id={TRACE_COMPOSITION_ID}
        component={MayallTrace}
        durationInFrames={TRACE_DURATION}
        fps={TRACE_FPS}
        width={TRACE_WIDTH}
        height={TRACE_HEIGHT}
      />
    </>
  );
}
