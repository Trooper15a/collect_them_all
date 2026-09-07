import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { snapshotPortfolios } from "@/lib/portfolio";

const Body = z.object({ toPortfolioId: z.number().int().positive() });

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const items = await db.select().from(schema.portfolioItems).where(eq(schema.portfolioItems.id, id)).limit(1);
  if (!items[0]) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const targets = await db.select().from(schema.portfolios).where(eq(schema.portfolios.id, parsed.data.toPortfolioId)).limit(1);
  if (!targets[0]) return NextResponse.json({ error: "Target portfolio not found" }, { status: 404 });

  await db.update(schema.portfolioItems)
    .set({ portfolioId: parsed.data.toPortfolioId })
    .where(eq(schema.portfolioItems.id, id));

  snapshotPortfolios().catch(() => undefined);
  return NextResponse.json({ ok: true, movedTo: targets[0].name });
}
