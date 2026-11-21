// Proves the one thing /rigs exists for: it opens with no network.
// Run: node tests/rigs-offline.smoke.mjs
// Serves the repo on a loopback port, lets the service worker install, kills
// the network, reloads, and checks the page still renders with its own fonts.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8787;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A hung test is worse than a failing one: it blocks CI and tells you nothing.
const watchdog = setTimeout(() => {
  console.log("FAIL watchdog: test exceeded 60s, something is hanging");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}, 60000);
watchdog.unref?.();

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: ROOT, stdio: "ignore",
});
process.on("exit", () => server.kill());

let browser;
try {
  await sleep(900);
  browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  // --- online first load -------------------------------------------------
  await page.goto(`http://127.0.0.1:${PORT}/rigs/`, { waitUntil: "load" });
  ok((await page.locator("h1").innerText()).trim() === "Rig Card", "page renders online");

  // Wait for the worker to control this client, not merely to exist.
  const controlled = await page.evaluate(async () => {
    // serviceWorker.ready never settles when registration failed, so race it.
    const timeout = new Promise((r) => setTimeout(() => r(null), 8000));
    const reg = await Promise.race([navigator.serviceWorker.ready, timeout]);
    for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return { active: !!(reg && reg.active), controlling: !!navigator.serviceWorker.controller };
  });
  ok(controlled.active, "service worker reaches the active state");
  ok(controlled.controlling, "service worker is controlling the page", JSON.stringify(controlled));

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const c = await caches.open(names[0]);
    return (await c.keys()).map((r) => new URL(r.url).pathname).sort();
  });
  ok(cached.includes("/rigs/fonts/inter.woff2"), "fonts are in the cache after install", cached.join(","));
  ok(cached.includes("/rigs/index.html") || cached.includes("/rigs/"), "shell is in the cache after install", cached.join(","));

  // --- now cut the network ------------------------------------------------
  await ctx.setOffline(true);
  await page.reload({ waitUntil: "load" });

  const h1 = (await page.locator("h1").innerText()).trim();
  ok(h1 === "Rig Card", "page still renders with the network cut", h1);

  const fontOk = await page.evaluate(() => document.fonts.check('700 44px "Barlow Condensed"'));
  ok(fontOk, "self-hosted heading font is available offline");

  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  ok(bg !== "rgba(0, 0, 0, 0)" && bg !== "", "stylesheet applied offline", bg);

  // A cold start with no network at all: brand new context, same cache origin
  // is not shared, so this instead checks the navigate fallback path directly.
  const navFallback = await page.evaluate(async () => {
    const r = await fetch("/rigs/index.html");
    return r.ok;
  });
  ok(navFallback, "cached assets still fetch offline");
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
