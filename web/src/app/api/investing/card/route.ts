import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getInvestingCard } from '@/lib/investing-catalog';

const Query = z.object({ id: z.string().max(200).regex(/^(tp|pw|sf|ygo):[a-zA-Z0-9_:\-]+$/) });
export async function GET(request: NextRequest) {
  const parsed = Query.safeParse({ id: request.nextUrl.searchParams.get('id') });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid card identifier.' }, { status: 400 });
  try {
    const result = await getInvestingCard(parsed.data.id);
    return result ? NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
      : NextResponse.json({ error: 'No singles market history is available for this card.' }, { status: 404 });
  } catch {
    return NextResponse.json({ error: 'Card history is temporarily unavailable. Retry in a moment.' }, { status: 503 });
  }
}
