"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { prepareScanEngine } from "@/lib/scanner/preparation";
import { getActiveTcg } from "@/lib/ui-prefs";

const tabs = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/portfolios", label: "Binders", icon: FolderIcon },
  { href: "/scan", label: "Scan", icon: ScanIcon, badge: true },
  { href: "/sets", label: "Lookup", icon: GridIcon },
];

const moreTools = [
  { href: "/card-show", label: "Card Show", icon: CardShowIcon },
  { href: "/investing", label: "Investing", icon: InvestingIcon },
  { href: "/shop", label: "Shop", icon: ShopIcon },
  { href: "/grade", label: "Pre-grade", icon: GradeIcon },
  { href: "/wishlist", label: "Wishlist", icon: HeartIcon },
  { href: "/opens", label: "Box opens", icon: BoxIcon },
  { href: "/settings", label: "Settings", icon: GearIcon },
];

const PUBLIC_PATHS = ["/landing", "/login", "/privacy", "/terms", "/faq", "/auth/error", "/onboarding"];
const prepareScanner = () => { void prepareScanEngine(getActiveTcg()); };

export function TabBar() {
  const pathname = usePathname();
  const [scanBadge, setScanBadge] = useState(0);
  const [moreForPath, setMoreForPath] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const hidden = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const moreOpen = !hidden && moreForPath === pathname;
  const moreActive = moreTools.some((t) => pathname === t.href || pathname.startsWith(t.href + "/")) || pathname === "/premium" || pathname === "/pricing";

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!moreOpen || !dialog) return;
    dialog.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, [moreOpen]);

  useEffect(() => {
    // Signal to globals.css (.safe-bottom / .pwa-banner) that no tab bar is rendered.
    document.documentElement.classList.toggle("no-tabbar", hidden);
    return () => document.documentElement.classList.remove("no-tabbar");
  }, [hidden]);

  useEffect(() => {
    const update = () => {
      try {
        const q = localStorage.getItem("bulkQueue");
        const queue: unknown = q ? JSON.parse(q) : [];
        setScanBadge(Array.isArray(queue) ? queue.length : 0);
      } catch { setScanBadge(0); }
    };
    update();
    window.addEventListener("storage", update);
    const id = setInterval(update, 2000);
    return () => { window.removeEventListener("storage", update); clearInterval(id); };
  }, []);

  if (hidden) return null;

  return (
    <>
    <nav aria-label="Primary" className="app-tabbar">
      <div className="app-tabbar-inner">
        {tabs.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href) || (t.href === "/sets" && pathname.startsWith('/cards'));
          const badge = t.badge ? scanBadge : 0;
          return (
            <Link
              key={t.href}
              href={t.href}
              onPointerEnter={t.href === "/scan" ? prepareScanner : undefined}
              onFocus={t.href === "/scan" ? prepareScanner : undefined}
              onTouchStart={t.href === "/scan" ? prepareScanner : undefined}
              aria-current={active ? "page" : undefined}
              className={`app-tab ${active ? "is-active" : ""}`}
            >
              <div className="relative">
                <t.icon className="w-5 h-5" />
                {badge > 0 && (
                  <span className="scan-queue-badge" aria-label={`${badge} cards in scan queue`}>
                    {badge}
                  </span>
                )}
              </div>
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button type="button" className={`app-tab ${moreActive ? "is-active" : ""}`} aria-current={moreActive ? "page" : undefined} aria-haspopup="dialog" aria-expanded={moreOpen} onClick={() => setMoreForPath(pathname)}>
          <MoreIcon className="w-5 h-5" />
          <span>More</span>
        </button>
      </div>
    </nav>
    <dialog ref={dialogRef} className="more-dialog" aria-label="More tools" onClose={() => setMoreForPath(null)} onClick={(e) => { if (e.target === e.currentTarget) setMoreForPath(null); }}>
      <div className="flex items-center justify-between gap-4 mb-5">
        <h2 className="text-lg font-medium">More tools</h2>
        <button type="button" className="sheet-close" aria-label="Close more tools" onClick={() => setMoreForPath(null)}><CloseIcon className="w-5 h-5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {moreTools.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return <Link key={t.href} href={t.href} aria-label={t.href === "/investing" ? "Card Investing" : undefined} aria-current={active ? "page" : undefined} className="more-tool" onClick={() => setMoreForPath(null)}><t.icon className="w-5 h-5 shrink-0" /><span>{t.label}</span></Link>;
        })}
      </div>
    </dialog>
    </>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
}
function CloseIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m6 6 12 12M18 6 6 18" /></svg>;
}
function GradeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="M4 8V4h4m8 0h4v4m0 8v4h-4M8 20H4v-4" /><circle cx="12" cy="12" r="4" /></svg>;
}
function HeartIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1.1-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21.2l8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" /></svg>;
}
function BoxIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v10l9 5 9-5V8M12 13v10" /></svg>;
}

function InvestingIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18M6 15l5-5 4 3 6-8M16 5h5v5" /></svg>;
}

function CardShowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="7" y="3" width="13" height="17" rx="2" />
      <path d="M4 7H3v13a2 2 0 0 0 2 2h10M11 9h5m-5 4h3" />
    </svg>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </svg>
  );
}
function ScanIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" />
      <rect x="8" y="7" width="8" height="10" rx="1" />
    </svg>
  );
}
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
function GridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function ShopIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3h2l.4 2M7 13h10l4-8H5.4" />
      <circle cx="7.5" cy="19.5" r="1.5" />
      <circle cx="17.5" cy="19.5" r="1.5" />
    </svg>
  );
}
function GearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}
