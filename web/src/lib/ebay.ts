let _db: typeof import("@/db").db | null = null;
let _schema: typeof import("@/db").schema | null = null;
let _eq: typeof import("drizzle-orm").eq | null = null;
let _and: typeof import("drizzle-orm").and | null = null;
let _gt: typeof import("drizzle-orm").gt | null = null;

async function getDb() {
  if (_db) return { db: _db, schema: _schema!, eq: _eq!, and: _and!, gt: _gt! };
  try {
    const dbMod = await import("@/db");
    const orm = await import("drizzle-orm");
    _db = dbMod.db;
    _schema = dbMod.schema;
    _eq = orm.eq;
    _and = orm.and;
    _gt = orm.gt;
    return { db: _db, schema: _schema, eq: _eq, and: _and, gt: _gt };
  } catch {
    return null;
  }
}

const EBAY_CLIENT_ID = process.env.EBAY_CLIENT_ID ?? "";
const EBAY_CLIENT_SECRET = process.env.EBAY_CLIENT_SECRET ?? "";
const TOKEN_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE_URL = "https://api.ebay.com/buy/browse/v1/item_summary/search";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token;
  }
  const creds = Buffer.from(`${EBAY_CLIENT_ID}:${EBAY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials&scope=https://api.ebay.com/oauth/api_scope",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`eBay token error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export interface EbaySoldItem {
  title: string;
  price: number;
  currency: string;
  date: string;
  imageUrl: string | null;
  itemUrl: string;
  condition: string | null;
}

export interface EbaySoldResult {
  raw: EbaySoldItem[];
  graded: { grade: string; items: EbaySoldItem[] }[];
  cached: boolean;
}

function buildSearchQuery(
  cardName: string,
  setName: string | null,
  cardNumber: string | null,
  tcg: string,
  suffix?: string,
): string {
  const num = (cardNumber ?? "").split("/")[0].replace(/^0+(?=\d)/, "");
  const name = cardName.replace(/\s+-\s+\d+\/\d+$/, "");
  const set = (setName ?? "").replace(/^Scarlet & Violet[:—]\s*/, "SV ").replace(/^Sword & Shield[:—]\s*/, "SWSH ");
  const parts = [name, set, num, tcg === "pokemon" ? "pokemon" : "", suffix ?? ""].filter(Boolean);
  return parts.join(" ");
}

async function searchSold(query: string, limit = 3): Promise<EbaySoldItem[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({
    q: query,
    filter: "buyingOptions:{FIXED_PRICE|AUCTION}",
    sort: "-endDate",
    limit: String(limit),
  });
  const url = `${BROWSE_URL}?${params}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=<default>",
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`eBay Browse API error ${res.status}: ${txt}`);
  }
  const data = await res.json();
  const items = data.itemSummaries ?? [];
  return items.map((item: Record<string, unknown>) => {
    const priceObj = item.price as { value: string; currency: string } | undefined;
    const img = item.thumbnailImages as { imageUrl: string }[] | undefined;
    return {
      title: String(item.title ?? ""),
      price: priceObj ? parseFloat(priceObj.value) : 0,
      currency: priceObj?.currency ?? "USD",
      date: String(item.itemEndDate ?? item.itemCreationDate ?? ""),
      imageUrl: img?.[0]?.imageUrl ?? null,
      itemUrl: String(item.itemWebUrl ?? item.itemHref ?? ""),
      condition: String((item.condition as string) ?? ""),
    };
  });
}

const CACHE_TTL = 24 * 60 * 60 * 1000;

export async function getEbaySold(
  cardName: string,
  setName: string | null,
  cardNumber: string | null,
  tcg: string,
): Promise<EbaySoldResult> {
  if (!EBAY_CLIENT_ID || !EBAY_CLIENT_SECRET) {
    return { raw: [], graded: [], cached: false };
  }

  const cacheKey = `ebay:listings:v2:${JSON.stringify([tcg, cardName, setName, cardNumber])}`;
  const now = Date.now();
  const dbCtx = await getDb();

  if (dbCtx) {
    try {
      const cached = await dbCtx.db
        .select()
        .from(dbCtx.schema.apiCache)
        .where(dbCtx.and(dbCtx.eq(dbCtx.schema.apiCache.key, cacheKey), dbCtx.gt(dbCtx.schema.apiCache.expiresAt, now)))
        .then((r) => r[0]);

      if (cached) {
        return { ...JSON.parse(cached.value), cached: true };
      }
    } catch {
      // DB not reachable, skip cache
    }
  }

  const rawQuery = buildSearchQuery(cardName, setName, cardNumber, tcg, "near mint raw -psa -bgs -cgc -graded -slab");
  const raw = await searchSold(rawQuery, 3);

  const gradeQueries = [
    { grade: "PSA 10", suffix: "PSA 10" },
    { grade: "PSA 9", suffix: "PSA 9" },
    { grade: "BGS 9.5", suffix: "BGS 9.5" },
  ];
  const graded: { grade: string; items: EbaySoldItem[] }[] = [];
  for (const gq of gradeQueries) {
    const q = buildSearchQuery(cardName, setName, cardNumber, tcg, gq.suffix);
    const items = await searchSold(q, 2);
    if (items.length > 0) graded.push({ grade: gq.grade, items });
  }

  const result = { raw, graded };

  if (dbCtx) {
    try {
      await dbCtx.db
        .insert(dbCtx.schema.apiCache)
        .values({ key: cacheKey, value: JSON.stringify(result), expiresAt: now + CACHE_TTL })
        .onConflictDoUpdate({
          target: dbCtx.schema.apiCache.key,
          set: { value: JSON.stringify(result), expiresAt: now + CACHE_TTL },
        });
    } catch {
      // DB not reachable, skip cache write
    }
  }

  return { ...result, cached: false };
}
