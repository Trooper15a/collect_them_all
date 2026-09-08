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
}
