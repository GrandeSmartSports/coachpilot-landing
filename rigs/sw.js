// Fishing Library service worker.
// Unlike fields/sw.js (notifications only), this one exists for ONE reason:
// /rigs must open at a pier with no cell signal. Everything below serves that.
//
// Two caching behaviours, on purpose:
//   - fonts and icons are immutable, so cache-first, never re-fetched.
//   - html, js and the manifest are stale-while-revalidate: the cached copy
//     is served instantly (so it works offline and opens fast), and a fresh
//     copy is fetched in the background for the NEXT open. Without this a
//     cache-first shell would serve last month's content forever and Coach
//     would read stale tides at the rail.
//
// Bump CACHE whenever the precache LIST changes. Content changes inside
// these files do not need a bump: stale-while-revalidate picks them up.

const CACHE = "rigs-v2";

const PRECACHE = [
  "/rigs/",
  "/rigs/index.html",
  "/rigs/diagrams.js",
  "/rigs/content.js",
  "/rigs/manifest.webmanifest",
  "/rigs/fonts/inter.woff2",
  "/rigs/fonts/barlow-condensed-600.woff2",
  "/rigs/fonts/barlow-condensed-700.woff2",
  "/rigs/icon-192.png",
  "/rigs/icon-512.png"
];

const IMMUTABLE = /\/rigs\/(fonts\/|icon-)/;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) =>
      // One bad URL must not fail the whole install and leave the page with
      // no offline story at all, so each asset is added independently.
      Promise.all(PRECACHE.map((u) => c.add(u).catch((e) => console.warn("rigs sw: skipped", u, e))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k.startsWith("rigs-")).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/rigs")) return;

  // A navigation with no signal must land on the cached shell rather than
  // the browser's offline error page.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/rigs/index.html", copy));
          return res;
        })
        .catch(() => caches.match("/rigs/index.html").then((r) => r || caches.match("/rigs/")))
    );
    return;
  }

  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
    return;
  }

  // stale-while-revalidate
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || net;
    })
  );
});
