/* Service Worker for WebOCR.
 *
 * Strategy: stale-while-revalidate for same-origin static assets.
 * The app shell is precached on install. On every subsequent fetch, the
 * cached response is served immediately for speed, and a network fetch runs
 * in the background. If the network response differs from the cached one
 * (compared byte-for-byte), the cache is updated and the service worker posts
 * an UPDATE_AVAILABLE message to every client so they can prompt the user to
 * reload and pick up the new version.
 *
 * Cross-origin requests (e.g. Tesseract.js from jsDelivr, language data) are
 * ignored by this service worker and always go straight to the network/CDN.
 */
const CACHE_NAME = "webocr-v1";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/languages.js",
  "./js/db.js",
  "./js/ocr.js",
  "./js/app.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(CORE_ASSETS);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(req, { ignoreSearch: true });
      const networkFetch = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            if (cached) {
              const [oldText, newText] = await Promise.all([
                cached.clone().text(),
                res.clone().text(),
              ]);
              if (oldText !== newText) {
                await cache.put(req, res.clone());
                notifyClients();
              }
            } else {
              await cache.put(req, res.clone());
            }
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })()
  );
});

async function notifyClients() {
  const clients = await self.clients.matchAll({
    includeUncontrolled: true,
    type: "window",
  });
  for (const client of clients) {
    client.postMessage({ type: "UPDATE_AVAILABLE" });
  }
}