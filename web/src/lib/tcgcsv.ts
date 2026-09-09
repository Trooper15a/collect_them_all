import { and, eq, sql } from "drizzle-orm";
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { db, schema } from "@/db";
import { getSetting, setSetting } from "./cache";
import { nowIso, today } from "./format";
import type { CardPrices, PriceVariant } from "./types";

const execFileAsync = promisify(execFile);

const BASE = "https://tcgcsv.com/tcgplayer";

export interface TcgcsvCategory {
  id: number;
  tcg: string;
  language: "eng" | "jap";
  label: string;
}

export const TCGCSV_CATEGORIES: TcgcsvCategory[] = [
  { id: 3, tcg: "pokemon", language: "eng", label: "Pokémon" },
  { id: 85, tcg: "pokemon", language: "jap", label: "Pokémon Japan" },
  { id: 1, tcg: "mtg", language: "eng", label: "Magic" },
  { id: 2, tcg: "yugioh", language: "eng", label: "Yu-Gi-Oh!" },
  { id: 68, tcg: "onepiece", language: "eng", label: "One Piece" },
  { id: 71, tcg: "lorcana", language: "eng", label: "Lorcana" },
  { id: 63, tcg: "digimon", language: "eng", label: "Digimon" },
  { id: 27, tcg: "dbs", language: "eng", label: "Dragon Ball Super" },
  { id: 80, tcg: "dbfw", language: "eng", label: "DB Fusion World" },
  { id: 62, tcg: "fab", language: "eng", label: "Flesh and Blood" },
  { id: 79, tcg: "swu", language: "eng", label: "Star Wars Unlimited" },
  { id: 16, tcg: "vanguard", language: "eng", label: "Cardfight!! Vanguard" },
  { id: 20, tcg: "weiss", language: "eng", label: "Weiss Schwarz" },
  { id: 24, tcg: "finalfantasy", language: "eng", label: "Final Fantasy" },
  { id: 81, tcg: "unionarena", language: "eng", label: "Union Arena" },
];

