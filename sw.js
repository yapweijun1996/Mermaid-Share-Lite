// ============================================================
// Mermaid Share Lite — Service Worker (Auto-Update)
// ============================================================
// Update APP_VERSION to bust the cache and trigger SW update.
// The browser compares sw.js byte-for-byte; any change here
// (including the version string) triggers the update lifecycle.
// ============================================================

const APP_VERSION = "1.0.0";
const CACHE_NAME = `mermaid-share-lite-v${APP_VERSION}`;

// Resources to pre-cache on install
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/svg-pan-zoom.min.js",
  "./lib/pako.esm.mjs",
  "./manifest.json"
];

// CDN resources — cached on first fetch (runtime cache)
const CDN_HOSTS = [
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com"
];

// ------------------------------------------------------------
// Install: pre-cache core shell
// ------------------------------------------------------------
self.addEventListener("install", (event) => {
  console.log(`[SW] Installing v${APP_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

// ------------------------------------------------------------
// Activate: clean up old caches, claim clients
// ------------------------------------------------------------
self.addEventListener("activate", (event) => {
  console.log(`[SW] Activating v${APP_VERSION}`);
  event.waitUntil(
    caches.keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("mermaid-share-lite-") && key !== CACHE_NAME)
            .map((key) => {
              console.log(`[SW] Deleting old cache: ${key}`);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim()) // Take control of all tabs
      .then(() => {
        // Notify all clients that a new version is active
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: "SW_UPDATED", version: APP_VERSION });
          });
        });
      })
  );
});

// ------------------------------------------------------------
// Fetch: Network-first for local, Cache-first for CDN
// ------------------------------------------------------------
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // CDN resources: cache-first (they are versioned by URL)
  if (CDN_HOSTS.some((host) => url.hostname === host)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Local resources: network-first (always get latest, fallback to cache)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
});
