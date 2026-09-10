import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SITE } from "@/lib/site";
import { TCG_SEO, getTcgBySlug } from "../tcg-data";

const COMPARISON = [
  { label: "Price", paid: "$5–10/mo subscriptions", ripnpull: "$4.99 one-time (free during beta) — no subscription" },
  { label: "Price history", paid: "Paywalled", ripnpull: "Full price history included, plus wishlist price alerts" },
  { label: "Source", paid: "Closed source", ripnpull: "Open source (MIT)" },
  { label: "Offline", paid: "No offline scanning", ripnpull: "Offline AI scanner" },
  { label: "Games", paid: "Limited TCG support", ripnpull: "14 TCGs in one app" },
];

export function generateStaticParams() {
  return TCG_SEO.map((t) => ({ tcg: t.slug }));
}

// Only the slugs in TCG_SEO exist — anything else must be a real 404 (HTTP
// status), not a 200 with the not-found UI.
export const dynamicParams = false;

export async function generateMetadata(props: { params: Promise<{ tcg: string }> }): Promise<Metadata> {
  const { tcg: slug } = await props.params;
  const tcg = getTcgBySlug(slug);
  if (!tcg) return {};
  return {
    title: tcg.title,
    description: tcg.description,
    keywords: tcg.keywords,
    alternates: { canonical: `${SITE.url}/landing/${tcg.slug}` },
    openGraph: {
      title: tcg.title,
      description: tcg.description,
      url: `${SITE.url}/landing/${tcg.slug}`,
    },
  };
}

export default async function TcgLandingPage(props: { params: Promise<{ tcg: string }> }) {
  const { tcg: slug } = await props.params;
  const tcg = getTcgBySlug(slug);
  if (!tcg) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: `RipnPull — ${tcg.name} Tracker`,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Web, iOS, Android",
    offers: { "@type": "Offer", price: "4.99", priceCurrency: "USD" },
    description: tcg.description,
    url: `${SITE.url}/landing/${tcg.slug}`,
  };

  return (
    <div className="min-h-screen flex flex-col -mx-4 -mt-[max(env(safe-area-inset-top),12px)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="h-16 px-6 flex items-center justify-between border-b border-line">
        <Link href="/landing" className="text-lg font-extrabold tracking-tight">
          RipnPull
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/landing" className="text-muted font-medium hover:text-fg transition-colors">
            All TCGs
          </Link>
          <Link href="/login" className="font-semibold hover:text-accent transition-colors">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="relative overflow-hidden px-6 pt-16 pb-14 text-center">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/10 via-transparent to-transparent" />
        <div className="relative z-10 max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">{tcg.name}</p>
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-[1.1]">{tcg.h1}</h1>
          <p className="mt-6 text-lg text-muted max-w-lg mx-auto leading-relaxed">{tcg.intro}</p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="btn-rainbow inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold shadow-lg shadow-[rgba(167,139,250,0.35)] hover:brightness-110 transition"
            >
              Start tracking free
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <section className="px-6 py-16 max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-center mb-10">
          Everything you need to track your {tcg.shortName} collection
        </h2>
        <div className="space-y-6">
          {tcg.features.map((f, i) => (
            <div key={i} className="flex gap-4 items-start">
              <div className="mt-1 w-8 h-8 rounded-full bg-accent/10 text-accent flex items-center justify-center shrink-0 text-sm font-bold">
                {i + 1}
              </div>
              <p className="text-muted leading-relaxed">{f}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 border-t border-line">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">
            Why RipnPull for {tcg.shortName}?
          </h2>
          <div className="mt-8 space-y-3 text-sm text-left">
            <div className="grid grid-cols-2 gap-4 px-4 font-semibold">
              <p className="text-down">Paid trackers</p>
              <p className="text-accent">RipnPull</p>
            </div>
            {COMPARISON.map((row) => (
              <div key={row.label} className="rounded-xl bg-elev border border-line p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-2">{row.label}</p>
                <div className="grid grid-cols-2 gap-4">
                  <p className="text-muted">{row.paid}</p>
                  <p className="text-up">{row.ripnpull}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-12 border-t border-line">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-bold mb-6">Also tracks these TCGs</h2>
          <div className="flex flex-wrap gap-2 justify-center">
            {TCG_SEO.filter((t) => t.slug !== tcg.slug).map((t) => (
              <Link
                key={t.slug}
                href={`/landing/${t.slug}`}
                className="rounded-full bg-elev border border-line px-4 py-1.5 text-sm text-muted hover:text-fg hover:border-accent/40 transition-colors"
              >
                {t.shortName}
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 text-center">
        <h2 className="text-3xl font-bold mb-4">Start tracking your {tcg.shortName} cards</h2>
        <p className="text-muted mb-8 max-w-md mx-auto">
          No credit card. Sign in with Google and start adding cards in seconds.
        </p>
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

      <footer className="border-t border-line px-6 py-8 text-center text-xs text-muted">
        <p>RipnPull is open source.</p>
        <p className="mt-1">MIT licensed &middot; Built by collectors, for collectors.</p>
        <div className="mt-3 flex gap-4 justify-center">
          <Link href="/landing" className="hover:text-fg transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
          <a href="https://github.com/Trooper15a/collect_them_all" target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
