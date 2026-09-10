import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${SITE.name} collects, uses, and protects your data.`,
};

const EFFECTIVE_DATE = "September 1, 2026";

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-2 py-10">
      <header className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Effective date: {EFFECTIVE_DATE}</p>
        <p className="mt-4 text-muted leading-relaxed">
          {SITE.name} ({SITE.url}) is an open-source TCG portfolio tracker
          operated from Canada. This policy explains, in plain language, what
          information we collect, why we collect it, and the choices you have.
        </p>
      </header>

      <div className="space-y-8 leading-relaxed">
        <section>
          <h2 className="text-xl font-semibold mb-2">What we collect</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted">
            <li>
              <span className="text-fg font-medium">Google account basics.</span>{" "}
              When you sign in with Google, we receive your name, email address,
              and profile picture from your Google profile. We use this only to
              create and identify your account.
            </li>
            <li>
              <span className="text-fg font-medium">Collection data.</span> The
              cards, binders, portfolios, quantities, purchase prices, grades,
              and wishlist entries you add to the app. This is the core data the
              service exists to store for you.
            </li>
            <li>
              <span className="text-fg font-medium">Technical data.</span>{" "}
              Standard server logs (such as IP address and browser type) kept
              briefly for security and debugging.
            </li>
          </ul>
          <p className="mt-3 text-muted">
            Card scanning happens on your device. Photos of your cards are not
            uploaded to our servers.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Why we collect it</h2>
          <p className="text-muted">
            We use your Google profile to sign you in, and your collection data
            to show you your portfolio, values, and price history. That&apos;s
            it — we don&apos;t use your data for advertising, profiling, or
            anything unrelated to running the app.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Where your data is stored</h2>
          <p className="text-muted">
            Your account and collection data are stored in a database operated
            by our hosting provider. Because {SITE.name} is open source (
            <a
              href={SITE.repoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              {SITE.license} licensed
            </a>
            ), you can also inspect exactly how data is handled, or self-host
            your own instance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">We never sell your data</h2>
          <p className="text-muted">
            We do not sell, rent, or share your personal information with
            advertisers, data brokers, or anyone else for their own purposes.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Cookies</h2>
          <p className="text-muted">
            We use a single category of cookie: the session cookie that keeps
            you signed in. We don&apos;t use advertising or analytics tracking
            cookies.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Third parties</h2>
          <ul className="list-disc pl-5 space-y-2 text-muted">
            <li>
              <span className="text-fg font-medium">Google (sign-in).</span>{" "}
              Authentication is handled by Google OAuth. Google&apos;s own
              privacy policy applies to that sign-in process.
            </li>
            <li>
              <span className="text-fg font-medium">TCGPlayer (price data).</span>{" "}
              Card prices shown in the app come from TCGPlayer data. Fetching
              prices does not send your personal information to TCGPlayer.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Deleting your data</h2>
          <p className="text-muted">
            You can delete your collection data at any time from the Settings
            page. To delete your account entirely, or to request an export of
            your data, contact us at{" "}
            <a
              href={SITE.contactUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent hover:underline"
            >
              our issue tracker
            </a>{" "}
            and we&apos;ll take care of it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Changes to this policy</h2>
          <p className="text-muted">
            If we change this policy, we&apos;ll update the effective date
            above. Material changes will also be noted in the project&apos;s
            public repository.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-2">Contact</h2>
          <p className="text-muted">
            Questions about privacy? Reach us at{" "}
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
        <Link href="/terms" className="hover:text-fg transition-colors">
          Terms of Service
        </Link>
      </footer>
    </div>
  );
}
