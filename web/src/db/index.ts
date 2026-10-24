import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

export { schema };

// Alert queries await this promise; the additive migration must finish before
// Drizzle selects the new column. Keep its failure visible to those callers.
const alertMigrationGlobal = globalThis as typeof globalThis & { __alertsSchemaReady?: Promise<unknown> };
export const alertsSchemaReady = alertMigrationGlobal.__alertsSchemaReady ??= client.unsafe(
  `ALTER TABLE alerts ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'either'`,
);
void alertsSchemaReady.catch((error) => console.error("[db] alerts.direction migration failed", error));

const migrated = (globalThis as Record<string, unknown>).__dbMigrated;
if (!migrated) {
  (globalThis as Record<string, unknown>).__dbMigrated = true;
  client.unsafe(`ALTER TABLE portfolios ADD COLUMN IF NOT EXISTS accent_color TEXT`).catch(() => {});
  client.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium BOOLEAN NOT NULL DEFAULT false`).catch((error) => console.error("[db] users.premium migration failed", error));
  client.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT`).catch((error) => console.error("[db] users.stripe_customer_id migration failed", error));
  client.unsafe(`ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_since TEXT`).catch((error) => console.error("[db] users.premium_since migration failed", error));
}
