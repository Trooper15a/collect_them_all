import type { Metadata } from "next";
import { PurchaseConfirmation } from "@/components/PurchaseConfirmation";

export const metadata: Metadata = { title: "Purchase confirmation", robots: { index: false, follow: false } };

export default async function PremiumSuccessPage({ searchParams }: { searchParams: Promise<{ session_id?: string | string[] }> }) {
  const params = await searchParams;
  return <div className="mx-auto max-w-lg py-5"><PurchaseConfirmation sessionId={typeof params.session_id === "string" ? params.session_id : null} /></div>;
}
