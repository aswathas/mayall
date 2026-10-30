import type { Metadata } from 'next';
import { TrackerConsole } from '../../components/TrackerConsole';

export const metadata: Metadata = {
  title: 'Mayall — live attack tracker',
  description:
    'Follow one local Foundry exploit simulation frame by frame: gas attributed, call depth, balance movement and the parsed forge trace as it appears.',
};

export default function TrackerPage() {
  return <TrackerConsole />;
}
