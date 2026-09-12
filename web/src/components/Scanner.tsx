"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getScanEngine, type ScanEngine } from "@/lib/scanner/engine";
import type { Match } from "@/lib/scanner/matcher";
import { cardGuide, isSharp, preprocess } from "@/lib/scanner/preprocess";
import { haptic } from "@/lib/haptics";
import { useActiveTcg } from "@/lib/ui-prefs";
import { showToast } from "./Toast";
import { Button } from "./ui";

/** Map an ML index card id (pw:/sf:/ygo:) straight to the app's card id: they use the same scheme. */
export function Scanner({ onMatches, onClose, bulkMode, bulkCount, lang }: { onMatches: (m: Match[]) => void; onClose: () => void; bulkMode?: boolean; bulkCount?: number; lang?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<ScanEngine | null>(null);
  const activeTcg = useActiveTcg();
  const [camError, setCamError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [live, setLive] = useState<Match[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const streakRef = useRef<{ id: string; count: number }>({ id: "", count: 0 });
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [blurry, setBlurry] = useState(false);
  const scanInFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    getScanEngine().then((e) => !cancelled && setEngine(e));
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 1280 },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ...(({ focusMode: { ideal: "continuous" } }) as any),
          },
          audio: false,
        });
        if (cancelled) return stream.getTracks().forEach((t) => t.stop());
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const caps = track.getCapabilities?.() as any;
        if (caps?.torch) setHasTorch(true);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (e) {
        setCamError(e instanceof Error ? e.message : "Camera unavailable. Use HTTPS (npm run dev:https) and allow camera access.");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    track.applyConstraints({ advanced: [{ torch: next } as any] }).catch(() => {});
    setTorch(next);
  }

  const scanOnce = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !engine || engine.status !== "ready" || v.videoWidth === 0) return null;
    if (scanInFlight.current) return null;
    const guide = cardGuide(v.videoWidth, v.videoHeight);
    if (!blurCanvasRef.current) blurCanvasRef.current = document.createElement("canvas");
    if (!isSharp(v, guide, blurCanvasRef.current)) { setBlurry(true); return null; }
    setBlurry(false);
    const input = preprocess(v, guide, canvasRef.current ?? undefined);
    scanInFlight.current = true;
    try {
      return await engine.match(input, 5, activeTcg === "all" ? undefined : activeTcg, lang === "all" ? undefined : lang);
    } finally {
      scanInFlight.current = false;
    }
  }, [engine, activeTcg, lang]);

  // Live preview: run matches rapidly; only update the displayed result after
  // the same top card wins 3 consecutive frames (stabilisation).
  // In bulk mode, auto-accept after 5 consecutive high-confidence frames.
  const REQUIRED_STREAK = 3;
  const AUTO_ACCEPT_STREAK = 5;
  const AUTO_ACCEPT_SCORE = 0.9;
  const autoAcceptRef = useRef(false);
  useEffect(() => {
    if (!auto || !engine || engine.status !== "ready") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const m = await scanOnce();
        if (m && m.length > 0 && !stop) {
          const topId = m[0].card.id;
          const streak = streakRef.current;
          if (topId === streak.id) {
            streak.count++;
          } else {
            streak.id = topId;
            streak.count = 1;
          }
          if (streak.count >= REQUIRED_STREAK) setLive(m);
          if (bulkMode && streak.count >= AUTO_ACCEPT_STREAK && m[0].score >= AUTO_ACCEPT_SCORE && !autoAcceptRef.current) {
            autoAcceptRef.current = true;
            haptic("heavy");
            onMatches(m);
            streak.id = "";
            streak.count = 0;
            setTimeout(() => { autoAcceptRef.current = false; }, 1000);
          }
        }
      } catch {
        /* ignore transient */
      }
      if (!stop) setTimeout(tick, 150);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [auto, engine, scanOnce, bulkMode, onMatches]);

  async function capture() {
    setBusy(true);
    try {
      const m = await scanOnce();
      if (m && m.length > 0) {
        onMatches(m);
      } else if (blurry) {
        showToast("Hold the card steady", "info");
      } else {
        showToast("No match found — reposition the card", "info");
      }
    } catch {
      showToast("Scan failed — check your connection", "down");
    } finally {
      setBusy(false);
    }
  }

  // Accepting the live match takes the same path as "Identify card".
  function acceptLive() {
    if (busy || live.length === 0) return;
    onMatches(live);
  }

  const top = live[0];
  const confident = top && top.score > 0.85;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <Guide locked={confident} blurry={blurry} />
        <div className="absolute top-0 inset-x-0 p-4 pt-[max(env(safe-area-inset-top),16px)] flex items-center justify-between">
          <button onClick={onClose} className="glass rounded-full px-3 py-1.5 text-sm">
            Close
          </button>
          <div className="flex items-center gap-2">
            {hasTorch && (
              <button onClick={toggleTorch} className={`glass rounded-full p-2 ${torch ? "text-yellow-400" : "text-muted"}`} aria-label="Toggle flashlight">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill={torch ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M9 18h6M10 22h4M12 2v1M4.22 4.22l.71.71M1 12h1M20 12h1M18.36 4.22l-.71.71" />
                  <path d="M15 9a3 3 0 1 1-6 0 5 5 0 0 1 6 0z" />
                </svg>
              </button>
            )}
            <div className="glass rounded-full px-3 py-1.5 text-xs text-muted">
              {engine == null ? "Loading model…" : engine.status === "ready" ? `Model ready · ${engine.backend}` : engine.status}
            </div>
          </div>
        </div>
        {top && (
          <div
            role="button"
            tabIndex={0}
            onClick={acceptLive}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                acceptLive();
              }
            }}
            aria-label={`Accept match ${top.card.name}`}
            className="absolute bottom-4 inset-x-4 glass rounded-2xl p-3 text-left cursor-pointer transition-colors hover:bg-white/[0.06] focus:outline-none focus:ring-2 focus:ring-accent"
          >
            <div className="text-[10px] uppercase tracking-wider text-muted">Live match · {(top.score * 100).toFixed(0)}% · tap to accept</div>
            <div className={`font-semibold ${confident ? "text-up" : ""}`}>{top.card.name}</div>
            <div className="text-xs text-muted">
              {top.card.setName ?? top.card.set} #{top.card.num} · {top.card.lang?.toUpperCase()}
            </div>
          </div>
        )}
      </div>
      <div className="glass p-4 pb-[max(env(safe-area-inset-bottom),16px)]">
        {camError && <div className="text-sm text-down mb-3">{camError}</div>}
        {engine && engine.status !== "ready" && engine.error && <div className="text-sm text-down mb-3">{engine.error}</div>}
        {bulkMode && (bulkCount ?? 0) > 0 && (
          <div className="text-xs text-accent font-semibold mb-2 text-center">{bulkCount} card{bulkCount !== 1 ? "s" : ""} scanned</div>
        )}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-accent" /> Live
          </label>
          <Button className="flex-1" onClick={capture} disabled={busy || !engine || engine.status !== "ready" || !!camError}>
            {busy ? "Identifying…" : "Identify card"}
          </Button>
          {bulkMode && (
            <Button variant="ghost" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Guide({ locked, blurry }: { locked?: boolean; blurry?: boolean }) {
  const borderColor = locked ? "border-green-400" : "border-white/90";
  const corner = `absolute w-6 h-6 ${borderColor} transition-colors duration-300`;
  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="relative" style={{ width: "78%", aspectRatio: "63/88", maxHeight: "85%" }}>
        <div className="absolute inset-0 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        {/* Corner brackets */}
        <div className={`${corner} top-0 left-0 border-t-[3px] border-l-[3px] rounded-tl-xl`} />
        <div className={`${corner} top-0 right-0 border-t-[3px] border-r-[3px] rounded-tr-xl`} />
        <div className={`${corner} bottom-0 left-0 border-b-[3px] border-l-[3px] rounded-bl-xl`} />
        <div className={`${corner} bottom-0 right-0 border-b-[3px] border-r-[3px] rounded-br-xl`} />
        {/* Center crosshair */}
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <div className="w-px h-5 bg-white" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center opacity-30">
          <div className="h-px w-5 bg-white" />
        </div>
        {/* Label */}
        <div className="absolute -bottom-7 inset-x-0 text-center text-[11px] font-medium">
          {blurry ? (
            <span className="text-yellow-400">Hold steady…</span>
          ) : locked ? (
            <span className="text-green-400">Locked on</span>
          ) : (
            <span className="text-white/60">Align card within frame</span>
          )}
        </div>
      </div>
    </div>
  );
}
