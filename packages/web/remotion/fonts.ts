import { useEffect, useState } from 'react';
import { continueRender, delayRender, getRemotionEnvironment } from 'remotion';

const GOOGLE_FONTS =
  'https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Public+Sans:wght@400;500;600&display=swap';

let injected = false;

/**
 * Holds the first captured frame until the three families are actually
 * available. Remotion's `delayRender` handle is continued only after
 * `document.fonts.ready` and an explicit load of each face resolve, so no
 * frame is ever captured with a fallback typeface.
 *
 * The handle is only created while Remotion is rendering (CLI or Studio).
 * Creating it inside the browser Player would pause playback, so there the
 * fonts load in the background and the composition re-renders when ready.
 */
export function useMayallFonts(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof document === 'undefined') {
      setReady(true);
      return;
    }

    const environment = getRemotionEnvironment();
    const holdFrame = environment.isRendering || environment.isStudio;
    const handle = holdFrame ? delayRender('Loading Mayall font families', { timeoutInMilliseconds: 30_000 }) : null;
    let cancelled = false;

    if (!injected) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = GOOGLE_FONTS;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
      injected = true;
    }

    const faces = [
      '700 48px "Familjen Grotesk"',
      '600 32px "Familjen Grotesk"',
      '500 16px "Public Sans"',
      '400 16px "JetBrains Mono"',
    ];

    const done = (): void => {
      if (cancelled) return;
      setReady(true);
      if (handle !== null) continueRender(handle);
    };

    Promise.all([
      document.fonts.ready,
      ...faces.map((face) => document.fonts.load(face).catch(() => [])),
    ])
      .then(done)
      .catch(done);

    return () => {
      cancelled = true;
    };
  }, []);

  return ready;
}
