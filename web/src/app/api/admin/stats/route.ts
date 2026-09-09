import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { auth } from "@/lib/auth";

const ADMIN_EMAILS = ["isadin531@gmail.com"];

export async function GET() {
  const session = await auth();
  if (!session?.user?.email || !ADMIN_EMAILS.includes(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [
    [{ count: totalUsers }],
    [{ count: totalPortfolios }],
    [{ count: totalPortfolioItems }],
    [{ count: totalWishlistItems }],
    [{ count: totalBoxOpens }],
    [{ count: totalAlerts }],
    [{ count: totalCards }],
    [{ count: totalSets }],
    activeSessions,
    recentUsers,
    tcgBreakdown,
    topPortfolios,
  ] = await Promise.all([
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM users`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM portfolios`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM portfolio_items`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM wishlist_items`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM box_opens`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM alerts`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM cards`),
    db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM sets`),
    db.execute<{ count: number }>(
      sql`SELECT COUNT(*)::int AS count FROM sessions WHERE expires > NOW()`
    ),
    db.execute<{ name: string | null; email: string | null }>(
      sql`SELECT name, email FROM users ORDER BY id DESC LIMIT 10`
    ),
    db.execute<{ tcg: string; cards: number; sets: number }>(
      sql`SELECT c.tcg, COUNT(DISTINCT c.id)::int AS cards, COUNT(DISTINCT s.id)::int AS sets
          FROM cards c LEFT JOIN sets s ON s.tcg = c.tcg
          GROUP BY c.tcg ORDER BY cards DESC`
    ),
    db.execute<{ name: string; items: number; user_name: string | null }>(
      sql`SELECT p.name, COUNT(pi.id)::int AS items, u.name AS user_name
          FROM portfolios p
          LEFT JOIN portfolio_items pi ON pi.portfolio_id = p.id
          LEFT JOIN users u ON u.id = p.user_id
          GROUP BY p.id, p.name, u.name
          ORDER BY items DESC LIMIT 10`
    ),
  ]);

  return NextResponse.json({
    overview: {
      totalUsers,
      activeSessions: activeSessions[0]?.count ?? 0,
      totalPortfolios,
      totalPortfolioItems,
      totalWishlistItems,
      totalBoxOpens,
      totalAlerts,
      totalCards,
      totalSets,
    },
    recentUsers,
    tcgBreakdown,
    topPortfolios,
    generatedAt: new Date().toISOString(),
  });
}
