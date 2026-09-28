import { test } from "node:test";
import assert from "node:assert/strict";
import { captureStill, videoGuide, cardGuide } from "../src/lib/scanner/preprocess";

test("manual capture reads the video even when ImageCapture never resolves", async () => {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const previousCapture = Object.getOwnPropertyDescriptor(globalThis, "ImageCapture");
  let drawnSource: unknown;
  let drawnCrop: number[] = [];
  Object.defineProperty(globalThis, "ImageCapture", { configurable: true, value: class {
    grabFrame() { return new Promise(() => {}); }
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    createElement: () => ({ getContext: () => ({
      drawImage: (source: unknown, ...crop: number[]) => { drawnSource = source; drawnCrop = crop; },
      getImageData: () => ({ data: new Uint8ClampedArray(224 * 224 * 4) }),
    }) }),
  } });
  const video = { videoWidth: 1280, videoHeight: 720, clientWidth: 390, clientHeight: 700 } as HTMLVideoElement;
  let timer: ReturnType<typeof setTimeout>;
  try {
    const input = await Promise.race([
      captureStill(video),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Capture stalled")), 100); }),
    ]);
    assert.equal(input.length, 3 * 224 * 224);
    assert.equal(drawnSource, video);
    const guide = videoGuide(video);
    assert.deepEqual(drawnCrop.slice(0, 4), [guide.x + guide.w * 0.02, guide.y + guide.h * 0.02, guide.w * 0.96, guide.h * 0.96]);
  } finally {
    clearTimeout(timer!);
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
    if (previousCapture) Object.defineProperty(globalThis, "ImageCapture", previousCapture);
    else Reflect.deleteProperty(globalThis, "ImageCapture");
  }
});

for (const [sourceW, sourceH, viewW, viewH] of [
  [1280, 720, 390, 700], [720, 1280, 900, 400], [1280, 1280, 390, 600],
]) {
  test(`guide crop projects back onto the visible guide (${viewW}x${viewH})`, () => {
    const video = { videoWidth: sourceW, videoHeight: sourceH, clientWidth: viewW, clientHeight: viewH } as HTMLVideoElement;
    const crop = videoGuide(video);
    const guide = cardGuide(viewW, viewH);
    const scale = Math.max(viewW / sourceW, viewH / sourceH);
    const projected = {
      x: crop.x * scale - (sourceW * scale - viewW) / 2,
      y: crop.y * scale - (sourceH * scale - viewH) / 2,
      w: crop.w * scale, h: crop.h * scale,
    };
    for (const key of ["x", "y", "w", "h"] as const) {
      assert.ok(Math.abs(projected[key] - guide[key]) < 0.001, `${key} must align`);
    }
    assert.ok(Math.abs(crop.w / crop.h - 63 / 88) < 0.001);
    assert.ok(crop.x >= 0 && crop.y >= 0 && crop.x + crop.w <= sourceW && crop.y + crop.h <= sourceH);
  });
}

test("live results clear on scene changes and reject late results, even after the original card returns", async () => {
  const { LiveScanTracker } = await import("../src/lib/scanner/live");
  const tracker = new LiveScanTracker();
  const first = new Uint8Array(64).fill(20);
  const second = new Uint8Array(64).fill(100);
  const matches = [{ card: { id: "a" }, score: 0.99 }] as import("../src/lib/scanner/matcher").Match[];
  tracker.observe(first, 0);
  const token = tracker.capture(0);
  assert.equal(tracker.publish(token, matches, 100), true);
  assert.equal(tracker.matches, matches);
  tracker.observe(second, 150);
  assert.equal(tracker.matches.length, 0);
  tracker.observe(first, 200);
  assert.equal(tracker.publish(token, matches, 250), false);
});

test("small lighting variations preserve a match but unrefreshed results expire", async () => {
  const { LiveScanTracker } = await import("../src/lib/scanner/live");
  const tracker = new LiveScanTracker();
  tracker.observe(new Uint8Array(64).fill(20), 0);
  const token = tracker.capture(0);
  const matches = [{ card: { id: "a" }, score: 0.99 }] as import("../src/lib/scanner/matcher").Match[];
  tracker.publish(token, matches, 100);
  assert.equal(tracker.observe(new Uint8Array(64).fill(23), 200), false);
  assert.equal(tracker.matches, matches);
  assert.equal(tracker.observe(new Uint8Array(64).fill(23), 6000), true);
  assert.equal(tracker.matches.length, 0);
  assert.equal(tracker.publish(token, matches, 16000), false);
});

test("a slow result is still usable when scene monitoring confirms the card stayed in place", async () => {
  const { LiveScanTracker } = await import("../src/lib/scanner/live");
  const tracker = new LiveScanTracker();
  const frame = new Uint8Array(64).fill(20);
  const matches = [{ card: { id: "a" }, score: 0.99 }] as import("../src/lib/scanner/matcher").Match[];
  tracker.observe(frame, 0);
  tracker.publish(tracker.capture(0), matches, 100);
  const pending = tracker.capture(200);
  tracker.observe(frame, 6000);
  assert.equal(tracker.matches.length, 0);
  assert.equal(tracker.publish(pending, matches, 6500), true);
});

test("scan tasks run serially and recover after a rejected task", async () => {
  const { createScanTask } = await import("../src/lib/scanner/task");
  let active = 0;
  let peak = 0;
  const run = createScanTask(async (fail: boolean) => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    active--;
    if (fail) throw new Error("Failed frame");
    return "match";
  }, 100);
  const results = await Promise.allSettled([run(true), run(false)]);
  assert.equal(peak, 1);
  assert.equal(results[0].status, "rejected");
  assert.deepEqual(results[1], { status: "fulfilled", value: "match" });
});

test("stalled scans time out without overlapping or running expired queued scans", async () => {
  const { createScanTask } = await import("../src/lib/scanner/task");
  let release!: () => void;
  let calls = 0;
  const run = createScanTask(async () => {
    calls++;
    await new Promise<void>(resolve => { release = resolve; });
  }, 20);
  await Promise.all([
    assert.rejects(run(), /Scan timed out/),
    assert.rejects(run(), /Scan timed out/),
  ]);
  assert.equal(calls, 1);
  release();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(calls, 1);
});
