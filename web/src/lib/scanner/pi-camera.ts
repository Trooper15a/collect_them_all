const PI_URL = "http://10.12.194.1:8000";

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(`${PI_URL}${path}`, {
      ...init, credentials: "omit", cache: "no-store",
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(35000)]) : AbortSignal.timeout(35000),
      // Chrome's local-network permission allows the secure app to reach the USB Pi.
      targetAddressSpace: "local",
    } as RequestInit & { targetAddressSpace: string });
  } catch (cause) {
    if (cause instanceof Error && cause.name === "AbortError") throw cause;
    throw new Error("Could not reach the Pi. Check its USB cable, allow local-network access in Chrome, and install the Pi service update.");
  }
}

export async function connectPi(signal?: AbortSignal): Promise<void> {
  const response = await request("/api/health", { signal });
  if (!response.ok) throw new Error("The Pi camera service is unavailable.");
  const health = await response.json();
  if (!health.ready || !health.directCapture) throw new Error("Install the Pi service update, then connect again.");
}

export async function capturePi(signal?: AbortSignal): Promise<Blob> {
  const response = await request("/api/capture", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal,
  });
  if (!response.ok) throw new Error(response.status === 409 ? "The Pi camera is busy. Try again."
    : "The Pi could not capture a photo. Check its camera connection and try again.");
  if (!response.headers.get("Content-Type")?.startsWith("image/jpeg")) throw new Error("The Pi returned an invalid photo.");
  const length = Number(response.headers.get("Content-Length"));
  if (length > 30_000_000) throw new Error("The Pi photo is too large.");
  const blob = await response.blob();
  if (blob.size < 4 || blob.size > 30_000_000 || (length && length !== blob.size)) throw new Error("The Pi photo transfer was incomplete.");
  const head = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  const tail = new Uint8Array(await blob.slice(-2).arrayBuffer());
  if (head[0] !== 255 || head[1] !== 216 || tail[0] !== 255 || tail[1] !== 217) throw new Error("The Pi returned an invalid JPEG.");
  return blob;
}
