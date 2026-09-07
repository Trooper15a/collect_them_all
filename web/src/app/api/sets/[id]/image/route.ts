import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { hasPokewalletKey, pokewalletLimiter, POKEWALLET_BASE } from "@/lib/pokewallet";

/** Set logo proxy. Pokémon logos come from PokéWallet; Magic from Scryfall's icon. Vercel CDN caches via Cache-Control. */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await ctx.params).id);
  const sets = await db.select().from(schema.sets).where(eq(schema.sets.id, id)).limit(1);
  const set = sets[0];
  if (!set) return new NextResponse("not found", { status: 404 });
  try {
    let upstream: Response | null = null;
    if (set.imageUrl) {
      upstream = await fetch(set.imageUrl, { headers: { "User-Agent": "ripnpull/0.1" } });
    } else if (set.tcg === "pokemon" && hasPokewalletKey() && pokewalletLimiter.remaining.hour > 10) {
      await pokewalletLimiter.acquire();
      const url = new URL(`${POKEWALLET_BASE}/sets/${encodeURIComponent(set.code)}/image`);
      if (set.language) url.searchParams.set("language", set.language);
      upstream = await fetch(url, { headers: { "X-API-Key": process.env.POKEWALLET_API_KEY ?? "" } });
    }
    if (!upstream || !upstream.ok) return new NextResponse("no logo", { status: 404 });
    const type = upstream.headers.get("Content-Type") ?? "image/png";
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch {
    return new NextResponse("logo fetch failed", { status: 502 });
  }
}
