import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { getCard } from "@/lib/cards";
import { indexCard } from "@/lib/model-index";
import { pwRawImage } from "@/lib/pokewallet";

/**
 * Image proxy. GET /api/images/<cardId>?size=high|low&lang=fr
 * PokéWallet images need the API key header, so the browser can never load them directly;
 * every source goes through here so the phone gets one cacheable URL per card.
 * Vercel CDN caches via Cache-Control headers.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const id = decodeURIComponent((await ctx.params).id);
  const size = req.nextUrl.searchParams.get("size") === "low" ? "low" : "high";
  const lang = req.nextUrl.searchParams.get("lang") ?? undefined;
  const [src, ...rest] = id.split(":");
  const sourceId = rest.join(":");
  if (!sourceId || !["pw", "sf", "ygo", "tcgdex", "pcjp", "tp"].includes(src)) return new NextResponse("bad id", { status: 400 });

  try {
    let upstream: Response;
    if (src === "pw") {
      upstream = await pwRawImage(sourceId, size, lang);
    } else if (src === "tcgdex" || src === "pcjp") {
      const img = indexCard(id)?.img;
      if (!img) return new NextResponse("no image", { status: 404 });
      const url = src === "tcgdex" ? `${img.replace(/\/(high|low)\.webp$/, "")}/${size}.webp` : img;
      upstream = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 collectr-clone-personal/0.1" } });
    } else {
      const cards = await db.select({ imageUrl: schema.cards.imageUrl }).from(schema.cards).where(eq(schema.cards.id, id)).limit(1);
      let url = cards[0]?.imageUrl;
      if (!url) url = (await getCard(id))?.imageUrl ?? null;
      if (!url) return new NextResponse("no image", { status: 404 });
      if (size === "low" && src === "sf") url = url.replace("/large/", "/normal/");
      if (src === "tp") url = url.replace(/_\d+w\.jpg$/, size === "low" ? "_400w.jpg" : "_in_1000x1000.jpg");
      upstream = await fetch(url, { headers: { "User-Agent": "collectr-clone-personal/0.1" } });
    }
    if (!upstream.ok) return new NextResponse("upstream error", { status: upstream.status });
    const type = upstream.headers.get("Content-Type") ?? "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());
    return new NextResponse(buf, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch (err) {
    console.error("image proxy error", err);
    return new NextResponse("image fetch failed", { status: 502 });
  }
}
