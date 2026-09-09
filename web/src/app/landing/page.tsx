import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";
import { TCG_SEO } from "./tcg-data";

export const metadata: Metadata = {
  title: "Free TCG Portfolio Tracker — AI Scanner, Prices & Collection Tracking | RipnPull",
  description:
    "Track your Pokémon, Magic, Yu-Gi-Oh! and 11 more TCG collections for free. AI card scanner, daily TCGPlayer prices, wishlist alerts, grading support, and full offline mode. Open source.",
  alternates: { canonical: `${SITE.url}/landing` },
  openGraph: {
    title: "RipnPull — Free TCG Portfolio Tracker with AI Card Scanner",
    description:
      "The free, open-source TCG portfolio tracker. AI card scanning, daily prices across 14 games, wishlist price alerts, and offline support.",
    url: `${SITE.url}/landing`,
  },
};

const FEATURES = [
  {
    title: "AI Card Scanner",
    desc: "Point your camera at any card and instantly identify it with on-device AI recognition. Works offline.",
    emoji: "📸",
  },
  {
    title: "Up-to-Date Prices",
    desc: "Prices from TCGPlayer across 14 TCGs updated daily. Track market value, low, mid, and high for every variant.",
    emoji: "📈",
  },
  {
    title: "14 TCGs Supported",
    desc: "Pokémon, Magic, Yu-Gi-Oh!, One Piece, Lorcana, Digimon, Dragon Ball, Flesh and Blood, Star Wars, Union Arena, and more.",
    emoji: "🃏",
  },
  {
    title: "Portfolio Binders",
    desc: "Organize cards into binders with grading support. Track purchase price, quantity, and see gains over time.",
    emoji: "📁",
  },
  {
    title: "Works Offline",
    desc: "Full PWA with offline caching. Browse your collection, scan cards, and queue changes — syncs when you're back online.",
    emoji: "📶",
  },
  {
    title: "Open Source",
    desc: "No hidden fees. Self-hostable. Your data stays yours. Community-driven development on GitHub.",
    emoji: "🔓",
  },
];

const TCGS = ["Pokémon", "Magic", "Yu-Gi-Oh!", "One Piece", "Lorcana", "Digimon", "Dragon Ball Super", "DB Fusion World", "Flesh and Blood", "Star Wars Unlimited", "Vanguard", "Weiß Schwarz", "Final Fantasy", "Union Arena"];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "RipnPull",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Web, iOS, Android",
  offers: { "@type": "Offer", price: "4.99", priceCurrency: "USD" },
  description: SITE.description,
  url: SITE.url,
  screenshot: `${SITE.url}/og-image.png`,
  featureList: "AI Card Scanner, Daily TCGPlayer Prices, 14 TCGs, Portfolio Tracking, Wishlist Price Alerts, Offline Mode, Open Source",
};

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col -mx-4 -mt-[max(env(safe-area-inset-top),12px)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      {/* Header */}
      <header className="h-16 px-6 flex items-center justify-between border-b border-line">
        <Link href="/landing" className="text-lg font-extrabold tracking-tight">
          RipnPull
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <a
            href="https://github.com/Trooper15a/collect_them_all"
            target="_blank"
            rel="noreferrer"
            className="text-muted font-medium hover:text-fg transition-colors"
          >
            GitHub
          </a>
          <Link href="/login" className="font-semibold hover:text-accent transition-colors">
            Sign in
          </Link>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-16 pb-20 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/10 via-transparent to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight leading-[1.1]">
            Track your cards.
            <br />
            <span className="text-rainbow">Know their worth.</span>
          </h1>
          <p className="mt-6 text-lg text-muted max-w-lg mx-auto leading-relaxed">
            The TCG portfolio tracker with AI card scanning, daily prices across 14 games, and offline support. Free during beta, then just $4.99 — once, forever.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="btn-rainbow inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-[rgba(167,139,250,0.35)] hover:brightness-110 transition"
            >
              Get started free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <a
              href="https://github.com/Trooper15a/collect_them_all"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-6 py-3 text-base font-semibold hover:bg-white/[0.04] transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" /></svg>
              View on GitHub
            </a>
          </div>
        </div>
      </section>

      {/* TCG ticker */}
      <section className="py-6 border-y border-line overflow-hidden marquee-fade">
        <div className="flex gap-6 animate-marquee marquee-track whitespace-nowrap">
          {TCGS.map((t) => (
            <span key={t} className="text-sm font-medium text-muted">{t}</span>
          ))}
          {TCGS.map((t) => (
            <span key={`${t}-duplicate`} aria-hidden="true" className="text-sm font-medium text-muted">{t}</span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="px-6 py-20 max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-12">Everything you need to manage your collection</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl bg-elev border border-line p-5">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4 text-2xl">
                {f.emoji}
              </div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-sm text-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="px-6 py-16 border-t border-line">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">Why RipnPull over typical paid trackers?</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mt-8">
            <div className="rounded-xl bg-elev border border-line p-4 text-left space-y-3">
              <p className="font-semibold text-down">Typical paid trackers</p>
              <ul className="space-y-2 text-muted">
                <li>$5–10/mo subscriptions</li>
                <li>Paywalled price history</li>
                <li>Closed source</li>
                <li>No offline mode</li>
              </ul>
            </div>
            <div className="rounded-xl bg-elev border border-accent/30 p-4 text-left space-y-3">
              <p className="font-semibold text-accent">RipnPull</p>
              <ul className="space-y-2 text-muted">
                <li className="text-up">$4.99 one-time (free beta)</li>
                <li className="text-up">No subscription ever</li>
                <li className="text-up">Full price history included</li>
                <li className="text-up">Full offline mode</li>
                <li className="text-up">14 TCGs supported</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Supported TCGs */}
      <section className="px-6 py-16 border-t border-line">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-8">Supported Trading Card Games</h2>
          <div className="flex flex-wrap gap-2 justify-center">
            {TCG_SEO.map((t) => (
              <Link
                key={t.slug}
                href={`/landing/${t.slug}`}
                className="rounded-full bg-elev border border-line px-4 py-2 text-sm font-medium text-muted hover:text-fg hover:border-accent/40 transition-colors"
              >
                {t.name}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Start tracking for free</h2>
        <p className="text-muted mb-8 max-w-md mx-auto">Free during beta. No credit card needed. Sign in with Google and start adding cards in seconds.</p>
        <Link
          href="/login"
          className="btn-rainbow inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold shadow-lg shadow-[rgba(167,139,250,0.35)] hover:brightness-110 transition"
        >
          Get started free
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
          </svg>
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-line px-6 py-8 text-center text-xs text-muted">
        <p>RipnPull is open source.</p>
        <p className="mt-1">MIT licensed · Built by collectors, for collectors.</p>
        <div className="mt-3 flex gap-4 justify-center">
          <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
          <a href="https://github.com/Trooper15a/collect_them_all" target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">GitHub</a>
          <Link href="/login" className="hover:text-fg transition-colors">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
