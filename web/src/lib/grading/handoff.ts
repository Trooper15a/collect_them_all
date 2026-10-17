/** One photo passed from the Pi's HTTP camera window to the app window. */
export const PI_CAMERA_ORIGIN = "http://10.12.194.1:8000";
export type CardSide = "front" | "back";

export function parsePiPhotoMessage(
  event: { origin: string; source: unknown; data: unknown },
  expectedWindow: unknown,
  expectedSession: string,
): { side: CardSide; bytes: ArrayBuffer } | null {
  if (!expectedWindow || event.source !== expectedWindow || event.origin !== PI_CAMERA_ORIGIN) return null;
  if (!expectedSession || !event.data || typeof event.data !== "object") return null;
  const message = event.data as Record<string, unknown>;
  if (message.type !== "rnp-photo" || message.session !== expectedSession ||
      (message.side !== "front" && message.side !== "back") ||
      !(message.bytes instanceof ArrayBuffer)) return null;
  const bytes = new Uint8Array(message.bytes);
  if (bytes.length < 4 || bytes.length > 30_000_000 ||
      bytes[0] !== 0xff || bytes[1] !== 0xd8 ||
      bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) return null;
  return { side: message.side, bytes: message.bytes };
}
