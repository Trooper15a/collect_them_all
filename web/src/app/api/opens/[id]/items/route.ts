import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { requireUserId } from "@/lib/auth";
import { ownedOpenIds } from "@/lib/ownership";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const { id } = await params;
  const openId = Number(id);
  const opens = await db.select().from(schema.boxOpens).where(and(eq(schema.boxOpens.id, openId), eq(schema.boxOpens.userId, userId))).limit(1);
  if (!opens[0]) return NextResponse.json({ error: "Box open not found" }, { status: 404 });

  try {
    const body = await req.json();
    const cardId = String(body.cardId ?? "").trim();
    if (!cardId) return NextResponse.json({ error: "cardId is required" }, { status: 400 });
    const cards = await db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).limit(1);
    if (!cards[0]) return NextResponse.json({ error: "Card not found" }, { status: 404 });

    const now = new Date().toISOString();
    const result = await db.insert(schema.boxOpenItems).values({
      boxOpenId: openId,
      cardId,
      quantity: Math.max(1, Number(body.quantity) || 1),
      variantType: body.variantType ?? "normal",
      addedAt: now,
    }).returning();

    return NextResponse.json({ id: result[0].id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const openId = Number((await params).id);
  const itemId = Number(req.nextUrl.searchParams.get("itemId"));
  if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });
  await db.delete(schema.boxOpenItems).where(and(
    eq(schema.boxOpenItems.id, itemId),
    eq(schema.boxOpenItems.boxOpenId, openId),
    inArray(schema.boxOpenItems.boxOpenId, ownedOpenIds(userId)),
  ));
  return NextResponse.json({ ok: true });
}
