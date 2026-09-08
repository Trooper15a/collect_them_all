import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import type { IndexCard } from "@/lib/scanner/matcher";

const MODEL_DIR = path.join(process.cwd(), "public", "model");
const INDEX_PATH = path.join(MODEL_DIR, "index.json");
const EMB_PATH = path.join(MODEL_DIR, "embeddings.bin");

interface ServerIndex {
  dim: number;
  count: number;
  cards: IndexCard[];
  vectors: Float32Array;
}

const globalForScan = globalThis as unknown as { __scanIndex?: ServerIndex };

function getIndex(): ServerIndex | null {
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

export async function POST(req: NextRequest) {
  try {
    const { embedding, k = 5 } = (await req.json()) as {
      embedding: number[];
      k?: number;
    };
    if (!Array.isArray(embedding) || embedding.length === 0) {
      return NextResponse.json({ error: "Missing embedding" }, { status: 400 });
    }
    const idx = getIndex();
    if (!idx) {
      return NextResponse.json({ error: "Model not loaded" }, { status: 503 });
    }
    const query = new Float32Array(embedding);
    const { vectors, dim, cards } = idx;
    const n = vectors.length / dim;
    const best: { i: number; s: number }[] = [];
    for (let i = 0; i < n; i++) {
      let s = 0;
      const off = i * dim;
      for (let d = 0; d < dim; d++) s += query[d] * vectors[off + d];
      if (best.length < k) {
        best.push({ i, s });
        best.sort((a, b) => b.s - a.s);
      } else if (s > best[k - 1].s) {
        best[k - 1] = { i, s };
        best.sort((a, b) => b.s - a.s);
      }
    }
    const matches = best.map((b) => ({ card: cards[b.i], score: b.s }));
    return NextResponse.json({ matches });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
