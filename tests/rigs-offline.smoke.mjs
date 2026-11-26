// Proves the one thing /rigs exists for: it opens with no usable network.
// Run: node tests/rigs-offline.smoke.mjs
//
// Served with Cache-Control: no-store so the browser's own http cache cannot
// stand in for the service worker. An earlier version of this file used
// python3 -m http.server, which sends no cache headers at all, and every
// offline assertion passed with the service worker deleted. Two real defects
// shipped past it. The control case at the bottom now pins that honesty.
import { chromium } from "@playwright/test";
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
