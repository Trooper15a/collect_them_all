"use client";

import type { InferenceSession } from "onnxruntime-web";
import type { EmbeddingIndex, Match } from "./matcher";
import { IMAGE_SIZE } from "./preprocess";

export type EngineStatus = "idle" | "loading" | "ready" | "missing" | "error";

export interface ScanEngine {
  status: EngineStatus;
  error?: string;
  index?: EmbeddingIndex;
  embed(input: Float32Array): Promise<Float32Array>;
  match(input: Float32Array, k?: number): Promise<Match[]>;
  backend?: string;
}

const MODEL_URL = "/model/card_embedder.onnx";
const INDEX_URL = "/model/index.json";

let enginePromise: Promise<ScanEngine> | null = null;

/** Lazily load ONNX Runtime Web + the model. Matching is done server-side to save mobile memory. */
export function getScanEngine(): Promise<ScanEngine> {
  if (!enginePromise) enginePromise = load();
  return enginePromise;
}

async function load(): Promise<ScanEngine> {
  const head = await fetch(MODEL_URL, { method: "HEAD" }).catch(() => null);
  if (!head || !head.ok || !(head.headers.get("content-type") ?? "").match(/octet|onnx|protobuf/)) {
    return missing("Model not found. Run the ML pipeline (train.py, embed.py, export.py) to create web/public/model/.");
  }
  try {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = "/ort/";
    ort.env.wasm.numThreads = Math.min(4, navigator.hardwareConcurrency || 2);
    let session: InferenceSession;
    let backend = "wasm";
    try {
      session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "all" });
      backend = "webgpu";
    } catch {
      session = await ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    }
    const index = await fetch(INDEX_URL).then((r) => r.json() as Promise<EmbeddingIndex>);
    const inputName = session.inputNames[0];
    const embed = async (input: Float32Array) => {
      const tensor = new ort.Tensor("float32", input, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
      const out = await session.run({ [inputName]: tensor });
      return out[session.outputNames[0]].data as Float32Array;
    };
    const match = async (input: Float32Array, k = 5): Promise<Match[]> => {
      const embedding = await embed(input);
      const res = await fetch("/api/scan/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embedding: Array.from(embedding), k }),
      });
      if (!res.ok) throw new Error("Match API failed");
      const data = await res.json();
      return data.matches as Match[];
    };
    return { status: "ready", index, backend, embed, match };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err), embed: fail, match: fail };
  }
}

function missing(msg: string): ScanEngine {
  return { status: "missing", error: msg, embed: fail, match: fail };
}
async function fail(): Promise<never> {
  throw new Error("scan engine not ready");
}
