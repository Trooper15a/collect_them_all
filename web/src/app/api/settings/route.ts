import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/cache";
import { getRates } from "@/lib/currency";
import { hasPokewalletKey, pokewalletLimiter } from "@/lib/pokewallet";

const Patch = z.object({
  currency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).optional(),
  theme: z.enum(["dark", "light"]).optional(),
  language: z.enum(["en", "ja"]).optional(),
  bulkCondition: z.enum(["NM", "LP", "MP", "HP", "DMG"]).optional(),
  bulkCurrency: z.enum(["USD", "EUR", "GBP", "CAD", "JPY", "AUD"]).optional(),
  bulkPortfolio: z.string().min(1).max(100).optional(),
});

export async function GET() {
  // getSetting is async (Postgres); without await each field serializes as {}
  // and clients crash (e.g. Intl.NumberFormat "Invalid currency code").
  const [fx, currency, theme, language, bulkCondition, bulkCurrency, bulkPortfolio] = await Promise.all([
    getRates(),
    getSetting("currency", "USD"),
    getSetting("theme", "dark"),
    getSetting("language", "en"),
    getSetting("bulkCondition", "NM"),
    getSetting("bulkCurrency", "CAD"),
    getSetting("bulkPortfolio", "My Collection"),
  ]);
  return NextResponse.json({
    currency,
    theme,
    language,
    bulkCondition,
    bulkCurrency,
    bulkPortfolio,
    pokewalletConfigured: hasPokewalletKey(),
    pokewalletBudget: pokewalletLimiter.remaining,
    fxDate: fx.date,
  });
}

export async function PATCH(req: NextRequest) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Validation failed", details: parsed.error.issues }, { status: 400 });
  for (const [k, v] of Object.entries(parsed.data)) if (v) await setSetting(k, v);
  return GET();
}
