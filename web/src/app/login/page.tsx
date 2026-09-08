"use client";

import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function LoginInner() {
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") ?? "/";

  return (
    <div className="min-h-[100dvh] -mx-4 -mt-[max(env(safe-area-inset-top),12px)] px-4 grid place-items-center">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-elev border border-line p-10 flex flex-col items-center gap-6">
          <div className="text-center">
            <Image
              src="/icons/icon-192.png"
              alt="RipnPull"
              width={64}
              height={64}
              className="w-16 h-16 rounded-2xl mx-auto mb-4"
              priority
            />
            <h1 className="text-2xl font-bold">RipnPull</h1>
            <p className="text-sm text-muted mt-2">Sign in to track your collection</p>
          </div>

          <button
            onClick={() => signIn("google", { callbackUrl })}
            className="btn-rainbow flex items-center gap-3 px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-[rgba(167,139,250,0.3)] hover:shadow-xl transition-shadow"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.77.42 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </button>

          <p className="text-xs text-muted text-center -mt-2">
            We only read your name &amp; email — see{" "}
            <Link href="/privacy" className="underline hover:text-fg transition-colors">
              Privacy
            </Link>
          </p>

          <p className="text-xs text-muted text-center max-w-xs leading-relaxed">
            By signing in you agree to the{" "}
            <Link href="/terms" className="underline hover:text-fg transition-colors">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-fg transition-colors">
              Privacy Policy
            </Link>
            .
          </p>
        </div>

        <div className="mt-6 text-center">
          <Link href="/landing" className="text-sm text-muted hover:text-fg transition-colors">
            ← Back to site
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginInner />
    </Suspense>
  );
}
