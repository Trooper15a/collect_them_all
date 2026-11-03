import { and, eq, sql } from "drizzle-orm";
import { db, ensurePremiumSchema, schema } from "@/db";

export async function getPremiumAccount(userId: string) {
  await ensurePremiumSchema();
  const [account] = await db.select({
    id: schema.users.id, premium: schema.users.premium, stripeCustomerId: schema.users.stripeCustomerId,
  }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return account ?? null;
}

export async function saveStripeCustomer(userId: string, customerId: string) {
  await ensurePremiumSchema();
  await db.update(schema.users).set({ stripeCustomerId: customerId }).where(eq(schema.users.id, userId));
}

/** A duplicate webhook preserves both the original access flag and purchase date. */
export async function grantPremium(userId: string, customerId: string) {
  await ensurePremiumSchema();
  const rows = await db.update(schema.users).set({
    premium: true,
    premiumSince: sql`coalesce(${schema.users.premiumSince}, ${new Date().toISOString()})`,
  }).where(and(eq(schema.users.id, userId), eq(schema.users.stripeCustomerId, customerId)))
    .returning({ id: schema.users.id });
  if (rows.length !== 1) throw new Error("Premium account association changed");
}
