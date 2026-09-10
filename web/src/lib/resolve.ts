import { and, eq, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getCard, rowToCard, upsertCard } from "./cards";
import { nowIso } from "./format";
import { indexCard } from "./model-index";
import { isScanIndexId } from "./scanner/matcher";
import type { NormalizedCard } from "./types";

export async function resolveScanId(scanId: string): Promise<{ card: NormalizedCard | null; method: string }> {
  if (!isScanIndexId(scanId)) {
    return { card: await getCard(scanId), method: "direct" };
  }
  const links = await db.select().from(schema.cardLinks).where(eq(schema.cardLinks.scanId, scanId)).limit(1);
  const link = links[0];
  if (link) {
    if (!link.cardId) return { card: null, method: link.method };
    const card = await getCard(link.cardId);
    if (card) return { card, method: link.method };
  }
  const idx = indexCard(scanId);
  if (!idx) return { card: null, method: "unknown-id" };

  const lang = idx.lang === "jap" ? "jap" : "eng";
  const setCode = (idx.set ?? "").trim();
  const num = (idx.num ?? "").trim();
  const name = (idx.name ?? "").trim();

  if (num) {
    const numNorm = num.replace(/^0+(?=\d)/, "");
    const numFilter = or(like(schema.cards.cardNumber, `${num}%`), like(schema.cards.cardNumber, `${numNorm}%`));
    const conditions = [eq(schema.cards.tcg, "pokemon"), eq(schema.cards.language, lang), sql`id like 'tp:%'`, numFilter];
    if (lang === "eng" && name) {
      conditions.push(like(schema.cards.name, `${name}%`));
    } else if (setCode) {
      conditions.push(eq(schema.cards.setCode, setCode));
    }
    const rows = await db
      .select()
      .from(schema.cards)
      .where(and(...conditions))
      .limit(10);
    const local = pickMatch(rows.map(rowToCard), { setCode, num, name, lang });
    if (local) {
      await remember(scanId, local.id, "tcgcsv-local");
      return { card: local, method: "tcgcsv-local" };
    }
  }
  await remember(scanId, null, "none");
  return { card: null, method: "none" };
}

function normNum(n: string | null | undefined) {
  const first = (n ?? "").split("/")[0].trim().toLowerCase();
  return first.replace(/^0+(?=\d)/, "");
}

function pickMatch(results: NormalizedCard[], want: { setCode: string; num: string; name: string; lang: string }): NormalizedCard | null {
  const wantNum = normNum(want.num);
  const wantSet = want.setCode.toLowerCase();
  const wantName = want.name.toLowerCase();
  const scored = results
    .map((c) => {
      let score = 0;
      if (c.language !== want.lang) return { c, score: -1 };
      if (wantNum && normNum(c.cardNumber) === wantNum) score += 4;
      if (wantSet && (c.setCode ?? "").toLowerCase() === wantSet) score += 3;
      if (wantName && c.name.toLowerCase().startsWith(wantName)) score += 2;
      return { c, score };
    })
    .filter((x) => x.score >= 4)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.c ?? null;
}

async function remember(scanId: string, cardId: string | null, method: string) {
  await db.insert(schema.cardLinks)
    .values({ scanId, cardId, method, createdAt: nowIso() })
    .onConflictDoUpdate({ target: schema.cardLinks.scanId, set: { cardId, method, createdAt: nowIso() } });
}

export async function linkManually(scanId: string, cardId: string) {
  await remember(scanId, cardId, "manual");
}
