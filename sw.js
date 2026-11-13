/* Workout Tracker — service worker cho PWA (cache app shell).
   Chiến lược:
   - HTML / điều hướng: network-first (luôn ưu tiên bản mới), offline thì lấy cache.
   - Tài sản tĩnh (JS, CSS, wasm, icon…): cache-first, nền tảng cho tải lại gần như tức thì.
*/
const CACHE = "workout-tracker-v14";
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
  // Xoá cache của các version cũ để UI cũ không quay lại.
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
  if (url.pathname.includes("/api/")) return; // API -> chỉ dùng mạng

  // HTML: mạng trước, cache dự phòng.
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

  // Tài sản tĩnh: cache trước, mạng sau (và tự bổ sung cache).
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
