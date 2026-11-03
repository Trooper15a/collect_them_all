import Stripe from "stripe";

export class PaymentError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}

export interface PaymentConfig {
  enabled: boolean;
  mode: "test" | "live";
  secretKey: string;
  priceId: string;
  appUrl: string;
  webhookSecret: string;
}

/** Read at request time: unrelated pages and builds never need payment credentials. */
export function getPaymentConfig(): PaymentConfig {
  const mode = process.env.STRIPE_MODE ?? "test";
  const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
  const priceId = process.env.STRIPE_PRICE_ID ?? "";
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? "";
  const origin = process.env.STRIPE_APP_URL ?? process.env.AUTH_URL ?? "";
  const unavailable = () => new PaymentError("Payments are unavailable right now.", 503);
  if ((mode !== "test" && mode !== "live") || !new RegExp(`^(sk|rk|rkcs)_${mode}_`).test(secretKey)
    || !/^price_[A-Za-z0-9_]+$/.test(priceId) || !webhookSecret.startsWith("whsec_")) throw unavailable();
  let url: URL;
  try { url = new URL(origin); } catch { throw unavailable(); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol !== "https:" && !(mode === "test" && local && url.protocol === "http:"))) throw unavailable();
  return { enabled: process.env.PAYMENTS_ENABLED === "true", mode, secretKey, priceId, webhookSecret, appUrl: url.origin };
}

export function paymentAvailability() {
  try {
    const config = getPaymentConfig();
    return { paymentsEnabled: config.enabled, configured: true, testMode: config.mode === "test" };
  } catch {
    return { paymentsEnabled: false, configured: false, testMode: process.env.STRIPE_MODE !== "live" };
  }
}

let cached: { key: string; client: Stripe } | undefined;
export function getStripe(): Stripe {
  const { secretKey } = getPaymentConfig();
  if (!cached || cached.key !== secretKey) {
    // The pinned SDK supplies its matching API version.
    cached = { key: secretKey, client: new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 10_000 }) };
  }
  return cached.client;
}
