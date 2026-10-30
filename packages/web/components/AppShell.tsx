'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BookOpen,
  Crosshair,
  FlaskConical,
  LayoutDashboard,
  Library,
  Radar,
  ScrollText,
  ShieldAlert,
  Swords,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { EngineStatus } from './EngineStatus';
import { ThemeToggle } from './ThemeToggle';

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: 'Console',
    items: [
      { href: '/', label: 'Overview', icon: LayoutDashboard },
      { href: '/incidents', label: 'Incidents', icon: ShieldAlert },
      { href: '/live', label: 'Live case', icon: Radar },
    ],
  },
  {
    title: 'Workbench',
    items: [
      { href: '/lab', label: 'Live lab', icon: FlaskConical },
      { href: '/attack-lab', label: 'Attack lab', icon: Crosshair },
      { href: '/tracker', label: 'Tracker', icon: Activity },
      { href: '/evidence', label: 'Evidence', icon: ScrollText },
      { href: '/historical', label: 'Historical', icon: Swords },
    ],
  },
  {
    title: 'Reference',
    items: [
      { href: '/bible', label: 'Forensic Bible', icon: Library },
      { href: '/showcase', label: 'Showcase', icon: BookOpen },
      { href: '/docs', label: 'Docs', icon: BookOpen },
      { href: '/agents', label: 'Agents', icon: Activity },
    ],
  },
];

function isActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  if (href === '/incidents') return pathname.startsWith('/incidents') || pathname.startsWith('/cases');
  if (href === '/live') return pathname === '/live';
  return pathname.startsWith(href);
}

/**
 * The aperture: an iris drawn as six chords with one arterial blade. Reads as
 * an instrument, not a logo tile.
 */
function ApertureMark() {
  return (
    <svg viewBox="0 0 34 34" className="h-8 w-8 text-bone" fill="none" aria-hidden="true">
      <circle cx="17" cy="17" r="13.4" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
      <circle cx="17" cy="17" r="9.1" stroke="currentColor" strokeWidth="0.8" opacity="0.3" />
      <g strokeLinecap="round">
        <path d="M17 3.6 L17 14.2" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
        <path d="M28.6 10.3 L19.4 15.6" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
        <path d="M28.6 23.7 L19.4 18.4" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
        <path d="M17 30.4 L17 19.8" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
        <path d="M5.4 23.7 L14.6 18.4" stroke="currentColor" strokeWidth="1.1" opacity="0.7" />
        <path d="M5.4 10.3 L14.6 15.6" stroke="var(--hx-arterial)" strokeWidth="1.4" />
      </g>
      <circle cx="17" cy="17" r="2" fill="var(--hx-arterial)" />
      <g stroke="currentColor" strokeWidth="0.7" opacity="0.4">
        <path d="M17 0.6v2.2M17 31.2v2.2M0.6 17h2.2M31.2 17h2.2" />
      </g>
    </svg>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="group flex items-center gap-3" aria-label="Mayall — overview">
      <ApertureMark />
      <span className="leading-none">
        <span className="display block text-[1.02rem] font-semibold uppercase tracking-[0.24em] text-ink">
          Mayall
        </span>
        <span className="mono mt-1 block text-[0.5rem] uppercase tracking-[0.2em] text-ink-faint">
          exploit forensics
        </span>
      </span>
    </Link>
  );
}

function RouteReadout({ pathname }: { pathname: string }) {
  return (
    <p className="mono flex min-w-0 items-center gap-1.5 text-[0.56rem] uppercase tracking-[0.1em] text-ink-faint">
      <span className="shrink-0 text-ink-dim/70">route</span>
      <span className="truncate text-ink-dim">{pathname}</span>
    </p>
  );
}

function DesktopNav({ pathname }: { pathname: string }) {
  return (
    <nav aria-label="Console sections" className="flex flex-col gap-3">
      {NAV.map((group) => (
        <div key={group.title}>
          <p className="label-micro mb-1 px-4">{group.title}</p>
          <div className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center gap-2.5 rounded-[9px] py-2 pl-4 pr-2.5 text-[0.82rem] transition-colors duration-100 ${
                    active
                      ? 'bg-elevated font-medium text-ink'
                      : 'text-ink-dim hover:bg-elevated/60 hover:text-ink'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`absolute left-0 top-1/2 h-5 w-[2px] -translate-y-1/2 rounded-full transition-colors duration-100 ${
                      active ? 'bg-arterial' : 'bg-transparent'
                    }`}
                  />
                  <Icon
                    className={`h-[15px] w-[15px] ${active ? 'text-arterial' : 'text-ink-faint'}`}
                    strokeWidth={active ? 2 : 1.8}
                  />
                  <span>{item.label}</span>
                  {active ? (
                    <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rotate-45 bg-arterial" />
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function MobileNav({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Console sections"
      className="flex items-center gap-1 overflow-x-auto border-b border-edge bg-abyss/40 px-3 py-1.5 lg:hidden"
    >
      {NAV.flatMap((group) => group.items).map((item) => {
        const active = isActive(item.href, pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-11 shrink-0 items-center gap-1 rounded-md px-2 py-2 font-mono text-[0.56rem] uppercase tracking-[0.08em] transition-colors duration-100 ${
              active ? 'text-ink' : 'text-ink-faint'
            }`}
          >
            {active ? (
              <span aria-hidden="true" className="absolute inset-x-2 bottom-0 h-[2px] bg-arterial" />
            ) : null}
            <Icon className={`h-3 w-3 ${active ? 'text-arterial' : 'text-ink-faint'}`} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a
        href="#console"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-md focus:border focus:border-bone focus:bg-bone focus:px-3 focus:py-2 focus:text-sm focus:text-on-bone"
      >
        Skip to console
      </a>

      <div key={pathname} aria-hidden="true" className="boot-sweep" />

      <aside className="sticky top-0 hidden h-screen flex-col border-r border-edge bg-abyss/70 px-3.5 py-5 pb-20 lg:flex">
        <div className="px-1.5">
          <Wordmark />
        </div>

        <div className="mt-5 px-1.5">
          <RouteReadout pathname={pathname} />
        </div>

        <div aria-hidden="true" className="my-3 h-px bg-edge" />

        <DesktopNav pathname={pathname} />

        <div className="mt-auto flex flex-col gap-3">
          <div className="px-1.5">
            <p className="label-micro">Instrument status</p>
          </div>
          <EngineStatus />
          <div className="flex items-center justify-between gap-2 border-t border-edge pt-3">
            <span className="mono pl-1 text-[0.54rem] uppercase tracking-[0.14em] text-ink-faint">
              red room / paper room
            </span>
            <ThemeToggle />
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col">
        <header className="sticky top-0 z-30 border-b border-edge bg-abyss/85 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-2.5">
            <Wordmark />
            <div className="ml-auto flex items-center gap-2">
              <EngineStatus compact />
              <ThemeToggle />
            </div>
          </div>
          <MobileNav pathname={pathname} />
          <div className="border-b border-edge bg-abyss/25 px-4 py-1 lg:hidden">
            <RouteReadout pathname={pathname} />
          </div>
        </header>

        <main id="console" className="mx-auto w-full max-w-[1500px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>

        <footer className="border-t border-edge px-4 py-4 lg:px-8">
          <div className="mx-auto flex max-w-[1500px] flex-wrap items-center justify-between gap-2 font-mono text-[0.56rem] uppercase tracking-[0.14em] text-ink-faint">
            <span>mayall — local Foundry simulation · not mainnet evidence</span>
            <span>evidence handling: internal</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
