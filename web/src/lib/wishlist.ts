import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { rowToCard } from "./cards";
import { nowIso } from "./format";
import { bestPrice, type NormalizedCard } from "./types";

export interface WishlistView {
  id: number;
  card: NormalizedCard;
  targetPrice: number | null;
  targetCurrency: string | null;
  currentPrice: number | null;
  currentCurrency: string | null;
  belowTarget: boolean;
  notes: string | null;
  createdAt: string;
}

export async function listWishlist(userId?: string | null): Promise<WishlistView[]> {
  const condition = userId
    ? eq(schema.wishlistItems.userId, userId)
    : undefined;
  const rows = await db
    .select({ item: schema.wishlistItems, card: schema.cards })
    .from(schema.wishlistItems)
    .innerJoin(schema.cards, eq(schema.wishlistItems.cardId, schema.cards.id))
    .where(condition);
  return rows.map(({ item, card: row }) => {
    const card = rowToCard(row);
    const bp = bestPrice(card.prices);
    const current = bp?.amount ?? null;
    const belowTarget = item.targetPrice != null && current != null && current <= item.targetPrice;
    return {
      id: item.id,
      card,
      targetPrice: item.targetPrice,
      targetCurrency: item.targetCurrency,
      currentPrice: current,
      currentCurrency: bp?.currency ?? null,
      belowTarget,
      notes: item.notes,
      createdAt: item.createdAt,
    };
  });
}

export async function addToWishlist(
  userId: string | null,
  cardId: string,
  targetPrice?: number | null,
  targetCurrency?: string,
) {
  const values = {
    userId,
    cardId,
    targetPrice: targetPrice ?? null,
    targetCurrency: targetCurrency ?? "USD",
    notes: null,
    createdAt: nowIso(),
  };
  const result = await db
    .insert(schema.wishlistItems)
    .values(values)
    .onConflictDoUpdate({
      target: [schema.wishlistItems.userId, schema.wishlistItems.cardId],
      set: { targetPrice: values.targetPrice, targetCurrency: values.targetCurrency },
    })
    .returning();
  return result[0];
}

export async function removeFromWishlist(userId: string | null, cardId: string) {
  const condition = userId
    ? and(eq(schema.wishlistItems.userId, userId), eq(schema.wishlistItems.cardId, cardId))
    : eq(schema.wishlistItems.cardId, cardId);
  await db.delete(schema.wishlistItems).where(condition);
}

export async function checkWishlistTargets(): Promise<{ triggered: number }> {
  const rows = await db
    .select({ item: schema.wishlistItems, card: schema.cards })
    .from(schema.wishlistItems)
    .innerJoin(schema.cards, eq(schema.wishlistItems.cardId, schema.cards.id));
  let triggered = 0;
  for (const { item, card: row } of rows) {
    if (item.targetPrice == null) continue;
    const card = rowToCard(row);
    const bp = bestPrice(card.prices);
    if (bp && bp.amount <= item.targetPrice) {
      triggered++;
      console.log(`[wishlist] price drop: ${card.name} is ${bp.amount} ${bp.currency} (target: ${item.targetPrice})`);
    }
  }
  return { triggered };
}
