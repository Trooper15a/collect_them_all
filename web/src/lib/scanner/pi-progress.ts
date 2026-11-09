export interface PiScanProgress { captured: number; identified: number; failed: number }

/** Count unique captures sent to recognition, not polling frames or retries. */
export class PiScanCounter {
  private captures = new Map<string, { identified: boolean; failed: boolean }>();

  start(id: string) {
    if (!this.captures.has(id)) this.captures.set(id, { identified: false, failed: false });
  }

  identified(id: string) {
    this.start(id);
    const capture = this.captures.get(id)!;
    capture.identified = true; capture.failed = false;
  }

  failed(id: string) {
    this.start(id); this.captures.get(id)!.failed = true;
  }

  snapshot(): PiScanProgress {
    return { captured: this.captures.size,
      identified: [...this.captures.values()].filter(capture => capture.identified).length,
      failed: [...this.captures.values()].filter(capture => capture.failed).length };
  }
}
