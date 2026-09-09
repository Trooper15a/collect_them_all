import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/lib/cache";
import { getCard, getPriceHistory } from "@/lib/cards";
import { getRates } from "@/lib/currency";
import { backfillCardHistory } from "@/lib/tcgcsv";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const refresh = req.nextUrl.searchParams.get("refresh") === "1";
  try {
    const card = await getCard(decodeURIComponent(id), { forceRefresh: refresh });
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    const history = await getPriceHistory(card.id);
    const fx = await getRates();

    // Trigger background backfill if this tp: card has sparse history
    if (card.id.startsWith("tp:") && history.length < 7) {
      backfillCardHistory(card.id)
        .then((n) => { if (n > 0) console.log(`Backfilled ${n} price points for ${card.id}`); })
        .catch((err) => console.error("Backfill error:", err));
    }

    return NextResponse.json({ card, history, fx, displayCurrency: await getSetting("currency", "USD") });
  } catch (err) {
    console.error("card error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load card" }, { status: 500 });
  }
}
