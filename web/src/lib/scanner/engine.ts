"use client";

import type { InferenceSession } from "onnxruntime-web";
import type { Match } from "./matcher";
import { IMAGE_SIZE } from "./preprocess";
import { createScanTask } from "./task";

export type EngineStatus = "idle" | "loading" | "ready" | "missing" | "error";

export interface ScanEngine {
  status: EngineStatus;
  error?: string;
  embed(input: Float32Array): Promise<Float32Array>;
  match(input: Float32Array, k?: number, tcg?: string, lang?: string): Promise<Match[]>;
  backend?: string;
}

const MODEL_URL = "/model/card_embedder.onnx";

let enginePromise: Promise<ScanEngine> | null = null;

/** Lazily load ONNX Runtime Web + the model. Matching is done server-side to save mobile memory. */
export function getScanEngine(): Promise<ScanEngine> {
  if (!enginePromise) {
    enginePromise = load().then((engine) => {
      if (engine.status !== "ready") enginePromise = null;
      return engine;
    });
  }
  return enginePromise;
}

async function load(): Promise<ScanEngine> {
  try {
    const head = await fetch(MODEL_URL, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    if (!head.ok || !(head.headers.get("content-type") ?? "").match(/octet|onnx|protobuf/)) {
      return missing("The scanner model is unavailable. Please try again later.");
    }
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
    const inputName = session.inputNames[0];
    const embed = async (input: Float32Array) => {
      const tensor = new ort.Tensor("float32", input, [1, 3, IMAGE_SIZE, IMAGE_SIZE]);
      const out = await session.run({ [inputName]: tensor });
      return out[session.outputNames[0]].data as Float32Array;
    };
    const match = createScanTask(async (input: Float32Array, k = 5, tcg?: string, lang?: string): Promise<Match[]> => {
      const embedding = await embed(input);
      const body = JSON.stringify({ embedding: Array.from(embedding), k, tcg, lang });
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch("/api/scan/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            // The first request also loads the server's embedding index.
            // The enclosing scan task still bounds total waiting to 15 seconds.
            signal: AbortSignal.timeout(8000),
          });
          if (!res.ok) throw new Error(res.status === 503
            ? "Card matching is temporarily unavailable. Please try again shortly."
            : "Couldn't identify the card. Please try again.");
          const data = await res.json();
          return data.matches as Match[];
        } catch (err) {
          lastErr = err;
        }
      }
      throw lastErr instanceof Error && lastErr.name !== "TimeoutError" && lastErr.name !== "TypeError"
        ? lastErr : new Error("Couldn't reach card matching. Check your connection and try again.");
    });
    return { status: "ready", backend, embed, match };
  } catch {
    return { status: "error", error: "Couldn't load the scanner model. Check your connection and retry.", embed: fail, match: fail };
  }
}

function missing(msg: string): ScanEngine {
  return { status: "missing", error: msg, embed: fail, match: fail };
}
async function fail(): Promise<never> {
  throw new Error("scan engine not ready");
}
