import Image from "next/image";
import Link from "next/link";

export const metadata = { title: "Sign-in error" };

// Human-readable text for NextAuth error codes (?error=…).
const ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin: "Couldn't start Google sign-in — try again.",
  OAuthCallback: "Sign-in was cancelled or failed — try again.",
  OAuthCreateAccount: "Couldn't create your account — try again.",
  OAuthAccountNotLinked: "That email is already linked to a different sign-in method.",
  Callback: "Sign-in was cancelled or failed — try again.",
  Configuration: "Sign-in is temporarily unavailable — please try again later.",
  AccessDenied: "Access was denied.",
  Verification: "That sign-in link has expired or was already used.",
  Default: "Something went wrong during sign-in — try again.",
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = (error && ERROR_MESSAGES[error]) ?? ERROR_MESSAGES.Default;

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
            <h1 className="text-2xl font-bold">Sign-in didn&apos;t work</h1>
            <p className="text-sm text-muted mt-2">{message}</p>
          </div>

          <Link
            href="/login"
            className="btn-rainbow flex items-center justify-center px-6 py-3 rounded-2xl font-semibold shadow-lg shadow-[rgba(167,139,250,0.3)] hover:shadow-xl transition-shadow"
          >
            Back to sign in
          </Link>
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
