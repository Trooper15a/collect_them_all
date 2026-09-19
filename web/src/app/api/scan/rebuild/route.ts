import { NextResponse } from "next/server";
import { rebuildScanIndex } from "@/lib/scan-rebuild";
import { requireAdmin } from "@/lib/admin";

export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
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
