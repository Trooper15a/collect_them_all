import { NextRequest, NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { refreshOwnedPrices } from "@/lib/portfolio";

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return NextResponse.json({ error: "Sign in to refresh prices" }, { status: 401 });
  }
  const force = req.nextUrl.searchParams.get("force") === "1";
  try {
    const result = await refreshOwnedPrices({ userId, onlyStale: !force, maxCards: 300 });
    return NextResponse.json(result);
  } catch (err) {
    console.error("refresh error", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Refresh failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok" });
}
