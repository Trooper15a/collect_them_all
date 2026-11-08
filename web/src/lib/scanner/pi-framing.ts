import type { CropRect } from "@/lib/grading/analysis";

export interface SceneSample { width: number; height: number; pixels: Uint8ClampedArray; aspect: number }

export function sampleScene(image: ImageBitmap): SceneSample {
  const canvas = document.createElement("canvas"); canvas.width = 96; canvas.height = 64;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Camera framing checks are unavailable.");
  context.drawImage(image, 0, 0, 96, 64);
  return { width: 96, height: 64, pixels: context.getImageData(0, 0, 96, 64).data, aspect: image.width / image.height };
}

/** Conservative background-subtraction check, not proof of a complete card.
 * Anything clipped, too wide/narrow, or indistinguishable from the calibrated
 * stand must be reviewed instead of automatically entering the ready queue. */
export function framingIssue(current: SceneSample, empty: SceneSample, crop: CropRect): string | undefined {
  const { width, height, pixels, aspect } = current;
  if (width !== empty.width || height !== empty.height || pixels.length !== empty.pixels.length) return "Camera position changed — recalibrate the empty stand.";
  const size = width * height;
  const offsets = Array.from({ length: height }, (_, row) => [0, 1, 2].map(channel => {
    const differences = Array.from({ length: width }, (_, x) => pixels[(row * width + x) * 4 + channel] - empty.pixels[(row * width + x) * 4 + channel]);
    differences.sort((a, b) => a - b); return differences[Math.floor(width / 2)];
  }));
  const changed = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    let difference = 0;
    for (let channel = 0; channel < 3; channel++) difference += Math.abs(pixels[i * 4 + channel] - empty.pixels[i * 4 + channel] - offsets[Math.floor(i / width)][channel]);
    changed[i] = difference / 3 > 24 ? 1 : 0;
  }
  // Join small gaps in artwork before finding the main changed object.
  const mask = changed.slice();
  for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
    if (changed[y * width + x]) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) mask[(y + dy) * width + x + dx] = 1;
  }
  let best: { area: number; left: number; right: number; top: number; bottom: number } | undefined;
  for (let start = 0; start < size; start++) {
    if (!mask[start]) continue;
    mask[start] = 0;
    const stack = [start]; let area = 0, left = width, right = 0, top = height, bottom = 0;
    while (stack.length) {
      const index = stack.pop()!; const x = index % width, y = Math.floor(index / width);
      area++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
      const neighbors = [x > 0 ? index - 1 : -1, x < width - 1 ? index + 1 : -1, y > 0 ? index - width : -1, y < height - 1 ? index + width : -1];
      for (const next of neighbors) if (next >= 0 && mask[next]) { mask[next] = 0; stack.push(next); }
    }
    if (!best || area > best.area) best = { area, left, right, top, bottom };
  }
  if (!best || best.area < size * 0.025) return "Could not verify the whole card — check the framing.";
  if (best.left <= 1 || best.right >= width - 2 || best.top <= 1 || best.bottom >= height - 2) return "The card may be cut off at the edge of the photo.";
  const margin = 2;
  if (best.left < crop.x * width - margin || best.right > (crop.x + crop.width) * width + margin ||
    best.top < crop.y * height - margin || best.bottom > (crop.y + crop.height) * height + margin) return "The card extends outside the scan area — adjust the outline.";
  const ratio = ((best.right - best.left + 1) / width * aspect) / ((best.bottom - best.top + 1) / height);
  if (ratio < 0.5 || ratio > 0.95) return "The whole upright card is not clearly framed — review this capture.";
  return undefined;
}
