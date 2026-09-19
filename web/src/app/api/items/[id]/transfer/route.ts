import { and, eq, inArray } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { snapshotPortfolios } from "@/lib/portfolio";
import { requireUserId } from "@/lib/auth";
import { ownedPortfolioIds } from "@/lib/ownership";

const Body = z.object({ toPortfolioId: z.number().int().positive() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const ownerCondition = and(eq(schema.portfolioItems.id, id), inArray(schema.portfolioItems.portfolioId, ownedPortfolioIds(userId)));
  const items = await db.select().from(schema.portfolioItems).where(ownerCondition).limit(1);
  if (!items[0]) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const targets = await db.select().from(schema.portfolios).where(and(eq(schema.portfolios.id, parsed.data.toPortfolioId), eq(schema.portfolios.userId, userId))).limit(1);
  if (!targets[0]) return NextResponse.json({ error: "Target portfolio not found" }, { status: 404 });

  await db.update(schema.portfolioItems)
    .set({ portfolioId: parsed.data.toPortfolioId })
    .where(ownerCondition);

  snapshotPortfolios().catch(() => undefined);
  return NextResponse.json({ ok: true, movedTo: targets[0].name });
}
