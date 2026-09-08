export default function ShopPage() {
  return (
    <div className="pb-24">
      <header className="pt-2 pb-3">
        <h1 className="text-xl font-bold">Shop</h1>
        <p className="text-xs text-muted mt-1">Price comparison across marketplaces is coming soon.</p>
      </header>

      <div className="card-surface rounded-2xl p-8 mt-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-5">
          <svg className="w-7 h-7 text-black" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold mb-2">Coming soon</h2>
        <p className="text-sm text-muted leading-relaxed max-w-md mx-auto">
          We&apos;re building price comparison across marketplaces so you can find the best deal on any card without leaving RipnPull.
        </p>
        <p className="text-xs text-muted/70 leading-relaxed max-w-md mx-auto mt-4">
          In the meantime, individual card pages still link out to marketplaces like TCGPlayer and eBay so you can check live listings there.
        </p>
        <a
          href="https://github.com/Trooper15a/collect_them_all"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-5 py-2.5 mt-6 text-sm font-semibold hover:bg-white/[0.04] transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12Z" /></svg>
          Follow updates on GitHub
        </a>
      </div>
    </div>
  );
}
