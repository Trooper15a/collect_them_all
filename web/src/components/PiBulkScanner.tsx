"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "./ui";
import { getScanEngine } from "@/lib/scanner/engine";
import { preprocess } from "@/lib/scanner/preprocess";
import { capturePi, connectPi } from "@/lib/scanner/pi-camera";
import { StandDetector, imageFingerprint } from "@/lib/scanner/stand-detector";
import type { CropRect } from "@/lib/grading/analysis";
import type { Match } from "@/lib/scanner/matcher";

type Props = {
  onMatches: (matches: Match[], automatic?: boolean) => void | boolean | Promise<void | boolean>;
  onClose: () => void; paused: boolean; count: number; tcg: string; lang: string;
};
const DEFAULT_CROP = { x: 0.3, y: 0.06, width: 0.4, height: 0.88 };

export function PiBulkScanner({ onMatches, onClose, paused, count, tcg, lang }: Props) {
  const alive = useRef(false);
  const locked = useRef(false);
  const detector = useRef(new StandDetector());
  const image = useRef<ImageBitmap | null>(null);
  const objectUrl = useRef("");
  const activeRequest = useRef<AbortController | null>(null);
  const controls = useRef({ paused, onMatches, tcg, lang });
  const generation = useRef(0);
  const cancelRun = useCallback(() => { generation.current++; }, []);
  const region = useRef<CropRect>(DEFAULT_CROP);
  const [crop, setCrop] = useState<CropRect>(DEFAULT_CROP);
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);
  const [url, setUrl] = useState("");
  const [connected, setConnected] = useState(false);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connect your Pi over USB, then connect the camera here.");

  useEffect(() => { controls.current = { paused, onMatches, tcg, lang }; }, [paused, onMatches, tcg, lang]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false; activeRequest.current?.abort();
      image.current?.close();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);

  async function takePhoto(): Promise<ImageBitmap> {
    const request = new AbortController();
    activeRequest.current = request;
    const blob = await capturePi(request.signal);
    const bitmap = await createImageBitmap(blob);
    if (!alive.current || request.signal.aborted) { bitmap.close(); throw new Error("Capture stopped."); }
    image.current?.close(); image.current = bitmap;
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(blob); setUrl(objectUrl.current);
    return bitmap;
  }

  async function identify(bitmap: ImageBitmap, auto: boolean) {
    const token = generation.current;
    const crop = region.current;
    const input = preprocess(bitmap, { x: crop.x * bitmap.width, y: crop.y * bitmap.height,
      w: crop.width * bitmap.width, h: crop.height * bitmap.height });
    const current = controls.current;
    const engine = await getScanEngine();
    if (!alive.current || (auto && token !== generation.current)) return;
    if (engine.status !== "ready") throw new Error(engine.error ?? "Scanner unavailable. Try again.");
    const matches = await engine.match(input, 5, current.tcg, current.lang);
    if (!alive.current || (auto && token !== generation.current)) return;
    if (!matches.length) throw new Error("No matches. Check the scan area and try again.");
    const queued = await controls.current.onMatches(matches, auto);
    if (!alive.current) return;
    if (queued === false) throw new Error("Could not queue this card. Retry identification or check the match manually.");
    setStatus(queued ? "Card queued — remove it, then place the next card."
      : "Check the suggested matches to continue.");
  }

  async function action(kind: "connect" | "calibrate" | "capture" | "identify") {
    if (locked.current || paused) return;
    locked.current = true; setBusy(true); setError(""); setRunning(false);
    try {
      if (kind === "connect") {
        setStatus("Connecting to the Pi — allow local-network access if Chrome asks.");
        await connectPi();
        if (!alive.current) return;
        setConnected(true);
      }
      if (kind === "identify") {
        if (image.current) await identify(image.current, false);
      } else {
        const bitmap = await takePhoto();
        if (kind === "calibrate") {
          detector.current.calibrate(imageFingerprint(bitmap, region.current));
          setStatus("Ready — place a card in the scan area."); setRunning(true);
        } else setStatus("Check the scan area. Click two opposite corners to fit the card, then clear the stand and start automatic scanning.");
      }
    } catch (cause) {
      if (alive.current) {
        setError(cause instanceof Error ? cause.message : "Pi camera operation failed.");
        setStatus("Scanning stopped. Resolve the error, then try again.");
      }
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }

  useEffect(() => {
    if (!running) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stopped) return;
      if (!controls.current.paused && !locked.current) {
        locked.current = true; setBusy(true);
        try {
          const bitmap = await takePhoto();
          if (stopped || !alive.current) return;
          const state = detector.current.observe(imageFingerprint(bitmap, region.current));
          if (state === "capture") {
            setStatus("Card settled — identifying…");
            await identify(bitmap, true);
          } else setStatus(state === "empty" ? "Ready — place a card in the scan area."
            : state === "remove" ? "Remove the scanned card before placing the next one."
            : "Waiting for the card to settle…");
        } catch (cause) {
          if (!stopped && alive.current) {
            setError(cause instanceof Error ? cause.message : "Automatic scanning failed.");
            setRunning(false); setStatus("Scanning paused. Check the photo and retry identification, or restart with the stand empty.");
          }
          return;
        } finally {
          locked.current = false;
          if (alive.current) setBusy(false);
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), 1000);
    };
    timer = setTimeout(() => void tick(), 1000);
    return () => { stopped = true; cancelRun(); clearTimeout(timer); activeRequest.current?.abort(); };
    // Capture/recognition use current props through controls; do not restart an in-flight loop on a parent render.
  }, [running, cancelRun]);

  function selectCrop(event: MouseEvent<HTMLButtonElement>) {
    if (busy || paused) return;
    setRunning(false);
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
    if (!corner) { setCorner(point); return; }
    const width = Math.abs(point.x - corner.x), height = Math.abs(point.y - corner.y);
    if (width >= 0.03 && height >= 0.03) {
      const selected = { x: Math.min(point.x, corner.x), y: Math.min(point.y, corner.y), width, height };
      region.current = selected; setCrop(selected);
    }
    setCorner(null);
  }

  return <section className="card-surface rounded-2xl p-4 mt-4 space-y-3" aria-label="Pi bulk scanner">
    <div className="flex justify-between items-center gap-3">
      <h2 className="font-semibold">Pi bulk scan · {count} queued</h2>
      <Button variant="ghost" onClick={onClose}>Finish scanning</Button>
    </div>
    <p className="text-sm text-muted">Place a card, let it settle, then remove it after it’s queued. Clear matches queue automatically; uncertain matches ask for review. Everything stays on this page.</p>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void action("connect")} disabled={busy || paused || running}>{connected ? "Reconnect Pi camera" : "Connect Pi camera"}</Button>
      {connected && !running && <Button disabled={busy || paused || !!corner} onClick={() => void action("calibrate")}>Stand is empty — start automatic scanning</Button>}
      {running && <Button variant="ghost" onClick={() => { generation.current++; setRunning(false); activeRequest.current?.abort(); setStatus("Automatic scanning stopped."); }}>Stop automatic scanning</Button>}
    </div>
    <p role="status" className="text-sm text-accent">{status}</p>
    <p className="text-xs text-muted">First time: allow local-network access in Chrome. The Pi needs the direct-camera service update. Detection takes several seconds per card; leave this page open.</p>
    {url && <>
      <p className="text-xs text-muted">{corner ? "Now click the opposite corner of the card area." : "The outline is the scan area. Stop scanning to adjust it by clicking two opposite corners, then recalibrate with the stand empty."}</p>
      <button type="button" className="relative block w-full max-w-xl mx-auto overflow-hidden" onClick={selectCrop} aria-label="Select card crop" disabled={busy || paused || running}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local camera JPEG preview */}
        <img src={url} alt="Pi camera preview" className="block w-full" />
        <span className="absolute border-2 border-accent pointer-events-none" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
      </button>
      {!running && <div className="flex gap-2">
        <Button disabled={busy || paused || !!corner} onClick={() => void action("identify")}>{busy ? "Working…" : "Identify card"}</Button>
        <Button variant="ghost" disabled={busy || paused} onClick={() => void action("capture")}>Take photo</Button>
      </div>}
    </>}
    {error && <p className="text-sm text-down" role="alert">{error}</p>}
  </section>;
}
