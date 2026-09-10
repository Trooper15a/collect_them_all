import { eq, lt } from "drizzle-orm";
import { db, schema } from "@/db";

/** Read-through cache stored in Postgres. TTL in seconds. Falls through to fetcher on DB errors. */
export async function cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const now = Date.now();
  try {
    const rows = await db.select().from(schema.apiCache).where(eq(schema.apiCache.key, key)).limit(1);
    const row = rows[0];
    if (row && row.expiresAt > now) return JSON.parse(row.value) as T;
  } catch {
    // DB unreachable — skip cache read, fall through to fetcher
  }
  const value = await fetcher();
  try {
    await db.insert(schema.apiCache)
      .values({ key, value: JSON.stringify(value), expiresAt: now + ttlSeconds * 1000 })
      .onConflictDoUpdate({ target: schema.apiCache.key, set: { value: JSON.stringify(value), expiresAt: now + ttlSeconds * 1000 } });
    if (Math.random() < 0.02) await db.delete(schema.apiCache).where(lt(schema.apiCache.expiresAt, now));
  } catch {
    // DB unreachable — value still usable, just not cached
  }
  return value;
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  try {
    const rows = await db.select().from(schema.settings).where(eq(schema.settings.key, key)).limit(1);
    return rows[0]?.value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting(key: string, value: string) {
  await db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } });
}

/** In-process sliding-window rate limiter for outbound API calls. */
export class RateLimiter {
  private hour: number[] = [];
  private day: number[] = [];
  constructor(private perHour: number, private perDay: number, private minIntervalMs = 0) {}
  private last = 0;
  async acquire(): Promise<void> {
    const now = Date.now();
    this.hour = this.hour.filter((t) => now - t < 3_600_000);
    this.day = this.day.filter((t) => now - t < 86_400_000);
    if (this.hour.length >= this.perHour || this.day.length >= this.perDay) {
      throw new RateLimitError(this.hour.length >= this.perHour ? "hourly" : "daily");
    }
    const wait = this.minIntervalMs - (now - this.last);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const t = Date.now();
    this.hour.push(t);
    this.day.push(t);
    this.last = t;
  }
  get remaining() {
    const now = Date.now();
    return {
      hour: this.perHour - this.hour.filter((t) => now - t < 3_600_000).length,
      day: this.perDay - this.day.filter((t) => now - t < 86_400_000).length,
    };
  }
}

export class RateLimitError extends Error {
  constructor(public window: "hourly" | "daily") {
    super(`${window} rate limit reached`);
  }
}
