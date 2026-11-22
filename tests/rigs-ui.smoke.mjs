// The page has to pop and navigate like the old Rig Card: dark always,
// species tabs pinned on top, and a jump bar so any card is one tap away.
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

  const nSpecies = await page.evaluate(() => window.RIG.content.species.length);
  const tabs = await page.locator(".top .tabs [data-species]").count();
  ok(tabs === nSpecies, "every species is a tab on top of the home screen", `${tabs} of ${nSpecies}`);
  ok(await page.locator(".top .tabs [data-learn]").count() === 1, "Learn is its own tab");
  ok(await page.locator('[data-view="home"] [data-group="fundamental"]').count() === 0,
    "the rod course is not dumped on the home screen");

  await page.locator('.top .tabs [data-species="squid"]').click();
  await page.waitForSelector('[data-view="species"]');
  ok(await page.locator('.top .tabs [data-species="squid"][aria-selected="true"]').count() === 1,
    "the open species tab is lit");

  const cards = await page.locator("[data-view=species] [data-card]").count();
  const pills = await page.locator(".top .jump [data-jump]").count();
  ok(cards > 0 && pills === cards, "a jump pill for every card", `${pills} pills, ${cards} cards`);
  const long = await page.locator(".top .jump [data-jump]").allInnerTexts();
  ok(long.every((t) => t.trim().length <= 16), "jump pills are short labels", long.filter((t) => t.length > 16).join(" | "));

  // Tap the last pill: that card lands just under the pinned header.
  const last = page.locator(".top .jump [data-jump]").last();
  const id = await last.getAttribute("data-jump");
  await last.click();
  await page.waitForTimeout(700);
  const pos = await page.evaluate((id) => {
    const top = document.querySelector(".top").getBoundingClientRect();
    const c = document.querySelector(`[data-view=species] [data-card="${id}"]`).getBoundingClientRect();
    return { header: top.top, headerBottom: top.bottom, card: c.top };
  }, id);
  ok(pos.header >= -1 && pos.header < 5, "the header stays pinned after scrolling", JSON.stringify(pos));
  ok(pos.card >= pos.headerBottom - 2 && pos.card < pos.headerBottom + 80,
    "a jump pill lands its card right under the header, not behind it", JSON.stringify(pos));

  await page.locator(".top .tabs [data-learn]").click();
  await page.waitForSelector('[data-view="learn"] [data-card="rod-power"]');
  ok(await page.locator(".top .jump [data-jump]").count() > 0, "Learn has its jump bar too");
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
