/* Workout Tracker â€” service worker cho PWA (cache app shell).
   Chiáº¿n lÆ°á»£c:
   - HTML / Ä‘iá»u hÆ°á»›ng: network-first (luÃ´n Æ°u tiÃªn báº£n má»›i), offline thÃ¬ láº¥y cache.
   - TÃ i sáº£n tÄ©nh (JS, CSS, wasm, iconâ€¦): cache-first, ná»n táº£ng cho táº£i láº¡i gáº§n nhÆ° tá»©c thÃ¬.
*/
const CACHE = "workout-tracker-v23";
const BASE = new URL("./", self.location.href).href;
const BASE_PATH = new URL(BASE).pathname;

const ASSETS = [
  BASE,
  BASE + "index.html",
  BASE + "manifest.json",
  BASE + "static/styles.css",
  BASE + "static/app.js",
  BASE + "static/i18n.js",
  BASE + "static/icon-192.png",
  BASE + "static/icon-256.png",
  BASE + "static/icon-512.png",
  BASE + "static/icon-192.png?v=3",
  BASE + "static/icon-256.png?v=3",
  BASE + "static/favicon.ico?v=3",
  BASE + "assets/app.js",
  BASE + "assets/web.js",
  BASE + "assets/esm.js",
  BASE + "assets/dist.js",
  BASE + "assets/web2.js",
  BASE + "assets/esm2.js",
  BASE + "assets/sql-wasm.wasm",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => Promise.allSettled(ASSETS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // XoÃ¡ cache cá»§a cÃ¡c version cÅ© Ä‘á»ƒ UI cÅ© khÃ´ng quay láº¡i.
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  if (url.pathname.endsWith("/")) return true;
  if (url.pathname.endsWith(".html")) return true;
  return url.pathname === BASE_PATH;
}

function putInCache(request, response) {
  if (!response || !response.ok) return;
  const sameOrigin = new URL(response.url).origin === self.location.origin;
  if (!sameOrigin) return;
  const copy = response.clone();
  caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return; // API -> chá»‰ dÃ¹ng máº¡ng

  // HTML: máº¡ng trÆ°á»›c, cache dá»± phÃ²ng.
  if (isHtmlRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(request, response);
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request, { ignoreSearch: true })) ||
            (await caches.match(BASE + "index.html", { ignoreSearch: true })) ||
            (await caches.match(BASE, { ignoreSearch: true }));
          if (cached) return cached;
          return new Response("Offline", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        })
    );
    return;
  }

  // TÃ i sáº£n tÄ©nh: cache trÆ°á»›c, máº¡ng sau (vÃ  tá»± bá»• sung cache).
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          putInCache(request, response);
          return response;
        })
        .catch(() => caches.match(request, { ignoreSearch: true }));
    })
  );
});
