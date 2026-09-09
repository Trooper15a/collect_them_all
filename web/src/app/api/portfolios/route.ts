import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { TCG_IDS } from "@/lib/types";
import { db, schema } from "@/db";
import { requireUserId } from "@/lib/auth";
import { getSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { nowIso } from "@/lib/format";
import { summarize, valuedItems } from "@/lib/portfolio";

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  tcgId: z.enum(TCG_IDS).nullable().optional(),
  language: z.enum(["eng", "jap"]).nullable().optional(),
});

export async function GET(req: NextRequest) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const currency = req.nextUrl.searchParams.get("currency") ?? await getSetting("currency", "USD");
  try {
    const fx = await getRates();
    const all = await valuedItems(null, currency, fx, userId);
    const list = await db.select().from(schema.portfolios).where(eq(schema.portfolios.userId, userId)).orderBy(schema.portfolios.createdAt);
    const portfolios = list.map((p) => ({ ...p, summary: summarize(all.filter((i) => i.portfolioId === p.id)) }));
    return NextResponse.json({ portfolios, all: summarize(all), currency });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  const result = await db
    .insert(schema.portfolios)
    .values({ userId, name: parsed.data.name, tcgId: parsed.data.tcgId ?? null, language: parsed.data.language ?? null, createdAt: nowIso() })
    .returning();
  return NextResponse.json(result[0], { status: 201 });
}
