import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

/** An explicit binder scope must belong to the signed-in collector. */
export async function binderScope(userId: string | undefined, raw: string | null) {
  if (raw === null) return { id: null, error: null, status: 200 };
  if (!/^[1-9]\d*$/.test(raw) || !Number.isSafeInteger(Number(raw))) return { id: null, error: "Invalid binder", status: 400 };
  if (!userId) return { id: null, error: "Unauthorized", status: 401 };
  const id = Number(raw);
  const rows = await db.select({ id: schema.portfolios.id }).from(schema.portfolios)
    .where(and(eq(schema.portfolios.id, id), eq(schema.portfolios.userId, userId))).limit(1);
  return rows[0] ? { id, error: null, status: 200 } : { id: null, error: "Binder not found", status: 404 };
}

/** Use as a SQL subquery so ownership is checked by the mutation itself. */
export function ownedPortfolioIds(userId: string) {
  if (!userId) throw new Error("Unauthorized");
  return db.select({ id: schema.portfolios.id }).from(schema.portfolios)
    .where(eq(schema.portfolios.userId, userId));
}

export function ownedOpenIds(userId: string) {
  if (!userId) throw new Error("Unauthorized");
  return db.select({ id: schema.boxOpens.id }).from(schema.boxOpens)
    .where(eq(schema.boxOpens.userId, userId));
}
