import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

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
