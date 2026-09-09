import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";

const ADMIN_EMAILS = ["isadin531@gmail.com"];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const [user] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!user?.email || !ADMIN_EMAILS.includes(user.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [[{ count: totalUsers }]] = await Promise.all([
      db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM users`),
    ]);

    const results = await Promise.all([
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
        activeSessions: results[7][0]?.count ?? 0,
        totalPortfolios: results[0][0]?.count ?? 0,
        totalPortfolioItems: results[1][0]?.count ?? 0,
        totalWishlistItems: results[2][0]?.count ?? 0,
        totalBoxOpens: results[3][0]?.count ?? 0,
        totalAlerts: results[4][0]?.count ?? 0,
        totalCards: results[5][0]?.count ?? 0,
        totalSets: results[6][0]?.count ?? 0,
      },
      recentUsers: results[8],
      tcgBreakdown: results[9],
      topPortfolios: results[10],
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Admin stats error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
