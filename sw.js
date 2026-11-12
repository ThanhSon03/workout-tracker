/* Workout Tracker — service worker cho PWA (cache app shell). */
const CACHE = "workout-tracker-v11";
const BASE = new URL("./", self.location.href).href;

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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // API -> network only
  // Mạng trước, cache dự phòng: cập nhật code là reload là thấy luôn;
  // mất mạng thì vẫn mở được app từ cache.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const sameOrigin = new URL(response.url).origin === self.location.origin;
        if (response.ok && sameOrigin) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request, { ignoreVary: true });
        if (cached) return cached;
        if (event.request.mode === "navigate") {
          return (
            (await caches.match(BASE + "index.html", { ignoreVary: true })) ||
            (await caches.match(BASE, { ignoreVary: true })) ||
            Response.error()
          );
        }
        return Response.error();
      })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const client = clients.find((row) => "focus" in row);
        if (client) return client.focus();
        return self.clients.openWindow(self.registration.scope);
      })
  );
});
