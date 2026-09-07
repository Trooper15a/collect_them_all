/**
 * One-time migration: SQLite → PostgreSQL.
 *
 * Usage:
 *   1. Make sure your Postgres is running (docker compose up db)
 *   2. Push the schema:  DATABASE_URL=postgresql://ripnpull:ripnpull_dev@localhost:5432/ripnpull npx drizzle-kit push
 *   3. Run this script:  DATABASE_URL=postgresql://ripnpull:ripnpull_dev@localhost:5432/ripnpull npx tsx scripts/migrate-to-postgres.ts [path/to/ripnpull.db]
 *
 * The SQLite path defaults to ./data/ripnpull.db if not provided.
 */

import Database from "better-sqlite3";
import pg from "postgres";
import path from "node:path";

const BATCH = 500;

const sqlitePath = process.argv[2] ?? path.join(process.cwd(), "data", "ripnpull.db");
const pgUrl = process.env.DATABASE_URL!;
if (!pgUrl) {
  console.error("DATABASE_URL env var is required");
  process.exit(1);
}

const lite = new Database(sqlitePath, { readonly: true });
const sql = pg(pgUrl);

interface TableDef {
  name: string;
  pgName?: string;
  boolCols?: string[];
  timestampCols?: string[];
  serialCol?: string;
}

const TABLES: TableDef[] = [
  { name: "users", timestampCols: ["email_verified"] },
  { name: "accounts" },
  { name: "sessions", timestampCols: ["expires"] },
  { name: "verification_tokens", timestampCols: ["expires"] },
  { name: "cards" },
  { name: "sets" },
  { name: "settings" },
  { name: "api_cache" },
  { name: "card_prices", serialCol: "id" },
  { name: "price_history", serialCol: "id" },
  { name: "card_links" },
  { name: "portfolios", serialCol: "id" },
  { name: "portfolio_items", serialCol: "id", boolCols: ["is_graded"] },
  { name: "portfolio_snapshots", serialCol: "id" },
  { name: "alerts", serialCol: "id" },
  { name: "box_opens", serialCol: "id" },
  { name: "box_open_items", serialCol: "id" },
];

function convertRow(row: Record<string, unknown>, def: TableDef): Record<string, unknown> {
  const out = { ...row };
  for (const col of def.boolCols ?? []) {
    if (col in out) out[col] = out[col] === 1 || out[col] === true;
  }
  for (const col of def.timestampCols ?? []) {
    if (out[col] != null && typeof out[col] === "number") {
      out[col] = new Date(out[col] as number);
    }
  }
  return out;
}

async function migrateTable(def: TableDef) {
  const tableName = def.pgName ?? def.name;
  const rows = lite.prepare(`SELECT * FROM ${def.name}`).all() as Record<string, unknown>[];
  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows (skip)`);
    return;
  }

  const cols = Object.keys(rows[0]);
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map((r) => convertRow(r, def));
    const colList = cols.map((c) => `"${c}"`).join(", ");
    const placeholders = batch
      .map((_, bi) => `(${cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(", ")})`)
      .join(", ");
    const params = batch.flatMap((r) => cols.map((c) => r[c] as string | number | boolean | null));
    await sql.unsafe(
      `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders} ON CONFLICT DO NOTHING`,
      params,
    );
    inserted += batch.length;
  }

  if (def.serialCol) {
    await sql.unsafe(
      `SELECT setval(pg_get_serial_sequence('"${tableName}"', '${def.serialCol}'), COALESCE((SELECT MAX("${def.serialCol}") FROM "${tableName}"), 0) + 1, false)`
    );
  }

  console.log(`  ${tableName}: ${inserted} rows`);
}

async function main() {
  console.log(`SQLite: ${sqlitePath}`);
  console.log(`Postgres: ${pgUrl.replace(/:[^:@]+@/, ':***@')}`);
  console.log();

  for (const def of TABLES) {
    try {
      await migrateTable(def);
    } catch (err) {
      console.error(`  ERROR migrating ${def.name}:`, err);
    }
  }

  console.log("\nDone. Verifying row counts...\n");

  for (const def of TABLES) {
    const tableName = def.pgName ?? def.name;
    const liteCount = (lite.prepare(`SELECT COUNT(*) as c FROM ${def.name}`).get() as { c: number }).c;
    const pgRows = await sql.unsafe(`SELECT COUNT(*) as c FROM "${tableName}"`);
    const pgCount = Number(pgRows[0].c);
    const match = liteCount === pgCount ? "OK" : "MISMATCH";
    console.log(`  ${tableName}: SQLite=${liteCount} Postgres=${pgCount} [${match}]`);
  }

  lite.close();
  await sql.end();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
