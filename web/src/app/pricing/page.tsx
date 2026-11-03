import type { Metadata } from "next";
import { PremiumPurchase } from "@/components/PremiumPurchase";

export const metadata: Metadata = { title: "Premium", robots: { index: false, follow: false } };

export default function PricingPage() {
  return <div className="mx-auto max-w-lg space-y-5 py-5">
    <header><h1 className="text-2xl font-medium">RipnPull Premium</h1><p className="mt-2 text-sm text-muted">A one-time upgrade for your RipnPull account.</p></header>
    <PremiumPurchase />
  </div>;
}
