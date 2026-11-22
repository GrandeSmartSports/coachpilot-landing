// The page has to pop and navigate like the old Rig Card: dark always,
// Water, Fish and Learn pinned on top, filters one tap away, headlines first.
// Run: node tests/rigs-ui.smoke.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8792;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 60000);
watchdog.unref?.();

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  // A phone in daylight asks for light. The card stays dark anyway.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "light" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;
  await page.goto(base, { waitUntil: "load" });

  const lum = await page.evaluate(() => {
    const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number);
    return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255;
  });
  ok(lum < 0.15, "page is dark even when the phone asks for light", lum.toFixed(2));

  const tabs = await page.locator(".top .tabs [data-tab]").allInnerTexts();
  ok(tabs.map((t) => t.trim().toLowerCase()).join(",") === "water,fish,learn", "three ways in: Water, Fish, Learn", tabs.join(","));
  ok(await page.locator('[data-view="home"] [data-group="fundamental"]').count() === 0,
    "the rod course is not dumped on the home screen");

  // Screen one is tiles, not reading. Few words is a rule, so it is counted.
  const words = await page.evaluate(() => document.querySelector('[data-view="home"]').innerText.split(/\s+/).filter(Boolean).length);
  ok(words <= 40, "home screen is under 40 words", words);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth);
  ok(wide <= 390, "nothing runs off the side at phone width", wide);

  await page.locator('.top [data-tab="fish"]').click();
  await page.waitForSelector('[data-view="fish"]');
  const nSpecies = await page.evaluate(() => window.RIG.content.species.length);
  ok(await page.locator(".top .jump [data-species]").count() === nSpecies, "every species is one tap away under Fish");
  await page.locator('.top .jump [data-species="squid"]').click();
  await page.waitForSelector('[data-view="species"]');
  ok(await page.locator('.top .jump [data-species="squid"][aria-current="true"]').count() === 1, "the open species is lit");

  // A long card scrolled to the bottom keeps the header pinned.
  await page.goto(base + "#/squid/redondo/squid-watch-start", { waitUntil: "load" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);
  const hdr = await page.evaluate(() => document.querySelector(".top").getBoundingClientRect().top);
  ok(hdr >= -1 && hdr < 5, "the header stays pinned after scrolling", hdr);

  await page.locator('.top [data-tab="water"]').click();
  await page.waitForSelector('[data-view="home"]');
  ok(true, "Water goes back to the tiles");
  ok(errors.length === 0, "no page errors", errors.join(" | "));
} catch (e) {
  fail++; console.log("FAIL threw:", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
