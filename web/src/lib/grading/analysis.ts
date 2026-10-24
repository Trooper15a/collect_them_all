/** Browser-side measurements for a pre-grade. These are observations, not certified grades. */
export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface CropRect { x: number; y: number; width: number; height: number }

export interface CenteringMeasurement {
  leftRight: [number, number];
  topBottom: [number, number];
  confidence: "measured" | "unavailable";
  reason?: string;
}

export interface PhotoCheck {
  sharpness: number;
  meanBrightness: number;
  clippedHighlights: number;
  issues: string[];
  centering: CenteringMeasurement;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function normalizeCrop(rect: CropRect): CropRect {
  const x = clamp(rect.x, 0, 0.95);
  const y = clamp(rect.y, 0, 0.95);
  return {
    x,
    y,
    width: clamp(rect.width, 0.03, 1 - x),
    height: clamp(rect.height, 0.03, 1 - y),
  };
}

/** Find the central non-green component inside the scanner's green card holder. */
export function suggestCardCrop(image: PixelImage): CropRect | null {
  const { width: w, height: h, data } = image;
  if (w < 80 || h < 80 || data.length < w * h * 4) return null;
  const isHolder = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    const r = data[p], g = data[p + 1], b = data[p + 2];
    // The actual jig has both lime and dark green bricks. A few foil glints
    // can also be green, so require agreement across several scanlines.
    return (g > r * 1.08 && g > b * 1.4 && g - r > 12) ||
      (g > r * 1.17 && g > b * 1.12 && g - r > 14);
  };
  const rows = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65].map((v) => Math.floor(h * v));
  const columns = [0.40, 0.45, 0.50, 0.55, 0.60].map((v) => Math.floor(w * v));
  const holderColumn = (x: number) => rows.filter((y) => isHolder(x, y)).length / rows.length >= 0.6;
  const holderRow = (y: number) => columns.filter((x) => isHolder(x, y)).length / columns.length >= 0.6;
  const runLength = Math.max(4, Math.round(Math.min(w, h) * 0.018));
  function transition(start: number, step: number, limit: number, holder: (at: number) => boolean): number | null {
    let run = 0;
    for (let at = start; at >= 0 && at < limit; at += step) {
      run = holder(at) ? run + 1 : 0;
      if (run >= runLength) return at - step * (runLength - 1);
    }
    return null;
  }
  let left = transition(Math.floor(w * 0.5), -1, w, holderColumn);
  let right = transition(Math.floor(w * 0.5), 1, w, holderColumn);
  const top = transition(Math.floor(h * 0.5), -1, h, holderRow);
  const bottom = transition(Math.floor(h * 0.5), 1, h, holderRow);
  // One edge of this jig can be shadowed by the white side clamp. The card
  // lies landscape in it, so use its known 88:63 aspect as a bounded fallback.
  if (top != null && bottom != null) {
    const expectedWidth = (bottom - top) * 88 / 63;
    if (left != null && right == null && left + expectedWidth < w * 0.90) right = Math.round(left + expectedWidth);
    if (right != null && left == null && right - expectedWidth > w * 0.10) left = Math.round(right - expectedWidth);
  }
  if (left == null || right == null || top == null || bottom == null) return null;
  const bw = right - left, bh = bottom - top;
  if (bw < w * 0.25 || bh < h * 0.25 || bw > w * 0.75 || bh > h * 0.84) return null;
  const aspect = bw / bh;
  if (aspect < 0.55 || aspect > 1.8) return null;
  return normalizeCrop({
    x: left / w, y: top / h, width: bw / w, height: bh / h,
  });
}

