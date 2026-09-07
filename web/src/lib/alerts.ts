import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { rowToCard } from "./cards";
import { nowIso } from "./format";
import { bestPrice, type NormalizedCard } from "./types";

export interface AlertView {
  id: number;
  card: NormalizedCard;
  thresholdPct: number;
  variantType: string;
  basePrice: number | null;
  baseCurrency: string | null;
  currentPrice: number | null;
  currency: string | null;
  changePct: number | null;
  triggered: boolean;
  createdAt: string;
  acknowledgedAt: string | null;
}

export async function listAlerts(): Promise<AlertView[]> {
  const rows = await db
    .select({ alert: schema.alerts, card: schema.cards })
    .from(schema.alerts)
    .innerJoin(schema.cards, eq(schema.alerts.cardId, schema.cards.id));
  const views = await Promise.all(rows.map(async ({ alert, card: row }) => {
    const card = rowToCard(row);
    const bp = bestPrice(card.prices, alert.variantType);
    const current = bp?.amount ?? null;
    const changePct = current != null && alert.basePrice ? ((current - alert.basePrice) / alert.basePrice) * 100 : null;
    const triggered = changePct != null && Math.abs(changePct) >= alert.thresholdPct;
    if (triggered && !alert.lastTriggeredAt) {
      await db.update(schema.alerts).set({ lastTriggeredAt: nowIso() }).where(eq(schema.alerts.id, alert.id));
    }
    return {
      id: alert.id,
      card,
      thresholdPct: alert.thresholdPct,
      variantType: alert.variantType,
      basePrice: alert.basePrice,
      baseCurrency: alert.baseCurrency,
      currentPrice: current,
      currency: bp?.currency ?? alert.baseCurrency,
      changePct,
      triggered,
      createdAt: alert.createdAt,
      acknowledgedAt: alert.acknowledgedAt,
    };
  }));
  return views.sort((a, b) => Number(b.triggered) - Number(a.triggered) || Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
}

export async function upsertAlert(cardId: string, thresholdPct: number, variantType?: string) {
  const rows = await db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).limit(1);
  if (!rows[0]) throw new Error("Card not found");
  const card = rowToCard(rows[0]);
  const bp = bestPrice(card.prices, variantType);
  const values = {
    cardId,
    thresholdPct,
    variantType: bp?.variant ?? variantType ?? "normal",
    basePrice: bp?.amount ?? null,
    baseCurrency: bp?.currency ?? null,
    createdAt: nowIso(),
    lastTriggeredAt: null,
    acknowledgedAt: null,
  };
  const result = await db
    .insert(schema.alerts)
    .values(values)
    .onConflictDoUpdate({ target: schema.alerts.cardId, set: values })
    .returning();
  return result[0];
}

export async function acknowledgeAlert(id: number) {
  const alerts = await db.select().from(schema.alerts).where(eq(schema.alerts.id, id)).limit(1);
  const alert = alerts[0];
  if (!alert) return null;
  const cards = await db.select().from(schema.cards).where(eq(schema.cards.id, alert.cardId)).limit(1);
  const row = cards[0];
  const bp = row ? bestPrice(rowToCard(row).prices, alert.variantType) : null;
  const result = await db
    .update(schema.alerts)
    .set({ basePrice: bp?.amount ?? alert.basePrice, baseCurrency: bp?.currency ?? alert.baseCurrency, acknowledgedAt: nowIso(), lastTriggeredAt: null })
    .where(eq(schema.alerts.id, id))
    .returning();
  return result[0];
}

export async function deleteAlert(id: number) {
  await db.delete(schema.alerts).where(eq(schema.alerts.id, id));
}

export async function alertForCard(cardId: string) {
  const rows = await db.select().from(schema.alerts).where(eq(schema.alerts.cardId, cardId)).limit(1);
  return rows[0] ?? null;
}
