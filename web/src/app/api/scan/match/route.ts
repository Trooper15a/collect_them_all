import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { IndexCard } from "@/lib/scanner/matcher";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";
import { insertTopMatch, selectPreferredMatches } from "@/lib/scanner/top-matches";

const MODEL_DIR = path.join(process.cwd(), "public", "model");
const INDEX_PATH = path.join(MODEL_DIR, "index.json");
const EMB_PATH = path.join(MODEL_DIR, "embeddings.bin");

interface ServerIndex {
  dim: number;
  count: number;
  cards: IndexCard[];
  vectors: Float32Array;
}

interface DbIndex {
  cards: IndexCard[];
  vectors: Float32Array;
  loadedAt: number;
}

const halfToFloat = new Float32Array(65536);
for (let h = 0; h < halfToFloat.length; h++) {
  const sign = h & 0x8000 ? -1 : 1;
  const exponent = (h & 0x7c00) >> 10;
  const fraction = h & 0x03ff;
  halfToFloat[h] = sign * (exponent === 0
    ? (fraction / 1024) * 2 ** -14
    : exponent === 0x1f ? (fraction ? NaN : Infinity)
    : (1 + fraction / 1024) * 2 ** (exponent - 15));
}

const globalForScan = globalThis as unknown as {
  __scanIndex?: ServerIndex;
  __dbEmbeddingsByKey?: Map<string, DbIndex>;
  __dbEmbeddingsPendingByKey?: Map<string, Promise<DbIndex>>;
};

function getStaticIndex(): ServerIndex | null {
  if (globalForScan.__scanIndex) return globalForScan.__scanIndex;
  try {
    const indexData = JSON.parse(fs.readFileSync(INDEX_PATH, "utf8")) as {
      dim: number;
      count: number;
      cards: IndexCard[];
    };
    const embBuf = fs.readFileSync(EMB_PATH);
    const u16 = new Uint16Array(embBuf.buffer, embBuf.byteOffset, embBuf.byteLength / 2);
    const vectors = new Float32Array(u16.length);
    for (let i = 0; i < u16.length; i++) vectors[i] = halfToFloat[u16[i]];
    globalForScan.__scanIndex = { ...indexData, vectors };
    return globalForScan.__scanIndex;
  } catch {
    return null;
  }
}

const DB_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function loadDbEmbeddings(dim: number, tcg?: string): Promise<DbIndex> {
  const rows = await db
    .select({
      cardId: schema.cardEmbeddings.cardId,
      embedding: schema.cardEmbeddings.embedding,
      name: schema.cards.name,
      setCode: schema.cards.setCode,
      setName: schema.cards.setName,
      cardNumber: schema.cards.cardNumber,
      tcg: schema.cards.tcg,
      language: schema.cards.language,
    })
    .from(schema.cardEmbeddings)
    .innerJoin(schema.cards, eq(schema.cardEmbeddings.cardId, schema.cards.id))
    .where(tcg ? eq(schema.cards.tcg, tcg) : undefined);

  const cards: IndexCard[] = [];
  const vectors = new Float32Array(rows.length * dim);

  for (const row of rows) {
    const buf = Buffer.from(row.embedding, "base64");
    if (buf.byteLength !== dim * 2) continue;
    const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    const offset = cards.length * dim;
    for (let i = 0; i < dim; i++) vectors[offset + i] = halfToFloat[u16[i]];
    cards.push({
      id: row.cardId,
      name: row.name,
      set: row.setCode ?? undefined,
      setName: row.setName ?? undefined,
      num: row.cardNumber ?? undefined,
      tcg: row.tcg,
      lang: row.language,
    } as IndexCard);
  }

  console.log(`[scan/match] loaded ${cards.length} ${tcg ?? "all"} embeddings`);
  return { cards, vectors: vectors.subarray(0, cards.length * dim), loadedAt: Date.now() };
}

async function getDbEmbeddings(dim: number, tcg?: string): Promise<DbIndex> {
  const key = `${tcg ?? "all"}:${dim}`;
  const cache = globalForScan.__dbEmbeddingsByKey ??= new Map();
  const pending = globalForScan.__dbEmbeddingsPendingByKey ??= new Map();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.loadedAt < DB_CACHE_TTL) return cached;
  let loading = pending.get(key);
  if (!loading) {
    loading = loadDbEmbeddings(dim, tcg)
      .then((data) => { cache.set(key, data); return data; })
      .finally(() => { pending.delete(key); });
    pending.set(key, loading);
  }
  // A cached index stays usable while its replacement loads in the background.
  if (cached) {
    void loading.catch((error: unknown) => console.error("[scan/match] index refresh failed:", error));
    return cached;
  }
  return loading;
}

export async function POST(req: NextRequest) {
  try {
    const { embedding, k = 5, tcg, lang } = (await req.json()) as {
      embedding: number[];
      k?: number;
      tcg?: string;
      lang?: string;
    };
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ error: "Missing embedding" }, { status: 400 });
    }

    const query = new Float32Array(embedding);
    const dim = query.length;
    const limit = Math.max(1, Math.min(Number(k) || 5, 20));
    const best: { card: IndexCard; score: number }[] = [];
    const preferred: { card: IndexCard; score: number }[] = [];

    const offer = (card: IndexCard, score: number) => {
      insertTopMatch(best, { card, score }, limit);
      if (lang && card.lang === lang) insertTopMatch(preferred, { card, score }, limit);
    };

    // Search static index
    const staticIdx = getStaticIndex();
    if (staticIdx) {
      const { vectors, cards } = staticIdx;
      if (staticIdx.dim !== dim) {
        return NextResponse.json({ error: "Embedding dimensions do not match the scanner index" }, { status: 400 });
      }
      const n = vectors.length / staticIdx.dim;
      for (let i = 0; i < n; i++) {
        if (tcg && cards[i].tcg !== tcg) continue;
        let s = 0;
        const off = i * staticIdx.dim;
        for (let d = 0; d < staticIdx.dim; d++) s += query[d] * vectors[off + d];
        offer(cards[i], s);
      }
    }

    // Search DB embeddings
    let dbCards: IndexCard[] = [];
    try {
      const dbData = await getDbEmbeddings(dim, tcg);
      dbCards = dbData.cards;
      const dbN = dbData.vectors.length / dim;

      for (let i = 0; i < dbN; i++) {
        if (tcg && dbCards[i].tcg !== tcg) continue;
        let s = 0;
        const off = i * dim;
        for (let d = 0; d < dim; d++) s += query[d] * dbData.vectors[off + d];
        offer(dbCards[i], s);
      }

    } catch (e) {
      console.error("[scan/match] DB embeddings lookup failed:", e);
    }

    if (best.length === 0) {
      return NextResponse.json({ error: "No index available" }, { status: 503 });
    }
    const matches = lang ? selectPreferredMatches(best, preferred) : best;
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
