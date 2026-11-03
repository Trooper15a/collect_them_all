import { requireUserId } from "@/lib/auth";
import { getPaymentConfig, PaymentError } from "@/lib/stripe";
import { createPremiumCheckout } from "@/lib/stripe-payments";

const headers = { "Cache-Control": "private, no-store" };

export async function POST(request: Request) {
  let userId: string;
  try { userId = await requireUserId(); } catch { return Response.json({ error: "Unauthorized" }, { status: 401, headers }); }
  try {
    const config = getPaymentConfig();
    if (request.headers.get("origin") !== config.appUrl) return Response.json({ error: "Request origin is not allowed." }, { status: 403, headers });
    const key = request.headers.get("idempotency-key");
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
      return Response.json({ error: "A valid checkout retry key is required." }, { status: 400, headers });
    }
    return Response.json(await createPremiumCheckout(userId, key), { headers });
  } catch (error) {
    if (error instanceof PaymentError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("[stripe] checkout failed");
    return Response.json({ error: "Couldn't start checkout. Please try again." }, { status: 500, headers });
  }
}
