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

const CACHE = "rigs-v35";

// This one file runs under two registrations. "/rigs/" is the app, and
// everything below is for it. "/rigs" with no slash is the address a person
// types or gets in a text: it is outside the app's scope, the server answers
// it with a redirect that cannot be saved, and with no signal that used to be
// the browser's own error page. The second registration exists only to hand
// that one address to "/rigs/". It caches nothing and touches nothing else.
const BARE_ONLY = new URL(self.registration.scope).pathname === "/rigs";

// Without these the page cannot render at all, so a failure to cache any of
// them must fail the whole install and leave the previous worker and its
// cache in place. kit.css, scene.css and scene.js are the look: the page is
// unstyled without them; spots-scene.js gives each spot its own picture.
// fish.css and fish.js are the animals drawn on the Fish tab and on every
// fish's page.
const SHELL = [
  "/rigs/index.html",
  "/rigs/kit.css",
  "/rigs/scene.css",
  "/rigs/scene.js",
  "/rigs/spots-scene.js",
  "/rigs/fish.css",
  "/rigs/fish.js",
  "/rigs/diagrams.js",
  "/rigs/content.js",
  "/rigs/trips.js",
  "/rigs/runs.js",
  "/rigs/sky.js",
  "/rigs/crew.js",
  "/rigs/rules.js",
  "/rigs/waters.js"
];

// Nice to have. One of these failing should not cost the offline story.
const EXTRA = [
  "/rigs/",
  "/rigs/manifest.webmanifest",
  "/rigs/fonts/inter.woff2",
  "/rigs/fonts/barlow-condensed-600.woff2",
  "/rigs/fonts/barlow-condensed-700.woff2",
  "/rigs/icon-v4-180.png",
  "/rigs/icon-v4-192.png",
  "/rigs/icon-v4-512.png",
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
  if (BARE_ONLY) { event.waitUntil(self.skipWaiting()); return; }
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
  if (BARE_ONLY) { event.waitUntil(self.clients.claim()); return; }
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
  if (BARE_ONLY) {
    // Exactly "/rigs" and nothing else. "/rigs-anything" also falls in this
    // scope and is none of our business.
    if (req.mode === "navigate" && url.pathname === "/rigs") {
      event.respondWith(Response.redirect("/rigs/" + url.search + url.hash, 302));
    }
    return;
  }
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
  // The app owns /rigs/ itself. Other pages under it (/rigs/look/ and
  // anything later) are their own pages: serving them the app shell made a
  // link Coach tapped open the app instead, which looked like a stale copy.
  if (req.mode === "navigate" && !isShellPath(url.pathname)) return;

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

// ---- alerts ---------------------------------------------------------------
// The crew function sends { title, body, url, tag }. Only the "/rigs/" worker
// is ever subscribed, so only it hears these.
//
// The link in an alert is written for coachpilot.org. This copy of the app may
// have been opened, and put on a Home Screen, from www.coachpilot.org (both
// answer), so the link is carried over to the address this worker lives at:
// the same page, on the copy that is installed. A link to anywhere that is not
// a Rig Card page of ours becomes the app's front door and is never opened.
const OURS = /^(www\.)?coachpilot\.org$/;
function rigUrl(raw) {
  const home = self.location.origin + "/rigs/";
  try {
    const u = new URL(raw || "/rigs/", self.location.origin);
    const ours = u.origin === self.location.origin || (u.protocol === "https:" && !u.port && OURS.test(u.hostname));
    return ours && u.pathname.startsWith("/rigs/") ? self.location.origin + u.pathname + u.search + u.hash : home;
  } catch (e) { return home; }
}

// What to show for one push. Kept apart from the listener so it can be read
// and tested on its own.
function pushParts(data) {
  let d = { title: "Rig Card", body: "Something changed on a crew trip.", url: "/rigs/#/trips" };
  if (data) {
    try { d = Object.assign(d, data.json()); } catch (e) { d.body = data.text() || d.body; }
  }
  const opts = { body: String(d.body || ""), icon: "/rigs/icon-v4-192.png", badge: "/rigs/icon-v4-192.png", data: { url: rigUrl(d.url) } };
  if (d.tag) opts.tag = String(d.tag);
  return { title: String(d.title || "Rig Card"), opts: opts };
}
function showPush(data) {
  const p = pushParts(data);
  return self.registration.showNotification(p.title, p.opts);
}
self.addEventListener("push", (event) => {
  event.waitUntil(showPush(event.data));
});

// A tap: bring an open Rig Card to the front and send it to the trip, or
// open one there. Only the app itself can be sent anywhere. Another page
// under /rigs/ would take the message and do nothing with it.
async function openRig(target) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) {
    if (isShellPath(new URL(c.url).pathname)) {
      c.postMessage({ type: "rig-open", url: target });
      if ("focus" in c) { try { await c.focus(); } catch (e) { /* the phone decides */ } }
      return "sent";
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(target);
  return "opened";
}
function alertTapped(notification) {
  notification.close();
  return openRig(rigUrl(notification.data && notification.data.url));
}
self.addEventListener("notificationclick", (event) => {
  event.waitUntil(alertTapped(event.notification));
});
