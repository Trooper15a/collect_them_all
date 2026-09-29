import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

export { schema };

const migrated = (globalThis as Record<string, unknown>).__dbMigrated;
if (!migrated) {
  (globalThis as Record<string, unknown>).__dbMigrated = true;
  client.unsafe(`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS accent_color TEXT`).catch(() => {});
  client.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium BOOLEAN NOT NULL DEFAULT false`).catch((error) => console.error("[db] users.premium migration failed", error));
  client.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`).catch((error) => console.error("[db] users.stripe_customer_id migration failed", error));
  client.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_since TEXT`).catch((error) => console.error("[db] users.premium_since migration failed", error));
}
