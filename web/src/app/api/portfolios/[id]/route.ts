import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { db, schema } from "@/db";
import { requireUserId } from "@/lib/auth";
import { getSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { RANGES, type Range } from "@/lib/format";
import { summarize, valuedItems, valueSeries } from "@/lib/portfolio";

const Patch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  tcgId: z.enum(TCG_IDS).nullable().optional(),
  language: z.enum(["eng", "jap"]).nullable().optional(),
  accentColor: z.string().max(20).nullable().optional(),
});

function parseId(id: string) {
  const n = Number(id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const rows = await db.select().from(schema.portfolios).where(and(eq(schema.portfolios.id, id), eq(schema.portfolios.userId, userId))).limit(1);
  const portfolio = rows[0];
  if (!portfolio) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const currency = req.nextUrl.searchParams.get("currency") ?? await getSetting("currency", "USD");
  const rangeParam = req.nextUrl.searchParams.get("range") ?? "1M";
  const range = (RANGES as readonly string[]).includes(rangeParam) ? (rangeParam as Range) : "1M";
  try {
    const fx = await getRates();
    const items = await valuedItems(id, currency, fx, userId);
    return NextResponse.json({ portfolio, items, summary: summarize(items), series: await valueSeries(id, range, currency, fx), currency });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  const exists = await db.select().from(schema.portfolios).where(and(eq(schema.portfolios.id, id), eq(schema.portfolios.userId, userId))).limit(1);
  if (!exists[0]) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const result = await db.update(schema.portfolios).set(parsed.data).where(eq(schema.portfolios.id, id)).returning();
  return NextResponse.json(result[0]);
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const id = parseId((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  await db.delete(schema.portfolios).where(and(eq(schema.portfolios.id, id), eq(schema.portfolios.userId, userId)));
  return NextResponse.json({ ok: true });
}
