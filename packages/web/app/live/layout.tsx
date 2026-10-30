import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Binance $6.3B breach — live case | Mayall',
  description:
    'Mayall’s live case file for the $6.3 billion Binance breach of 29–30 October 2026: verified facts, timeline, Forensic Bible mapping, ten-detector coverage, the closest local analogue and the full forensic report.',
};

export default function LiveCaseLayout({ children }: { children: ReactNode }) {
  return children;
}
