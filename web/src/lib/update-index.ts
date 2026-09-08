/**
 * Node.js replacement for ml/update_index.py
 *
 * Downloads new card images from TCGCSV API, computes embeddings using the
 * ONNX model (via onnxruntime-node), and appends them to the scanner index.
 *
 * Runs entirely in Node.js — no Python dependency.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMAGE_SIZE = 224;
const EMBED_DIM = 512;
const MODEL_VERSION = "effb0-v1";

/** ImageNet normalisation constants (must match ml/model.py). */
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

const TCGCSV_BASE = "https://tcgcsv.com/tcgplayer";

/** Maps TCG id -> TCGCSV category id(s). */
const TCGCSV_CATEGORIES: Record<string, number[]> = {
  pokemon: [3, 85],
  mtg: [1],
  yugioh: [2],
  onepiece: [68],
  lorcana: [71],
  digimon: [63],
  dbs: [27],
  dbfw: [80],
  fab: [62],
  swu: [79],
  vanguard: [16],
  weiss: [20],
  finalfantasy: [24],
};

/** Category IDs that are Japanese. Everything else defaults to "eng". */
const CATEGORY_LANG: Record<number, string> = { 85: "jap" };

const MODEL_DIR = path.join(process.cwd(), "public", "model");
const INDEX_PATH = path.join(MODEL_DIR, "index.json");
const EMB_PATH = path.join(MODEL_DIR, "embeddings.bin");
const ONNX_PATH = path.join(MODEL_DIR, "card_embedder.onnx");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IndexCard {
  id: string;
  name: string | null;
  set: string | null;
  setName?: string | null;
  num: string | null;
  tcg: string | null;
  lang: string | null;
  src?: string | null;
  img?: string | null;
}

interface IndexFile {
  model_version: string;
  dim: number;
  count: number;
  cards: IndexCard[];
}

interface NewCardJob {
  card: IndexCard;
  imageUrl: string;
}

export interface UpdateStatus {
  running: boolean;
  phase: string;
  progress: string;
  newCards: number;
  error?: string;
  finishedAt?: string;
}

// ---------------------------------------------------------------------------
// Module state (singleton, guarded by `running`)
// ---------------------------------------------------------------------------

let status: UpdateStatus = {
  running: false,
  phase: "idle",
  progress: "",
  newCards: 0,
};

export function getStatus(): UpdateStatus {
  return { ...status };
}

// ---------------------------------------------------------------------------
// Float16 conversion (float32 -> float16 for embeddings.bin)
// ---------------------------------------------------------------------------

function float32ToFloat16(value: number): number {
  // Use a DataView round-trip to get the IEEE-754 bits
  const buf = new ArrayBuffer(4);
  const view = new DataView(buf);
  view.setFloat32(0, value, true);
  const bits = view.getUint32(0, true);

  const sign = (bits >> 31) & 1;
  let exp = (bits >> 23) & 0xff;
  let frac = bits & 0x7fffff;

  if (exp === 0xff) {
    // Inf / NaN
    return (sign << 15) | 0x7c00 | (frac ? 0x0200 : 0);
  }

  // Re-bias exponent from float32 bias (127) to float16 bias (15)
  exp = exp - 127 + 15;

  if (exp >= 0x1f) {
    // Overflow -> Inf
    return (sign << 15) | 0x7c00;
  }
  if (exp <= 0) {
    // Subnormal or zero
    if (exp < -10) return sign << 15; // too small
    frac = (frac | 0x800000) >> (1 - exp);
    return (sign << 15) | (frac >> 13);
  }

  return (sign << 15) | (exp << 10) | (frac >> 13);
}

function float32ArrayToFloat16Buffer(arr: Float32Array): Buffer {
  const u16 = new Uint16Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    u16[i] = float32ToFloat16(arr[i]);
  }
  return Buffer.from(u16.buffer);
}

// ---------------------------------------------------------------------------
// Image preprocessing (matches ml/dataset.py + preprocess.ts)
// ---------------------------------------------------------------------------

