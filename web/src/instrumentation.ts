export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await ensureTables();
    const { startCron } = await import("./lib/cron");
    startCron();
  }
}

async function ensureTables() {
  try {
    const { db } = await import("./db");
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS decks (
        id SERIAL PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        tcg TEXT NOT NULL,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        source_url TEXT,
        format TEXT,
        author TEXT,
        "placing" INTEGER,
        tournament_name TEXT,
        created_at TEXT NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS decks_user_idx ON decks(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS decks_tcg_idx ON decks(tcg)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS deck_cards (
        id SERIAL PRIMARY KEY,
        deck_id INTEGER NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
        card_id TEXT REFERENCES cards(id),
        card_name TEXT NOT NULL,
        set_code TEXT,
        card_number TEXT,
        quantity INTEGER NOT NULL DEFAULT 1,
        section TEXT NOT NULL DEFAULT 'main'
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS deck_cards_deck_idx ON deck_cards(deck_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS deck_cards_card_idx ON deck_cards(card_id)`);
    console.log("[startup] deck tables ensured");
  } catch (err) {
    console.error("[startup] failed to ensure deck tables:", err);
  }
}
