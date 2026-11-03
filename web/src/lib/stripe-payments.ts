import { createHash } from "node:crypto";
import type Stripe from "stripe";
import { getPaymentConfig, getStripe, PaymentError } from "@/lib/stripe";
import { getPremiumAccount, grantPremium, saveStripeCustomer } from "@/lib/premium";

const PURCHASE = "ripnpull_premium_v1";
const AMOUNT = 499;

async function premiumPrice() {
  const config = getPaymentConfig();
  const price = await getStripe().prices.retrieve(config.priceId);
  if (price.id !== config.priceId || !price.active || price.currency !== "usd" || price.unit_amount !== AMOUNT
    || price.type !== "one_time" || price.recurring || price.livemode !== (config.mode === "live")) {
    throw new PaymentError("The Premium price is not configured correctly.", 503);
  }
  return price;
}

function customerId(session: Stripe.Checkout.Session) {
  return typeof session.customer === "string" ? session.customer : session.customer?.id;
}

export async function createPremiumCheckout(userId: string, requestKey: string) {
  const config = getPaymentConfig();
  if (!config.enabled) throw new PaymentError("Purchases are not available yet.", 403);
  const account = await getPremiumAccount(userId);
  if (!account) throw new PaymentError("Account not found.", 404);
  if (account.premium && config.mode === "live") throw new PaymentError("You already have Premium.", 409);
  await premiumPrice();
  const stripe = getStripe();
  let customer = config.mode === "live" ? account.stripeCustomerId : null;
  if (!customer) {
    const binding = createHash("sha256").update(`${config.mode}:${userId}`).digest("hex");
    const created = await stripe.customers.create({ metadata: { userId, app: "ripnpull" } }, { idempotencyKey: `ripnpull-customer-${binding}` });
    customer = created.id;
    if (config.mode === "live") await saveStripeCustomer(userId, customer);
  }
  const binding = createHash("sha256").update(`${config.mode}:${userId}:${config.priceId}`).digest("hex");
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer,
    client_reference_id: userId,
    metadata: { userId, purchase: PURCHASE, environment: config.mode },
    payment_intent_data: { metadata: { userId, purchase: PURCHASE, environment: config.mode } },
    line_items: [{ price: config.priceId, quantity: 1 }],
    adaptive_pricing: { enabled: false },
    success_url: `${config.appUrl}/premium/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appUrl}/pricing?canceled=1`,
  }, { idempotencyKey: `ripnpull-checkout-${binding}-${requestKey}` });
  if (!session.url) throw new PaymentError("This checkout has already finished. Check your purchase status.", 409);
  return { url: session.url, testMode: config.mode === "test" };
}

export interface PremiumCheckoutResult {
  status: "pending" | "test_paid" | "paid";
  premium: boolean;
  testMode: boolean;
}

/** Both the signed webhook and the authenticated return page use the same verification. */
export async function verifyPremiumCheckout(sessionId: string, expectedUserId?: string): Promise<PremiumCheckoutResult> {
  const config = getPaymentConfig();
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  const userId = session.metadata?.userId;
  if (!userId || (expectedUserId && userId !== expectedUserId) || session.client_reference_id !== userId
    || session.metadata?.purchase !== PURCHASE) throw new PaymentError("Purchase not found.", 404);
  if (session.mode !== "payment" || session.livemode !== (config.mode === "live")
    || session.metadata?.environment !== config.mode) throw new PaymentError("Payment environment mismatch.");
  const account = await getPremiumAccount(userId);
  if (!account) throw new PaymentError("Account not found.", 404);
  const customer = customerId(session);
  if (!customer || (config.mode === "live" && customer !== account.stripeCustomerId)) throw new PaymentError("Purchase account mismatch.");
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 2 });
  const item = items.data[0];
  if (items.has_more || items.data.length !== 1 || item?.quantity !== 1 || item.price?.id !== config.priceId
    || item.price.currency !== "usd" || item.price.unit_amount !== AMOUNT || item.price.recurring
    || session.currency !== "usd" || session.amount_subtotal !== AMOUNT) throw new PaymentError("Purchase price mismatch.");
  if (session.status !== "complete" || session.payment_status !== "paid") {
    return { status: "pending", premium: account.premium, testMode: config.mode === "test" };
  }
  if (config.mode === "test") return { status: "test_paid", premium: account.premium, testMode: true };
  if (!account.premium) await grantPremium(userId, customer);
  return { status: "paid", premium: true, testMode: false };
}
