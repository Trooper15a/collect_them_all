import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TabBar } from "@/components/TabBar";
import { TcgPicker } from "@/components/TcgPicker";
import { PwaRegister } from "@/components/PwaRegister";
import { ThemeScript } from "@/components/ThemeScript";
import { OfflineBanner } from "@/components/OfflineStatus";
import { AuthProvider } from "@/components/AuthProvider";
import { ToastContainer } from "@/components/Toast";
import { SITE } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const TITLE_DEFAULT = "RipnPull — Free TCG Portfolio Tracker";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: TITLE_DEFAULT,
    template: "%s · RipnPull",
  },
  description: SITE.description,
  keywords: [
    "TCG portfolio tracker",
    "card collection tracker",
    "trading card prices",
    "TCGPlayer prices",
    "card scanner",
    "Pokémon",
    "Magic: The Gathering",
    "Yu-Gi-Oh!",
    "open source",
    "PWA",
  ],
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "RipnPull" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: TITLE_DEFAULT,
    description: SITE.description,
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: TITLE_DEFAULT,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE_DEFAULT,
    description: SITE.description,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          <main className="flex-1 w-full max-w-3xl mx-auto px-4 pt-[max(env(safe-area-inset-top),12px)] safe-bottom">
            <OfflineBanner />
            {children}
          </main>
          <TabBar />
          <TcgPicker />
          <ToastContainer />
          <PwaRegister />
        </AuthProvider>
      </body>
    </html>
  );
}
