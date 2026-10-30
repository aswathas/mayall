import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { BIBLE_ENTRIES, getEntry } from '../../../data/bible';
import { BibleEntry } from '../../../components/BibleEntry';

interface EntryPageProps {
  params: Promise<{ vectorId: string }>;
}

export function generateStaticParams() {
  return BIBLE_ENTRIES.map((entry) => ({ vectorId: entry.id }));
}

export async function generateMetadata({ params }: EntryPageProps): Promise<Metadata> {
  const { vectorId } = await params;
  const entry = getEntry(vectorId);
  if (!entry) {
    return {
      title: 'Unknown vector — The Forensic Bible',
      description: 'This attack vector is not in the published taxonomy.',
    };
  }
  return {
    title: `${entry.label} — The Forensic Bible`,
    description: entry.signature,
  };
}

export default async function BibleVectorPage({ params }: EntryPageProps) {
  const { vectorId } = await params;
  const entry = getEntry(vectorId);

  if (!entry) {
    return (
      <div className="flex flex-col gap-5">
        <nav aria-label="Bible navigation">
          <Link
            href="/bible"
            className="mono inline-flex items-center gap-1.5 text-[0.62rem] uppercase tracking-[0.14em] text-ink-dim transition-colors duration-100 hover:text-arterial"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            All vectors
          </Link>
        </nav>

        <div className="panel flex flex-col items-center px-6 py-16 text-center">
          <BookOpen className="h-6 w-6 text-ink-faint" aria-hidden="true" />
          <p className="label-micro mt-4">Unknown vector</p>
          <h1 className="display mt-2 text-2xl leading-tight text-ink">
            No entry for <span className="mono text-[1.15rem] text-arterial">{vectorId}</span>
          </h1>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed text-ink-dim">
            The Bible publishes {BIBLE_ENTRIES.length} attack vectors by their taxonomy id. Check the
            spelling against the index — or open the index and pick the vector from the table.
          </p>
          <Link href="/bible" className="btn btn-primary mt-5 h-10 px-4 text-sm">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to the index
          </Link>
        </div>
      </div>
    );
  }

  return <BibleEntry entry={entry} />;
}
