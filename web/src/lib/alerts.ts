import { and, eq, sql } from "drizzle-orm";
import { alertsSchemaReady, db, schema } from "@/db";
import { rowToCard } from "./cards";
import { nowIso } from "./format";
import { type NormalizedCard } from "./types";
import { alertQuote, evaluateAlert, type AlertDirection } from "./alert-rules";

export interface AlertView {
  id: number;
  card: NormalizedCard;
  thresholdPct: number;
  direction: AlertDirection;
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

export async function listAlerts(userId: string): Promise<AlertView[]> {
  await alertsSchemaReady;
  const rows = await db
    .select({ alert: schema.alerts, card: schema.cards })
    .from(schema.alerts)
    .innerJoin(schema.cards, eq(schema.alerts.cardId, schema.cards.id))
    .where(eq(schema.alerts.userId, userId));
  const views = await Promise.all(rows.map(async ({ alert, card: row }) => {
    const card = rowToCard(row);
    const direction = alert.direction ?? "either";
    const bp = alert.baseCurrency ? alertQuote(card.prices, alert.variantType, alert.baseCurrency) : null;
    const current = bp?.amount ?? null;
    const { changePct, triggered } = evaluateAlert(alert.basePrice, alert.baseCurrency, bp, alert.thresholdPct, direction);
    if (triggered && !alert.lastTriggeredAt) {
      await db.update(schema.alerts).set({ lastTriggeredAt: nowIso() }).where(and(eq(schema.alerts.id, alert.id), eq(schema.alerts.userId, userId)));
    }
    return {
      id: alert.id,
      card,
      thresholdPct: alert.thresholdPct,
      direction,
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

export async function upsertAlert(userId: string, cardId: string, thresholdPct: number, variantType?: string, direction: AlertDirection = "either") {
  await alertsSchemaReady;
  if (!Number.isFinite(thresholdPct) || thresholdPct < 0.5 || thresholdPct > 1000) throw new Error("Threshold must be between 0.5 and 1000 percent");
  if (!["drop", "rise", "either"].includes(direction)) throw new Error("Invalid alert direction");
  const existing = variantType ? null : await alertForCard(userId, cardId);
  const rows = await db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).limit(1);
  if (!rows[0]) throw new Error("Card not found");
  const card = rowToCard(rows[0]);
  const variant = variantType ?? existing?.variantType ?? "normal";
  const bp = alertQuote(card.prices, variant);
  if (!bp) throw new Error("No usable market quote for this finish");
  const values = {
    userId,
    cardId,
    thresholdPct,
    direction,
    variantType: variant,
    basePrice: bp.amount,
    baseCurrency: bp.currency,
    createdAt: nowIso(),
    lastTriggeredAt: null,
    acknowledgedAt: null,
  };
  const result = await db
    .insert(schema.alerts)
    .values(values)
    .onConflictDoUpdate({ target: [schema.alerts.userId, schema.alerts.cardId], set: {
      thresholdPct,
      direction,
      variantType: variant,
      // Evaluate against the row being updated, so concurrent edits cannot rebase a watch.
      basePrice: sql`case when ${schema.alerts.variantType} = ${variant} then ${schema.alerts.basePrice} else ${bp.amount} end`,
      baseCurrency: sql`case when ${schema.alerts.variantType} = ${variant} then ${schema.alerts.baseCurrency} else ${bp.currency} end`,
      lastTriggeredAt: sql`case when ${schema.alerts.variantType} = ${variant} then ${schema.alerts.lastTriggeredAt} else ${null} end`,
      acknowledgedAt: sql`case when ${schema.alerts.variantType} = ${variant} then ${schema.alerts.acknowledgedAt} else ${null} end`,
    } })
    .returning();
  return result[0];
}

export async function acknowledgeAlert(userId: string, id: number) {
  await alertsSchemaReady;
  const alerts = await db.select().from(schema.alerts).where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId))).limit(1);
  const alert = alerts[0];
  if (!alert) return null;
  const cards = await db.select().from(schema.cards).where(eq(schema.cards.id, alert.cardId)).limit(1);
  const row = cards[0];
  const bp = row ? alertQuote(rowToCard(row).prices, alert.variantType) : null;
  if (!bp) throw new Error("No usable market quote for this finish; baseline was not reset");
  const result = await db
    .update(schema.alerts)
    .set({ basePrice: bp.amount, baseCurrency: bp.currency, acknowledgedAt: nowIso(), lastTriggeredAt: null })
    .where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId), eq(schema.alerts.variantType, alert.variantType)))
    .returning();
  return result[0];
}

export async function deleteAlert(userId: string, id: number) {
  await alertsSchemaReady;
  await db.delete(schema.alerts).where(and(eq(schema.alerts.id, id), eq(schema.alerts.userId, userId)));
}

export async function alertForCard(userId: string, cardId: string) {
  await alertsSchemaReady;
  const rows = await db.select().from(schema.alerts).where(and(eq(schema.alerts.cardId, cardId), eq(schema.alerts.userId, userId))).limit(1);
  return rows[0] ?? null;
}
