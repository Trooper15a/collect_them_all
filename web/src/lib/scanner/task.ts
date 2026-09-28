/** Bound the caller's wait while keeping uncancellable inference strictly serial. */
export function createScanTask<Args extends unknown[], Result>(
  task: (...args: Args) => Promise<Result>,
  timeoutMs = 15000,
): (...args: Args) => Promise<Result> {
  let tail: Promise<unknown> = Promise.resolve();
  return (...args) => {
    let expired = false;
    let timer: ReturnType<typeof setTimeout>;
    const timeoutError = new Error("Scan timed out — try again. If it keeps happening, reload the page.");
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { expired = true; reject(timeoutError); }, timeoutMs);
    });
    const result = tail.then(() => {
      if (expired) throw timeoutError;
      return task(...args);
    });
    // A timeout cannot cancel ONNX. Keep the lock until the real task settles.
    tail = result.catch(() => {});
    return Promise.race([result, timeout]).finally(() => clearTimeout(timer));
  };
}
