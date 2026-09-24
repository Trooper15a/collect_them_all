"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getScanEngine, type ScanEngine } from "@/lib/scanner/engine";
import type { Match } from "@/lib/scanner/matcher";
import { cardGuide, videoGuide, isSharp, preprocess, frameFingerprint, fingerprintDiff, captureStill } from "@/lib/scanner/preprocess";
import { LiveScanTracker, SCENE_CHANGE_THRESHOLD } from "@/lib/scanner/live";
import { haptic } from "@/lib/haptics";
import { useActiveTcg } from "@/lib/ui-prefs";
import { showToast } from "./Toast";
import { Button } from "./ui";

type ScannerProps = { onMatches: (m: Match[]) => void; onClose: () => void; bulkMode?: boolean; standMode?: boolean; bulkCount?: number; lang?: string };

export function Scanner(props: ScannerProps) {
  const [attempt, setAttempt] = useState(0);
  const activeTcg = useActiveTcg();
  return <ScannerSession key={`${attempt}:${activeTcg}:${props.lang}`} {...props} activeTcg={activeTcg} onRetry={() => setAttempt((n) => n + 1)} />;
}

function ScannerSession({ onMatches, onClose, bulkMode, standMode, bulkCount, lang, activeTcg, onRetry }: ScannerProps & { activeTcg: string; onRetry: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<ScanEngine | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [startupSlow, setStartupSlow] = useState(false);
  const mounted = useRef(false);
  const tracker = useRef(new LiveScanTracker());
  const viewport = useRef("");
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(true);
  const [live, setLive] = useState<Match[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const streakRef = useRef<{ id: string; count: number }>({ id: "", count: 0 });
  const [torch, setTorch] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const blurCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [blurry, setBlurry] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scanInFlight = useRef(false);
  const manualInFlight = useRef(false);
  const lastAcceptedFp = useRef<Uint8Array | null>(null);
  const fpCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [standState, setStandState] = useState<"scanning" | "waiting">("scanning");

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    const startupTimer = setTimeout(() => !cancelled && setStartupSlow(true), 20000);
    getScanEngine().then((e) => !cancelled && setEngine(e)).catch(() => {
      if (!cancelled) setScanError("Couldn't start the scanner. Reload the page to try again.");
    });
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
          if (!cancelled) setCameraReady(true);
        }
      } catch (e) {
        if (cancelled) return;
        streamRef.current?.getTracks().forEach((t) => t.stop());
        const name = e instanceof Error ? e.name : "";
        setCamError(name === "NotAllowedError"
          ? "Camera access was blocked. Allow camera access in your browser settings, then retry."
          : name === "NotFoundError" ? "No camera was found. Connect a camera, then retry."
          : name === "NotReadableError" ? "The camera is busy. Close other apps using it, then retry."
          : "Couldn't start the camera. Use a secure connection and allow camera access, then retry.");
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      clearTimeout(startupTimer);
      if (blurTimer.current) clearTimeout(blurTimer.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const clearLive = useCallback(() => {
    tracker.current.clear();
    setLive(tracker.current.matches);
    streakRef.current = { id: "", count: 0 };
  }, []);

  // Runs independently of network inference, including while a request is pending.
  const observeScene = useCallback(() => {
    const v = videoRef.current;
    if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) {
      if (tracker.current.matches.length) clearLive();
      return null;
    }
    const dimensions = `${v.videoWidth}:${v.videoHeight}:${v.clientWidth}:${v.clientHeight}`;
    if (dimensions !== viewport.current) {
      viewport.current = dimensions;
      clearLive();
    }
    if (!fpCanvasRef.current) fpCanvasRef.current = document.createElement("canvas");
    const fp = frameFingerprint(v, videoGuide(v), fpCanvasRef.current);
    if (tracker.current.observe(fp)) {
      setLive(tracker.current.matches);
      streakRef.current = { id: "", count: 0 };
    }
    return fp;
  }, [clearLive]);

  useEffect(() => {
    if (!cameraReady) return;
    const timer = setInterval(() => {
      try { observeScene(); } catch {
        clearLive();
        setScanError("Couldn't read the camera. Close and reopen the scanner to try again.");
        setAuto(false);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [cameraReady, observeScene, clearLive]);

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
    if (scanInFlight.current || manualInFlight.current) return null;
    if (!observeScene()) return null;
    const token = tracker.current.capture();
    const guide = videoGuide(v);
    if (!blurCanvasRef.current) blurCanvasRef.current = document.createElement("canvas");
    if (!isSharp(v, guide, blurCanvasRef.current)) {
      clearLive();
      if (!blurTimer.current) {
        blurTimer.current = setTimeout(() => setBlurry(true), 400);
      }
      return null;
    }
    if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = null; }
    setBlurry(false);
    const input = preprocess(v, guide, canvasRef.current ?? undefined);
    scanInFlight.current = true;
    try {
      const matches = await engine.match(input, 5, activeTcg === "all" ? undefined : activeTcg, lang === "all" ? undefined : lang);
      return { matches, token };
    } finally {
      scanInFlight.current = false;
    }
  }, [engine, activeTcg, lang, observeScene, clearLive]);

  // Only publish live results while their captured scene is still current.
  // In bulk mode, auto-accept after consecutive high-confidence frames.
  // In stand mode, after auto-accept wait for scene change before resuming.
  const AUTO_ACCEPT_STREAK = 2;
  const AUTO_ACCEPT_SCORE = 0.85;
  const autoAcceptRef = useRef(false);
  const isBatchMode = bulkMode || standMode;
  useEffect(() => {
    if (!auto || !engine || engine.status !== "ready") return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      try {
        const v = videoRef.current;
        // Stand mode: after accepting a card, wait for scene change before scanning again
        if (standMode && lastAcceptedFp.current && v && v.videoWidth > 0) {
          const guide = videoGuide(v);
          if (!fpCanvasRef.current) fpCanvasRef.current = document.createElement("canvas");
          const currentFp = frameFingerprint(v, guide, fpCanvasRef.current);
          const diff = fingerprintDiff(lastAcceptedFp.current, currentFp);
          if (diff < SCENE_CHANGE_THRESHOLD) {
            // Same card still in frame, keep waiting
            if (!stop) setTimeout(tick, 100);
            return;
          }
          // Scene changed — card was swapped. Clear fingerprint and resume scanning.
          lastAcceptedFp.current = null;
          setStandState("scanning");
          streakRef.current = { id: "", count: 0 };
        }

        const result = await scanOnce();
        if (stop) return;
        if (result && !manualInFlight.current && observeScene() && tracker.current.publish(result.token, result.matches)) {
          const m = result.matches;
          setLive(m);
          if (!m.length) {
            streakRef.current = { id: "", count: 0 };
          } else {
            const topId = m[0].card.id;
            const streak = streakRef.current;
            if (topId === streak.id) {
              streak.count++;
            } else {
              streak.id = topId;
              streak.count = 1;
            }
            if (isBatchMode && streak.count >= AUTO_ACCEPT_STREAK && m[0].score >= AUTO_ACCEPT_SCORE && !autoAcceptRef.current) {
              autoAcceptRef.current = true;
              haptic("heavy");
              onMatches(m);
              streak.id = "";
              streak.count = 0;
              if (standMode && v && v.videoWidth > 0) {
                const guide = videoGuide(v);
                if (!fpCanvasRef.current) fpCanvasRef.current = document.createElement("canvas");
                lastAcceptedFp.current = frameFingerprint(v, guide, fpCanvasRef.current);
                setStandState("waiting");
              }
              setTimeout(() => { autoAcceptRef.current = false; }, standMode ? 300 : 1000);
            }
          }
        }
      } catch (error) {
        if (!stop) {
          clearLive();
          setScanError(error instanceof Error ? error.message : "Live scanning failed. Please try again.");
          setAuto(false);
        }
        return;
      }
      if (!stop) setTimeout(tick, 150);
    };
    tick();
    return () => {
      stop = true;
    };
  }, [auto, engine, scanOnce, bulkMode, standMode, isBatchMode, onMatches, observeScene, clearLive]);

  async function capture() {
    // Keep the current live-mode control: accept a match rather than queueing
    // another inference request behind the scan loop.
    if (live.length > 0) {
      acceptLive();
      return;
    }
    if (auto || manualInFlight.current) return;
    manualInFlight.current = true;
    clearLive();
    setScanError(null);
    setBusy(true);
    try {
      const v = videoRef.current;
      const stream = streamRef.current;
      if (!v || !stream || !engine || engine.status !== "ready" || v.videoWidth === 0) {
        showToast("Camera not ready", "info");
        return;
      }
      const input = await captureStill(v);
      const m = await engine.match(input, 5, activeTcg === "all" ? undefined : activeTcg, lang === "all" ? undefined : lang);
      if (!mounted.current) return;
      if (m && m.length > 0) {
        onMatches(m);
      } else if (blurry) {
        showToast("Hold the card steady", "info");
      } else {
        showToast("No match found — reposition the card", "info");
      }
    } catch (error) {
      if (mounted.current) {
        clearLive();
        setScanError(error instanceof Error ? error.message : "Scan failed — please try again");
        setAuto(false);
      }
    } finally {
      manualInFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  // Accepting the live match takes the same path as "Identify card".
  function acceptLive() {
    if (manualInFlight.current) return;
    try {
      if (observeScene() && tracker.current.matches.length) onMatches(tracker.current.matches);
    } catch { clearLive(); }
  }

  const top = live[0];
  const confident = !!top && top.score > 0.85;
  const engineFailed = !!engine && engine.status !== "ready";
  const starting = !cameraReady || !engine;
  const status = camError ? "Camera unavailable" : engineFailed ? "Scanner unavailable"
    : busy ? "Identifying…" : !cameraReady ? "Starting camera…"
    : !engine ? "Loading model…" : scanError ? "Live scanning paused"
    : auto ? "Ready · scanning live" : "Ready";

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
        <canvas ref={canvasRef} className="hidden" />
        <Guide locked={confident} blurry={blurry} standMode={standMode} standState={standState} />
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
            <div role="status" className="glass rounded-full px-3 py-1.5 text-xs text-muted">
              {status}
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
        {(camError || engineFailed || scanError) && (
          <div role="alert" className="text-sm text-down mb-3 flex items-center justify-between gap-3">
            <span>{camError || (engineFailed && engine?.error) || scanError}</span>
            <Button variant="ghost" disabled={busy} onClick={() => {
              if (camError || engineFailed || !engine) onRetry();
              else { clearLive(); setScanError(null); setAuto(true); }
            }}>Retry</Button>
          </div>
        )}
        {startupSlow && starting && !camError && !engineFailed && (
          <div role="status" className="text-sm text-muted mb-3">
            {!cameraReady ? "Allow camera access if your browser asks. " : "The first model download may take a moment. "}
            <button className="underline" onClick={() => window.location.reload()}>Reload scanner</button>
          </div>
        )}
        {isBatchMode && (bulkCount ?? 0) > 0 && (
          <div className="text-xs text-accent font-semibold mb-2 text-center">{bulkCount} card{bulkCount !== 1 ? "s" : ""} scanned</div>
        )}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={auto} onChange={(e) => { clearLive(); setScanError(null); setAuto(e.target.checked); }} className="accent-accent" /> Live
          </label>
          <Button className="flex-1" onClick={capture} disabled={busy || !cameraReady || (auto && live.length === 0) || !engine || engine.status !== "ready" || !!camError}>
            {live.length > 0 ? "Accept match" : busy ? "Identifying…" : auto ? "Scanning…" : "Identify card"}
          </Button>
          {isBatchMode && (
            <Button variant="ghost" onClick={onClose}>Done</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Guide({ locked, blurry, standMode, standState }: { locked?: boolean; blurry?: boolean; standMode?: boolean; standState?: "scanning" | "waiting" }) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setSize({ width: element.clientWidth, height: element.clientHeight });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const guide = cardGuide(size.width, size.height);
  const isWaiting = standMode && standState === "waiting";
  const borderColor = isWaiting ? "border-blue-400" : locked ? "border-green-400" : "border-white/90";
  const corner = `absolute w-6 h-6 ${borderColor} transition-colors duration-300`;
  return (
    <div ref={container} className="absolute inset-0 pointer-events-none flex items-center justify-center">
      <div className="relative" style={{ width: guide.w, height: guide.h, visibility: size.width ? "visible" : "hidden" }}>
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
          {isWaiting ? (
            <span className="text-blue-400">Place next card…</span>
          ) : blurry ? (
            <span className="text-yellow-400">Hold steady…</span>
          ) : locked ? (
            <span className="text-green-400">Locked on</span>
          ) : standMode ? (
            <span className="text-white/60">Scanning…</span>
          ) : (
            <span className="text-white/60">Align card within frame</span>
          )}
        </div>
      </div>
    </div>
  );
}
