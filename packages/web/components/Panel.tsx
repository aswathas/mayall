import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  /** Optional right-aligned meta or actions in the header. */
  action?: ReactNode;
  /** Optional secondary line under the title. */
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Removes the default body padding (tables, charts). */
  flush?: boolean;
}

/**
 * A flat forensic surface: one 1px border, no drop shadow. Never nest a Panel
 * inside a Panel — use a `.rule` or a labelled sub-block instead.
 */
export function Panel({
  title,
  action,
  subtitle,
  children,
  className = '',
  bodyClassName = '',
  flush = false,
}: PanelProps) {
  return (
    <section className={`panel flex min-w-0 flex-col ${className}`}>
      {(title || action) && (
        <header className="panel-header">
          <div className="min-w-0">
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {subtitle ? (
              <p className="mt-1 truncate text-xs text-ink-dim/80">{subtitle}</p>
            ) : null}
          </div>
          {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
        </header>
      )}
      <div className={`min-w-0 flex-1 ${flush ? '' : 'p-4 sm:p-5'} ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function MicroLabel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`label-micro ${className}`}>{children}</span>;
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-12 text-center">
      <p className="label-micro">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-ink-dim/75">{hint}</p> : null}
    </div>
  );
}

/** A labelled sub-block inside a panel — the legal alternative to nested cards. */
export function SubBlock({
  title,
  children,
  className = '',
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {title ? <p className="label-micro mb-2">{title}</p> : null}
      {children}
    </div>
  );
}
