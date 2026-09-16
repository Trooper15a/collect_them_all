import { NextResponse } from "next/server";
import { rebuildScanIndex } from "@/lib/scan-rebuild";

export async function POST() {
  try {
    const result = await rebuildScanIndex();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[scan/rebuild] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Rebuild failed" },
      { status: 500 },
    );
  }
}
