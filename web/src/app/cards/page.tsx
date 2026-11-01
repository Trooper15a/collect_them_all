import type { Metadata } from 'next';
import { CardLookup } from '@/components/CardLookup';

export const metadata: Metadata = { title: 'Card Lookup', robots: { index: false, follow: false } };
export default function CardsPage() { return <CardLookup />; }
