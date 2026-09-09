import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
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

    // Run all counts in a single query to avoid 11 round trips
    const [counts] = await db.execute<{
      users: number; portfolios: number; items: number; wishlist: number;
      box_opens: number; alerts: number; cards: number; sets: number; sessions: number;
    }>(sql`SELECT
      (SELECT COUNT(*)::int FROM users) AS users,
      (SELECT COUNT(*)::int FROM portfolios) AS portfolios,
      (SELECT COUNT(*)::int FROM portfolio_items) AS items,
      (SELECT COUNT(*)::int FROM wishlist_items) AS wishlist,
      (SELECT COUNT(*)::int FROM box_opens) AS box_opens,
      (SELECT COUNT(*)::int FROM alerts) AS alerts,
      (SELECT COUNT(*)::int FROM cards) AS cards,
      (SELECT COUNT(*)::int FROM sets) AS sets,
      (SELECT COUNT(*)::int FROM sessions WHERE expires > NOW()) AS sessions`);

    const [recentUsers, cardsByTcg, setsByTcg, topPortfolios] = await Promise.all([
      db.execute<{ name: string | null; email: string | null }>(
        sql`SELECT name, email FROM users ORDER BY id DESC LIMIT 10`
      ),
      db.execute<{ tcg: string; cards: number }>(
        sql`SELECT tcg, COUNT(*)::int AS cards FROM cards GROUP BY tcg ORDER BY cards DESC`
      ),
      db.execute<{ tcg: string; sets: number }>(
        sql`SELECT tcg, COUNT(*)::int AS sets FROM sets GROUP BY tcg ORDER BY sets DESC`
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

    const setsMap = new Map(setsByTcg.map((r) => [r.tcg, r.sets]));
    const tcgBreakdown = cardsByTcg.map((r) => ({ tcg: r.tcg, cards: r.cards, sets: setsMap.get(r.tcg) ?? 0 }));

    return NextResponse.json({
      overview: {
        totalUsers: counts.users,
        activeSessions: counts.sessions,
        totalPortfolios: counts.portfolios,
        totalPortfolioItems: counts.items,
        totalWishlistItems: counts.wishlist,
        totalBoxOpens: counts.box_opens,
        totalAlerts: counts.alerts,
        totalCards: counts.cards,
        totalSets: counts.sets,
      },
      recentUsers,
      tcgBreakdown,
      topPortfolios,
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
