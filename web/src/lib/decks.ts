import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/* ─── Limitless TCG (Pokemon tournaments) ─── */

const LIMITLESS_BASE = "https://play.limitlesstcg.com/api";

interface LimitlessTournament {
  id: string;
  name: string;
  date: string;
  players: number;
  format?: string;
}

interface LimitlessStanding {
  player: string;
  name: string;
  placing: number;
  record: { wins: number; losses: number; ties: number };
  decklist: { name: string; count: number; set?: string; number?: string }[] | null;
  deck?: { id: string; name: string } | null;
}

export async function fetchLimitlessTournaments(limit = 20): Promise<LimitlessTournament[]> {
  const res = await fetch(`${LIMITLESS_BASE}/tournaments?game=PTCG&limit=${limit}&format=standard`);
  if (!res.ok) throw new Error(`Limitless API error: ${res.status}`);
  return res.json();
}

export async function fetchLimitlessStandings(tournamentId: string, topN = 8): Promise<LimitlessStanding[]> {
  const res = await fetch(`${LIMITLESS_BASE}/tournaments/${tournamentId}/standings`);
  if (!res.ok) throw new Error(`Limitless standings error: ${res.status}`);
  const all: LimitlessStanding[] = await res.json();
  return all.filter((s) => s.decklist && s.decklist.length > 0).slice(0, topN);
}

export interface DeckEntry {
  cardName: string;
  quantity: number;
  setCode: string | null;
  cardNumber: string | null;
  section: string;
}

export function limitlessToDeckEntries(standing: LimitlessStanding): DeckEntry[] {
  if (!standing.decklist) return [];
  return standing.decklist.map((c) => ({
    cardName: c.name,
    quantity: c.count,
    setCode: c.set ?? null,
    cardNumber: c.number ?? null,
    section: "main",
  }));
}

/* ─── YDK parser (Yu-Gi-Oh) ─── */

export function parseYDK(text: string): { main: number[]; extra: number[]; side: number[] } {
  const result = { main: [] as number[], extra: [] as number[], side: [] as number[] };
  let current: number[] = result.main;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#created") || line.startsWith("//")) continue;
    if (line === "#main") { current = result.main; continue; }
    if (line === "#extra") { current = result.extra; continue; }
    if (line === "!side" || line === "#side") { current = result.side; continue; }
    const id = parseInt(line, 10);
    if (Number.isFinite(id) && id > 0) current.push(id);
  }
  return result;
}

export async function ydkToDeckEntries(text: string): Promise<DeckEntry[]> {
  const parsed = parseYDK(text);
  const allIds = [...new Set([...parsed.main, ...parsed.extra, ...parsed.side])];
  if (allIds.length === 0) return [];

  const nameMap = new Map<number, string>();
  const rows = await db
    .select({ sourceId: schema.cards.sourceId, name: schema.cards.name })
    .from(schema.cards)
    .where(and(eq(schema.cards.tcg, "yugioh"), inArray(schema.cards.sourceId, allIds.map(String))));
  for (const r of rows) nameMap.set(Number(r.sourceId), r.name);

  const entries: DeckEntry[] = [];
  function addSection(ids: number[], section: string) {
    const counts = new Map<number, number>();
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const [id, qty] of counts) {
      entries.push({
        cardName: nameMap.get(id) ?? `YGO #${id}`,
        quantity: qty,
        setCode: null,
        cardNumber: String(id),
        section,
      });
    }
  }
  addSection(parsed.main, "main");
  addSection(parsed.extra, "extra");
  addSection(parsed.side, "side");
  return entries;
}

/* ─── Save deck to DB ─── */

export interface SaveDeckInput {
  userId: string | null;
  tcg: string;
  name: string;
  source: string;
  sourceUrl?: string;
  format?: string;
  author?: string;
  placing?: number;
  tournamentName?: string;
  entries: DeckEntry[];
}

export async function saveDeck(input: SaveDeckInput) {
  const now = new Date().toISOString();
  const [deck] = await db.insert(schema.decks).values({
    userId: input.userId,
    tcg: input.tcg,
    name: input.name,
    source: input.source,
    sourceUrl: input.sourceUrl ?? null,
    format: input.format ?? null,
    author: input.author ?? null,
    placing: input.placing ?? null,
    tournamentName: input.tournamentName ?? null,
    createdAt: now,
  }).returning();

  if (input.entries.length > 0) {
    const resolved = await resolveCards(input.entries, input.tcg);
    await db.insert(schema.deckCards).values(
      resolved.map((e) => ({
        deckId: deck.id,
        cardId: e.cardId,
        cardName: e.cardName,
        setCode: e.setCode,
        cardNumber: e.cardNumber,
        quantity: e.quantity,
        section: e.section,
      })),
    );
  }
  return deck;
}

