// The spot paintings in a real browser (tests/look-spots/, the checking
// page), at night. Run: node tests/rigs-spots-look.smoke.mjs
//
// What this guards: where no moon stands in the picture (behind you, down,
// or a feed lake with no facing) the water ahead keeps no light road, read
// from the computed style the browser paints; where the moon is ahead the
// road stays; Redondo's lamps are lit with their ladders and the squid
// lights on the water; no page errors. Nothing here reaches a real server.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8873;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 120000);
watchdog.unref?.();

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  async function look(spot, extra) {
    const q = new URLSearchParams(Object.assign({ spot, sky: "night", date: "2026-11-24", hour: "19", bare: "1", moon: ".6" }, extra || {}));
    await page.goto(`http://127.0.0.1:${PORT}/tests/look-spots/?` + q, { waitUntil: "load" });
    await page.waitForSelector("body[data-ready]");
    return page.evaluate(() => {
      const el = document.getElementById("scene"), gr = el.querySelector(".w-gr");
      const lampsOn = +getComputedStyle(el).getPropertyValue("--lamps") || 0;
      return { moonpos: el.dataset.moonpos || "", gr: gr ? +getComputedStyle(gr).opacity : null, ladders: el.querySelectorAll(".w-lampson .w-poolg rect").length, pools: el.querySelectorAll(".w-lampson .w-pool").length, lampsOn };
    });
  }
  for (const spot of ["w-l1536", "w-l2668", "cowlitz"]) {
    const r = await look(spot);
    ok(["behind", "none", "down"].indexOf(r.moonpos) >= 0 && r.gr !== null && r.gr <= 0.04, spot + " at night: no moon in the picture, so no light road on the water ahead (--gr " + r.gr + ", moon " + r.moonpos + ")", r);
  }
  const fen = await look("lake-fenwick");
  ok(fen.moonpos === "ahead" && fen.gr > 0.2, "Lake Fenwick at night: the moon is ahead, so its road stays (--gr " + fen.gr + ")", fen);
  const red = await look("redondo");
  ok(red.lampsOn > 0.5 && red.ladders >= 40 && red.pools >= 6, "Redondo at night: the lamps lit, their gold ladders and the squid lights on the water (" + red.ladders + " rungs, " + red.pools + " pools)", red);
  ok(!errors.length, "no page errors", errors);
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
