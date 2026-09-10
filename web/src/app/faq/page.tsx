import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "FAQ — Frequently Asked Questions",
  description:
    "Common questions about RipnPull: pricing, supported TCGs, card scanner, offline mode, data privacy, and more.",
  alternates: { canonical: `${SITE.url}/faq` },
  openGraph: {
    title: "FAQ — Frequently Asked Questions",
    description:
      "Common questions about RipnPull: pricing, supported TCGs, card scanner, offline mode, data privacy, and more.",
    url: `${SITE.url}/faq`,
  },
};

const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does RipnPull cost?",
    a: "RipnPull is free during the beta period. After beta, the full app will be a one-time purchase of $4.99 — no subscription, no monthly fees, no hidden costs. You pay once and get everything, including all future updates.",
  },
  {
    q: "Which trading card games are supported?",
    a: "RipnPull supports 14 TCGs: Pokémon, Magic: The Gathering, Yu-Gi-Oh!, One Piece, Disney Lorcana, Digimon, Dragon Ball Super, Dragon Ball Fusion World, Flesh and Blood, Star Wars: Unlimited, Cardfight!! Vanguard, Weiß Schwarz, Final Fantasy, and Union Arena.",
  },
  {
    q: "How does the card scanner work?",
    a: "Point your phone camera at any card and the AI identifies it instantly. The scanner runs entirely on your device — no internet connection needed. It matches cards by image recognition and can identify set, variant, and card number.",
  },
  {
    q: "Where do the prices come from?",
    a: "Card prices are sourced from TCGPlayer and updated daily. You get market price, low, mid, and high for every card and variant (reverse holo, full art, alt art, etc.). Price history is tracked over time so you can spot trends.",
  },
  {
    q: "Does it work offline?",
    a: "Yes. RipnPull is a Progressive Web App (PWA) with full offline support. You can browse your collection, scan cards, and queue changes while offline. Everything syncs automatically when you reconnect.",
  },
  {
    q: "How do I install RipnPull on my phone?",
    a: "Visit ripnpull.ca in your mobile browser, then use \"Add to Home Screen\" (Safari on iOS) or \"Install app\" (Chrome on Android). It works like a native app — no app store download needed.",
  },
  {
    q: "What is a PWA?",
    a: "A Progressive Web App (PWA) is a website that can be installed on your phone and works like a native app. It loads fast, works offline, and doesn't take up much storage. No app store approval process means faster updates.",
  },
  {
    q: "Can I track graded cards?",
    a: "Yes. When adding a card, you can mark it as graded and enter the grading company (PSA, BGS, CGC), grade number, and cert number. Graded cards are tracked separately from raw cards in your portfolio.",
  },
  {
    q: "How does the wishlist work?",
    a: "Tap the heart icon on any card to add it to your wishlist. You can set a target price — when the market price drops to or below your target, you'll see it highlighted on your wishlist page. Great for watching chase cards before buying.",
  },
  {
    q: "Can I track purchase price and gains?",
    a: "Yes. When you add a card to a portfolio, you can enter what you paid for it. RipnPull calculates your gains or losses based on the current market price, both per card and across your entire collection.",
  },
  {
    q: "What is set completion tracking?",
    a: "For every set, RipnPull shows a progress bar of how many cards you own vs. the total in the set. It also calculates the cost to complete the set based on current prices for the cards you're missing.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your collection data is stored on our servers (needed for syncing across devices) but is never shared with third parties. We don't sell data or show ads. The app is open source so you can verify this yourself.",
  },
  {
    q: "Is RipnPull open source?",
    a: "Yes. The full source code is available on GitHub under the MIT license. You can inspect the code, contribute, or even self-host your own instance.",
  },
  {
    q: "Do I need to create an account?",
    a: "You sign in with Google — no separate account to create, no password to remember. This also means your collection is tied to your Google account and accessible from any device.",
  },
  {
    q: "Can I use it on desktop?",
    a: "Yes. RipnPull works on any device with a browser — phone, tablet, or desktop. The interface is optimized for mobile but fully functional on larger screens.",
  },
  {
    q: "How is this different from TCGPlayer?",
    a: "TCGPlayer is a marketplace for buying and selling cards. RipnPull is a portfolio tracker — it helps you organize your collection, track what you own, monitor prices, and see your gains over time. We use TCGPlayer's pricing data but serve a different purpose.",
  },
  {
    q: "Will beta users have to pay $4.99 later?",
    a: "No. Everyone who joins during beta keeps free access forever — the $4.99 one-time price only applies to new accounts after beta ends.",
  },
];

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function FaqPage() {
  return (
    <div className="min-h-screen flex flex-col -mx-4 -mt-[max(env(safe-area-inset-top),12px)]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="h-16 px-6 flex items-center justify-between border-b border-line">
        <Link href="/landing" className="text-lg font-extrabold tracking-tight">
          RipnPull
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/landing" className="text-muted font-medium hover:text-fg transition-colors">
            Home
          </Link>
          <Link href="/login" className="font-semibold hover:text-accent transition-colors">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="px-6 pt-12 pb-6 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Frequently Asked Questions</h1>
        <p className="mt-3 text-muted max-w-lg mx-auto">
          Everything you need to know about RipnPull.
        </p>
      </section>

      <section className="px-6 pb-20 max-w-5xl mx-auto w-full">
        <div className="divide-y divide-line">
          {FAQS.map((faq, i) => (
            <details key={i} className="group py-5">
              <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-[15px] leading-snug">
                {faq.q}
                <span className="ml-4 shrink-0 text-muted text-xl group-open:rotate-45 transition-transform duration-200">+</span>
              </summary>
              <p className="mt-3 text-sm text-muted leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 text-center border-t border-line">
        <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
        <p className="text-muted mb-6">
          Open an issue on GitHub or try the app yourself — it&apos;s free during beta.
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/login"
            className="btn-rainbow inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold shadow-lg shadow-[rgba(167,139,250,0.35)] hover:brightness-110 transition"
          >
            Try it free
          </Link>
          <a
            href="https://github.com/Trooper15a/collect_them_all/issues"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-6 py-3 text-sm font-semibold hover:bg-white/[0.04] transition-colors"
          >
            Ask on GitHub
          </a>
        </div>
      </section>

      <footer className="border-t border-line px-6 py-8 text-center text-xs text-muted">
        <div className="flex gap-4 justify-center">
          <Link href="/landing" className="hover:text-fg transition-colors">Home</Link>
          <Link href="/privacy" className="hover:text-fg transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-fg transition-colors">Terms</Link>
          <a href="https://github.com/Trooper15a/collect_them_all" target="_blank" rel="noreferrer" className="hover:text-fg transition-colors">GitHub</a>
        </div>
      </footer>
    </div>
  );
}
