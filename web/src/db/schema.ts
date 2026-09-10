import { bigint, boolean, doublePrecision, index, integer, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/* ─── Auth tables (NextAuth / Auth.js) ─── */

export const users = pgTable("users", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable("accounts", {
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })]);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("verification_tokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })]);

/* ─── Card data ─── */

/** Unified card ids: `tp:<tcgcsv product id>`. Legacy prefixes: `pw:`, `sf:`, `ygo:`. */
export const cards = pgTable(
  "cards",
  {
    id: text("id").primaryKey(),
    tcg: text("tcg").notNull(), // pokemon | mtg | yugioh | onepiece | ...
    name: text("name").notNull(),
    setName: text("set_name"),
    setCode: text("set_code"),
    setId: text("set_id"),
    cardNumber: text("card_number"),
    rarity: text("rarity"),
    variant: text("variant"),
    language: text("language").notNull().default("eng"),
    imageUrl: text("image_url"),
    imageCachedPath: text("image_cached_path"),
    releaseDate: text("release_date"),
    sourceId: text("source_id").notNull(),
    /** Full normalised price object (see lib/types.ts CardPrices) as JSON. */
    pricesJson: text("prices_json"),
    priceUpdatedAt: text("price_updated_at"),
    /** Extra metadata (hp, types, attacks, oracle text...) as JSON. */
    metaJson: text("meta_json"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [index("cards_tcg_idx").on(t.tcg), index("cards_set_idx").on(t.setCode), index("cards_name_idx").on(t.name)],
);

export const cardPrices = pgTable(
  "card_prices",
  {
    id: serial("id").primaryKey(),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    variantType: text("variant_type").notNull().default("normal"),
    source: text("source").notNull(), // tcgplayer | cardmarket | scryfall | ygoprodeck
    currency: text("currency").notNull(), // USD | EUR
    market: doublePrecision("market"),
    low: doublePrecision("low"),
    mid: doublePrecision("mid"),
    high: doublePrecision("high"),
    trend: doublePrecision("trend"),
    avg1: doublePrecision("avg1"),
    avg7: doublePrecision("avg7"),
    avg30: doublePrecision("avg30"),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("card_prices_unique").on(t.cardId, t.date, t.variantType, t.source),
    index("card_prices_card_idx").on(t.cardId),
  ],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    variantType: text("variant_type").notNull().default("normal"),
    tcgplayerMarket: doublePrecision("tcgplayer_market"),
    cardmarketAvg: doublePrecision("cardmarket_avg"),
  },
  (t) => [
    uniqueIndex("price_history_unique").on(t.cardId, t.date, t.variantType),
    index("price_history_card_idx").on(t.cardId),
  ],
);

export const portfolios = pgTable("portfolios", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  tcgId: text("tcg_id"),
  language: text("language"),
  accentColor: text("accent_color"),
  createdAt: text("created_at").notNull(),
});

export const portfolioItems = pgTable(
  "portfolio_items",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolio_id").notNull().references(() => portfolios.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull().references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
    variantType: text("variant_type").notNull().default("normal"),
    condition: text("condition").notNull().default("NM"), // NM LP MP HP DMG
    isGraded: boolean("is_graded").notNull().default(false),
    gradingCompany: text("grading_company"),
    grade: text("grade"),
    certNumber: text("cert_number"),
    costBasis: doublePrecision("cost_basis"),
    costCurrency: text("cost_currency").notNull().default("USD"),
    notes: text("notes"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [index("items_portfolio_idx").on(t.portfolioId), index("items_card_idx").on(t.cardId)],
);

export const portfolioSnapshots = pgTable(
  "portfolio_snapshots",
  {
    id: serial("id").primaryKey(),
    portfolioId: integer("portfolio_id"),
    date: text("date").notNull(),
    valueUsd: doublePrecision("value_usd").notNull(),
    costUsd: doublePrecision("cost_usd").notNull(),
    itemCount: integer("item_count").notNull(),
  },
  (t) => [uniqueIndex("snapshots_unique").on(t.portfolioId, t.date)],
);

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** Generic API response cache (search results, set lists, fx rates). */
export const apiCache = pgTable("api_cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: bigint("expires_at", { mode: "number" }).notNull(),
});

export const sets = pgTable(
  "sets",
  {
    id: text("id").primaryKey(), // `${tcg}:${code}:${language}`
    tcg: text("tcg").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    language: text("language").notNull().default("eng"),
    total: integer("total"),
    releaseDate: text("release_date"),
    imageUrl: text("image_url"),
  },
  (t) => [index("sets_tcg_idx").on(t.tcg)],
);

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  thresholdPct: doublePrecision("threshold_pct").notNull().default(10),
  basePrice: doublePrecision("base_price"),
  baseCurrency: text("base_currency"),
  variantType: text("variant_type").notNull().default("normal"),
  createdAt: text("created_at").notNull(),
  lastTriggeredAt: text("last_triggered_at"),
  acknowledgedAt: text("acknowledged_at"),
}, (t) => [uniqueIndex("alerts_card_unique").on(t.cardId)]);

export const cardLinks = pgTable("card_links", {
  scanId: text("scan_id").primaryKey(),
  cardId: text("card_id").references(() => cards.id),
  method: text("method").notNull(), // setcode+number | name+number | manual | none
  createdAt: text("created_at").notNull(),
});

export const boxOpens = pgTable("box_opens", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  productType: text("product_type").notNull().default("booster_box"),
  setCode: text("set_code"),
  setName: text("set_name"),
  cost: doublePrecision("cost").notNull(),
  costCurrency: text("cost_currency").notNull().default("CAD"),
  openedAt: text("opened_at").notNull(),
  createdAt: text("created_at").notNull(),
});

export const boxOpenItems = pgTable(
  "box_open_items",
  {
    id: serial("id").primaryKey(),
    boxOpenId: integer("box_open_id").notNull().references(() => boxOpens.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull().references(() => cards.id),
    quantity: integer("quantity").notNull().default(1),
    variantType: text("variant_type").notNull().default("normal"),
    addedAt: text("added_at").notNull(),
  },
  (t) => [index("box_items_open_idx").on(t.boxOpenId), index("box_items_card_idx").on(t.cardId)],
);

export const wishlistItems = pgTable("wishlist_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  cardId: text("card_id").notNull().references(() => cards.id, { onDelete: "cascade" }),
  targetPrice: doublePrecision("target_price"),
  targetCurrency: text("target_currency").default("USD"),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
}, (t) => [
  uniqueIndex("wishlist_user_card").on(t.userId, t.cardId),
  index("wishlist_user_idx").on(t.userId),
]);

export type User = typeof users.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Portfolio = typeof portfolios.$inferSelect;
export type PortfolioItem = typeof portfolioItems.$inferSelect;
export type SetRow = typeof sets.$inferSelect;
export type BoxOpen = typeof boxOpens.$inferSelect;
export type BoxOpenItem = typeof boxOpenItems.$inferSelect;
