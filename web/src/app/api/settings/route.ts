import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getUserSetting as getSetting, setUserSetting as setSetting } from "@/lib/user-settings";
import { requireUserId } from "@/lib/auth";
import { getRates } from "@/lib/currency";

const Patch = z.object({
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  language: z.enum(["en", "ja"]).optional(),
  bulkCondition: z.enum(["NM", "LP", "MP", "HP", "DMG"]).optional(),
  bulkCurrency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).optional(),
  bulkPortfolio: z.string().min(1).max(100).optional(),
});

export async function GET() {
  try { await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  try {
    const fx = await getRates();
    return NextResponse.json({
      currency: await getSetting("currency", "USD"),
      theme: await getSetting("theme", "dark"),
      language: await getSetting("language", "en"),
      bulkCondition: await getSetting("bulkCondition", "NM"),
      bulkCurrency: await getSetting("bulkCurrency", "CAD"),
      bulkPortfolio: await getSetting("bulkPortfolio", "My Collection"),
      fxDate: fx.date,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try { await requireUserId(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  for (const [k, v] of Object.entries(parsed.data)) if (v) await setSetting(k, v);
  return GET();
}
