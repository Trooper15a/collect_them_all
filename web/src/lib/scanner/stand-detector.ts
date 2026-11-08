/** Detect changes relative to an empty stand. A captured card must be removed
 * before another can trigger, even if the next card is an identical copy. */
export class StandDetector {
  private empty: Float32Array | null = null;
  private previous: Float32Array | null = null;
  private emptyFrames = 0;
  private waitingForRemoval = false;
  cardPresent = false;

  calibrate(frame: Float32Array) {
    this.empty = frame.slice();
    this.previous = null;
    this.emptyFrames = 0;
    this.cardPresent = false;
    this.waitingForRemoval = false;
  }

  observe(frame: Float32Array): "empty" | "settling" | "capture" | "remove" {
    if (!this.empty) throw new Error("Calibrate the empty stand first.");
    const distance = frameDistance(frame, this.empty);
    this.cardPresent = distance >= 12;
    const stable = this.previous !== null && frameDistance(frame, this.previous) < 4;
    this.previous = frame.slice();
    if (distance < 6) {
      if (++this.emptyFrames >= 2) this.waitingForRemoval = false;
      return this.waitingForRemoval ? "remove" : "empty";
    }
    this.emptyFrames = 0;
    if (this.waitingForRemoval) return "remove";
    if (distance < 12 || !stable) return "settling";
    this.waitingForRemoval = true;
    return "capture";
  }
}

/** Ignore horizontal rolling-shutter lighting bands as well as exposure shifts.
 * Compare spatial texture within each row, rather than treating moving light
 * stripes on the empty white stand as a card or continued motion. */
export function frameDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || !a.length || a.length % 3) throw new Error("Invalid stand fingerprint.");
  const side = Math.sqrt(a.length / 3);
  const rows = Number.isInteger(side) ? side : 1;
  const rowLength = a.length / rows;
  let total = 0;
  for (let row = 0; row < rows; row++) {
    const offsets = [0, 0, 0], start = row * rowLength;
    for (let i = 0; i < rowLength; i++) offsets[i % 3] += a[start + i] - b[start + i];
    for (let c = 0; c < 3; c++) offsets[c] /= rowLength / 3;
    for (let i = 0; i < rowLength; i++) total += Math.abs(a[start + i] - b[start + i] - offsets[i % 3]);
  }
  return total / a.length;
}

export async function photoFingerprint(blob: Blob): Promise<Float32Array> {
  const image = await createImageBitmap(blob);
  try {
    return imageFingerprint(image, { x: 0.2, y: 0.08, width: 0.6, height: 0.84 });
  } finally { image.close(); }
}

export function imageFingerprint(image: ImageBitmap, region: { x: number; y: number; width: number; height: number }): Float32Array {
    const canvas = document.createElement("canvas");
    canvas.width = 32; canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Stand detection is unavailable in this browser.");
    // The card stand should be centered in the camera's view.
    context.drawImage(image, image.width * region.x, image.height * region.y,
      image.width * region.width, image.height * region.height, 0, 0, 32, 32);
    const pixels = context.getImageData(0, 0, 32, 32).data;
    const result = new Float32Array(32 * 32 * 3);
    for (let i = 0; i < 32 * 32; i++) {
      result[i * 3] = pixels[i * 4]; result[i * 3 + 1] = pixels[i * 4 + 1]; result[i * 3 + 2] = pixels[i * 4 + 2];
    }
    return result;
}
