import { NextRequest, NextResponse } from "next/server";
import { getUserSetting as getSetting } from "@/lib/user-settings";
import { getCard, getPriceHistory } from "@/lib/cards";
import { getRates } from "@/lib/currency";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const card = await getCard(decodeURIComponent(id));
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    const history = await getPriceHistory(card.id);
    const fx = await getRates();

    return NextResponse.json({ card, history, fx, displayCurrency: await getSetting("currency", "USD") });
  } catch (err) {
    console.error("card error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load card" }, { status: 500 });
  }
}
