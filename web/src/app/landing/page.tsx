import Link from "next/link";

const FEATURES = [
  {
    title: "AI Card Scanner",
    desc: "Point your camera at any card and instantly identify it with on-device AI recognition. Works offline.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Z" />
      </svg>
    ),
  },
  {
    title: "Up-to-Date Prices",
    desc: "Prices from TCGPlayer across 13 TCGs updated daily. Track market value, low, mid, and high for every variant.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
      </svg>
    ),
  },
  {
    title: "13 TCGs Supported",
    desc: "Pokémon, Magic, Yu-Gi-Oh!, One Piece, Lorcana, Digimon, Dragon Ball, Flesh and Blood, Star Wars, and more.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6.878V6a2.25 2.25 0 0 1 2.25-2.25h7.5A2.25 2.25 0 0 1 18 6v.878m-12 0c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 4.5 9v.878m13.5-3A2.25 2.25 0 0 1 19.5 9v.878m-13.5-3c.235-.083.487-.128.75-.128h10.5c.263 0 .515.045.75.128m-12 0A2.25 2.25 0 0 0 3 12M18 9.878a2.25 2.25 0 0 1 1.5 2.122M3 12v6a2.25 2.25 0 0 0 2.25 2.25h13.5A2.25 2.25 0 0 0 21 18v-6m-18 0h18" />
      </svg>
    ),
  },
  {
    title: "Portfolio Binders",
    desc: "Organize cards into binders with grading support. Track purchase price, quantity, and see gains over time.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
      </svg>
    ),
  },
  {
    title: "Works Offline",
    desc: "Full PWA with offline caching. Browse your collection, scan cards, and queue changes — syncs when you're back online.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z" />
      </svg>
    ),
  },
  {
    title: "100% Free & Open Source",
    desc: "No paywalls, no subscriptions. Self-hostable. Your data stays yours. Community-driven development.",
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
      </svg>
    ),
  },
];

const TCGS = ["Pokémon", "Magic", "Yu-Gi-Oh!", "One Piece", "Lorcana", "Digimon", "Dragon Ball Super", "DB Fusion World", "Flesh and Blood", "Star Wars Unlimited", "Vanguard", "Weiß Schwarz", "Final Fantasy"];

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col -mx-4 -mt-[max(env(safe-area-inset-top),12px)]">
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
            <span className="text-accent">Know their worth.</span>
          </h1>
          <p className="mt-6 text-lg text-muted max-w-lg mx-auto leading-relaxed">
            The free, open-source TCG portfolio tracker with AI card scanning, daily prices across 13 games, and offline support.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold text-white bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] shadow-lg shadow-[rgba(59,130,246,0.35)] hover:brightness-110 transition"
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
              <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4">
                {f.icon}
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
                <li className="text-up">Free forever</li>
                <li className="text-up">PSA + BGS + CGC grading links</li>
                <li className="text-up">Open source (MIT)</li>
                <li className="text-up">Full offline mode</li>
                <li className="text-up">13 TCGs supported</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">Start tracking for free</h2>
        <p className="text-muted mb-8 max-w-md mx-auto">No credit card. No subscription. Sign in with Google and start adding cards in seconds.</p>
        <Link
          href="/login"
          className="inline-flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white bg-gradient-to-r from-[#3b82f6] to-[#60a5fa] shadow-lg shadow-[rgba(59,130,246,0.35)] hover:brightness-110 transition"
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
