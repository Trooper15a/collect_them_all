import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { IndexCard } from "@/lib/scanner/matcher";
import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

const MODEL_DIR = path.join(process.cwd(), "public", "model");
const INDEX_PATH = path.join(MODEL_DIR, "index.json");
const EMB_PATH = path.join(MODEL_DIR, "embeddings.bin");

interface ServerIndex {
  dim: number;
  count: number;
  cards: IndexCard[];
  vectors: Float32Array;
}

const globalForScan = globalThis as unknown as {
  __scanIndex?: ServerIndex;
  __dbEmbeddings?: { cards: IndexCard[]; vectors: Float32Array; loadedAt: number } | null;
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
    for (let i = 0; i < u16.length; i++) {
      const h = u16[i];
      const s = (h & 0x8000) >> 15;
      const e = (h & 0x7c00) >> 10;
      const f = h & 0x03ff;
      let v: number;
      if (e === 0) v = (f / 1024) * Math.pow(2, -14);
      else if (e === 0x1f) v = f ? NaN : Infinity;
      else v = (1 + f / 1024) * Math.pow(2, e - 15);
      vectors[i] = s ? -v : v;
    }
    globalForScan.__scanIndex = { ...indexData, vectors };
    return globalForScan.__scanIndex;
  } catch {
    return null;
  }
}

const DB_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getDbEmbeddings(dim: number): Promise<{ cards: IndexCard[]; vectors: Float32Array }> {
  const now = Date.now();
  if (globalForScan.__dbEmbeddings && now - globalForScan.__dbEmbeddings.loadedAt < DB_CACHE_TTL) {
    return globalForScan.__dbEmbeddings;
  }

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
    .innerJoin(schema.cards, eq(schema.cardEmbeddings.cardId, schema.cards.id));

  const cards: IndexCard[] = [];
  const allVecs: number[] = [];

  for (const row of rows) {
    const buf = Buffer.from(row.embedding, "base64");
    const u16 = new Uint16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    for (let i = 0; i < u16.length; i++) {
      const h = u16[i];
      const s = (h & 0x8000) >> 15;
      const e = (h & 0x7c00) >> 10;
      const f = h & 0x03ff;
      let v: number;
      if (e === 0) v = (f / 1024) * Math.pow(2, -14);
      else if (e === 0x1f) v = f ? NaN : Infinity;
      else v = (1 + f / 1024) * Math.pow(2, e - 15);
      allVecs.push(s ? -v : v);
    }
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

  const vectors = new Float32Array(allVecs);
  globalForScan.__dbEmbeddings = { cards, vectors, loadedAt: now };
  return { cards, vectors };
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
    const scores: { i: number; s: number; source: "static" | "db" }[] = [];

    // Search static index
    const staticIdx = getStaticIndex();
    if (staticIdx) {
      const { vectors, cards } = staticIdx;
      const n = vectors.length / staticIdx.dim;
      for (let i = 0; i < n; i++) {
        if (tcg && cards[i].tcg !== tcg) continue;
        let s = 0;
        const off = i * staticIdx.dim;
        for (let d = 0; d < staticIdx.dim; d++) s += query[d] * vectors[off + d];
        scores.push({ i, s, source: "static" });
      }
    }

    // Search DB embeddings
    let dbCards: IndexCard[] = [];
    try {
      const dbData = await getDbEmbeddings(dim);
      dbCards = dbData.cards;
      const dbN = dbData.vectors.length / dim;
      console.log(`[scan/match] DB embeddings: ${dbN} cards, dim=${dim}`);

      for (let i = 0; i < dbN; i++) {
        if (tcg && dbCards[i].tcg !== tcg) continue;
        let s = 0;
        const off = i * dim;
        for (let d = 0; d < dim; d++) s += query[d] * dbData.vectors[off + d];
        scores.push({ i, s, source: "db" });
      }

    } catch (e) {
      console.error("[scan/match] DB embeddings lookup failed:", e);
    }

    if (scores.length === 0) {
      return NextResponse.json({ error: "No index available" }, { status: 503 });
    }

    scores.sort((a, b) => b.s - a.s);

    const allCards = (source: "static" | "db", i: number) =>
      source === "static" ? staticIdx!.cards[i] : dbCards[i];

    let best: typeof scores;
    if (lang && scores.length > 0) {
      const sameLang = scores.filter((e) => allCards(e.source, e.i).lang === lang);
      if (sameLang.length > 0 && sameLang[0].s >= scores[0].s - 0.05) {
        best = sameLang.slice(0, k);
      } else {
        best = scores.slice(0, k);
      }
    } else {
      best = scores.slice(0, k);
    }

    const matches = best.map((b) => ({
      card: allCards(b.source, b.i),
      score: b.s,
    }));
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
