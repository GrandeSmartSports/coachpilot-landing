// The river species, ported from the old Rig Card: rigs render, the shared
// hook/swivel/shot parts draw, and the knot step players actually step.
// Run: node tests/rigs-river.smoke.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8791;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 300)); }
};

const watchdog = setTimeout(() => {
  console.log("FAIL watchdog: test exceeded 60s");
  console.log("\n0 passed, 1 failed");
  process.exit(1);
}, 60000);
watchdog.unref?.();

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;

  await page.goto(base, { waitUntil: "load" });
  const species = await page.locator("[data-species]").allInnerTexts();
  ok(species.some((t) => /salmon/i.test(t)), "species picker lists the river species", species.join(" | "));

  await page.locator('.pickcard[data-species="salmon"]').click();
  await page.waitForSelector("[data-view=species]", { state: "visible" });
  const ids = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card));
  ok(ids.includes("salmon-float-eggs-build") && ids.includes("salmon-blue-fox-fish"),
    "river rig cards render", ids.join(", "));

  // A <use href="#hook"> with no matching symbol draws a zero size box.
  const hookBox = await page.evaluate(() => {
    const u = document.querySelector('[data-card="salmon-float-eggs-build"] use[href=\"#hook\"]');
    if (!u) return null;
    const b = u.getBBox();
    return { w: b.width, h: b.height };
  });
  ok(hookBox && hookBox.w > 0 && hookBox.h > 0, "shared hook part actually draws in the rig diagram", JSON.stringify(hookBox));

  // Knot players: a rail of numbered buttons, a caption, and Play steps on.
  const bait = page.locator('[data-card="salmon-bait"] .tyer').first();
  const rail = await bait.locator(".rail button").count();
  ok(rail === 5, "bait thread player builds a 5 step rail", rail);
  const cap1 = await bait.locator(".cap").innerText();
  ok(/^1\./.test(cap1.trim()), "player opens on step 1 with a caption", cap1);
  await bait.locator(".rail button").nth(2).click();
  const cap3 = await bait.locator(".cap").innerText();
  ok(/^3\./.test(cap3.trim()), "tapping step 3 shows step 3", cap3);
  const onCount = await bait.locator(".kstep.on").count();
  ok(onCount === 1, "exactly one step drawing is lit", onCount);
  await bait.locator(".play").click();
  await page.waitForTimeout(1300);
  const capPlay = await bait.locator(".cap").innerText();
  ok(/^4\./.test(capPlay.trim()), "Play advances to the next step", capPlay);

  // Re-rendering (navigating away and back) must not stack a second rail.
  await page.goto(base, { waitUntil: "load" });
  await page.goto(base + "#/salmon", { waitUntil: "load" });
  await page.waitForSelector('[data-card="salmon-bait"] .tyer .rail button');
  const rail2 = await page.locator('[data-card="salmon-bait"] .tyer').first().locator(".rail button").count();
  ok(rail2 === 5, "a re-render does not double the rail", rail2);

  // Learn knots live on the home screen with working players.
  await page.goto(base + "#/learn/knot-improved-clinch", { waitUntil: "load" });
  await page.waitForSelector('[data-card="knot-improved-clinch"] .rail button');
  ok(await page.locator('[data-card="knot-improved-clinch"] .rail button').count() === 5,
    "improved clinch player works from the Learn shelf");

  // Green River location.
  await page.goto(base + "#/salmon/green-river", { waitUntil: "load" });
  await page.waitForSelector('[data-card="green-river-rules"]');
  ok(true, "Green River location shows its rules card");

  // Nothing in a card may run past its right edge on a phone.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base + "#/salmon", { waitUntil: "load" });
  await page.waitForSelector('[data-card="salmon-float-eggs-build"]');
  const over = await page.evaluate(() => [...document.querySelectorAll(".card")].flatMap((c) => {
    const r = c.getBoundingClientRect().right;
    return [...c.querySelectorAll("ol.steps .k")].filter((k) => k.getBoundingClientRect().right > r + 1)
      .map((k) => c.dataset.card + ": " + k.textContent.slice(0, 30));
  }));
  ok(over.length === 0, "step notes wrap inside the card at phone width", over.join(" | "));

  // Field mode: a knot added to a trip must still step.
  await page.goto(base + "#/salmon", { waitUntil: "load" });
  await page.locator('[data-addtrip="salmon-egg-loop"]').click();
  await page.locator("[data-mode-field]").first().click();
  await page.waitForSelector('.fieldmode [data-card="salmon-egg-loop"] .rail button');
  ok(await page.locator('[data-card="salmon-egg-loop"] .rail button').count() === 4,
    "egg loop player works in field mode");

  ok(errors.length === 0, "no page errors", errors.join(" | "));
} catch (e) {
  fail++;
  console.log("FAIL threw:", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  await server.close?.();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
