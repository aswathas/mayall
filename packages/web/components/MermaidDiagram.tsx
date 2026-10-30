'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface MermaidDiagramProps {
  chart: string;
  caption?: string;
  className?: string;
}

function readThemeVariables(): Record<string, string> {
  const root = getComputedStyle(document.documentElement);
  const read = (name: string): string => root.getPropertyValue(name).trim();
  return {
    background: 'transparent',
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: '12px',
    primaryColor: read('--hx-panel-2'),
    primaryTextColor: read('--hx-ink'),
    primaryBorderColor: read('--hx-arterial'),
    secondaryColor: read('--hx-panel'),
    secondaryTextColor: read('--hx-ink-dim'),
    secondaryBorderColor: read('--hx-edge'),
    tertiaryColor: read('--hx-abyss'),
    tertiaryTextColor: read('--hx-ink-dim'),
    tertiaryBorderColor: read('--hx-edge'),
    lineColor: read('--hx-ink-dim'),
    textColor: read('--hx-ink'),
    mainBkg: read('--hx-panel-2'),
    nodeBorder: read('--hx-arterial'),
    nodeTextColor: read('--hx-ink'),
    clusterBkg: read('--hx-panel'),
    clusterBorder: read('--hx-edge'),
    titleColor: read('--hx-ink'),
    edgeLabelBackground: read('--hx-panel'),
    actorBkg: read('--hx-panel-2'),
    actorBorder: read('--hx-arterial'),
    actorTextColor: read('--hx-ink'),
    actorLineColor: read('--hx-ink-dim'),
    signalColor: read('--hx-arterial'),
    signalTextColor: read('--hx-ink'),
    labelBoxBkgColor: read('--hx-panel-2'),
    labelBoxBorderColor: read('--hx-edge'),
    labelTextColor: read('--hx-ink'),
    loopTextColor: read('--hx-ink-dim'),
    noteBkgColor: read('--hx-panel-2'),
    noteBorderColor: read('--hx-edge'),
    noteTextColor: read('--hx-ink-dim'),
    activationBorderColor: read('--hx-arterial'),
    activationBkgColor: read('--hx-panel'),
    sequenceNumberColor: read('--hx-ink'),
  };
}

export function MermaidDiagram({ chart, caption, className = '' }: MermaidDiagramProps) {
  const rawId = useId();
  const idRef = useRef(`helix-mmd-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`);
  const [svg, setSvg] = useState('');
  const [failure, setFailure] = useState(false);
  const [themeTick, setThemeTick] = useState(0);

  useEffect(() => {
    const observer = new MutationObserver(() => setThemeTick((tick) => tick + 1));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSvg('');
    setFailure(false);

    if (!chart.trim()) return;

    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: 'base',
          securityLevel: 'strict',
          suppressErrorRendering: true,
          fontFamily: 'JetBrains Mono, monospace',
          themeVariables: readThemeVariables(),
        });
        const rendered = await mermaid.render(`${idRef.current}-${themeTick}`, chart);
        if (!cancelled) setSvg(rendered.svg);
      } catch {
        if (!cancelled) setFailure(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [chart, themeTick]);

  return (
    <figure className={`rounded-[9px] border border-edge bg-abyss/50 p-3 ${className}`}>
      {failure ? (
        <div className="flex flex-col gap-2">
          <span className="flex items-center gap-1.5 font-mono text-[0.58rem] uppercase tracking-[0.14em] text-ember">
            <AlertTriangle className="h-3 w-3" aria-hidden />
            diagram unavailable — showing source
          </span>
          <pre className="scroll-y max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[0.62rem] leading-relaxed text-ink-dim">
            {chart}
          </pre>
        </div>
      ) : svg ? (
        <div
          className="mermaid-diagram flex justify-center overflow-x-auto"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : (
        <div className="flex flex-col gap-2" role="status" aria-busy="true" aria-label="Rendering attack flow diagram">
          <span className="sr-only">Rendering attack flow diagram</span>
          <div className="mx-auto h-2 w-24 animate-pulse rounded-full bg-elevated" aria-hidden />
          <div className="mx-auto h-2 w-40 animate-pulse rounded-full bg-elevated" aria-hidden />
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-elevated" aria-hidden />
        </div>
      )}
      {caption ? (
        <figcaption className="mt-2 text-center font-mono text-[0.56rem] uppercase tracking-[0.14em] text-ink-faint">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