async function preprocessImage(imageBuffer: Buffer): Promise<Float32Array> {
  // Resize to 224x224, get raw RGB pixels (no alpha)
  const { data, info } = await sharp(imageBuffer)
    .resize(IMAGE_SIZE, IMAGE_SIZE, { fit: "fill" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 3) {
    throw new Error(`Expected 3 channels, got ${info.channels}`);
  }

  const n = IMAGE_SIZE * IMAGE_SIZE;
  const out = new Float32Array(3 * n);

  // Convert to CHW layout with ImageNet normalisation (same as preprocess.ts)
  for (let i = 0; i < n; i++) {
    out[i] = (data[i * 3] / 255 - MEAN[0]) / STD[0]; // R
    out[n + i] = (data[i * 3 + 1] / 255 - MEAN[1]) / STD[1]; // G
    out[2 * n + i] = (data[i * 3 + 2] / 255 - MEAN[2]) / STD[2]; // B
  }
  return out;
}

// ---------------------------------------------------------------------------
// ONNX inference
// ---------------------------------------------------------------------------

async function createSession() {
  // Dynamic import so this module can be imported without onnxruntime-node
  // being resolved at compile time (Next.js bundles would choke otherwise).
  const ort = await import("onnxruntime-node");
  const session = await ort.InferenceSession.create(ONNX_PATH, {
    executionProviders: ["cpu"],
    graphOptimizationLevel: "all",
  });
  return { ort, session };
}

async function computeEmbedding(
  ort: typeof import("onnxruntime-node"),
  session: import("onnxruntime-node").InferenceSession,
  input: Float32Array,
): Promise<Float32Array> {
  const tensor = new ort.Tensor("float32", input, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
  const inputName = session.inputNames[0];
  const results = await session.run({ [inputName]: tensor });
  const output = results[session.outputNames[0]];
  return new Float32Array(output.data as Float32Array);
}

// ---------------------------------------------------------------------------
// TCGCSV API fetching
// ---------------------------------------------------------------------------

async function fetchJson(url: string, retries = 3): Promise<unknown> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "collectr/0.1 (index-updater)",
          Accept: "application/json",
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries - 1) throw err;
      // Back off before retry
      await sleep(1000 * (attempt + 1));
    }
  }
  throw new Error("unreachable");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) collectr/0.1",
        Accept: "image/*",
      },
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

interface TcgcsvProduct {
  productId: number;
  name: string;
  imageUrl?: string;
  extendedData?: Array<{ name: string; value: string }>;
}

interface TcgcsvGroup {
  groupId: number;
  abbreviation?: string;
  name?: string;
}

/**
 * Fetch all new cards from TCGCSV API for the specified TCGs.
 */
async function fetchNewCards(
  existingIds: Set<string>,
  tcgs: string[],
): Promise<NewCardJob[]> {
  const jobs: NewCardJob[] = [];

  for (const tcg of tcgs) {
    const catIds = TCGCSV_CATEGORIES[tcg];
    if (!catIds) continue;

    for (const catId of catIds) {
      const lang = CATEGORY_LANG[catId] || "eng";
      status.progress = `Fetching groups for ${tcg} (cat ${catId})...`;

      let groups: TcgcsvGroup[];
      try {
        const data = (await fetchJson(
          `${TCGCSV_BASE}/${catId}/groups`,
        )) as { results: TcgcsvGroup[] };
        groups = data.results || [];
      } catch (err) {
        console.error(`[update-index] groups for ${tcg}/${catId} failed:`, err);
        continue;
      }

      for (let gi = 0; gi < groups.length; gi++) {
        const group = groups[gi];
        const gid = group.groupId;
        const setCode = String(group.abbreviation || gid);
        const setName = group.name || "";

        if ((gi + 1) % 20 === 0) {
          status.progress = `${tcg}: group ${gi + 1}/${groups.length} (${jobs.length} new so far)`;
        }

        let products: TcgcsvProduct[];
        try {
          const data = (await fetchJson(
            `${TCGCSV_BASE}/${catId}/${gid}/products`,
          )) as { results: TcgcsvProduct[] };
          products = data.results || [];
        } catch {
          continue;
        }

        // Small delay between groups to be polite
        await sleep(50);

        for (const p of products) {
          if (!p.imageUrl) continue;
          const extMap: Record<string, string> = {};
          for (const e of p.extendedData || []) {
            extMap[e.name] = e.value;
          }
          const number = extMap["Number"];
          if (!number) continue;

          const pid = String(p.productId);
          const cardId = `tp:${pid}`;
          if (existingIds.has(cardId)) continue;

          existingIds.add(cardId);
          jobs.push({
            card: {
              id: cardId,
              name: p.name,
              set: setCode,
              setName,
              num: number,
              tcg,
              lang,
              src: pid,
              img: p.imageUrl.replace("_200w.jpg", "_in_1000x1000.jpg"),
            },
            // Use 400w for downloading (faster, still good quality for 224x224)
            imageUrl: p.imageUrl.replace("_200w.jpg", "_400w.jpg"),
          });
        }
      }
    }
  }

  return jobs;
}

// ---------------------------------------------------------------------------
// Main update pipeline
// ---------------------------------------------------------------------------

