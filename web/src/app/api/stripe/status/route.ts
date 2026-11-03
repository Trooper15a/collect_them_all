import { requireUserId } from "@/lib/auth";
import { getPremiumAccount } from "@/lib/premium";
import { paymentAvailability, PaymentError } from "@/lib/stripe";
import { verifyPremiumCheckout } from "@/lib/stripe-payments";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401, headers }); }
  try {
    const sessionId = new URL(request.url).searchParams.get("session_id");
    if (sessionId) {
      if (!/^cs_[A-Za-z0-9_]{1,240}$/.test(sessionId)) return Response.json({ error: "Invalid purchase reference." }, { status: 400, headers });
      return Response.json(await verifyPremiumCheckout(sessionId, userId), { headers });
    }
    const account = await getPremiumAccount(userId);
    if (!account) return Response.json({ error: "Account not found." }, { status: 404, headers });
    return Response.json({ premium: account.premium, ...paymentAvailability() }, { headers });
  } catch (error) {
    if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("[stripe] purchase verification failed");
    return Response.json({ error: "Couldn't verify this purchase. Please try again." }, { status: 500, headers });
  }
}
