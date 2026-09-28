"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Button } from "@/components/ui";
import {
  estimatePregrade, inspectPhoto, normalizeCrop, suggestCardCrop,
  type CropRect, type PhotoCheck, type PixelImage,
} from "@/lib/grading/analysis";

type Side = "front" | "back";
type Photo = { file: File; url: string; pixels: PixelImage; crop: CropRect; check: PhotoCheck };
type Photos = Partial<Record<Side, Photo>>;
const PI_ORIGIN = "http://10.12.194.1:8000";

function centeringScore(check: PhotoCheck): number | null {
  if (check.centering.confidence !== "measured") return null;
  const worst = Math.max(
    Math.abs(check.centering.leftRight[0] - 50),
    Math.abs(check.centering.topBottom[0] - 50),
  );
  return Math.max(1, Math.round((10 - worst * 0.2) * 2) / 2);
}

async function readPhoto(file: File): Promise<PixelImage> {
  if (!["image/jpeg", "image/png"].includes(file.type) || file.size > 30_000_000) {
    throw new Error("Choose a JPEG or PNG under 30 MB.");
  }
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width < 600 || bitmap.height < 400) {
      throw new Error("The image is too small for a pre-grade. Use the full-resolution Pi photo.");
    }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 800 / bitmap.width);
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Image analysis is unavailable in this browser.");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}

function ScoreSlider({ title, detail, value, onChange }: {
  title: string; detail: string; value: number | null; onChange: (value: number) => void;
}) {
  return <label className="block rounded-xl border border-line p-3">
    <span className="flex justify-between gap-2 text-sm font-semibold">
      <span>{title}</span><span>{value == null ? "Not assessed" : `${value.toFixed(1)}/10`}</span>
    </span>
    <span className="block text-xs text-muted mt-1">{detail}</span>
    <input type="range" min="1" max="10" step="0.5" value={value ?? 8}
      onChange={(e) => onChange(Number(e.target.value))}
      className="mt-3 w-full accent-accent" aria-label={`${title} condition score`} />
  </label>;
}

