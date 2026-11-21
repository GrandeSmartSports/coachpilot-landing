// Trip state and Field mode for /rigs.
// Run: node tests/rigs-trip.smoke.mjs
//
// Library mode is for study and planning. Field mode is what Coach carries to
// the rail: only this trip's cards, nothing else, and it must survive a cold
// open. The resilience cases at the bottom are the ones that bite in real use.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8789;
const KEY = "rig.trip.v1";

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const watchdog = setTimeout(() => {
  console.log("FAIL watchdog: test exceeded 90s");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}, 90000);
watchdog.unref?.();

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
  cwd: ROOT, stdio: "ignore",
});
process.on("exit", () => server.kill());

const BASE = `http://127.0.0.1:${PORT}/rigs/`;
let browser;
try {
  await sleep(900);
  browser = await chromium.launch();

  // ---------------------------------------------------------------- happy
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto(BASE + "#/squid/redondo", { waitUntil: "load" });

    ok(await page.evaluate(() => typeof window.RIG?.trip?.add === "function"), "RIG.trip.add exists");
    ok(await page.evaluate(() => typeof window.RIG?.trip?.setDate === "function"), "RIG.trip.setDate exists");

    await page.locator('[data-addtrip="squid-gear"]').click();
    await page.locator('[data-addtrip="squid-regs"]').click();
    ok((await page.evaluate(() => window.RIG.trip.list())).length === 2, "two cards added to the trip");
    ok(/2/.test(await page.locator("[data-trip-count]").innerText()), "the trip count shows 2");

    // Persistence across a reload is the whole point: planned at home, opened
    // at the pier hours later.
    await page.reload({ waitUntil: "load" });
    const after = await page.evaluate(() => window.RIG.trip.list());
    ok(after.length === 2 && after.includes("squid-gear") && after.includes("squid-regs"),
      "the trip survives a reload", JSON.stringify(after));

    // ------------------------------------------------------------ field mode
    await page.locator("[data-mode-field]").click();
    await page.waitForSelector("[data-view=field]", { state: "visible" });
    const shown = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card).sort());
    ok(JSON.stringify(shown) === JSON.stringify(["squid-gear", "squid-regs"]),
      "field mode renders exactly the trip's cards and nothing else", JSON.stringify(shown));
    ok(await page.locator("[data-view=home]").count() === 0, "field mode hides the species picker");

    // Zero taps at the rail: it comes back up where he left it.
    await page.reload({ waitUntil: "load" });
    ok(await page.locator("[data-view=field]").isVisible(), "it reopens straight into field mode");

    await page.locator("[data-mode-library]").click();
    ok(await page.locator("[data-view=field]").count() === 0, "library mode returns");
    await ctx.close();
  }

  // ------------------------------------------------------- stale conditions
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Regs decay (shelfDays 180) and the gear card does not, so exactly one
    // banner should appear. A banner on everything trains him to ignore it.
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY,
      JSON.stringify({ cards: ["squid-regs", "squid-gear"], date: "2027-08-01", mode: "field" })]);
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("[data-view=field]", { state: "visible" });
    const stale = await page.locator("[data-stale]").count();
    ok(stale === 1, "a trip dated after the data was gathered shows a stale banner", `found ${stale}`);
    const txt = stale ? await page.locator("[data-stale]").innerText() : "";
    ok(/2026-11-21/.test(txt), "the stale banner names the date the data was good for", txt);
    const warned = await page.locator("[data-stale]").evaluateAll((els) =>
      els.map((e) => e.closest("[data-card]").dataset.card));
    ok(JSON.stringify(warned) === JSON.stringify(["squid-regs"]),
      "only content that actually decays is warned about", JSON.stringify(warned));
    await ctx.close();
  }

  // ------------------------------- a library link tapped FROM field mode
  // squid-gear ships a link into the rod course, and squid-gear is exactly
  // the card that goes in a trip. In field mode the hash changed and nothing
  // rendered, so the link just looked broken.
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY,
      JSON.stringify({ cards: ["squid-gear"], date: "", mode: "field" })]);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("[data-view=field]", { state: "visible" });

    await page.locator('[data-card="squid-gear"] a.klink').click();
    await page.waitForSelector('[data-card="rod-power"]', { timeout: 5000 });
    ok(await page.locator('[data-card="rod-power"]').count() === 1,
      "a course link tapped from field mode actually goes to the course");

    // Leaving field mode to read something must not cost him the pier
    // default: the saved mode is untouched, so the next open is field again.
    await page.reload({ waitUntil: "load" });
    ok(await page.locator("[data-view=field]").isVisible(),
      "reading a course card does not change which mode it opens in");
    await ctx.close();
  }

  // ------------------------------------- stale with NO trip date set
  // The default path. Staleness used to require a trip date, so a trip with
  // no date showed month old numbers under a quiet "good as of" stamp and no
  // warning at all. Age is now measured against today when no date is set.
  {
    const ctx = await browser.newContext();
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY,
      JSON.stringify({ cards: ["squid-regs"], date: "", mode: "field" })]);
    const page = await ctx.newPage();
    // squid-regs is dated 2026-11-21 with a 180 day shelf life, so it has
    // gone off well before this.
    await ctx.clock.setFixedTime(new Date("2027-09-01T12:00:00Z"));
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("[data-view=field]", { state: "visible" });
    ok(await page.locator("[data-stale]").count() === 1,
      "content past its shelf life warns even with no trip date set");
    await ctx.close();
  }

  // ------------------------------------------------ a card that no longer exists
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY,
      JSON.stringify({ cards: ["squid-gear", "card-that-was-deleted"], date: "", mode: "field" })]);
    await page.goto(BASE, { waitUntil: "load" });
    await page.waitForSelector("[data-view=field]", { state: "visible" });
    const shown = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card));
    ok(JSON.stringify(shown) === JSON.stringify(["squid-gear"]),
      "an unknown card id is dropped and the rest still render", JSON.stringify(shown));
    await ctx.close();
  }

  // ------------------------------------------------------ storage unavailable
  {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // iOS private browsing throws on setItem. The page must still work.
    await ctx.addInitScript(() => {
      const proto = Object.getPrototypeOf(window.localStorage);
      proto.setItem = function () { throw new DOMException("QuotaExceededError"); };
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(BASE + "#/squid/redondo", { waitUntil: "load" });
    ok(await page.locator("[data-view=species]").isVisible(), "the page still renders when storage throws");

    await page.locator('[data-addtrip="squid-gear"]').click();
    ok((await page.evaluate(() => window.RIG.trip.list())).length === 1,
      "the trip still works in memory when it cannot be saved");
    ok(await page.locator("[data-trip-notice]").count() === 1,
      "a notice says the trip could not be saved");
    ok(errors.length === 0, "no uncaught page errors when storage throws", errors.join(" | "));
    await ctx.close();
  }
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
