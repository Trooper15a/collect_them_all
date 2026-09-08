import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hasPokewalletKey, pokewalletLimiter, POKEWALLET_BASE } from "@/lib/pokewallet";

/**
 * Set logo proxy — free sources only, no API key required. Vercel CDN caches via Cache-Control.
 * Fallback chain per set:
 *   1. set.imageUrl (populated at import time — long-term fix for odd cases)
 *   2. Pokémon EN: images.pokemontcg.io/{id}/symbol.png. pokemontcg.io ids (sv1, me1…)
 *      differ from the TCGplayer group abbreviations stored in sets.code (SVI, MEG…),
 *      so we map via pokemon-tcg-data's ptcgoCode field (ptcgoCode == TCGplayer
 *      abbreviation for mainline sets). Pokémon JP (category 85) is not covered by
 *      pokemontcg.io at all → falls through to the chip.
 *   3. Pokémon fallback: PokéWallet, only if a key is configured (user has none today).
 *   4. Magic: Scryfall's free set-icon SVG at svgs.scryfall.io/sets/{code}.svg —
 *      TCGplayer MTG abbreviations are (mostly) Scryfall set codes; extras like art
 *      series 404 → chip.
 *   5. Everything else → 404 and the client renders the code chip.
 */

// pokemon-tcg-data set list (~77KB, free, no key). Lazily fetched once per process
// and indexed by TCGplayer abbreviation (ptcgoCode) and by lowercased name.
const PKMN_SETS_URL = "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json";

let pkmnIndexPromise: Promise<Map<string, string>> | null = null;
function pokemonSetIndex(): Promise<Map<string, string>> {
  if (!pkmnIndexPromise) {
    pkmnIndexPromise = (async () => {
      const res = await fetch(PKMN_SETS_URL, {
        headers: { "User-Agent": "ripnpull/0.1" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) throw new Error(`pokemon set index ${res.status}`);
      const rows = (await res.json()) as { id: string; name: string; ptcgoCode?: string }[];
      const map = new Map<string, string>();
      for (const s of rows) {
        if (s.ptcgoCode) map.set(s.ptcgoCode.toUpperCase(), s.id);
        map.set(`name:${s.name.toLowerCase()}`, s.id);
      }
      return map;
    })();
    // a failed index fetch must not poison the cache — retry on the next request
    pkmnIndexPromise.catch(() => {
      pkmnIndexPromise = null;
    });
  }
  return pkmnIndexPromise;
}

async function pokemonSymbolUrl(set: { code: string; name: string; language: string }): Promise<string | null> {
  if (set.language === "jap") return null; // pokemontcg.io is English-only
  try {
    const index = await pokemonSetIndex();
    const id = index.get(set.code.toUpperCase()) ?? index.get(`name:${set.name.toLowerCase()}`);
    return id ? `https://images.pokemontcg.io/${encodeURIComponent(id)}/symbol.png` : null;
  } catch {
    return null;
  }
}

async function fetchImage(url: string | URL, headers: Record<string, string> = {}): Promise<Response | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": "ripnpull/0.1", ...headers },
    signal: AbortSignal.timeout(15_000),
  });
  const type = res.headers.get("Content-Type") ?? "";
  if (!res.ok || !type.startsWith("image/")) {
    res.body?.cancel();
    return null;
  }
  return res;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // Short negative cache: logoless sets (JP Pokémon, MTG extras, unmapped codes)
  // otherwise re-walk the whole fallback chain on every /sets render.
  const NEGATIVE = { "Cache-Control": "public, max-age=300" };
  const id = decodeURIComponent((await ctx.params).id);
  const sets = await db.select().from(schema.sets).where(eq(schema.sets.id, id)).limit(1);
  const set = sets[0];
  if (!set) return new NextResponse("not found", { status: 404, headers: NEGATIVE });
  try {
    let upstream: Response | null = null;
    if (set.imageUrl) {
      upstream = await fetchImage(set.imageUrl);
    }
    if (!upstream && set.tcg === "pokemon") {
      const symbolUrl = await pokemonSymbolUrl(set);
      if (symbolUrl) upstream = await fetchImage(symbolUrl);
      if (!upstream && hasPokewalletKey() && pokewalletLimiter.remaining.hour > 10) {
        await pokewalletLimiter.acquire();
        const url = new URL(`${POKEWALLET_BASE}/sets/${encodeURIComponent(set.code)}/image`);
        if (set.language) url.searchParams.set("language", set.language);
        upstream = await fetchImage(url, { "X-API-Key": process.env.POKEWALLET_API_KEY ?? "" });
      }
    }
    if (!upstream && set.tcg === "mtg" && set.code) {
      upstream = await fetchImage(`https://svgs.scryfall.io/sets/${encodeURIComponent(set.code.toLowerCase())}.svg`);
    }
    if (!upstream) return new NextResponse("no logo", { status: 404, headers: NEGATIVE });
    const type = upstream.headers.get("Content-Type") ?? "image/png";
    const buf = Buffer.from(await upstream.arrayBuffer());
    // Never buffer unbounded upstream bodies into memory per request.
    if (buf.byteLength > 5_000_000) return new NextResponse("logo too large", { status: 404, headers: NEGATIVE });
    return new NextResponse(buf, {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
        // Upstream SVGs are re-served same-origin — make sure they're only ever
        // treated as images, never executed.
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "script-src 'none'",
      },
    });
  } catch {
    return new NextResponse("logo fetch failed", { status: 502, headers: NEGATIVE });
  }
}