/* ─── Resolve deck entries to card IDs in our DB ─── */

interface ResolvedEntry extends DeckEntry {
  cardId: string | null;
}

async function resolveCards(entries: DeckEntry[], tcg: string): Promise<ResolvedEntry[]> {
  const names = [...new Set(entries.map((e) => e.cardName.toLowerCase()))];
  const rows = await db
    .select({ id: schema.cards.id, name: schema.cards.name, setCode: schema.cards.setCode, cardNumber: schema.cards.cardNumber })
    .from(schema.cards)
    .where(and(
      eq(schema.cards.tcg, tcg),
      sql`lower(${schema.cards.name}) IN ${sql.raw(`(${names.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")})`)}`,
      sql`${schema.cards.id} LIKE 'tp:%'`,
    ));

  const cardMap = new Map<string, { id: string; setCode: string | null; cardNumber: string | null }>();
  for (const r of rows) {
    const key = r.name.toLowerCase();
    const existing = cardMap.get(key);
    if (!existing) cardMap.set(key, { id: r.id, setCode: r.setCode, cardNumber: r.cardNumber });
  }

  return entries.map((e) => {
    const match = cardMap.get(e.cardName.toLowerCase());
    return { ...e, cardId: match?.id ?? null };
  });
}

/* ─── Check deck ownership against portfolio ─── */

export interface DeckOwnership {
  cardName: string;
  cardId: string | null;
  quantity: number;
  owned: number;
  section: string;
  setCode: string | null;
  cardNumber: string | null;
  imageUrl: string | null;
  price: number | null;
}

export async function checkDeckOwnership(deckId: number): Promise<{ cards: DeckOwnership[]; owned: number; total: number; missingCost: number }> {
  const deckCardRows = await db
    .select()
    .from(schema.deckCards)
    .where(eq(schema.deckCards.deckId, deckId));

  const cardIds = deckCardRows.map((dc) => dc.cardId).filter((id): id is string => id !== null);
  const ownedMap = new Map<string, number>();
  const imageMap = new Map<string, string | null>();
  const priceMap = new Map<string, number | null>();

  if (cardIds.length > 0) {
    const items = await db
      .select({ cardId: schema.portfolioItems.cardId, qty: schema.portfolioItems.quantity })
      .from(schema.portfolioItems)
      .where(inArray(schema.portfolioItems.cardId, cardIds));
    for (const it of items) ownedMap.set(it.cardId, (ownedMap.get(it.cardId) ?? 0) + it.qty);

    const cardRows = await db
      .select({ id: schema.cards.id, imageUrl: schema.cards.imageUrl, pricesJson: schema.cards.pricesJson })
      .from(schema.cards)
      .where(inArray(schema.cards.id, cardIds));
    for (const c of cardRows) {
      imageMap.set(c.id, c.imageUrl);
      try {
        const prices = c.pricesJson ? JSON.parse(c.pricesJson) : null;
        const tp = prices?.tcgplayer ?? prices?.cardmarket;
        if (tp) {
          const variants = tp.variants ?? {};
          const first = Object.values(variants)[0] as Record<string, number | null> | undefined;
          priceMap.set(c.id, first?.market ?? first?.mid ?? first?.low ?? null);
        }
      } catch { /* ignore */ }
    }
  }

  let totalCards = 0;
  let ownedCount = 0;
  let missingCost = 0;

  const cards: DeckOwnership[] = deckCardRows.map((dc) => {
    const owned = dc.cardId ? (ownedMap.get(dc.cardId) ?? 0) : 0;
    const ownedQty = Math.min(owned, dc.quantity);
    totalCards += dc.quantity;
    ownedCount += ownedQty;
    const price = dc.cardId ? (priceMap.get(dc.cardId) ?? null) : null;
    if (ownedQty < dc.quantity && price != null) missingCost += price * (dc.quantity - ownedQty);
    return {
      cardName: dc.cardName,
      cardId: dc.cardId,
      quantity: dc.quantity,
      owned: ownedQty,
      section: dc.section,
      setCode: dc.setCode,
      cardNumber: dc.cardNumber,
      imageUrl: dc.cardId ? (imageMap.get(dc.cardId) ?? null) : null,
      price,
    };
  });

  return { cards, owned: ownedCount, total: totalCards, missingCost };
}
