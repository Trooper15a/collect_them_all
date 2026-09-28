import type { Match } from "./matcher";
import { fingerprintDiff } from "./preprocess";

const MAX_AGE_MS = 5000;
const MAX_CAPTURE_AGE_MS = 15000;
export const SCENE_CHANGE_THRESHOLD = 15;

/** Track scene generations so late inference cannot restore a removed card. */
export class LiveScanTracker {
  private fingerprint: Uint8Array | null = null;
  private generation = 0;
  private resultAt = 0;
  matches: Match[] = [];

  clear() {
    this.generation++;
    this.matches = [];
  }

  observe(frame: Uint8Array, now = performance.now()): boolean {
    const changed = this.fingerprint !== null && fingerprintDiff(this.fingerprint, frame) >= SCENE_CHANGE_THRESHOLD;
    if (!this.fingerprint || changed) this.fingerprint = frame;
    if (changed) {
      this.clear();
      return true;
    }
    if (this.matches.length > 0 && now - this.resultAt > MAX_AGE_MS) {
      // Hide an unrefreshed result without discarding an in-flight scan of the
      // same continuously observed scene (important on slower phones).
      this.matches = [];
      return true;
    }
    return false;
  }

  capture(now = performance.now()) {
    return { generation: this.generation, startedAt: now };
  }

  publish(token: ReturnType<LiveScanTracker["capture"]>, matches: Match[], now = performance.now()) {
    if (token.generation !== this.generation || now - token.startedAt > MAX_CAPTURE_AGE_MS) return false;
    this.matches = matches;
    this.resultAt = now;
    return true;
  }
}
