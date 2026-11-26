// Proves the one thing /rigs exists for: it opens with no usable network.
// Run: node tests/rigs-offline.smoke.mjs
//
// Served with Cache-Control: no-store so the browser's own http cache cannot
// stand in for the service worker. An earlier version of this file used
// python3 -m http.server, which sends no cache headers at all, and every
// offline assertion passed with the service worker deleted. Two real defects
// shipped past it. The control case at the bottom now pins that honesty.
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8787;
const HANG_PORT = 8786;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};

const watchdog = setTimeout(() => {
  console.log("FAIL watchdog: test exceeded 120s, something is hanging");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}, 120000);
watchdog.unref?.();

const BASE = `http://127.0.0.1:${PORT}/rigs/`;
let server = await startServer(ROOT, PORT);
let browser;

// The test server answers /rigs with the page itself. Production does not:
// it redirects /rigs to /rigs/ with nothing cacheable, and it must send
// Service-Worker-Allowed for sw.js so the worker may also take the bare
// address. This stands in front of the test server and answers those two
// things the way production does.
function vercelLike(port, upstream) {
  const live = createServer(async (req, res) => {
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/rigs") {
      res.writeHead(307, { location: "/rigs/" + u.search, "cache-control": "public, max-age=0, must-revalidate" });
      res.end();
      return;
    }
    try {
      const r = await fetch(upstream + req.url);
      const body = Buffer.from(await r.arrayBuffer());
      const headers = { "content-type": r.headers.get("content-type") || "application/octet-stream", "cache-control": "no-store" };
      if (u.pathname === "/rigs/sw.js") headers["service-worker-allowed"] = "/rigs";
      res.writeHead(r.status, headers);
      res.end(body);
    } catch (e) {
      res.writeHead(502, { "cache-control": "no-store" }).end("upstream down");
    }
  });
  return new Promise((ok) => live.listen(port, "127.0.0.1", () => ok(live)));
}

// Opens a fresh context, lets the worker install and take control.
async function warmed(ctx) {
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "load" });
  await page.evaluate(async () => {
    const timeout = new Promise((r) => setTimeout(() => r(null), 8000));
    await Promise.race([navigator.serviceWorker.ready, timeout]);
    for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
  });
  return page;
}

