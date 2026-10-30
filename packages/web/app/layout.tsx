import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Familjen_Grotesk, JetBrains_Mono, Public_Sans } from 'next/font/google';
import './globals.css';
import { AppShell } from '../components/AppShell';

const display = Familjen_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-familjen',
  weight: ['400', '500', '600', '700'],
});

const body = Public_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-familjen-body',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

export const metadata: Metadata = {
  title: 'Mayall — Web3 Exploit Forensics',
  description:
    'Mayall is a forensic console for Web3 exploits: incident registry, live Foundry reproductions, trace analysis and generated case reports.',
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: '#090607' },
    { media: '(prefers-color-scheme: light)', color: '#f2efed' },
  ],
  width: 'device-width',
  initialScale: 1,
};

/**
 * Applies the stored theme before first paint so the console never flashes the
 * wrong world. Kept inline and tiny on purpose.
 */
const THEME_BOOTSTRAP = `(function(){try{var s=localStorage.getItem('mayall-theme');var m=window.matchMedia('(prefers-color-scheme: light)').matches;var t=s==='light'||s==='dark'?s:(m?'light':'dark');document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      data-theme="dark"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body className="bg-void text-ink antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
