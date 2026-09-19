/* Cache public assets only. Private responses and mutations stay network-only. */
const VERSION = "v3";
const STATIC = `rnp-static-${VERSION}`;
const MODEL = `rnp-model-${VERSION}`;
const IMAGES = `rnp-images-${VERSION}`;

async function purgeLegacyPrivateState() {
  const keep = new Set([STATIC, MODEL, IMAGES]);
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => (k.startsWith("rnp-") || k.startsWith("cta-")) && !keep.has(k)).map(k => caches.delete(k)));
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("cta-offline");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    // A blocked deletion stays pending until legacy connections close.
  });
}

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => {
  event.waitUntil(purgeLegacyPrivateState().then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin || req.method !== "GET") return;
  // Never cache documents, RSC responses, API data or authentication traffic.
  if (req.mode === "navigate" || req.headers.has("RSC")) return;
  if (url.pathname.startsWith("/model/")) {
    event.respondWith(staleRevalidate(MODEL, req, event));
  } else if (url.pathname.startsWith("/ort/")) {
    event.respondWith(cacheFirst(MODEL, req));
  } else if (url.pathname.startsWith("/api/images/")) {
    event.respondWith(cacheFirst(IMAGES, req));
  } else if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(STATIC, req));
  }
});

async function staleRevalidate(name, req, event) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const fresh = fetch(req).then(async res => {
    if (res.ok && !res.redirected && !(res.headers.get("Content-Type") || "").includes("text/html")) {
      await cache.put(req, res.clone());
    }
    return res;
  });
  event.waitUntil(fresh.then(() => undefined, () => undefined));
  return hit || fresh;
}

async function cacheFirst(name, req) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  // Do not cache redirects to login or unexpected HTML under an asset URL.
  if (res.ok && !res.redirected && !(res.headers.get("Content-Type") || "").includes("text/html")) {
    await cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener("message", event => {
  if (event.data === "GET_STATUS") {
    event.source?.postMessage({ type: "STATUS", pending: 0, lastSync: null });
  }
  // Legacy pages may still request SYNC_QUEUE: deliberately never replay it.
  if (event.data === "CLEAR_PRIVATE_STATE") {
    event.waitUntil(purgeLegacyPrivateState().then(() => event.ports[0]?.postMessage({ cleared: true })));
  }
});