export default function GradePage() {
  const [photos, setPhotos] = useState<Photos>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Side | null>(null);
  const [cropStart, setCropStart] = useState<{ side: Side; x: number; y: number } | null>(null);
  const [manualCentering, setManualCentering] = useState<number | null>(null);
  const [corners, setCorners] = useState<number | null>(null);
  const [edges, setEdges] = useState<number | null>(null);
  const [surface, setSurface] = useState<number | null>(null);
  const popup = useRef<Window | null>(null);
  const session = useRef("");
  const frontUrl = photos.front?.url;
  const backUrl = photos.back?.url;
  useEffect(() => () => { if (frontUrl) URL.revokeObjectURL(frontUrl); }, [frontUrl]);
  useEffect(() => () => { if (backUrl) URL.revokeObjectURL(backUrl); }, [backUrl]);

  const acceptPhoto = useCallback(async (side: Side, file: File, fromPi = false) => {
    setBusy(side);
    setError("");
    try {
      const pixels = await readPhoto(file);
      const crop = suggestCardCrop(pixels) ?? (fromPi
        ? { x: 0.28, y: 0.08, width: 0.56, height: 0.66 }
        : { x: 0.02, y: 0.02, width: 0.96, height: 0.96 });
      const photo: Photo = {
        file, url: URL.createObjectURL(file), pixels, crop, check: inspectPhoto(pixels, crop),
      };
      setPhotos((previous) => ({ ...previous, [side]: photo }));
      setCropStart(null);
      setManualCentering(null);
      setCorners(null);
      setEdges(null);
      setSurface(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that photo.");
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== PI_ORIGIN || event.source !== popup.current) return;
      const data = event.data as { type?: string; session?: string; side?: string; bytes?: unknown } | null;
      if (data?.type !== "rnp-photo" || data.session !== session.current ||
          (data.side !== "front" && data.side !== "back") || !(data.bytes instanceof ArrayBuffer) ||
          data.bytes.byteLength < 4 || data.bytes.byteLength > 30_000_000) return;
      const bytes = new Uint8Array(data.bytes);
      if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) return;
      void acceptPhoto(data.side, new File([data.bytes], `${data.side}.jpg`, { type: "image/jpeg" }), true);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [acceptPhoto]);

  function openPi() {
    session.current = crypto.randomUUID();
    const url = new URL(PI_ORIGIN);
    url.searchParams.set("gradeOrigin", window.location.origin);
    url.searchParams.set("session", session.current);
    popup.current = window.open(url.toString(), "rnp-pi-camera");
    if (!popup.current) setError("Chrome blocked the camera window. Allow pop-ups, or download and upload the JPEGs below.");
  }

  function updateCrop(side: Side, crop: CropRect) {
    const photo = photos[side];
    if (!photo) return;
    const normalized = normalizeCrop(crop);
    setPhotos((previous) => ({
      ...previous, [side]: { ...photo, crop: normalized, check: inspectPhoto(photo.pixels, normalized) },
    }));
    setManualCentering(null);
  }

  function clickCrop(side: Side, event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    if (!cropStart || cropStart.side !== side) {
      setCropStart({ side, x, y });
      return;
    }
    updateCrop(side, { x: Math.min(x, cropStart.x), y: Math.min(y, cropStart.y),
      width: Math.abs(x - cropStart.x), height: Math.abs(y - cropStart.y) });
    setCropStart(null);
  }

  const frontScore = photos.front ? centeringScore(photos.front.check) : null;
  const backScore = photos.back ? centeringScore(photos.back.check) : null;
  const suggestedCenter = frontScore != null && backScore != null
    ? Math.min(frontScore, backScore) : null;
  const center = manualCentering ?? suggestedCenter;
  const complete = !!photos.front && !!photos.back &&
    center != null && corners != null && edges != null && surface != null;
  const estimate = complete ? estimatePregrade({
    centering: center, corners: corners!, edges: edges!, surface: surface!,
  }) : null;
  const qualityIssues = [...(photos.front?.check.issues ?? []), ...(photos.back?.check.issues ?? [])];

  return <div className="pb-24 max-w-4xl mx-auto space-y-5">
    <header className="pt-2">
      <h1 className="text-xl font-bold">Card pre-grade</h1>
      <p className="text-sm text-muted mt-1">Capture both sides, inspect the crop, then review condition before seeing an estimate.</p>
    </header>

    <section className="card-surface rounded-2xl p-4 space-y-3">
      <h2 className="font-semibold">1. Capture the card</h2>
      <p className="text-sm text-muted">Connect your Pi Zero 2 W through its USB data port. Chrome opens the Pi camera page to take front and back photos.</p>
      <div className="flex flex-wrap gap-2 items-center">
        <Button onClick={openPi}>Open Pi camera</Button>
        <a href={PI_ORIGIN} target="_blank" rel="noreferrer" className="text-sm text-accent underline">Open camera page directly</a>
      </div>
      {error && <p className="text-sm text-down" role="alert">{error}</p>}
    </section>

    <div className="grid gap-4 md:grid-cols-2">
      {(["front", "back"] as const).map((side) => {
        const photo = photos[side];
        return <section key={side} className="card-surface rounded-2xl p-4 space-y-3">
          <div className="flex justify-between items-center gap-2">
            <h2 className="font-semibold capitalize">{side} photo</h2>
            <label className="text-sm text-accent cursor-pointer underline">
              {photo ? "Replace JPEG" : "Upload JPEG"}
              <input hidden type="file" accept="image/jpeg,image/png" onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void acceptPhoto(side, file);
                e.target.value = "";
              }} />
            </label>
          </div>
          {busy === side && <p className="text-sm text-muted">Reading photo…</p>}
          {photo ? <>
            <div className="relative cursor-crosshair" onClick={(event) => clickCrop(side, event)}
              title="Click the top-left and bottom-right corners of the physical card to correct the crop">
              {/* eslint-disable-next-line @next/next/no-img-element -- Local blob URLs are not image-optimizer inputs. */}
              <img src={photo.url} alt={`${side} of card, with crop outline`} className="block w-full h-auto rounded-lg" />
              <div className="absolute border-2 border-accent pointer-events-none" style={{
                left: `${photo.crop.x * 100}%`, top: `${photo.crop.y * 100}%`,
                width: `${photo.crop.width * 100}%`, height: `${photo.crop.height * 100}%`,
              }} />
              {cropStart?.side === side && <div className="absolute w-3 h-3 rounded-full bg-accent pointer-events-none"
                style={{ left: `${cropStart.x * 100}%`, top: `${cropStart.y * 100}%` }} />}
            </div>
            <p className="text-xs text-muted">Crop should follow the physical card edge. Click its top-left, then bottom-right corner to correct it.</p>
            <div className="flex gap-3 text-sm">
              <a href={photo.url} target="_blank" rel="noreferrer" className="text-accent underline">Inspect full photo</a>
              <a href={photo.url} download={`${side}.jpg`} className="text-accent underline">Download</a>
            </div>
            {photo.check.issues.length
              ? <ul className="text-xs text-amber-300 list-disc pl-4">{photo.check.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
              : <p className="text-xs text-up">Basic brightness, highlight, and sharpness checks passed.</p>}
            {photo.check.centering.confidence === "measured"
              ? <p className="text-sm">Printed border: {photo.check.centering.leftRight.join("/")} left/right · {photo.check.centering.topBottom.join("/")} top/bottom</p>
              : <p className="text-xs text-muted">{photo.check.centering.reason}</p>}
          </> : <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-muted">Waiting for {side} photo</div>}
        </section>;
      })}
    </div>

    <section className="card-surface rounded-2xl p-4 space-y-3">
      <h2 className="font-semibold">2. Review condition</h2>
      <p className="text-xs text-muted">The photo can suggest centering, but this version does not automatically detect microscopic corner, edge, or surface defects. Inspect the full-size photos, preferably with angled light for surface marks.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <ScoreSlider title="Centering"
          detail={suggestedCenter == null
            ? "Set this when a clear printed border cannot be measured on both sides."
            : `Photo suggestion: ${suggestedCenter.toFixed(1)}/10. Check the crop and adjust if it measured artwork instead of a border.`}
          value={center} onChange={setManualCentering} />
        <ScoreSlider title="Corners" detail="Inspect all four corners on both sides for whitening, bends, and rounding." value={corners} onChange={setCorners} />
        <ScoreSlider title="Edges" detail="Inspect all edges on both sides for chips, fraying, and dents." value={edges} onChange={setEdges} />
        <ScoreSlider title="Surface" detail="Look for scratches, creases, print lines, and stains under angled light." value={surface} onChange={setSurface} />
      </div>
    </section>

    <section className="card-surface rounded-2xl p-4 space-y-2" aria-live="polite">
      <h2 className="font-semibold">3. Pre-grade result</h2>
      {estimate ? <>
        <p className="text-3xl font-bold">{estimate.score.toFixed(1)} <span className="text-base font-normal text-muted">/ 10 estimated condition</span></p>
        <p className="text-sm text-muted">Review range: {estimate.low.toFixed(1)}–{estimate.high.toFixed(1)}. This is an informal pre-grade, not a PSA, BGS, or CGC grade.</p>
        {qualityIssues.length > 0 && <p className="text-sm text-amber-300">Photo quality needs review. Retake the affected side before relying on this estimate.</p>}
      </> : <p className="text-sm text-muted">Add front and back photos and assess all four categories to see a provisional result.</p>}
    </section>
  </div>;
}
