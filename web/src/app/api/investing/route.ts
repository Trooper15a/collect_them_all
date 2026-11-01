import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getMarketCatalog } from '@/lib/investing-catalog';
import { screenMarket } from '@/lib/investing';
import { getRates } from '@/lib/currency';
import { exchange } from '@/lib/card-show';
import { CURRENCIES } from '@/lib/types';

const Query = z.object({
  source: z.enum(['tcgplayer', 'cardmarket']).default('tcgplayer'),
  days: z.enum(['7', '30', '90']).default('7'),
  language: z.enum(['all', 'eng', 'jap']).default('all'),
  currency: z.enum(CURRENCIES).default('USD'),
  min: z.coerce.number().finite().min(0).max(1_000_000_000).default(0),
  max: z.coerce.number().finite().min(0).max(1_000_000_000).optional(),
  q: z.string().max(120).default(''),
  limit: z.coerce.number().int().min(1).max(60).default(20),
}).refine((value) => value.max === undefined || value.max >= value.min, { message: 'Maximum must be at least minimum.' });

/** Public catalog only: never reads a user's collection, cost basis or settings. */
export async function GET(request: NextRequest) {
  const parsed = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'Check the price range and filters.' }, { status: 400 });
  try {
    const filters = parsed.data;
    const [catalog, fx] = await Promise.all([getMarketCatalog(filters.source), getRates()]);
    const query = filters.q.trim().toLowerCase();
    const entries = catalog.filter((entry) => {
      const price = exchange(entry.analysis.reference.amount, entry.analysis.reference.currency, filters.currency, fx);
      return price !== null && price >= filters.min && (filters.max === undefined || price <= filters.max)
        && (filters.language === 'all' || entry.language === filters.language)
        && (!query || `${entry.name} ${entry.setName ?? ''} ${entry.cardNumber ?? ''}`.toLowerCase().includes(query));
    });
    const lists = screenMarket(entries, Number(filters.days) as 7 | 30 | 90);
    return NextResponse.json({
      lists: Object.fromEntries(Object.entries(lists).map(([name, rows]) => [name, rows.slice(0, filters.limit)])),
      counts: Object.fromEntries(Object.entries(lists).map(([name, rows]) => [name, rows.length])),
      catalogCount: catalog.length, filteredCount: entries.length,
      freshCount: entries.filter((entry) => entry.analysis.fresh).length,
      comparableCount: entries.filter((entry) => entry.analysis.fresh && entry.analysis.changes[Number(filters.days) as 7 | 30 | 90]).length,
      fx, asOf: new Date().toISOString(),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[investing] catalog unavailable', error);
    return NextResponse.json({ error: 'Market data is temporarily unavailable. Retry in a moment.' }, { status: 503 });
  }
}
