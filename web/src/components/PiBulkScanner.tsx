"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "./ui";
import { PI_CAMERA_ORIGIN, parsePiPhotoMessage } from "@/lib/grading/handoff";
import { suggestCardCrop, type CropRect } from "@/lib/grading/analysis";
import { getScanEngine } from "@/lib/scanner/engine";
import { preprocess } from "@/lib/scanner/preprocess";
import type { Match } from "@/lib/scanner/matcher";

export function PiBulkScanner({ onMatches, onClose, paused, count, tcg, lang }: {
  onMatches: (matches: Match[]) => void; onClose: () => void;
  paused: boolean; count: number; tcg: string; lang: string;
}) {
  const popup = useRef<Window | null>(null);
  const session = useRef("");
  const locked = useRef(false);
  const alive = useRef(false);
  const bitmap = useRef<ImageBitmap | null>(null);
  const photoUrl = useRef("");
  const [url, setUrl] = useState("");
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, width: 1, height: 1 });
  const [corner, setCorner] = useState<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      session.current = "";
      bitmap.current?.close();
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      popup.current?.close();
    };
  }, []);

  useEffect(() => {
    const receive = async (event: MessageEvent) => {
      const photo = parsePiPhotoMessage(event, popup.current, session.current);
      if (!photo || locked.current || paused) return;
      locked.current = true;
      setBusy(true);
      setError("");
      try {
        const blob = new Blob([photo.bytes], { type: "image/jpeg" });
        const image = await createImageBitmap(blob);
        if (!alive.current) { image.close(); return; }
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(800, image.width);
        canvas.height = Math.round(image.height * canvas.width / image.width);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) { image.close(); throw new Error("Photo preview is unavailable."); }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const suggested = suggestCardCrop(context.getImageData(0, 0, canvas.width, canvas.height));
        bitmap.current?.close();
        bitmap.current = image;
        if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
        photoUrl.current = URL.createObjectURL(blob);
        setUrl(photoUrl.current);
        setCrop(suggested ?? { x: 0, y: 0, width: 1, height: 1 });
        setCorner(null);
      } catch (cause) {
        if (alive.current) setError(cause instanceof Error ? cause.message : "Could not read the Pi photo.");
      } finally {
        locked.current = false;
        if (alive.current) setBusy(false);
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [paused]);

  function openCamera() {
    // Keep the session when reopening the same window.
    if (!popup.current || popup.current.closed) session.current = crypto.randomUUID();
    const target = new URL(PI_CAMERA_ORIGIN);
    target.searchParams.set("gradeOrigin", window.location.origin);
    target.searchParams.set("session", session.current);
    target.searchParams.set("mode", "bulk");
    popup.current = window.open(target.toString(), "rnp-pi-bulk-camera");
    setError(popup.current ? "" : "Allow pop-ups for this app, then open the Pi camera again.");
  }

  async function identify() {
    if (!bitmap.current || locked.current || paused) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      const image = bitmap.current;
      const input = preprocess(image, { x: crop.x * image.width, y: crop.y * image.height,
        w: crop.width * image.width, h: crop.height * image.height });
      const engine = await getScanEngine();
      if (engine.status !== "ready") throw new Error(engine.error ?? "Scanner unavailable. Try again.");
      const matches = await engine.match(input, 5, tcg, lang);
      if (!alive.current) return;
      if (!matches.length) throw new Error("No card matches. Adjust the crop or take another photo.");
      setUrl("");
      bitmap.current?.close();
      bitmap.current = null;
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
      photoUrl.current = "";
      onMatches(matches);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Could not identify the card. Try again.");
    } finally {
      locked.current = false;
      if (alive.current) setBusy(false);
    }
  }

  function selectCrop(event: MouseEvent<HTMLButtonElement>) {
    if (busy || paused) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = { x: (event.clientX - bounds.left) / bounds.width, y: (event.clientY - bounds.top) / bounds.height };
    if (!corner) { setCorner(point); return; }
    const width = Math.abs(point.x - corner.x), height = Math.abs(point.y - corner.y);
    if (width >= 0.03 && height >= 0.03) setCrop({ x: Math.min(point.x, corner.x), y: Math.min(point.y, corner.y), width, height });
    setCorner(null);
  }

  return <section className="card-surface rounded-2xl p-4 mt-4 space-y-3" aria-label="Pi bulk scanner">
    <div className="flex justify-between items-center gap-3">
      <h2 className="font-semibold">Pi bulk scan · {count} queued</h2>
      <Button variant="ghost" onClick={onClose}>Finish scanning</Button>
    </div>
    <p className="text-sm text-muted">Capture the card’s front in the Pi window, then return here to check the crop and identify it. Confirm a match to add it to your bulk queue.</p>
    <Button onClick={openCamera} disabled={busy || paused}>Open Pi camera</Button>
    <p className="text-xs text-muted">If the camera page shows “Send photo to pre-grader”, use that button to send each capture here. Either side selection works for this connection; photograph the front of each card.</p>
    {url && <>
      <p className="text-xs text-muted">{corner ? "Now click the opposite corner of the card." : "To adjust the crop, click two opposite corners of the card."}</p>
      <button type="button" className="relative block w-full max-w-xl mx-auto overflow-hidden" onClick={selectCrop} aria-label="Select card crop" disabled={busy || paused}>
        {/* eslint-disable-next-line @next/next/no-img-element -- local JPEG preview */}
        <img src={url} alt="Card photographed by the Pi" className="block w-full" />
        <span className="absolute border-2 border-accent pointer-events-none" style={{ left: `${crop.x * 100}%`, top: `${crop.y * 100}%`, width: `${crop.width * 100}%`, height: `${crop.height * 100}%` }} />
      </button>
      <div className="flex gap-2">
        <Button disabled={busy || paused || !!corner} onClick={() => void identify()}>{busy ? "Identifying…" : "Identify card"}</Button>
        <Button variant="ghost" disabled={busy || paused} onClick={() => { setCrop({ x: 0, y: 0, width: 1, height: 1 }); setCorner(null); }}>Use full photo</Button>
      </div>
    </>}
    {busy && !url && <p role="status">Receiving photo…</p>}
    {error && <p className="text-sm text-down" role="alert">{error}</p>}
  </section>;
}
