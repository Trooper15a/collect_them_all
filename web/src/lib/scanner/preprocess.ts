/** Must match ml/model.py MEAN/STD and ml/dataset.py normalize_tf (resize to 224x224, ImageNet norm, NCHW). */
export const IMAGE_SIZE = 224;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

/**
 * Crop `source` to `crop` (in source pixels), resize to 224x224 and return a normalised
 * Float32Array in NCHW layout ready for the ONNX model.
 *
 * Applies a 5% inward margin to avoid background bleed at edges, and clamps
 * glare hotspots (pixels brighter than the 95th-percentile luminance) so
 * specular reflections don't dominate the embedding.
 */
export function preprocess(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  crop?: { x: number; y: number; w: number; h: number },
  scratch?: HTMLCanvasElement,
): Float32Array {
  const canvas = scratch ?? document.createElement("canvas");
  canvas.width = IMAGE_SIZE;
  canvas.height = IMAGE_SIZE;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const sw = "videoWidth" in source ? source.videoWidth : source.width;
  const sh = "videoHeight" in source ? source.videoHeight : source.height;
  const raw = crop ?? { x: 0, y: 0, w: sw, h: sh };
  const margin = 0.05;
  const c = {
    x: raw.x + raw.w * margin,
    y: raw.y + raw.h * margin,
    w: raw.w * (1 - 2 * margin),
    h: raw.h * (1 - 2 * margin),
  };
  ctx.drawImage(source, c.x, c.y, c.w, c.h, 0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const { data } = ctx.getImageData(0, 0, IMAGE_SIZE, IMAGE_SIZE);
  const n = IMAGE_SIZE * IMAGE_SIZE;

  // Find 95th-percentile luminance to detect glare threshold.
  const lums = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    lums[i] = Math.round(0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2]);
  }
  const sorted = lums.slice().sort();
  const p95 = sorted[Math.floor(n * 0.95)];
  const glareThresh = Math.max(p95, 200);

  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const off = i * 4;
    const lum = 0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2];
    let scale = 1;
    if (lum > glareThresh) scale = glareThresh / lum;
    out[i] = ((data[off] * scale) / 255 - MEAN[0]) / STD[0];
    out[n + i] = ((data[off + 1] * scale) / 255 - MEAN[1]) / STD[1];
    out[2 * n + i] = ((data[off + 2] * scale) / 255 - MEAN[2]) / STD[2];
  }
  return out;
}

/**
 * Estimate sharpness of a 224x224 canvas by computing the variance of a
 * Laplacian approximation (sum of absolute horizontal + vertical differences).
 * Higher = sharper. Returns true when the frame is sharp enough to scan.
 */
export function isSharp(
  source: HTMLVideoElement,
  crop: { x: number; y: number; w: number; h: number },
  scratch?: HTMLCanvasElement,
  threshold = 8,
): boolean {
  const size = 64;
  const canvas = scratch ?? document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, size, size);
  const { data } = ctx.getImageData(0, 0, size, size);
  const gray = new Uint8Array(size * size);
  for (let i = 0; i < gray.length; i++) {
    const off = i * 4;
    gray[i] = Math.round(0.299 * data[off] + 0.587 * data[off + 1] + 0.114 * data[off + 2]);
  }
  let sum = 0;
  let count = 0;
  for (let y = 1; y < size - 1; y++) {
    for (let x = 1; x < size - 1; x++) {
      const idx = y * size + x;
      const lap = Math.abs(gray[idx - 1] + gray[idx + 1] + gray[idx - size] + gray[idx + size] - 4 * gray[idx]);
      sum += lap;
      count++;
    }
  }
  return (sum / count) >= threshold;
}

/** Card-shaped guide rectangle (63x88mm aspect) centred in a viewport. */
export function cardGuide(viewW: number, viewH: number, fill = 0.78) {
  const aspect = 63 / 88;
  let w = viewW * fill;
  let h = w / aspect;
  if (h > viewH * 0.85) {
    h = viewH * 0.85;
    w = h * aspect;
  }
  return { x: (viewW - w) / 2, y: (viewH - h) / 2, w, h };
}