export async function runUpdate(
  tcgs?: string[],
): Promise<void> {
  if (status.running) {
    throw new Error("Update already in progress");
  }

  status = {
    running: true,
    phase: "starting",
    progress: "",
    newCards: 0,
  };

  try {
    // 1. Load existing index
    status.phase = "loading-index";
    status.progress = "Loading existing index...";

    let existingCards: IndexCard[] = [];
    let existingEmbBytes: Buffer | null = null;

    if (fs.existsSync(INDEX_PATH) && fs.existsSync(EMB_PATH)) {
      const indexData = JSON.parse(
        fs.readFileSync(INDEX_PATH, "utf8"),
      ) as IndexFile;
      if (indexData.model_version === MODEL_VERSION) {
        existingCards = indexData.cards;
        existingEmbBytes = fs.readFileSync(EMB_PATH);
      }
    }

    const existingIds = new Set(existingCards.map((c) => c.id));
    status.progress = `${existingIds.size} cards already in index`;
    console.log(`[update-index] ${existingIds.size} existing cards`);

    // 2. Fetch new cards from TCGCSV
    status.phase = "fetching";
    const targetTcgs = tcgs ?? Object.keys(TCGCSV_CATEGORIES);
    const newJobs = await fetchNewCards(existingIds, targetTcgs);

    if (newJobs.length === 0) {
      status.phase = "done";
      status.progress = "No new cards found — index is up to date";
      status.running = false;
      status.finishedAt = new Date().toISOString();
      console.log("[update-index] no new cards found");
      return;
    }

    console.log(`[update-index] ${newJobs.length} new cards to process`);
    status.progress = `${newJobs.length} new cards found`;

    // 3. Load ONNX model
    status.phase = "loading-model";
    status.progress = "Loading ONNX model...";

    if (!fs.existsSync(ONNX_PATH)) {
      throw new Error(`ONNX model not found at ${ONNX_PATH}`);
    }

    const { ort, session } = await createSession();
    console.log("[update-index] ONNX model loaded");

    // 4. Process new cards: download image -> preprocess -> embed
    status.phase = "embedding";
    const newCards: IndexCard[] = [];
    const newEmbeddings: Float32Array[] = [];
    let processed = 0;
    let failed = 0;

    // Process in batches to limit concurrent downloads
    const BATCH_SIZE = 10;
    for (let i = 0; i < newJobs.length; i += BATCH_SIZE) {
      const batch = newJobs.slice(i, i + BATCH_SIZE);

      // Download images in parallel
      const imageResults = await Promise.all(
        batch.map(async (job) => {
          const buf = await fetchImageBuffer(job.imageUrl);
          return { job, buf };
        }),
      );

      // Process each image sequentially (ONNX session is single-threaded anyway)
      for (const { job, buf } of imageResults) {
        if (!buf) {
          failed++;
          continue;
        }

        try {
          const input = await preprocessImage(buf);
          const embedding = await computeEmbedding(ort, session, input);

          // L2-normalise the embedding (the model may or may not do this)
          let norm = 0;
          for (let d = 0; d < EMBED_DIM; d++) norm += embedding[d] * embedding[d];
          norm = Math.sqrt(norm);
          if (norm > 0) {
            for (let d = 0; d < EMBED_DIM; d++) embedding[d] /= norm;
          }

          newCards.push(job.card);
          newEmbeddings.push(embedding);
        } catch (err) {
          console.error(
            `[update-index] failed to process ${job.card.id}:`,
            err,
          );
          failed++;
        }
      }

      processed += batch.length;
      status.progress = `${processed}/${newJobs.length} processed (${failed} failed)`;
      status.newCards = newCards.length;
    }

    if (newCards.length === 0) {
      status.phase = "done";
      status.progress = "All image downloads failed — nothing to add";
      status.running = false;
      status.finishedAt = new Date().toISOString();
      return;
    }

    // 5. Merge embeddings into float16 binary
    status.phase = "saving";
    status.progress = `Saving ${newCards.length} new embeddings...`;

    // Convert new embeddings to float16
    const newEmbFlat = new Float32Array(newCards.length * EMBED_DIM);
    for (let i = 0; i < newCards.length; i++) {
      newEmbFlat.set(newEmbeddings[i], i * EMBED_DIM);
    }
    const newF16Buf = float32ArrayToFloat16Buffer(newEmbFlat);

    // Append to existing embeddings
    if (existingEmbBytes && existingEmbBytes.length > 0) {
      const combined = Buffer.concat([existingEmbBytes, newF16Buf]);
      fs.writeFileSync(EMB_PATH, combined);
    } else {
      fs.writeFileSync(EMB_PATH, newF16Buf);
    }

    // 6. Update index.json
    const allCards = [...existingCards, ...newCards];
    const indexData: IndexFile = {
      model_version: MODEL_VERSION,
      dim: EMBED_DIM,
      count: allCards.length,
      cards: allCards,
    };
    fs.writeFileSync(INDEX_PATH, JSON.stringify(indexData), "utf8");

    // Invalidate cached scan index so the match API picks up new data
    const globalForScan = globalThis as unknown as { __scanIndex?: unknown };
    delete globalForScan.__scanIndex;

    status.phase = "done";
    status.progress = `Index updated: ${existingCards.length} -> ${allCards.length} cards (+${newCards.length}, ${failed} failed)`;
    status.newCards = newCards.length;
    status.finishedAt = new Date().toISOString();
    console.log(`[update-index] ${status.progress}`);
  } catch (err) {
    status.phase = "error";
    status.error =
      err instanceof Error ? err.message : String(err);
    status.progress = "";
    status.finishedAt = new Date().toISOString();
    console.error("[update-index] fatal error:", err);
  } finally {
    status.running = false;
  }
}
