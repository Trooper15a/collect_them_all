import { NextRequest, NextResponse } from "next/server";
import { getEbaySold } from "@/lib/ebay";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const name = searchParams.get("name");
  const setName = searchParams.get("set");
  const num = searchParams.get("num");
  const tcg = searchParams.get("tcg") ?? "pokemon";

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  try {
    const result = await getEbaySold(name, setName, num, tcg);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=7200" },
    });
  } catch (e) {
    console.error("eBay sold error:", e);
    return NextResponse.json(
      { error: "Failed to fetch eBay sold data", raw: [], graded: [] },
      { status: 502 },
    );
  }
}
