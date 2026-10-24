import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const GEMRATE_SEARCH = "https://www.gemrate.com/universal-search-query";
const GEMRATE_DETAILS = "https://www.gemrate.com/card-details";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface GemRateSearchResult {
  gemrate_id: string;
  name: string;
  set_name: string;
  card_number: string;
  parallel: string;
  year: string;
  total_population: number;
}

export async function GET(req: NextRequest) {
  const cardId = req.nextUrl.searchParams.get("cardId");
  if (!cardId) return NextResponse.json({ error: "cardId required" }, { status: 400 });

  // Check cache
  // Older cache entries may contain a name-only match for another printing.
  const cacheKey = `pop:v2:${cardId}`;
  const cached = await db.select().from(schema.apiCache).where(eq(schema.apiCache.key, cacheKey)).then((r) => r[0]);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json(JSON.parse(cached.value));
  }

  // Look up the card to get name/set/number for searching
  const card = await db.select().from(schema.cards).where(eq(schema.cards.id, cardId)).then((r) => r[0]);
  if (!card) return NextResponse.json({ error: "Card not found" }, { status: 404 });

  try {
    // Search GemRate for this card
    const searchQuery = buildSearchQuery(card);
    const searchRes = await fetch(GEMRATE_SEARCH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ query: searchQuery }),
      signal: AbortSignal.timeout(8000),
    });
    if (!searchRes.ok) throw new Error("GemRate search failed");
    const searchData = await searchRes.json();
    const results: GemRateSearchResult[] = searchData.results ?? searchData ?? [];

    // Find best match
    const match = findBestMatch(results, card);
    if (!match) {
      const empty = { found: false, cardId };
      await upsertCache(cacheKey, empty, CACHE_TTL_MS);
      return NextResponse.json(empty);
    }

    // Fetch detailed pop data
    const detailRes = await fetch(`${GEMRATE_DETAILS}?gemrate_id=${match.gemrate_id}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!detailRes.ok) throw new Error("GemRate details failed");
    const detail = await detailRes.json();

    const pop = formatPopData(detail, match);
    const result = { found: true, cardId, ...pop };
    await upsertCache(cacheKey, result, CACHE_TTL_MS);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[pop] GemRate lookup failed:", e);
    return NextResponse.json({ error: "Pop data unavailable" }, { status: 502 });
  }
}

function buildSearchQuery(card: typeof schema.cards.$inferSelect): string {
  const parts: string[] = [];
  if (card.name) parts.push(card.name);
  if (card.setName) parts.push(card.setName);
  if (card.cardNumber) parts.push(card.cardNumber.split("/")[0]);
  return parts.join(" ");
}

function findBestMatch(
  results: GemRateSearchResult[],
  card: typeof schema.cards.$inferSelect,
): GemRateSearchResult | null {
  const normalize = (value: string) => value.normalize("NFKD")
    .replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const number = (value: string) => normalize(value.split("/")[0]).replace(/^0+(?=\d)/, "");
  const name = (value: string) => normalize(value.replace(/\s+-\s+[a-z]*\d+[a-z]*(?:\/[a-z]*\d+[a-z]*)?$/i, ""));
  const cardNum = number(card.cardNumber ?? "");
  const cardSet = normalize(card.setName ?? "");
  const cardName = name(card.name);
  if (!cardNum || !cardSet || !cardName) return null;

  const matches = results.filter((result) => result.gemrate_id &&
    number(result.card_number ?? "") === cardNum &&
    normalize(result.set_name ?? "") === cardSet && name(result.name ?? "") === cardName);
  // Multiple parallel printings cannot be distinguished from these fields alone.
  return new Set(matches.map((result) => result.gemrate_id)).size === 1 ? matches[0] : null;
}

interface GradeBreakdown {
  grade: string;
  count: number;
}

function formatPopData(detail: Record<string, unknown>, match: GemRateSearchResult) {
  const combined = (detail.combined_totals ?? {}) as Record<string, number>;
  const pctOfTotal = (detail.percent_of_total ?? {}) as Record<string, number>;

  // Map unified grade keys to display grades
  const grades: GradeBreakdown[] = [
    { grade: "10", count: combined.univ_gem_mint ?? 0 },
    { grade: "9.5", count: combined.univ_mint_plus ?? 0 },
    { grade: "9", count: combined.univ_9 ?? 0 },
    { grade: "8.5", count: (combined as Record<string, number>)["univ_8_5"] ?? 0 },
    { grade: "8", count: combined.univ_8 ?? 0 },
    { grade: "7", count: combined.univ_7 ?? 0 },
    { grade: "6", count: combined.univ_6 ?? 0 },
    { grade: "5", count: combined.univ_5 ?? 0 },
    { grade: "4", count: combined.univ_4 ?? 0 },
    { grade: "3", count: combined.univ_3 ?? 0 },
    { grade: "2", count: combined.univ_2 ?? 0 },
    { grade: "1", count: combined.univ_1 ?? 0 },
  ];

  const totalPop = (detail.total_population as number) ?? match.total_population ?? 0;
  const totalGems = (detail.total_gems_or_greater as number) ?? 0;
  const gemRate = totalPop > 0 ? totalGems / totalPop : 0;

  // Per-grader summary
  const popData = (detail.population_data ?? []) as Array<{
    grader: string;
    card_total_grades: number;
    card_gems: number;
    card_gem_rate: number;
  }>;
  const graders = popData.map((g) => ({
    name: g.grader.toUpperCase(),
    total: g.card_total_grades,
    gems: g.card_gems,
    gemRate: g.card_gem_rate,
  }));

  return {
    totalPop,
    totalGems,
    gemRate: Math.round(gemRate * 1000) / 10,
    grades,
    graders,
    gemrateUrl: (detail.gemrate_url as string) ?? `https://gemrate.com/card/${match.gemrate_id}`,
    lastUpdated: (detail.data_last_updated as string) ?? null,
    pctOfTotal: {
      "10": pctOfTotal.univ_gem_mint ?? 0,
      "9": pctOfTotal.univ_9 ?? 0,
      "8": pctOfTotal.univ_8 ?? 0,
      "7": pctOfTotal.univ_7 ?? 0,
    },
  };
}

async function upsertCache(key: string, data: unknown, ttl: number) {
  const value = JSON.stringify(data);
  const expiresAt = Date.now() + ttl;
  await db
    .insert(schema.apiCache)
    .values({ key, value, expiresAt })
    .onConflictDoUpdate({ target: schema.apiCache.key, set: { value, expiresAt } });
}
