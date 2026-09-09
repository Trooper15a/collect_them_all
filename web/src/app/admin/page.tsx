"use client";

import { useEffect, useState } from "react";

interface Stats {
  overview: {
    totalUsers: number;
    activeSessions: number;
    totalPortfolios: number;
    totalPortfolioItems: number;
    totalWishlistItems: number;
    totalBoxOpens: number;
    totalAlerts: number;
    totalCards: number;
    totalSets: number;
  };
  recentUsers: { name: string | null; email: string | null }[];
  tcgBreakdown: { tcg: string; cards: number; sets: number }[];
  topPortfolios: { name: string; items: number; user_name: string | null }[];
  generatedAt: string;
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/stats")
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 403 ? "Not authorized" : "Failed to load");
        return r.json();
      })
      .then(setStats)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-8 text-center text-muted">Loading stats...</div>;
  if (error) return <div className="p-8 text-center text-down">{error}</div>;
  if (!stats) return null;

  const { overview } = stats;

  return (
    <div className="py-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <span className="text-xs text-muted">
          {new Date(stats.generatedAt).toLocaleString()}
        </span>
      </div>

      <section className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard label="Users" value={overview.totalUsers} />
        <StatCard label="Active Sessions" value={overview.activeSessions} />
        <StatCard label="Portfolios" value={overview.totalPortfolios} />
        <StatCard label="Cards in Portfolios" value={overview.totalPortfolioItems} />
        <StatCard label="Wishlist Items" value={overview.totalWishlistItems} />
        <StatCard label="Box Opens" value={overview.totalBoxOpens} />
        <StatCard label="Price Alerts" value={overview.totalAlerts} />
        <StatCard label="Cards in DB" value={overview.totalCards.toLocaleString()} />
        <StatCard label="Sets in DB" value={overview.totalSets.toLocaleString()} />
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Users</h2>
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-elev text-muted text-left">
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-4 py-2 font-medium">Email</th>
              </tr>
            </thead>
            <tbody>
              {stats.recentUsers.map((u, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2">{u.name ?? "—"}</td>
                  <td className="px-4 py-2 text-muted">{u.email ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">TCG Breakdown</h2>
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-elev text-muted text-left">
                <th className="px-4 py-2 font-medium">TCG</th>
                <th className="px-4 py-2 font-medium text-right">Cards</th>
                <th className="px-4 py-2 font-medium text-right">Sets</th>
              </tr>
            </thead>
            <tbody>
              {stats.tcgBreakdown.map((t) => (
                <tr key={t.tcg} className="border-t border-line">
                  <td className="px-4 py-2 font-medium">{t.tcg}</td>
                  <td className="px-4 py-2 text-right text-muted">{t.cards.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right text-muted">{t.sets.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Top Portfolios</h2>
        <div className="rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-elev text-muted text-left">
                <th className="px-4 py-2 font-medium">Portfolio</th>
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium text-right">Cards</th>
              </tr>
            </thead>
            <tbody>
              {stats.topPortfolios.map((p, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-4 py-2 font-medium">{p.name}</td>
                  <td className="px-4 py-2 text-muted">{p.user_name ?? "—"}</td>
                  <td className="px-4 py-2 text-right">{p.items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-elev p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}
