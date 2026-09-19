import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { listAlerts, upsertAlert } from "@/lib/alerts";
import { requireUserId } from "@/lib/auth";

const Body = z.object({
  cardId: z.string().min(3),
  thresholdPct: z.coerce.number().min(0.5).max(1000).default(10),
  variantType: z.string().max(40).optional(),
});

export async function GET() {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const alerts = await listAlerts(userId);
  return NextResponse.json({ alerts, triggered: alerts.filter((a: { triggered: boolean }) => a.triggered).length });
}

export async function POST(req: NextRequest) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  try {
    return NextResponse.json(await upsertAlert(userId, parsed.data.cardId, parsed.data.thresholdPct, parsed.data.variantType), { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
