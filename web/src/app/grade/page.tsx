"use client";

import { useRef, useState } from "react";
import { Button, Section } from "@/components/ui";
import { showToast } from "@/components/Toast";

interface CenteringResult {
  leftRight: [number, number];
  topBottom: [number, number];
  score: number;
  psaCentering: string;
  psaTier: string;
}

function analyzeCentering(canvas: HTMLCanvasElement): CenteringResult {
  const ctx = canvas.getContext("2d")!;
  const w = canvas.width;
  const h = canvas.height;
  const data = ctx.getImageData(0, 0, w, h).data;

  const brightness = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (data[i] + data[i + 1] + data[i + 2]) / 3;
  };

  const edgeThreshold = 30;
  const numSamples = 15;

  function findEdge(scanFn: (sample: number) => number | null): number {
    const values: number[] = [];
    for (let s = 0; s < numSamples; s++) {
      const v = scanFn(s);
      if (v != null) values.push(v);
    }
    if (values.length === 0) return 0;
    values.sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  }

  const yStart = Math.floor(h * 0.25);
  const yEnd = Math.floor(h * 0.75);
  const yStep = Math.max(1, Math.floor((yEnd - yStart) / numSamples));

  const left = findEdge((s) => {
    const y = yStart + s * yStep;
    if (y >= h) return null;
    for (let x = 1; x < w * 0.4; x++) {
      if (Math.abs(brightness(x, y) - brightness(x - 1, y)) > edgeThreshold) return x;
    }
    return null;
  });

  const right = findEdge((s) => {
    const y = yStart + s * yStep;
    if (y >= h) return null;
    for (let x = w - 2; x > w * 0.6; x--) {
      if (Math.abs(brightness(x, y) - brightness(x + 1, y)) > edgeThreshold) return w - x;
    }
    return null;
  });

  const xStart = Math.floor(w * 0.25);
  const xEnd = Math.floor(w * 0.75);
  const xStep = Math.max(1, Math.floor((xEnd - xStart) / numSamples));

  const top = findEdge((s) => {
    const x = xStart + s * xStep;
    if (x >= w) return null;
    for (let y = 1; y < h * 0.4; y++) {
      if (Math.abs(brightness(x, y) - brightness(x, y - 1)) > edgeThreshold) return y;
    }
    return null;
  });

  const bottom = findEdge((s) => {
    const x = xStart + s * xStep;
    if (x >= w) return null;
    for (let y = h - 2; y > h * 0.6; y--) {
      if (Math.abs(brightness(x, y) - brightness(x, y + 1)) > edgeThreshold) return h - y;
    }
    return null;
  });

  ctx.strokeStyle = "rgba(167,139,250,0.7)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  if (left > 0) { ctx.beginPath(); ctx.moveTo(left, 0); ctx.lineTo(left, h); ctx.stroke(); }
  if (right > 0) { ctx.beginPath(); ctx.moveTo(w - right, 0); ctx.lineTo(w - right, h); ctx.stroke(); }
  if (top > 0) { ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.stroke(); }
  if (bottom > 0) { ctx.beginPath(); ctx.moveTo(0, h - bottom); ctx.lineTo(w, h - bottom); ctx.stroke(); }
  ctx.setLineDash([]);

  const lrTotal = left + right || 1;
  const tbTotal = top + bottom || 1;
  const lPct = Math.round((left / lrTotal) * 100);
  const rPct = 100 - lPct;
  const tPct = Math.round((top / tbTotal) * 100);
  const bPct = 100 - tPct;

  const lrOff = Math.abs(50 - lPct);
  const tbOff = Math.abs(50 - tPct);
  const score = Math.max(0, 10 - (lrOff + tbOff) * 0.3);

  const worstOff = Math.max(lrOff, tbOff);
  let psaTier: string;
  if (worstOff <= 5) psaTier = "PSA 10 eligible";
  else if (worstOff <= 10) psaTier = "PSA 9 range";
  else if (worstOff <= 15) psaTier = "PSA 8 range";
  else psaTier = "Below PSA 8";

  return {
    leftRight: [lPct, rPct],
    topBottom: [tPct, bPct],
    score: Math.round(score * 10) / 10,
    psaCentering: `${lPct}/${rPct} - ${tPct}/${bPct}`,
    psaTier,
  };
}