export function defaultCategoryIds(): number[] {
  const env = process.env.TCGCSV_CATEGORIES;
  if (env) return env.split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  return [3, 85];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;

// TCGCSV guideline: keep under ~10k requests/24h or risk a ban. Space requests
// ~100ms apart so a full import stays polite even for large categories.
const REQUEST_GAP_MS = 100;
let lastRequestAt = 0;
let requestChain: Promise<void> = Promise.resolve();

function throttle(): Promise<void> {
  requestChain = requestChain.then(async () => {
    const wait = REQUEST_GAP_MS - (Date.now() - lastRequestAt);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
  });
  return requestChain;
}

async function getJson(url: string): Promise<J> {
  await throttle();
  const res = await fetch(url, { headers: { "User-Agent": "ripnpull/0.1" }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`TCGCSV ${res.status} ${url}`);
  return res.json();
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const SUBTYPE_KEYS: Record<string, string> = {
  normal: "normal",
  holofoil: "holofoil",
  "reverse holofoil": "reverseHolofoil",
  "1st edition": "1stEdition",
  "1st edition holofoil": "1stEditionHolofoil",
  unlimited: "unlimited",
  "unlimited holofoil": "unlimitedHolofoil",
  foil: "foil",
  etched: "etched",
};

function variantKey(subType: string | null | undefined) {
  const s = (subType ?? "Normal").trim();
  return SUBTYPE_KEYS[s.toLowerCase()] ?? s.replace(/\s+(\w)/g, (_, c) => c.toUpperCase()).replace(/^\w/, (c) => c.toLowerCase());
}

export interface ImportResult {
  categories: number[];
  groups: number;
  products: number;
  priced: number;
  historyRows: number;
  skippedGroups: number;
  startedAt: string;
  finishedAt: string;
  errors: string[];
}

export interface ImportStatus {
  running: boolean;
  progress?: { category: number; group: number; of: number };
  last?: ImportResult;
}

const g = globalThis as unknown as { __tcgcsvStatus?: ImportStatus };
export async function importStatus(): Promise<ImportStatus> {
  if (!g.__tcgcsvStatus) {
    const raw = await getSetting("tcgcsv:last", "");
    g.__tcgcsvStatus = { running: false, last: raw ? (JSON.parse(raw) as ImportResult) : undefined };
  }
  return g.__tcgcsvStatus;
}

export async function importTcgcsv(categoryIds = defaultCategoryIds(), opts: { onlyGroups?: number } = {}): Promise<ImportResult> {
  const status = await importStatus();
  if (status.running) throw new Error("TCGCSV import already running");
  status.running = true;
  const result: ImportResult = { categories: categoryIds, groups: 0, products: 0, priced: 0, historyRows: 0, skippedGroups: 0, startedAt: nowIso(), finishedAt: "", errors: [] };
  const date = today();
  try {
    for (const catId of categoryIds) {
      const cat = TCGCSV_CATEGORIES.find((c) => c.id === catId);
      if (!cat) {
        result.errors.push(`unknown category ${catId}`);
        continue;
      }
      let groups: J[] = [];
      try {
        groups = (await getJson(`${BASE}/${catId}/groups`)).results ?? [];
      } catch (e) {
        result.errors.push(`groups ${catId}: ${(e as Error).message}`);
        continue;
      }
      if (opts.onlyGroups) groups = groups.slice(0, opts.onlyGroups);
      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        status.progress = { category: catId, group: gi + 1, of: groups.length };
        try {
          const [productsRes, pricesRes] = await Promise.all([
            getJson(`${BASE}/${catId}/${group.groupId}/products`),
            getJson(`${BASE}/${catId}/${group.groupId}/prices`),
          ]);
          const products: J[] = productsRes.results ?? [];
          const prices: J[] = pricesRes.results ?? [];
          if (!products.length) {
            result.skippedGroups++;
            continue;
          }
          const counts = await upsertGroup(cat, group, products, prices, date);
          result.groups++;
          result.products += counts.products;
          result.priced += counts.priced;
          result.historyRows += counts.history;
          await db.insert(schema.sets)
            .values({ id: `${cat.tcg}:${group.abbreviation ?? group.groupId}:${cat.language}`, tcg: cat.tcg, code: String(group.abbreviation ?? group.groupId), name: group.name, language: cat.language, total: products.length, releaseDate: group.publishedOn ? String(group.publishedOn).slice(0, 10) : null, imageUrl: null })
            .onConflictDoUpdate({ target: schema.sets.id, set: { name: group.name, total: products.length } });
        } catch (e) {
          result.errors.push(`group ${catId}/${group.groupId} ${group.name}: ${(e as Error).message}`);
        }
      }
    }
  } finally {
    result.finishedAt = nowIso();
    status.running = false;
    status.progress = undefined;
    status.last = result;
    await setSetting("tcgcsv:last", JSON.stringify(result));
  }
  return result;
}

async function upsertGroup(cat: TcgcsvCategory, group: J, products: J[], prices: J[], date: string) {
  const byProduct = new Map<number, J[]>();
  for (const p of prices) byProduct.set(p.productId, [...(byProduct.get(p.productId) ?? []), p]);
  const now = nowIso();
  let priced = 0;
  let history = 0;

  for (const p of products) {
    const ext: Record<string, string> = {};
    for (const e of p.extendedData ?? []) ext[e.name] = e.value;
    const number = ext.Number ?? null;
    const isSealed = !number;
    const id = `tp:${p.productId}`;
    const variants: Record<string, PriceVariant> = {};
    for (const pr of byProduct.get(p.productId) ?? []) {
      const v: PriceVariant = { market: num(pr.marketPrice), low: num(pr.lowPrice), mid: num(pr.midPrice), high: num(pr.highPrice), directLow: num(pr.directLowPrice) };
      if (Object.values(v).some((x) => x != null)) variants[variantKey(pr.subTypeName)] = v;
    }
    const hasPrices = Object.keys(variants).length > 0;
    const pricesJson: CardPrices | null = hasPrices ? { tcgplayer: { currency: "USD", url: p.url ?? null, updatedAt: now, variants }, cardmarket: null } : null;
    if (hasPrices && pricesJson) {
      const existing = await db.select({ pricesJson: schema.cards.pricesJson }).from(schema.cards).where(eq(schema.cards.id, id)).limit(1);
      if (existing[0]?.pricesJson) {
        const prev = JSON.parse(existing[0].pricesJson) as CardPrices;
        if (prev.cardmarket) pricesJson.cardmarket = prev.cardmarket;
      }
    }
    await db.insert(schema.cards)
      .values({
        id,
        tcg: cat.tcg,
        name: p.name,
        setName: group.name,
        setCode: String(group.abbreviation ?? group.groupId),
        setId: String(group.groupId),
        cardNumber: number,
        rarity: isSealed ? "Sealed" : (ext.Rarity ?? null),
        variant: null,
        language: cat.language,
        imageUrl: p.imageUrl ?? null,
        releaseDate: group.publishedOn ? String(group.publishedOn).slice(0, 10) : null,
        sourceId: String(p.productId),
        pricesJson: pricesJson ? JSON.stringify(pricesJson) : null,
        priceUpdatedAt: pricesJson ? now : null,
        metaJson: JSON.stringify({
          sealed: isSealed,
          tcgplayerUrl: p.url,
          groupId: p.groupId,
          hp: ext.HP,
          types: ext["Card Type"],
          stage: ext.Stage,
          attacks: [ext["Attack 1"], ext["Attack 2"], ext["Attack 3"]].filter(Boolean),
          weakness: ext.Weakness,
          resistance: ext.Resistance,
          retreatCost: ext.RetreatCost,
          description: ext.Description ?? ext.DescriptionText,
        }),
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.cards.id,
        set: {
          name: p.name,
          setName: group.name,
          setCode: String(group.abbreviation ?? group.groupId),
          cardNumber: number,
          rarity: isSealed ? "Sealed" : (ext.Rarity ?? null),
          imageUrl: p.imageUrl ?? null,
          pricesJson: pricesJson ? JSON.stringify(pricesJson) : sql`coalesce(${JSON.stringify(pricesJson)}, cards.prices_json)`,
          priceUpdatedAt: pricesJson ? now : sql`cards.price_updated_at`,
          metaJson: JSON.stringify({
            sealed: isSealed,
            tcgplayerUrl: p.url,
            groupId: p.groupId,
            hp: ext.HP,
            types: ext["Card Type"],
            stage: ext.Stage,
            attacks: [ext["Attack 1"], ext["Attack 2"], ext["Attack 3"]].filter(Boolean),
            weakness: ext.Weakness,
            resistance: ext.Resistance,
            retreatCost: ext.RetreatCost,
            description: ext.Description ?? ext.DescriptionText,
          }),
          updatedAt: now,
        },
      });
    if (hasPrices) priced++;
    for (const [variant, v] of Object.entries(variants)) {
      if (v.market == null) continue;
      const lastRows = await db
        .select({ tp: schema.priceHistory.tcgplayerMarket, date: schema.priceHistory.date })
        .from(schema.priceHistory)
        .where(and(eq(schema.priceHistory.cardId, id), eq(schema.priceHistory.variantType, variant)))
        .orderBy(sql`date desc`)
        .limit(1);
      const last = lastRows[0];
      const stale = !last || last.date < shiftDate(date, -6);
      if (stale || last?.tp !== v.market) {
        await db.insert(schema.priceHistory)
          .values({ cardId: id, date, variantType: variant, tcgplayerMarket: v.market, cardmarketAvg: null })
          .onConflictDoUpdate({ target: [schema.priceHistory.cardId, schema.priceHistory.date, schema.priceHistory.variantType], set: { tcgplayerMarket: v.market } });
        history++;
      }
    }
  }
  return { products: products.length, priced, history };
}

function shiftDate(iso: string, days: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function hasTcgcsvData(tcg: string, language?: string): Promise<boolean> {
  const row = await db
    .select({ id: schema.cards.id })
    .from(schema.cards)
    .where(and(eq(schema.cards.tcg, tcg), language ? eq(schema.cards.language, language) : sql`1=1`, sql`id like 'tp:%'`))
    .limit(1);
  return !!row[0];
}

// ── Price history backfill from TCGCSV daily archives ──

const ARCHIVE_BASE = "https://tcgcsv.com/archive/tcgplayer";
const ARCHIVE_START = "2024-02-08";

const backfillInFlight = new Set<string>();
let backfillQueue: Promise<void> = Promise.resolve();

/**
 * Backfill price history for a single tp: card from the TCGCSV daily archives.
 * Downloads ~12 monthly archive snapshots, extracts the card's group prices,
 * and inserts market prices into price_history.
 * Only one backfill runs at a time to protect the 4GB VPS.
 */
export async function backfillCardHistory(cardId: string): Promise<number> {
  if (!cardId.startsWith("tp:")) return 0;
  if (backfillInFlight.has(cardId)) return 0;
  backfillInFlight.add(cardId);

  // Queue behind any running backfill so only one runs at a time
  const result = new Promise<number>((resolve) => {
    backfillQueue = backfillQueue.then(() => doBackfill(cardId).then(resolve).catch(() => resolve(0)));
  });
  return result;
}

async function doBackfill(cardId: string): Promise<number> {

  try {
    const productId = Number(cardId.slice(3));
    if (!Number.isFinite(productId)) return 0;

    const card = await db.select({ metaJson: schema.cards.metaJson, tcg: schema.cards.tcg })
      .from(schema.cards).where(eq(schema.cards.id, cardId)).limit(1);
    if (!card[0]?.metaJson) return 0;

    const meta = JSON.parse(card[0].metaJson);
    const groupId = meta.groupId;
    if (!groupId) return 0;

    const cat = TCGCSV_CATEGORIES.find((c) => c.tcg === card[0].tcg);
    if (!cat) return 0;

    const dates = sampleDates(12);
    let inserted = 0;

    for (const date of dates) {
      try {
        const prices = await fetchArchivePrices(date, cat.id, groupId);
        if (!prices) continue;

        for (const p of prices) {
          if (p.productId !== productId) continue;
          const market = num(p.marketPrice);
          if (market == null) continue;
          const variant = variantKey(p.subTypeName);

          await db.insert(schema.priceHistory)
            .values({ cardId, date, variantType: variant, tcgplayerMarket: market, cardmarketAvg: null })
            .onConflictDoUpdate({
              target: [schema.priceHistory.cardId, schema.priceHistory.date, schema.priceHistory.variantType],
              set: { tcgplayerMarket: market },
            });
          inserted++;
        }
      } catch {
        // skip dates that fail (archive might not exist)
      }
    }
    return inserted;
  } finally {
    backfillInFlight.delete(cardId);
  }
}

/** Generate ~N sample dates spread across the past year + archive start. */
function sampleDates(count: number): string[] {
  const now = new Date();
  const start = new Date(ARCHIVE_START + "T00:00:00Z");
  const oneYearAgo = new Date(now);
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const from = oneYearAgo > start ? oneYearAgo : start;

  const range = now.getTime() - from.getTime();
  const step = range / count;
  const dates: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getTime() + step * i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

const archiveCache = new Map<string, J[] | null>();

/** Download + extract a single group's prices from a daily archive. */
async function fetchArchivePrices(date: string, categoryId: number, groupId: number): Promise<J[] | null> {
  const cacheKey = `${date}:${categoryId}:${groupId}`;
  if (archiveCache.has(cacheKey)) return archiveCache.get(cacheKey) ?? null;

  const tmp = join(tmpdir(), `tcgcsv-${date}-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  const archiveFile = join(tmp, `prices-${date}.ppmd.7z`);

  try {
    const url = `${ARCHIVE_BASE}/prices-${date}.ppmd.7z`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) { archiveCache.set(cacheKey, null); return null; }

    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(archiveFile, buf);

    // Extract only the specific group's price file
    const innerPath = `${date}/${categoryId}/${groupId}/prices`;
    try {
      await execFileAsync("7z", ["e", archiveFile, innerPath, `-o${tmp}`, "-y"], { timeout: 30_000 });
    } catch {
      // 7z might be named 7za on some systems
      await execFileAsync("7za", ["e", archiveFile, innerPath, `-o${tmp}`, "-y"], { timeout: 30_000 });
    }

    const pricesFile = join(tmp, "prices");
    if (!existsSync(pricesFile)) { archiveCache.set(cacheKey, null); return null; }

    const raw = readFileSync(pricesFile, "utf-8").trim();
    // The file is JSON (array of price objects)
    const data = JSON.parse(raw);
    const result = Array.isArray(data) ? data : (data.results ?? []);
    archiveCache.set(cacheKey, result);
    return result;
  } catch {
    archiveCache.set(cacheKey, null);
    return null;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
