import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupShowCard } from '@/lib/card-show-catalog';

const Query = z.object({ id: z.string().max(200).regex(/^(tp|ygo|sf|pw|tcgdex|pcjp):[a-zA-Z0-9_:\-]+$/) });

/** Public catalog data only; never returns account holdings or purchase prices. */
export async function GET(request: NextRequest) {
  const parsed = Query.safeParse({ id: request.nextUrl.searchParams.get('id') });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid card identifier.' }, { status: 400 });
  try {
    const result = await lookupShowCard(parsed.data.id);
    return result ? NextResponse.json(result) : NextResponse.json({ error: 'No catalog listing is available for this exact card. Try another match or retry when the catalog is available.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Card prices are temporarily unavailable. Please retry.' }, { status: 503 });
  }
}