try {
  browser = await chromium.launch();

  // ---------------------------------------------------------- clean offline
  {
    const ctx = await browser.newContext();
    const page = await warmed(ctx);
    ok((await page.locator("h1").innerText()).trim() === "Hot Trips", "page renders online");
    ok(await page.evaluate(() => !!navigator.serviceWorker.controller), "service worker controls the page");

    const cached = await page.evaluate(async () => {
      const names = await caches.keys();
      const c = await caches.open(names[0]);
      return (await c.keys()).map((r) => new URL(r.url).pathname).sort();
    });
    ok(cached.includes("/rigs/fonts/inter.woff2"), "fonts precached", cached.join(","));
    ok(cached.includes("/rigs/content.js"), "content precached", cached.join(","));

    await ctx.setOffline(true);
    await page.reload({ waitUntil: "load" });
    ok((await page.locator("h1").innerText()).trim() === "Hot Trips", "renders with the network cut");
    // The worker owns /rigs/, but other pages under it are their own pages.
    // Serving the app shell for them makes a link Coach taps show the app.
    await ctx.setOffline(false);
    await page.goto(`http://127.0.0.1:${PORT}/rigs/look/`, { waitUntil: "load" });
    const isLook = await page.evaluate(() => document.title + " | slider:" + !!document.getElementById("t"));
    ok(/the new look/.test(isLook) && /slider:true/.test(isLook), "a sibling page under /rigs/ is not replaced by the app shell", isLook);
    await page.goto(BASE, { waitUntil: "load" });
    await ctx.setOffline(true);
    ok(await page.evaluate(() => document.fonts.check('700 44px "Barlow Condensed"')),
      "self-hosted heading font available offline");
    ok(await page.evaluate(() => (window.RIG.content.species || []).length > 0 && !!window.RIG.trips), "content.js and trips.js executed offline");
    await ctx.close();
  }

  // ----------------------------------------- a 404 must not poison the shell
  // One mistyped or stale in-scope link used to overwrite the cached shell
  // with the error document, and the app stayed dead until the next
  // SUCCESSFUL online navigation. At a pier that is never.
  {
    const ctx = await browser.newContext();
    const page = await warmed(ctx);
    await page.goto(`http://127.0.0.1:${PORT}/rigs/nope-typo`, { waitUntil: "load" }).catch(() => {});
    await ctx.setOffline(true);
    await page.goto(BASE, { waitUntil: "load" }).catch(() => {});
    const body = await page.evaluate(() => document.body.innerText).catch(() => "");
    ok(!/404/.test(body), "a 404 navigation does not poison the cached shell", body.slice(0, 120));
    ok(/Hot Trips/.test(body), "the shell still renders after a 404 was visited", body.slice(0, 120));
    await ctx.close();
  }

  // ------------------------------------------ weak signal must not wait blank
  // A connection that opens but answers slowly does not reject, so a plain
  // network-first navigation sits on a blank page with a perfectly good cached
  // copy unused. That is one bar at the rail, or a marina wifi that associates
  // without routing. The server below answers correctly, just slowly: if the
  // page waits for it, it cannot possibly render before SLOW_MS.
  {
    const SLOW_MS = 5000;
    const ctx = await browser.newContext();
    const page = await warmed(ctx);
    server.close();
    const slow = await startServer(ROOT, PORT, { delayMs: SLOW_MS });
    const t0 = Date.now();
    let rendered = false;
    try {
      await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 15000 });
      rendered = (await page.locator("h1").innerText()).trim() === "Hot Trips";
    } catch (_e) { rendered = false; }
    const took = Date.now() - t0;
    ok(rendered, "a slow network still renders", `rendered=${rendered} took=${took}ms`);
    ok(took < SLOW_MS - 1500,
      "the cached shell is served without waiting on the network", `took ${took}ms, server answers at ${SLOW_MS}ms`);
    slow.close();
    server = await startServer(ROOT, PORT);
    await ctx.close();
  }

  // ------------------------------------------- the address with no slash
  // coachpilot.org/rigs is what a person types, or gets in a text. It is
  // outside the app's "/rigs/" scope and the live site answers it with a
  // redirect that cannot be saved, so with no signal it was the browser's own
  // error page. A second registration at scope "/rigs" hands that one address
  // to "/rigs/", and leaves everything else alone.
  {
    const live = await vercelLike(HANG_PORT, `http://127.0.0.1:${PORT}`);
    const origin = `http://127.0.0.1:${HANG_PORT}`;
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin + "/rigs", { waitUntil: "load" });
    ok(new URL(page.url()).pathname === "/rigs/", "online, /rigs lands on /rigs/ the way the live site sends it", page.url());
    const both = await page.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        const regs = await navigator.serviceWorker.getRegistrations();
        if (regs.length >= 2 && regs.every((r) => r.active) && navigator.serviceWorker.controller) return regs.map((r) => new URL(r.scope).pathname).sort().join(" ");
        await new Promise((r) => setTimeout(r, 100));
      }
      return (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).join(" ");
    });
    ok(both === "/rigs /rigs/", "the app and the bare address each have a worker", both);

    await ctx.setOffline(true);
    await page.goto(origin + "/rigs", { waitUntil: "load" }).catch(() => {});
    const h1 = await page.locator("h1").innerText().catch(() => "");
    ok(h1.trim() === "Hot Trips" && new URL(page.url()).pathname === "/rigs/", "/rigs with no slash opens with the network cut", h1 + " " + page.url());
    await page.goto(origin + "/rigs#/learn", { waitUntil: "load" }).catch(() => {});
    await page.waitForFunction(() => document.querySelector('.top [data-tab="learn"]')?.getAttribute("aria-selected") === "true", null, { timeout: 5000 }).catch(() => {});
    ok(new URL(page.url()).pathname === "/rigs/" && await page.evaluate(() => location.hash) === "#/learn", "and a link into the app through /rigs keeps where it was going", page.url());
    ok(await page.evaluate(() => (window.RIG.content.species || []).length > 0), "with the app's own files, served by the app's own worker");

    // The wider scope also covers /rigs/look/ and anything that merely
    // starts with /rigs. None of that may be answered by the app.
    await ctx.setOffline(false);
    await page.goto(origin + "/rigs/look/", { waitUntil: "load" });
    const isLook = await page.evaluate(() => document.title + " | slider:" + !!document.getElementById("t"));
    ok(/the new look/.test(isLook) && /slider:true/.test(isLook), "a sibling page under /rigs/ is still its own page", isLook);
    await page.goto(origin + "/rigs-nope", { waitUntil: "load" }).catch(() => {});
    const other = await page.evaluate(() => document.body.innerText).catch(() => "");
    ok(/SERVER 404/.test(other) && new URL(page.url()).pathname === "/rigs-nope", "an address that only starts with /rigs is left to the server", other.slice(0, 80) + " " + page.url());
    ok(errors.length === 0, "no page errors", errors.join(" | "));
    await ctx.close();
    live.close();

    // Where the server does not allow the wider scope (the plain test server
    // here), the second registration fails quietly and nothing else changes.
    const ctx2 = await browser.newContext();
    const page2 = await warmed(ctx2);
    const errors2 = []; page2.on("pageerror", (e) => errors2.push(e.message));
    await page2.waitForTimeout(400);
    const scopes = await page2.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map((r) => new URL(r.scope).pathname).join(" "));
    ok(scopes === "/rigs/" && errors2.length === 0, "without that header there is just the app's worker, and no error", scopes + " " + errors2.join(" | "));
    await ctx2.close();
  }

  // ----------------------------------------------------- the control case
  // If this passes, every assertion above is worthless: it would mean the
  // page renders offline WITHOUT the service worker, so the browser's own
  // http cache is doing the work and these tests measure nothing.
  {
    const ctx = await browser.newContext();
    const page = await warmed(ctx);
    await page.evaluate(async () => {
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
    });
    await ctx.setOffline(true);
    let renderedWithout = false;
    try {
      await page.goto(BASE, { waitUntil: "load", timeout: 8000 });
      renderedWithout = (await page.locator("h1").count()) > 0;
    } catch (_e) { renderedWithout = false; }
    ok(!renderedWithout,
      "CONTROL: with the worker and caches removed, offline must FAIL (else this file proves nothing)",
      `renderedWithout=${renderedWithout}`);
    await ctx.close();
  }
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
