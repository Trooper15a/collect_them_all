import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireUserId } from "@/lib/auth";
import { getUserSetting as getSetting } from "@/lib/user-settings";
import { getCard, getPriceHistory } from "@/lib/cards";
import { getRates } from "@/lib/currency";
import { defaultVariant, type OwnedCopy } from "@/lib/valuation";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const itemId = req.nextUrl.searchParams.get("itemId");
  if (itemId !== null && (!/^[1-9]\d*$/.test(itemId) || !Number.isSafeInteger(Number(itemId)))) {
    return NextResponse.json({ error: "Invalid itemId" }, { status: 400 });
  }
  let userId: string | null = null;
  if (itemId !== null) {
    try { userId = await requireUserId(); }
    catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  }
  try {
    const cardId = decodeURIComponent(id);
    let item: OwnedCopy | null = null;
    if (itemId !== null) {
      const rows = await db.select({
        id: schema.portfolioItems.id,
        portfolioId: schema.portfolioItems.portfolioId,
        portfolioName: schema.portfolios.name,
        quantity: schema.portfolioItems.quantity,
        variantType: schema.portfolioItems.variantType,
        condition: schema.portfolioItems.condition,
        isGraded: schema.portfolioItems.isGraded,
        gradingCompany: schema.portfolioItems.gradingCompany,
        grade: schema.portfolioItems.grade,
      }).from(schema.portfolioItems)
        .innerJoin(schema.portfolios, eq(schema.portfolioItems.portfolioId, schema.portfolios.id))
        .where(and(eq(schema.portfolioItems.id, Number(itemId)), eq(schema.portfolios.userId, userId!), eq(schema.portfolioItems.cardId, cardId)))
        .limit(1);
      if (!rows[0]) return NextResponse.json({ error: "Copy not found" }, { status: 404 });
      item = rows[0];
    }
    const card = await getCard(cardId);
    if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });
    const variant = item?.variantType ?? req.nextUrl.searchParams.get("variant") ?? defaultVariant(card.prices);
    if (!variant || variant.length > 100) return NextResponse.json({ error: "Invalid variant" }, { status: 400 });
    const history = await getPriceHistory(card.id, variant);
    const fx = await getRates();
    return NextResponse.json({ card, item, variant, history, fx, displayCurrency: await getSetting("currency", "USD") });
  } catch (err) {
    console.error("card error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load card" }, { status: 500 });
  }
}
