import { NextRequest, NextResponse } from "next/server";
import { getStatus, runUpdate } from "@/lib/update-index";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes (Vercel limit)

/**
 * GET /api/update-index — poll for status of a running (or last completed) update.
 */
export async function GET() {
  return NextResponse.json(getStatus());
}

/**
 * POST /api/update-index — kick off an async index update.
 *
 * Optionally accepts `{ tcgs: ["pokemon", "mtg", ...] }` to limit which
 * TCGs to check. Defaults to all supported TCGs.
 *
 * Returns immediately; poll GET for progress.
 */
export async function POST(req: NextRequest) {
  const current = getStatus();
  if (current.running) {
    return NextResponse.json(
      { error: "Update already in progress", status: current },
      { status: 409 },
    );
  }

  let tcgs: string[] | undefined;
  try {
    const body = await req.json().catch(() => ({}));
    if (body.tcgs && Array.isArray(body.tcgs)) {
      tcgs = body.tcgs as string[];
    }
  } catch {
    // No body is fine — run all TCGs
  }

  // Fire and forget — the caller polls GET for status
  runUpdate(tcgs).catch((err) => {
    console.error("[update-index] unhandled:", err);
  });

  return NextResponse.json({ started: true });
}
