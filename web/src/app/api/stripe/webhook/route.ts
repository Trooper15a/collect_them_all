import { getPaymentConfig, getStripe, PaymentError } from "@/lib/stripe";
import { verifyPremiumCheckout } from "@/lib/stripe-payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature." }, { status: 400 });
  let event;
  let config;
  try { config = getPaymentConfig(); } catch { return Response.json({ error: "Webhook unavailable." }, { status: 503 }); }
  try { event = getStripe().webhooks.constructEvent(await request.text(), signature, config.webhookSecret); }
  catch { return Response.json({ error: "Invalid signature." }, { status: 400 }); }
  if (event.type !== "checkout.session.completed" && event.type !== "checkout.session.async_payment_succeeded") {
    return Response.json({ received: true });
  }
  if (event.data.object.metadata?.purchase !== "ripnpull_premium_v1") return Response.json({ received: true });
  try {
    await verifyPremiumCheckout(event.data.object.id);
    return Response.json({ received: true });
  } catch (error) {
    if (error instanceof PaymentError && error.status < 500) return Response.json({ received: true, ignored: true });
    console.error("[stripe] webhook fulfillment failed");
    return Response.json({ error: "Fulfillment failed; retry delivery." }, { status: 500 });
  }
}
