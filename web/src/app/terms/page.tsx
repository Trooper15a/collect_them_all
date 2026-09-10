import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms that govern your use of ${SITE.name}.`,
};

const EFFECTIVE_DATE = "September 1, 2026";

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-2 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Effective date: {EFFECTIVE_DATE}</p>
        <p className="mt-4 text-muted leading-relaxed">
          These terms govern your use of {SITE.name} ({SITE.url}), an
          open-source TCG portfolio tracker operated from Canada. By signing in
          and using the service, you agree to them.
        </p>
      </header>

      <div className="space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-2">The service</h2>
          <p className="text-muted">
            {SITE.name} lets you track trading card collections across{" "}
            {SITE.tcgCount} games: catalog your cards, organize binders and
            portfolios, scan cards with on-device AI, and view daily market
            prices. The service is free of charge during the beta period.
            After beta, {SITE.name} will be offered as a one-time purchase of
            $4.99 — no subscription, no recurring fees. Accounts created during
            beta keep free access permanently.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Your account</h2>
          <p className="text-muted">
            You sign in with your Google account. You&apos;re responsible for
            keeping that account secure and for activity that happens under it.
            Don&apos;t use the service for anything unlawful, and don&apos;t try
            to disrupt or abuse the service or other users.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Price data disclaimer</h2>
          <p className="text-muted">
            Prices shown in {SITE.name} come from TCGPlayer data and are updated
            daily. They are estimates for informational purposes only — they may
            be delayed, incomplete, or inaccurate, and actual buy/sell prices
            will vary by condition, seller, and marketplace. Nothing in the app
            is financial or investment advice. Always verify prices before
            buying, selling, or trading cards.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Provided &quot;as is&quot;</h2>
          <p className="text-muted">
            {SITE.name} is provided &quot;as is&quot; and &quot;as
            available&quot;, without warranty of any kind, express or implied —
            including warranties of merchantability, fitness for a particular
            purpose, and non-infringement. We don&apos;t guarantee the service
            will be uninterrupted, error-free, or that your data will never be
            lost, so keep your own backups of anything important.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Limitation of liability</h2>
          <p className="text-muted">
            To the maximum extent permitted by law, we&apos;re not liable for
            any indirect, incidental, or consequential damages — including lost
            profits or lost data — arising from your use of the service. This
            includes decisions made based on price data shown in the app.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Account termination</h2>
          <p className="text-muted">
            You can stop using the service and delete your data at any time (see
            our{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              Privacy Policy
            </Link>
            ). We may suspend or terminate accounts that abuse the service or
            violate these terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Open-source code</h2>
          <p className="text-muted">
            The {SITE.name} source code is open source under the{" "}
            {SITE.license} license — you can read, modify, and self-host it at{" "}
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {SITE.repoUrl}
            </a>
            . The {SITE.license} license governs the code; these Terms of
            Service govern your use of the hosted service at {SITE.url}.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Changes to these terms</h2>
          <p className="text-muted">
            We may update these terms from time to time. Continued use of the
            service after the effective date above is updated means you accept
            the revised terms.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p className="text-muted">
            Questions about these terms? Reach us at{" "}
            <a
              href={SITE.contactUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {SITE.contactUrl}
            </a>
            .
          </p>
        </section>
      </div>

      <footer className="mt-12 border-t border-line pt-6 flex gap-4 justify-center text-sm text-muted">
        <Link href="/" className="hover:text-fg transition-colors">
          Home
        </Link>
        <Link href="/landing" className="hover:text-fg transition-colors">
          About
        </Link>
        <Link href="/privacy" className="hover:text-fg transition-colors">
          Privacy Policy
        </Link>
      </footer>
    </div>
  );
}