export default function CenteringCheckerPage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [overlayUrl, setOverlayUrl] = useState<string | null>(null);
  const [centering, setCentering] = useState<CenteringResult | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function handlePhoto(file: File) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    const url = URL.createObjectURL(file);
    setPhotoUrl(url);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current!;
      const scale = Math.min(600 / img.width, 840 / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        showToast("Couldn't analyze that photo — try another one", "down");
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = analyzeCentering(canvas);
      setCentering(result);
      setOverlayUrl(canvas.toDataURL("image/png"));
    };
    img.src = url;
  }

  function reset() {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl(null);
    setOverlayUrl(null);
    setCentering(null);
  }

  return (
    <div className="pb-24">
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Centering Checker</h1>
        <p className="text-xs text-muted mt-0.5">Snap a photo of your card to check its centering</p>
      </header>

      <div className="card-surface rounded-2xl p-4">
        {!photoUrl ? (
          <div className="text-center">
            <div className="relative mx-auto mb-4 rounded-xl bg-black/40 border border-line overflow-hidden" style={{ width: "200px", aspectRatio: "63/88" }}>
              <div className="absolute inset-0 flex items-center justify-center">
                {/* Corner brackets */}
                <div className="relative w-[85%] h-[85%]">
                  <div className="absolute top-0 left-0 w-5 h-5 border-t-[2.5px] border-l-[2.5px] border-white/60 rounded-tl-lg" />
                  <div className="absolute top-0 right-0 w-5 h-5 border-t-[2.5px] border-r-[2.5px] border-white/60 rounded-tr-lg" />
                  <div className="absolute bottom-0 left-0 w-5 h-5 border-b-[2.5px] border-l-[2.5px] border-white/60 rounded-bl-lg" />
                  <div className="absolute bottom-0 right-0 w-5 h-5 border-b-[2.5px] border-r-[2.5px] border-white/60 rounded-br-lg" />
                  {/* Center crosshair */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-px h-4 bg-white/30" />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-px w-4 bg-white/30" />
                  </div>
                </div>
              </div>
              <div className="absolute bottom-2 inset-x-0 text-center text-[10px] text-white/50 font-medium">
                Place card here
              </div>
            </div>
            <p className="text-sm text-muted mb-3">Snap a close-up of your card — fill the frame with even borders</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && handlePhoto(e.target.files[0])} />
            <div className="flex gap-2 justify-center">
              <Button onClick={() => fileRef.current?.click()}>Take photo</Button>
              <Button variant="ghost" onClick={() => { if (fileRef.current) { fileRef.current.removeAttribute("capture"); fileRef.current.click(); fileRef.current.setAttribute("capture", "environment"); } }}>Upload</Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="relative rounded-xl overflow-hidden bg-black flex justify-center">
              <img src={overlayUrl ?? photoUrl!} alt="Card photo with centering overlay" className="max-h-72 object-contain" />
            </div>

            {centering && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-center">
                  <div className="rounded-xl bg-white/[0.03] border border-line py-2.5 px-1">
                    <div className="text-[10px] text-muted uppercase tracking-wider">L/R centering</div>
                    <div className="text-lg font-bold tabular">{centering.leftRight[0]}/{centering.leftRight[1]}</div>
                  </div>
                  <div className="rounded-xl bg-white/[0.03] border border-line py-2.5 px-1">
                    <div className="text-[10px] text-muted uppercase tracking-wider">T/B centering</div>
                    <div className="text-lg font-bold tabular">{centering.topBottom[0]}/{centering.topBottom[1]}</div>
                  </div>
                </div>

                <div className="mt-3 text-center space-y-2">
                  <div>
                    <span className="text-sm text-muted">Score: </span>
                    <span className={`text-xl font-black tabular ${centering.score >= 9 ? "text-up" : centering.score >= 7 ? "text-accent" : "text-down"}`}>
                      {centering.score}/10
                    </span>
                  </div>
                  <div className={`inline-block text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full ${centering.score >= 9 ? "bg-up/15 text-up" : centering.score >= 7 ? "bg-accent/15 text-accent" : "bg-down/15 text-down"}`}>
                    {centering.psaTier}
                  </div>
                </div>
              </>
            )}

            <div className="mt-4 flex justify-center">
              <Button variant="ghost" onClick={reset}>Retake</Button>
            </div>
          </div>
        )}
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
