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

const CACHE = "rigs-v18";

// Without these three the page cannot render at all, so a failure to cache
// any of them must fail the whole install and leave the previous worker and
// its cache in place.
const SHELL = [
  "/rigs/index.html",
  "/rigs/diagrams.js",
  "/rigs/content.js",
  "/rigs/trips.js",
  "/rigs/runs.js",
  "/rigs/rules.js"
];

// Nice to have. One of these failing should not cost the offline story.
const EXTRA = [
  "/rigs/",
  "/rigs/manifest.webmanifest",
  "/rigs/fonts/inter.woff2",
  "/rigs/fonts/barlow-condensed-600.woff2",
  "/rigs/fonts/barlow-condensed-700.woff2",
  "/rigs/icon.svg",
  "/rigs/icon-v3-180.png",
  "/rigs/icon-v3-192.png",
  "/rigs/icon-v3-512.png",
  "/rigs/vendor/leaflet.js",
  "/rigs/vendor/leaflet.css"
];

const PRECACHE = SHELL.concat(EXTRA);

const IMMUTABLE = /\/rigs\/(fonts\/|icon-)/;

// The only two paths whose response may ever replace the cached shell. A 404,
// a redirect, or a Vercel 5xx during a deploy must never become the page the
// app falls back to, because the app then stays dead until the next SUCCESSFUL
// online navigation, and at a pier that is never.
function isShellPath(pathname) {
  return pathname === "/rigs/" || pathname === "/rigs/index.html";
}
function cacheable(res) {
  return res && res.ok && res.status === 200 && res.type === "basic";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(function (c) {
      // addAll is all or nothing: a half cached shell is worse than none.
      return c.addAll(SHELL).then(function () {
        return Promise.all(EXTRA.map(function (u) {
          return c.add(u).catch(function (e) { console.warn("rigs sw: skipped", u, e); });
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async function () {
    // Only drop the previous cache once this one can actually serve the page.
    const c = await caches.open(CACHE);
    const hasShell = await c.match("/rigs/index.html");
    if (hasShell) {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(function (k) { return k !== CACHE && k.indexOf("rigs-") === 0; })
        .map(function (k) { return caches.delete(k); }));
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith("/rigs")) return;

  // ---- navigations: cache first, always ----------------------------------
  // Network first looks fine on a clean connection and fails exactly where
  // this page has to work. A socket that opens and answers slowly does not
  // reject, so a network first navigation sits on a blank screen for as long
  // as the network takes while a complete copy sits in the cache. One bar at
  // the rail, or a marina wifi that associates without routing.
  //
  // So: serve the cached shell immediately, and refresh it in the background
  // for the next open.
  if (req.mode === "navigate") {
    event.respondWith((async function () {
      const cached = await caches.match("/rigs/index.html");
      if (cached) {
        event.waitUntil((async function () {
          try {
            const res = await fetch(req);
            if (cacheable(res) && isShellPath(new URL(res.url).pathname)) {
              const c = await caches.open(CACHE);
              await c.put("/rigs/index.html", res.clone());
            }
          } catch (e) { /* offline is the normal case here */ }
        })());
        return cached;
      }
      // Nothing cached yet, so this is a first visit and the network is all
      // there is.
      try {
        const res = await fetch(req);
        if (cacheable(res) && isShellPath(new URL(res.url).pathname)) {
          const c = await caches.open(CACHE);
          await c.put("/rigs/index.html", res.clone());
        }
        return res;
      } catch (e) {
        const fallback = await caches.match("/rigs/");
        if (fallback) return fallback;
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Rig Card</title>" +
          "<body style=\"font-family:system-ui;background:#0a0d10;color:#f4f7f9;padding:2rem\">" +
          "<h1>Not downloaded yet</h1><p>Open this once with a signal and it will work offline after that.</p>",
          { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
        );
      }
    })());
    return;
  }

  // ---- fonts and icons: immutable ----------------------------------------
  if (IMMUTABLE.test(url.pathname)) {
    event.respondWith(caches.match(req).then(function (hit) { return hit || fetch(req); }));
    return;
  }

  // ---- everything else: stale while revalidate ---------------------------
  event.respondWith(
    caches.match(req).then(function (hit) {
      const net = fetch(req)
        .then(function (res) {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        })
        .catch(function () { return hit; });
      return hit || net;
    })
  );
});
