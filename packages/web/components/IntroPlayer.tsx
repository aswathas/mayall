'use client';

import { useEffect, useState } from 'react';
import { Player } from '@remotion/player';
import { MayallIntro } from '../remotion/MayallIntro';
import {
  INTRO_DURATION,
  INTRO_FPS,
  INTRO_HEIGHT,
  INTRO_POSTER_SRC,
  INTRO_WIDTH,
} from '../remotion/constants';

/**
 * The Remotion composition, mounted live in the page. On the server (and
 * before hydration) we render the rendered poster so the hero never shifts.
 * `prefers-reduced-motion` keeps the poster and never autoplays.
 */
export function IntroPlayer({ className = '' }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    setMounted(true);
    const onChange = (): void => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  if (!mounted || reduced) {
    return (
      <div className={className}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={INTRO_POSTER_SRC}
          alt="Mayall intro: a re-entrant withdrawal trace drawn as fourteen nested call frames, a 6 ETH loss, and the Reentrancy detector at 97% confidence."
          width={INTRO_WIDTH}
          height={INTRO_HEIGHT}
          className="block h-auto w-full"
        />
      </div>
    );
  }

  return (
    <div className={className}>
      <Player
        component={MayallIntro}
        durationInFrames={INTRO_DURATION}
        fps={INTRO_FPS}
        compositionWidth={INTRO_WIDTH}
        compositionHeight={INTRO_HEIGHT}
        controls
        loop
        autoPlay
        initiallyMuted
        showVolumeControls={false}
        acknowledgeRemotionLicense
        style={{ width: '100%', aspectRatio: '16 / 9' }}
      />
    </div>
  );
}
