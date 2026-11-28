// Library-mode navigation for /rigs: water, then spot, then headlines, then one card.
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
  await page.goto(base + "#/water", { waitUntil: "load" });

  ok(await page.evaluate(() => typeof window.RIG?.go === "function"), "RIG.go is exposed");

  // --- the front door: how do you want to fish? ----------------------------
  const tiles = await page.locator("[data-type-tile]").evaluateAll((els) => els.map((e) => e.dataset.typeTile));
  ok(["river", "beach", "lake", "pier", "kayak-lake", "kayak-sound", "fly"].every((t) => tiles.includes(t)),
    "home has a tile for every way to fish", tiles.join(","));
  // A way to fish with no spots behind it must not render an empty tile.
  const withEmpty = await page.evaluate(() => {
    window.RIG.content.types.push({ id: "ice", label: "Ice" });
    location.hash = "#/fish"; location.hash = "#/water";
    return new Promise((r) => setTimeout(() => r([...document.querySelectorAll("[data-type-tile]")].map((e) => e.dataset.typeTile)), 100));
  });
  ok(withEmpty.length === tiles.length && !withEmpty.includes("ice"), "a way to fish with no spots is hidden, not an empty tile", withEmpty.join(","));
  await page.goto(base + "#/water/fly", { waitUntil: "load" });
  ok(await page.locator('[data-flylearn] a[href="#/learn/fly"]').count() === 1, "Fly links the casting course");
  ok(await page.locator('[data-spot="dash-point"]').count() === 1, "Fly lists a spot to fish it");
  await page.goto(base + "#/water", { waitUntil: "load" });

  // Pier -> Redondo -> straight into squid, since squid is all Redondo has.
  await page.locator('[data-type-tile="pier"]').click();
  await page.waitForSelector("[data-view=water]");
  ok(await page.locator('[data-spot="redondo"]').count() === 1, "Pier lists Redondo");
  await page.locator('[data-spot="redondo"]').click();
  await page.waitForSelector("[data-view=species]");
  ok(/#\/squid\/redondo$/.test(page.url()), "a spot with one fish skips the one item menu", page.url());

  // Lake -> Lake Fenwick asks which fish, because two live there.
  await page.goto(base + "#/water/lake", { waitUntil: "load" });
  await page.locator('[data-spot="lake-fenwick"]').click();
  await page.waitForSelector("[data-view=spot]");
  const at = await page.locator("[data-row-species]").evaluateAll((els) => els.map((e) => e.dataset.rowSpecies));
  ok(at.includes("bass") && at.includes("perch"), "Lake Fenwick offers bass and perch", at.join(","));

  // Kayak water carries the kayak safety cards with it.
  await page.goto(base + "#/water/kayak-sound", { waitUntil: "load" });
  ok(await page.locator('[data-kayak] a[href="#/learn/kayak"]').count() === 1, "kayak water links the kayak safety cards");

  // --- headlines first --------------------------------------------------
  await page.goto(base + "#/squid/redondo", { waitUntil: "load" });
  await page.waitForSelector("[data-view=species]");
  ok(await page.locator("[data-view=species] [data-card]").count() === 0,
    "a species page shows headlines, not every card opened at once");
  const groups = await page.locator("[data-group]").evaluateAll((els) =>
    els.map((e) => ({ key: e.dataset.group, rows: e.querySelectorAll("[data-row]").length })));
  ok(groups.length > 0 && groups.every((g) => g.rows > 0), "no empty group renders a heading", JSON.stringify(groups));
  ok(groups.some((g) => g.key === "before"), "the Plan group renders", JSON.stringify(groups));
  const sel = await page.locator("[data-location-current]").innerText();
  ok(/redondo/i.test(sel), "a single location is preselected", sel);

  // Tap a headline: that card opens alone, with a way back and a next.
  await page.locator('[data-row="redondo-access"]').click();
  await page.waitForSelector("[data-view=card]");
  ok(await page.locator("[data-card]").count() === 1, "a tapped headline opens that one card");
  ok(await page.locator('[data-card="redondo-access"]').count() === 1, "it is the card that was tapped");
  ok(await page.locator('[data-up][href="#/squid/redondo"]').count() === 1, "back goes up to the list");
  const first = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[data-step]")].map((a) => a.dataset.step);
    return { ids, pos: document.querySelector(".pos").textContent };
  });
  ok(/^\d+ of \d+$/.test(first.pos), "the card says where it sits in the list", first.pos);
  ok(first.ids.length >= 1, "next or back steps to a neighbour card", JSON.stringify(first));

  // The first card has no Back step, only Next.
  await page.goto(base + "#/squid/redondo/squid-watch-start", { waitUntil: "load" });
  await page.waitForSelector("[data-view=card]");
  ok(await page.locator(".pnb.prev[data-step]").count() === 0 && await page.locator(".pnb.next[data-step]").count() === 1,
    "the first card offers Next and no Back");
  const nextId = await page.locator(".pnb.next").getAttribute("data-step");
  await page.locator(".pnb.next").click();
  await page.waitForSelector(`[data-card="${nextId}"]`);
  ok(true, "Next opens the next card");

  // --- the rod course -----------------------------------------------------
  // Learn opens on the library's four parts, then the app's own courses and a
  // short Start here; the rod course is one tap in, under Rods.
  await page.goto(base + "#/learn", { waitUntil: "load" });
  const start = await page.locator('[data-start] [data-row]').evaluateAll((els) => els.map((e) => e.dataset.row));
  ok(await page.locator('[data-course-tile="rods"]').count() === 1 && start.includes("rod-length") && start.length <= 4, "Learn opens on its parts, with a short Start here", JSON.stringify(start));
  await page.goto(base + "#/learn/rods", { waitUntil: "load" });
  const learn = await page.locator('[data-group="fundamental"] [data-row]').evaluateAll((els) => els.map((e) => e.dataset.row));
  ok(learn.includes("rod-power") && learn.includes("rod-action"), "the rod course is listed under Rods", JSON.stringify(learn));
  await page.goto(base + "#/learn/rod-action", { waitUntil: "load" });
  await page.waitForSelector('[data-view=card] [data-card="rod-action"]');
  ok(true, "a #/learn/ link opens that course card");
  await page.goto(base + "#/learn/kayak", { waitUntil: "load" });
  const secs = await page.locator("[data-section]").evaluateAll((els) => els.map((e) => e.dataset.section));
  ok(secs.length === 1 && secs[0] === "Kayak", "a Learn filter shows just that section", secs.join(","));

  // --- by fish ------------------------------------------------------------
  await page.goto(base + "#/fish", { waitUntil: "load" });
  const species = await page.locator(".pickcard[data-species]").allInnerTexts();
  ok(species.some((t) => /squid/i.test(t)), "the Fish tab lists Squid", species.join(" | "));
  const stacked = await page.evaluate(() => {
    const c = document.querySelector(".pickcard");
    return c && { nm: getComputedStyle(c.querySelector(".nm")).display, sub: getComputedStyle(c.querySelector(".sub")).display };
  });
  ok(stacked && stacked.nm === "block" && stacked.sub === "block", "pick card name and hint stack", JSON.stringify(stacked));

  await page.goto(base, { waitUntil: "load" });
  ok(await page.locator("[data-view=trips]").isVisible(), "the bare url lands on Hot Trips");
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