function median(values: number[]): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Estimate a printed border only when both opposite edges are clearly visible. */
export function measureCentering(image: PixelImage, rect: CropRect): CenteringMeasurement {
  const { width: w, height: h, data } = image;
  const c = normalizeCrop(rect);
  const x0 = Math.floor(c.x * w), y0 = Math.floor(c.y * h);
  const cw = Math.floor(c.width * w), ch = Math.floor(c.height * h);
  const color = (x: number, y: number): [number, number, number] => {
    const p = ((y0 + y) * w + x0 + x) * 4;
    return [data[p], data[p + 1], data[p + 2]];
  };
  const distance = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
  function border(from: "left" | "right" | "top" | "bottom", fraction: number): number {
    const horizontal = from === "left" || from === "right";
    const length = horizontal ? cw : ch;
    const cross = Math.floor((horizontal ? ch : cw) * fraction);
    const point = (depth: number) => horizontal
      ? color(from === "left" ? depth : cw - 1 - depth, cross)
      : color(cross, from === "top" ? depth : ch - 1 - depth);
    const reference = point(Math.max(2, Math.floor(length * 0.012)));
    for (let depth = Math.floor(length * 0.025); depth < length * 0.28; depth++) {
      if (distance(point(depth), reference) > 75 &&
          distance(point(Math.min(length - 1, depth + 3)), reference) > 75) return depth;
    }
    return 0;
  }
  const measure = (side: "left" | "right" | "top" | "bottom") => {
    const found: number[] = [];
    for (let i = 0; i < 17; i++) {
      const n = border(side, 0.30 + i * 0.025);
      if (n) found.push(n);
    }
    return found.length >= 9 ? median(found) : 0;
  };
  const left = measure("left"), right = measure("right"), top = measure("top"), bottom = measure("bottom");
  const valid = (a: number, b: number, size: number) => a >= size * 0.012 && b >= size * 0.012 &&
    a <= size * 0.25 && b <= size * 0.25;
  if (!valid(left, right, cw) || !valid(top, bottom, ch)) {
    return { leftRight: [0, 0], topBottom: [0, 0], confidence: "unavailable",
      reason: "A complete printed border was not detected. Check the crop or assess centering manually." };
  }
  const lr = Math.round(left / (left + right) * 100);
  const tb = Math.round(top / (top + bottom) * 100);
  return { leftRight: [lr, 100 - lr], topBottom: [tb, 100 - tb], confidence: "measured" };
}

export function inspectPhoto(image: PixelImage, rect: CropRect): PhotoCheck {
  const { width: w, height: h, data } = image;
  const c = normalizeCrop(rect);
  const x0 = Math.floor(c.x * w), y0 = Math.floor(c.y * h);
  const x1 = Math.min(w, Math.ceil((c.x + c.width) * w));
  const y1 = Math.min(h, Math.ceil((c.y + c.height) * h));
  const luminance = (x: number, y: number) => {
    const p = (y * w + x) * 4;
    return (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) / 256;
  };
  let samples = 0, sum = 0, clipped = 0, sharp = 0;
  const stride = Math.max(1, Math.floor(Math.min(x1 - x0, y1 - y0) / 500));
  for (let y = y0 + stride; y < y1 - stride; y += stride) for (let x = x0 + stride; x < x1 - stride; x += stride) {
    const p = (y * w + x) * 4;
    sum += luminance(x, y);
    if (data[p] > 248 && data[p + 1] > 248 && data[p + 2] > 248) clipped++;
    sharp += Math.abs(4 * luminance(x, y) - luminance(x - stride, y) - luminance(x + stride, y) -
      luminance(x, y - stride) - luminance(x, y + stride));
    samples++;
  }
  const meanBrightness = sum / Math.max(1, samples);
  const clippedHighlights = clipped / Math.max(1, samples);
  const sharpness = sharp / Math.max(1, samples);
  const issues: string[] = [];
  if (meanBrightness < 45) issues.push("The card looks underexposed; add even light and retake.");
  if (meanBrightness > 225) issues.push("The card looks overexposed; reduce light and retake.");
  if (clippedHighlights > 0.05) issues.push("Bright areas may hide surface detail; check for glare.");
  if (sharpness < 7) issues.push("The card may be out of focus; inspect the corners at full size.");
  return { sharpness, meanBrightness, clippedHighlights, issues, centering: measureCentering(image, c) };
}

export interface ConditionScores { centering: number; corners: number; edges: number; surface: number }

export function estimatePregrade(scores: ConditionScores): { score: number; low: number; high: number } {
  const values = Object.values(scores).map((n) => clamp(n, 1, 10));
  const average = values.reduce((a, b) => a + b, 0) / values.length;
  const raw = Math.min(average, Math.min(...values) + 1);
  const score = Math.round(raw * 2) / 2;
  return { score, low: Math.max(1, score - 1), high: Math.min(10, score + 1) };
}
