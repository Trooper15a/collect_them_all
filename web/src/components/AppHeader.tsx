"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { TcgPicker } from "./TcgPicker";

const PUBLIC_PATHS = ["/landing", "/login", "/privacy", "/terms", "/faq", "/auth/error", "/onboarding"];

export function AppHeader() {
  const pathname = usePathname();
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;
  return (
    <header className="app-header">
      <Link href="/" className="app-wordmark" aria-label="RipnPull home"><span className="brand-card-mark" aria-hidden />RipnPull</Link>
      <TcgPicker />
    </header>
  );
}
