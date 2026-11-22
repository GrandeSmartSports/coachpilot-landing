// Library-mode navigation for /rigs: species, then where, then cards.
// Run: node tests/rigs-nav.smoke.mjs
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8788;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const watchdog = setTimeout(() => {
  console.log("FAIL watchdog: test exceeded 60s");
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
  const page = await (await browser.newContext()).newPage();
  const base = `http://127.0.0.1:${PORT}/rigs/`;
  await page.goto(base, { waitUntil: "load" });

  // --- the front door is a species picker ---------------------------------
  ok(await page.evaluate(() => typeof window.RIG?.go === "function"), "RIG.go is exposed");

  const species = await page.locator("[data-species]").allInnerTexts();
  ok(species.some((t) => /squid/i.test(t)), "species picker lists Squid", species.join(" | "));

  // A pick card stacks its name over its hint. These are spans, so without an
  // explicit display they run together on one line and the card reads as mush.
  var stacked = await page.evaluate(() => {
    const c = document.querySelector(".pickcard");
    if (!c) return null;
    return {
      nm: getComputedStyle(c.querySelector(".nm")).display,
      sub: getComputedStyle(c.querySelector(".sub")).display,
    };
  });
  ok(stacked && stacked.nm === "block" && stacked.sub === "block",
    "pick card name and hint are block level, not run together", JSON.stringify(stacked));

  // --- pick a species -----------------------------------------------------
  await page.locator('.pickcard[data-species="squid"]').click();
  await page.waitForSelector("[data-view=species]", { state: "visible" });

  const locText = await page.locator("[data-locations]").innerText();
  ok(/redondo/i.test(locText), "the where layer shows Redondo", locText);

  // Squid has exactly one location today. Making Coach choose from a list of
  // one is a tap that buys nothing, so it is preselected.
  const sel = await page.locator("[data-location-current]").innerText();
  ok(/redondo/i.test(sel), "a single location is preselected, not a one item menu", sel);

  // --- card groups --------------------------------------------------------
  // Groups with no cards must not render a heading. Coach's standing rule is
  // that an empty widget is noise, not a placeholder.
  const groups = await page.locator("[data-group]").evaluateAll((els) =>
    els.map((e) => ({ key: e.dataset.group, cards: e.querySelectorAll("[data-card]").length }))
  );
  ok(groups.length > 0, "at least one card group renders", JSON.stringify(groups));
  ok(groups.every((g) => g.cards > 0), "no empty card group renders a heading", JSON.stringify(groups));
  ok(groups.some((g) => g.key === "before"), "the Before you go group renders", JSON.stringify(groups));

  const redondoCard = page.locator('[data-card="redondo-access"]');
  ok(await redondoCard.count() === 1, "the Redondo access card renders under its species");

  // --- deep links ---------------------------------------------------------
  ok(/#\/squid/.test(page.url()), "picking a species puts it in the hash", page.url());

  await page.goto(base + "#/squid/redondo", { waitUntil: "load" });
  await page.waitForSelector("[data-view=species]", { state: "visible" });
  ok(await page.locator('[data-card="redondo-access"]').count() === 1,
    "a deep link restores straight to the species view");

  // --- the rod course -----------------------------------------------------
  // Fundamentals live on the home screen under Learn, and a species card
  // links into them rather than restating what power or action mean.
  await page.goto(base + "#/learn", { waitUntil: "load" });
  const learn = await page.locator('[data-group="fundamental"] [data-card]').evaluateAll((els) =>
    els.map((e) => e.dataset.card));
  ok(learn.includes("rod-power") && learn.includes("rod-action"),
    "the rod course renders on the Learn tab", JSON.stringify(learn));

  await page.goto(base + "#/learn/rod-action", { waitUntil: "load" });
  await page.waitForSelector('[data-card="rod-action"]');
  const onScreen = await page.locator('[data-card="rod-action"]').evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= -4 && r.top < window.innerHeight;
  });
  ok(onScreen, "a #/learn/ link scrolls that course card into view");

  // --- back to the picker -------------------------------------------------
  await page.goto(base, { waitUntil: "load" });
  ok(await page.locator("[data-view=home]").isVisible(), "the bare url lands on the species picker");
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  server.kill();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
