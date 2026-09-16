/**
 * Server-side scanner index rebuild: downloads card images, runs ONNX inference,
 * and stores embeddings in the DB so new cards become scannable automatically.
 */
import { db, schema } from "@/db";
import { eq, isNull, sql } from "drizzle-orm";
import sharp from "sharp";
import path from "node:path";

const IMAGE_SIZE = 224;
const EMBED_DIM = 512;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];
const MODEL_PATH = path.join(process.cwd(), "public", "model", "card_embedder.onnx");
const BATCH_SIZE = 20;

let ortSession: Awaited<ReturnType<typeof createSession>> | null = null;

async function createSession() {
  const ort = await import("onnxruntime-node");
  return ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ["cpu"],
  });
}

async function getSession() {
  if (!ortSession) ortSession = await createSession();
  return ortSession;
}

async function downloadAndPreprocess(imageUrl: string): Promise<Float32Array | null> {
  try {
    const res = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(buf)
      .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (info.channels !== 3) return null;
    const n = IMAGE_SIZE * IMAGE_SIZE;
    const out = new Float32Array(3 * n);
    for (let i = 0; i < n; i++) {
      out[i] = (data[i * 3] / 255 - MEAN[0]) / STD[0];
      out[n + i] = (data[i * 3 + 1] / 255 - MEAN[1]) / STD[1];
      out[2 * n + i] = (data[i * 3 + 2] / 255 - MEAN[2]) / STD[2];
    }
    return out;
  } catch {
    return null;
  }
}

function float32ToFloat16(f32: Float32Array): Buffer {
  const buf = Buffer.alloc(f32.length * 2);
  for (let i = 0; i < f32.length; i++) {
    const f = f32[i];
    const view = new DataView(new ArrayBuffer(4));
    view.setFloat32(0, f);
    const bits = view.getUint32(0);
    const sign = (bits >> 16) & 0x8000;
    const exp = ((bits >> 23) & 0xff) - 127 + 15;
    const frac = (bits >> 13) & 0x3ff;
    let h: number;
    if (exp <= 0) h = sign;
    else if (exp >= 31) h = sign | 0x7c00;
    else h = sign | (exp << 10) | frac;
    buf.writeUInt16LE(h, i * 2);
  }
  return buf;
}

async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS card_embeddings (
      card_id TEXT PRIMARY KEY REFERENCES cards(id) ON DELETE CASCADE,
      embedding TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);
}

export async function rebuildScanIndex(): Promise<{ added: number; skipped: number; errors: number }> {
  console.log("[scan-rebuild] checking for cards without embeddings...");
  await ensureTable();

  const cardsWithoutEmbeddings = await db
    .select({
      id: schema.cards.id,
      name: schema.cards.name,
      imageUrl: schema.cards.imageUrl,
      tcg: schema.cards.tcg,
      setCode: schema.cards.setCode,
      setName: schema.cards.setName,
      cardNumber: schema.cards.cardNumber,
      language: schema.cards.language,
    })
    .from(schema.cards)
    .leftJoin(schema.cardEmbeddings, eq(schema.cards.id, schema.cardEmbeddings.cardId))
    .where(isNull(schema.cardEmbeddings.cardId))
    .limit(2000);

  const candidates = cardsWithoutEmbeddings.filter(
    (c) => c.imageUrl && !c.name.toLowerCase().includes("sealed") && !c.name.toLowerCase().includes("booster"),
  );

  if (candidates.length === 0) {
    console.log("[scan-rebuild] no new cards to embed");
    return { added: 0, skipped: 0, errors: 0 };
  }

  console.log(`[scan-rebuild] ${candidates.length} cards to embed (${cardsWithoutEmbeddings.length - candidates.length} skipped — no image or sealed)`);

  const session = await getSession();
  const ort = await import("onnxruntime-node");
  let added = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const results: { cardId: string; embedding: string }[] = [];

    for (const card of batch) {
      try {
        const tensor = await downloadAndPreprocess(card.imageUrl!);
        if (!tensor) {
          errors++;
          continue;
        }

        const input = new ort.Tensor("float32", tensor, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
        const output = await session.run({ image: input });
        const embFloat32 = output.embedding.data as Float32Array;
        const embFloat16 = float32ToFloat16(embFloat32);

        results.push({
          cardId: card.id,
          embedding: embFloat16.toString("base64"),
        });
      } catch (e) {
        console.error(`[scan-rebuild] failed to embed ${card.id}:`, e);
        errors++;
      }
    }

    if (results.length > 0) {
      await db.insert(schema.cardEmbeddings).values(
        results.map((r) => ({ cardId: r.cardId, embedding: r.embedding, createdAt: now })),
      ).onConflictDoNothing();
      added += results.length;
    }

    if (i + BATCH_SIZE < candidates.length) {
      console.log(`[scan-rebuild] progress: ${Math.min(i + BATCH_SIZE, candidates.length)}/${candidates.length}`);
    }
  }

  // Invalidate the cached server index so the match endpoint picks up new embeddings
  const globalForScan = globalThis as unknown as { __scanIndex?: unknown; __scanIndexWithDb?: unknown };
  delete globalForScan.__scanIndex;
  delete globalForScan.__scanIndexWithDb;

  console.log(`[scan-rebuild] done: ${added} added, ${errors} errors, ${cardsWithoutEmbeddings.length - candidates.length} skipped`);
  return { added, skipped: cardsWithoutEmbeddings.length - candidates.length, errors };
}
