import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <p className="text-7xl font-extrabold tracking-tight text-accent">404</p>
      <h1 className="mt-4 text-2xl font-bold">Page not found</h1>
      <p className="mt-2 text-muted max-w-md leading-relaxed">
        This page doesn&apos;t exist — it may have moved, or the link is out of
        date. Let&apos;s get you back to your collection.
      </p>
      <div className="mt-8 flex flex-col sm:flex-row gap-3">
        <Link
          href="/"
          className="btn-rainbow inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-base font-semibold shadow-lg hover:brightness-110 transition"
        >
          Go to dashboard
        </Link>
        <Link
          href="/landing"
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-line px-6 py-3 text-base font-semibold hover:bg-white/[0.04] transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
