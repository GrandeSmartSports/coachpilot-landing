// Each spot's own picture, in the real app (stage E2: the app knows the spot).
// Run: node tests/rigs-spots-app.smoke.mjs
//
// What this guards: the page loads rigs/spots-scene.js after trips.js and
// waters.js, and the offline shell keeps it; a run card, the crew trip
// page, a spot page and every Hot Trips row paint the spot's own picture at
// the trip's own hour and today's water (the tide the page already has);
// the routing Coach settled holds on rendered run cards: a salmon trip on
// the Green is the Auburn Narrows and a steelhead trip or the Green's own
// page is Flaming Geyser; Dash Point by kayak is the kayak launch and a
// cutthroat trip the state park beach; Westport crab is Float 20; Bonney
// Lake is a gravel launch with no dock and no pier; Rainier stands in the
// picture only at Fox Island; two rows of the same kind of water (two lakes,
// two piers) have thumbnails of their own; the picture is painted again only
// when the spot, the hour or the water changes, not on every redraw.
// Trips no fixture week lists (pink on the Green or at Dash Point, winter
// steelhead on the Green: their rules are not settled, so the week leaves
// them out) are painted through the page's own paint (RIG.picture.paint)
// into a scene element the same way the page paints its own.
// Fix round 2: every run card's night is lit (no dark slab where a spot
// closes after dark: the towns' glow and its sheen, the moon where it is),
// the Narrows' grove stands under the title's chips, Redondo's lamp heads
// stand clear of them, a one-spot Water tile frames that spot on what it is
// known by, and Rainier's summit at Fox Island stands clear of the tag.
// Nothing here reaches a real server: the forecast and the crew are stubs.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SPRING_DAYS, SPRING_NOW, SEPT_DAYS, SEPT_NOW, DEC_DAYS, DEC_NOW, fake, decodePng } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8817;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 300000);
watchdog.unref?.();

// The offline shell keeps the file (rigs/sw.js), and the page loads it in order.
const sw = readFileSync(join(ROOT, "rigs/sw.js"), "utf8"), html = readFileSync(join(ROOT, "rigs/index.html"), "utf8");
ok(/"\/rigs\/spots-scene\.js"/.test(sw.slice(sw.indexOf("SHELL"), sw.indexOf("EXTRA"))), "the service worker's shell list keeps /rigs/spots-scene.js");
const at = (f) => html.indexOf('<script src="/rigs/' + f + '"></script>');
ok(at("spots-scene.js") > at("trips.js") && at("spots-scene.js") > at("waters.js") && at("trips.js") > 0 && at("waters.js") > 0 && at("spots-scene.js") < html.indexOf("RIG.version"),
  "the page loads spots-scene.js after trips.js and waters.js, before the app's own script");

const T = (iso, plan) => "#/trips/" + encodeURIComponent(iso + "~" + plan);
const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();
  async function week(days, now) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(ctx, days ? { days, now } : {});
    const page = await ctx.newPage();
    await page.clock.setFixedTime(now || NOW);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(base + "#/trips", { waitUntil: "load" });
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    return { ctx, page, errors };
  }
  const sky = async (page, id, hash) => {
    await page.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/learn"; location.hash = h; }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForTimeout(60);
  };
  // What the big picture on screen is: its kind, its spot and stand, and what is in it.
  const scene = (page) => page.evaluate(() => {
    const s = document.getElementById("scene"); let p = {};
    try { p = JSON.parse(s.dataset.paint || "{}"); } catch (e) { /* none */ }
    return { kind: s.getAttribute("data-scene"), spot: s.dataset.spot || "", stand: s.getAttribute("data-stand") || "", now: p.now || null, fish: p.fish || "", how: p.how || "",
      rainier: [...s.querySelectorAll("g.w-mtn[transform]")].length, kayak: s.querySelectorAll(".w-kayak").length, gravel: s.querySelectorAll(".w-gravel").length,
      dock: s.querySelectorAll(".w-dock, .w-decktop").length, pier: s.querySelectorAll(".w-crowd, .w-deckpoolg, .w-rail").length + (p.parts || []).filter((q) => q.t === "pier").length, stood: p.lake ? p.lake.stand : "", kids: s.querySelectorAll("svg *").length, title: (document.querySelector(".hero h1") || {}).textContent || "" };
  });
  const card = async (page, hash) => {
    await sky(page, "overcast", hash);
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    return scene(page);
  };
  // Paint any plan's picture the way the page does, into a scene element of its own.
  const paintOf = (page, spot, fish, iso, planId, kind) => page.evaluate(([spot, fish, iso, planId, kind]) => {
    const el = document.createElement("div"); el.className = "scene"; el.setAttribute("data-scene", kind);
    RIG.water.scene(el, RIG.picture.paint(spot, fish, { iso, from: 8, planId }));
    return { kind: el.getAttribute("data-scene"), stand: el.getAttribute("data-stand") || "", rainier: el.querySelectorAll("g.w-mtn[transform]").length, kayak: el.querySelectorAll(".w-kayak").length };
  }, [spot, fish, iso, planId, kind]);
  // (fix-2, V1-1) a run card's picture at night, in the band between the
  // chips under its title and its first card: the brightest one pixel in a
  // hundred is at least 105 of 255, and some of it is warm (the towns' glow
  // on the cloud and the water, a lamp) or silver (the moon): a night that
  // is lit, never a dark slab (the approved pier night is 121)
  const nightBand = async (page, hash) => {
    await sky(page, "night", hash);
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    await page.waitForTimeout(120);
    const b = await page.evaluate(() => {
      const hero = document.querySelector('[data-view="hot"] > .hero'); let bottom = 0;
      [].forEach.call(hero.children, (c) => { if (c.offsetHeight) bottom = Math.max(bottom, c.getBoundingClientRect().bottom); });
      let el = hero.nextElementSibling; while (el && !el.offsetHeight) el = el.nextElementSibling;
      return { y0: Math.ceil(bottom), y1: Math.floor(el.getBoundingClientRect().top), spot: document.getElementById("scene").dataset.spot || "" };
    });
    const img = decodePng(await page.screenshot({ clip: { x: 0, y: b.y0, width: 390, height: b.y1 - b.y0 } }));
    const n = img.w * img.h, Y = new Float32Array(n); let lit = 0;
    for (let i = 0; i < n; i++) {
      const o = i * img.bpp, R = img.px[o], G = img.px[o + 1], B = img.px[o + 2], y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
      Y[i] = y; if ((R - B > 30 && y > 70) || (y > 110 && Math.abs(R - B) < 25)) lit++;
    }
    Y.sort();
    return { hash: decodeURIComponent(hash.replace("#/trips/", "")), spot: b.spot, p99: Math.round(Y[Math.floor(n * 0.99)]), lit: Math.round((lit / n) * 1000) / 10 };
  };
  const nightAll = async (page, label) => {
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const keys = await page.evaluate(() => [...new Set([...document.querySelectorAll("[data-day]")].flatMap((d) => [...d.querySelectorAll("[data-hot]")].map((r) => d.dataset.day + "~" + r.dataset.hot)))]);
    const out = [];
    for (const k of keys) { const [iso, plan] = k.split("~"); out.push(await nightBand(page, T(iso, plan))); }
    const dark = out.filter((c) => c.p99 < 105 || c.lit < 0.3);
    ok(out.length >= 3 && out.every((c) => c.spot) && !dark.length, label + ": every run card's picture is lit at night (brightest 1% at least 105, some warm or silver light over the card)", dark.length ? dark : out.map((c) => [c.spot, c.p99, c.lit]));
    return out;
  };
  const allCards = async (page) => {
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const keys = await page.evaluate(() => [...document.querySelectorAll("[data-day]")].flatMap((d) => [...d.querySelectorAll("[data-hot]")].map((r) => d.dataset.day + "~" + r.dataset.hot)));
    const out = [];
    for (const k of [...new Set(keys)]) { const [iso, plan] = k.split("~"); out.push(Object.assign({ key: k }, await card(page, T(iso, plan)))); }
    return out;
  };

  // ---- a November week --------------------------------------------------------------------
  {
    const { ctx, page, errors } = await week();
    ok(await page.evaluate(() => typeof RIG.spotScene === "function" && typeof RIG.spotNow === "function" && typeof RIG.picture.paint === "function"), "the page has the spot pictures: RIG.spotScene, RIG.spotNow and its own paint");
    const coho = await card(page, T("2026-11-26", "coho-green-river"));
    ok(coho.kind === "river" && coho.spot === "green-river" && coho.stand === "narrows" && coho.kids > 100, "a coho trip on the Green: its run card stands at the Auburn Narrows", coho);
    ok(coho.now && coho.now.date === "2026-11-26T07:31" && coho.fish === "coho", "painted at the trip's own hour (7:31 AM on its day), for its fish", coho.now);
    // (fix-2, V1-6) the grove stands under the chips: no fitted crown climbs over their bottom
    // (E3, V2-2) the grove is now your own bank running away up the reach (.w-reach): every point of its
    // trees and of its massed crowns that lies across the chips' width stays below the chips; only right
    // of every chip do the nearest trees stand taller
    const grove = await page.evaluate(() => {
      const hero = document.querySelector('[data-view="hot"] > .hero'); let bottom = 0;
      [].forEach.call(hero.children, (c) => { if (c.offsetHeight) bottom = Math.max(bottom, c.getBoundingClientRect().bottom); });
      const chipsR = Math.max(...[...hero.querySelectorAll(".chips > *")].map((c) => c.getBoundingClientRect().right));
      const g = document.querySelector("#scene .w-reach"); if (!g) return null;
      const m = g.ownerSVGElement.getScreenCTM();
      let top = 9999, over = 0, tall = 9999;
      const scan = (sel, fn) => g.querySelectorAll(sel).forEach((q) => { const nums = (q.getAttribute("d") || "").match(/-?\d+(?:\.\d+)?/g) || []; for (let i = 0; i + 1 < nums.length; i += 2) fn(m.a * nums[i] + m.e, m.d * nums[i + 1] + m.f); });
      scan("[data-fit] path, .w-grovelace", (x, y) => { if (x > 0 && x < chipsR + 8) { top = Math.min(top, y); if (y < bottom) over++; } else if (x >= chipsR + 8 && x < 390) tall = Math.min(tall, y); });
      // the two tallest trunks at the frame's edge stand up past the chips' line; what of them reaches back
      // over the chips' side fades out above that line (a mask), so it never shows behind a chip
      const tg = g.querySelector(".w-reachtall[mask]"), gr = g.ownerSVGElement.querySelector('linearGradient[id$="f-tallg"]');
      if (tg) scan(".w-reachtall path", (x, y) => { if (x >= chipsR + 8 && x < 390) tall = Math.min(tall, y); });
      return { chips: Math.round(bottom), chipsR: Math.round(chipsR), top: Math.round(top), over, tall: Math.round(tall), reach: g.dataset.reach, fade: gr ? Math.round(+gr.getAttribute("y1") * m.d + m.f) : null };
    });
    ok(grove && grove.reach === "grove" && grove.over === 0 && grove.top >= grove.chips && grove.tall < grove.chips && grove.fade != null && grove.fade >= grove.chips - 8,
      "the Narrows' grove stands under the title's chips across their width, and stands tall only right of them (its tallest trunks fade out over the chips' side)", grove);
    const chum = await card(page, T("2026-11-28", "chum-green-river"));
    ok(chum.stand === "narrows" && chum.spot === "green-river", "a chum trip on the Green: the Auburn Narrows", chum);
    const pink = await paintOf(page, "green-river", "pink", "2027-09-10", "pink-green-river", "river"), steel = await paintOf(page, "green-river", "steelhead", "2026-12-12", "steelhead-green-river", "river");
    ok(pink.stand === "narrows" && steel.stand === "geyser", "a pink trip on the Green is the Auburn Narrows, a steelhead trip Flaming Geyser (painted through the page's own paint)", [pink, steel]);
    await sky(page, "overcast", "#/spot/green-river");
    await page.waitForSelector('[data-view="spot"] [data-row-species]');
    const gp = await scene(page);
    ok(gp.kind === "river" && gp.spot === "green-river" && gp.stand === "geyser" && !gp.fish, "the Green's own spot page: Flaming Geyser", gp);
    // (E3 fix-2, V2-9) its week's trips stand under their days' headings, as on Hot Trips: every row under a heading
    // that names its day, each day once, no two rows in a day the same trip, and a day's count is its rows here
    const spotWeek = await page.evaluate(() => [...document.querySelectorAll("[data-spot-trips] > [data-spot-day]")].map((d) => ({
      iso: d.dataset.spotDay, head: [...((d.querySelector(":scope > h2") || {}).childNodes || [])].filter((q) => q.nodeType === 3 || q.tagName === "SPAN").map((q) => q.textContent.trim()).join(" "), count: ((d.querySelector(":scope > h2 i") || {}).textContent || "").replace(/\D/g, ""),
      rows: [...d.querySelectorAll(".trip[data-hot]")].map((r) => r.dataset.hot) })));
    const loose = await page.evaluate(() => document.querySelectorAll("[data-spot-trips] .trip").length - document.querySelectorAll("[data-spot-trips] [data-spot-day] .trip").length);
    const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    ok(spotWeek.length >= 2 && !loose && new Set(spotWeek.map((d) => d.iso)).size === spotWeek.length &&
      spotWeek.every((d) => d.rows.length && new Set(d.rows).size === d.rows.length && +d.count === d.rows.length && new RegExp(MON[+d.iso.slice(5, 7) - 1] + " " + (+d.iso.slice(8)) + "\\b", "i").test(d.head)),
      "the Green's spot page: its week's trips under their days' headings (each day named once, its own count, no row twice in a day)", spotWeek);
    // (E3 fix-2, V2-9) and when each of its trips fishes: twelve months from this one, this month ringed, the
    // strip true to the trips' seasons (a trip on this week's list is in season this month on its strip)
    const seasonsOf = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-spot-seasons] [data-season]")].map((r) => [r.dataset.season, {
      line: (r.querySelector(".tx > span") || {}).textContent || "", cells: [...r.querySelectorAll(".months b")].map((b) => b.textContent + ":" + (b.classList.contains("pk") ? "pk" : b.classList.contains("ok") ? "ok" : "") + (b.classList.contains("now") ? "*" : "")),
      link: r.getAttribute("href") || "" }])));
    const gSeasons = await seasonsOf();
    ok(gSeasons["coho-green-river"] && gSeasons["chum-green-river"] && !gSeasons["steelhead-green-river"] && spotWeek.every((d) => d.rows.every((id) => /^N:(ok|pk)\*$/.test((gSeasons[id] || { cells: [] }).cells[0] || ""))) &&
      gSeasons["chum-green-river"].line === "Best Nov" && gSeasons["coho-green-river"].link === "#/coho/green-river",
      "the Green's spot page: when coho and chum fish (steelhead, its rules unsettled, left off), this month ringed and in season for each trip on the week's list", gSeasons);
    await sky(page, "overcast", "#/spot/westport");
    await page.waitForSelector('[data-view="spot"] [data-spot-seasons] [data-season]');
    const wSeasons = await seasonsOf();
    const cr = wSeasons["crab-westport"], pe = wSeasons["surfperch-westport"];
    ok(cr && pe && cr.cells.length === 12 && cr.cells.every((c) => /:ok/.test(c)) && cr.line === "All year" && /^N:ok\*$/.test(cr.cells[0]) &&
      pe.line === "Best Apr to Jun" && pe.cells.filter((c) => /:pk/.test(c)).map((c) => c[0]).join("") === "AMJ" && /^N:\*$/.test(pe.cells[0]),
      "Westport's spot page: crab off the docks all year, surf perch best April to June and out of season now (a short page no more)", wSeasons);
    // (fix-1, function-1) a fish's own page at a spot paints the stand that fish is fished from
    await sky(page, "overcast", "#/cutthroat/dash-point");
    await page.waitForSelector('[data-view] .hero h1');
    const cutP = await scene(page);
    ok(cutP.spot === "dash-point" && cutP.stand === "state" && cutP.kayak === 0, "the cutthroat page at Dash Point: the state park beach, no kayak", cutP);
    await sky(page, "overcast", "#/coho/dash-point");
    await page.waitForSelector('[data-view] .hero h1');
    const cohoP = await scene(page);
    ok(cohoP.stand === "city" && cohoP.kayak >= 1, "the coho page at Dash Point: the kayak launch", cohoP);
    // (fix-1, function-2 and function-7) the list a page is opened from picks the stand: its rows and the spot page
    const rowsOf = async (hash) => { await sky(page, "overcast", hash); await page.waitForSelector('[data-view="water"] .row[data-spot] svg'); return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-view="water"] .row[data-spot]')].map((r) => { const v = r.querySelector(".tile svg"); return [r.dataset.spot, { spot: v.getAttribute("data-paint-spot") || "", stand: v.getAttribute("data-stand") || "", scene: v.getAttribute("data-scene") }]; }))); };
    const pierRows = await rowsOf("#/water/pier");
    ok(pierRows.westport && pierRows.westport.spot === "westport" && pierRows.westport.stand === "float" && pierRows.westport.scene === "pier", "the Pier list: Westport's row is Float 20 (a pier), not the surf beach", pierRows.westport);
    ok(Object.values(pierRows).every((r) => r.spot), "and every row's thumbnail says which spot it paints (data-paint-spot)", pierRows);
    await page.evaluate(() => { location.hash = "#/spot/westport"; });
    await page.waitForSelector('[data-view="spot"] [data-row-species]');
    const wps = await scene(page);
    ok(wps.spot === "westport" && wps.stand === "float" && wps.kind === "pier", "Westport's spot page opened from the Pier list: Float 20", wps);
    const beachRows = await rowsOf("#/water/beach");
    ok(beachRows["dash-point"] && beachRows["dash-point"].stand === "state", "the Beach list: Dash Point's row is the state park beach", beachRows["dash-point"]);
    // (fix-1, look-19) a kind of water with one spot shows that spot's own picture on its home tile
    await sky(page, "overcast", "#/water");
    await page.waitForSelector('[data-view="home"] [data-type-tile]');
    const tiles = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-type-tile]")].map((t) => [t.dataset.typeTile, { n: +((t.querySelector(".meta") || {}).textContent || "0").replace(/\D/g, ""), spot: (t.querySelector("svg") || { getAttribute: () => "" }).getAttribute("data-paint-spot") || "" }])));
    ok(Object.values(tiles).filter((t) => t.n === 1).every((t) => t.spot) && tiles.river && tiles.river.spot === "green-river", "a kind of water with one spot paints that spot on its home tile (River: the Green)", tiles);
    // (fix-2, V1-5) and frames it on what that spot is known by: Flaming Geyser's bar and riffle, Lake Fenwick's pier and its big shore tree
    const frames = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-type-tile] svg[data-paint-spot]")].map((v) => [v.getAttribute("data-paint-spot"), v.getAttribute("viewBox")])));
    // (E3, V2-3) the River tile frames the reach (the bar at the left, your own bank's dark trees closing in at
    // the right); (E3 fix-2) the Lake tile looks down Lake Fenwick from the same pier to its far end
    ok(frames["green-river"] === "0 150 390 132" && frames["lake-fenwick"] === "50 96 340 191", "the River tile frames Flaming Geyser's reach, the Lake tile Lake Fenwick looking down the lake", frames);
    // (E3 fix-2, V2-3) the Lake tile is built like the River tile: its shores close in on the lake's far end (the far
    // shore in steps of distance, paler as it goes), the sky's road on the water under that end, your own shore's
    // point and big tree as the dark mass at the right (the tree's bare crown massed, not lace), the pier at your
    // feet, the trees in the still water; and it is its own view (facing 150), not the big picture's crop
    const ltile = await page.evaluate(() => {
      const v = document.querySelector('[data-type-tile="lake"] svg[data-paint-spot="lake-fenwick"]');
      if (!v) return null;
      const steps = new Set([...v.querySelectorAll(".sc-mid > g[class^='w-l'], g[class^='w-l']")].map((g) => g.getAttribute("class")).filter((c) => /^w-l[0-5]$/.test(c)));
      return { steps: [...steps].sort(), road: v.querySelectorAll(".w-gaprd path").length, sheen: !!v.querySelector(".w-gapsh"), town: !!v.querySelector(".w-townwater"), crown: !!v.querySelector(".w-crownm"), lace: !!v.querySelector(".w-twigm"),
        dock: v.querySelectorAll(".w-dock").length, glass: v.querySelectorAll("[id*='-rfp']").length, set: v.getAttribute("data-set") };
    });
    ok(ltile && ltile.steps.length >= 3 && ltile.road >= 12 && ltile.sheen && ltile.town && ltile.crown && !ltile.lace && ltile.dock === 1 && ltile.glass >= 2,
      "the Lake tile: shores closing in on the far end in three or more steps of distance, the sky's road under it, the dark mass of your own shore and its massed crown, the pier, the trees in the water", ltile);
    const rtile = await page.evaluate(() => { const v = document.querySelector('[data-type-tile="river"] svg[data-paint-spot]'); return { reach: !!(v && v.querySelector('.w-reach[data-reach="mixed"]')), road: !!(v && v.querySelector(".w-gaprd")), bar: !!(v && v.querySelector(".w-barg")) }; });
    ok(rtile.reach && rtile.road && rtile.bar, "the River tile has a dark mass at one side (your own bank's trees), the sky's road on the water and the bar at your feet", rtile);
    const cut = await card(page, T("2026-11-26", "cutthroat-dash-point"));
    ok(cut.spot === "dash-point" && cut.stand === "state" && cut.kayak === 0, "a cutthroat trip at Dash Point: the state park beach, no kayak", cut);
    const bon = await card(page, T("2026-11-26", "trout-w-l466"));
    ok(bon.kind === "lake" && bon.spot === "w-l466" && bon.stood === "gravel" && bon.gravel >= 1 && bon.dock === 0 && bon.pier === 0 && bon.rainier === 0, "Bonney Lake: a gravel launch, no dock and no pier", bon);
    // The tide the page already has, painted in: a squid evening starts at the high water (the fixture's 12 ft at 5:15 PM).
    const red = await card(page, T("2026-11-24", "squid-redondo"));
    // (fix-2, V1-7) no lamp head is hidden behind a chip or crowds one: each
    // stands 8 px clear of every chip, or shows just under it (its pole
    // ending below the chip, the head in sight), never at its sides or top
    const heads = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[data-view="hot"] > .hero .chips > *')].map((c) => c.getBoundingClientRect());
      return [...document.querySelectorAll("#scene .w-bulb")].map((b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { x: Math.round(x), y: Math.round(y), bad: chips.some((c) => x > c.left - 8 && x < c.right + 8 && y > c.top - 8 && y < c.bottom + 8 && !(y > c.bottom + 1 && x > c.left + 4 && x < c.right - 4)) }; });
    });
    ok(heads.length >= 3 && heads.every((h) => !h.bad), "Redondo: no lamp head is hidden behind the title's chips or crowds one (each clear of them, or in sight just under one)", heads);
    ok(red.spot === "redondo" && red.now && red.now.date === "2026-11-24T17:00" && red.now.tide > 0.9 && red.now.tideM > 3.4, "Redondo squid: the run card's water stands at that evening's high tide", red.now);
    // Not on every redraw: the same card drawn again keeps its painting.
    await page.evaluate(() => { document.getElementById("scene").querySelector("svg").setAttribute("data-mark", "1"); });
    await page.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo") + "/gear"; });
    await page.waitForSelector('[data-view="card"] .card');
    await page.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"); });
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    ok(await page.evaluate(() => !!document.querySelector('#scene svg[data-mark="1"]')), "the picture is not painted again on a redraw of the same trip (same spot, hour and water)");
    await page.evaluate(() => { location.hash = "#/trips/" + encodeURIComponent("2026-11-26~squid-redondo"); });
    await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
    ok(await page.evaluate(() => !document.querySelector('#scene svg[data-mark="1"]')), "and it is painted again for the same spot on another day (another hour and water)");
    // Rainier only at Fox Island: none on any run card this week.
    const cards = await allCards(page);
    ok(cards.length >= 6 && cards.every((c) => c.spot && c.kids > 50), "every run card of the week stands under its own spot's picture", cards.map((c) => [c.key, c.spot]));
    ok(cards.every((c) => c.rainier === 0), "and none of them has Rainier in it (only Fox Island does)", cards.filter((c) => c.rainier).map((c) => c.key));
    // Every Hot Trips row's thumbnail is its own spot's.
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const rows = await page.evaluate(() => [...document.querySelectorAll("[data-day] [data-hot]")].map((r) => { const v = r.querySelector(".tile svg"); return { id: r.dataset.hot, spot: v.getAttribute("data-spot") || "", stand: v.getAttribute("data-stand") || "" }; }));
    ok(rows.length >= 10 && rows.every((r) => r.spot), "every Hot Trips row's thumbnail is painted from its own spot", rows.filter((r) => !r.spot));
    ok(rows.filter((r) => /green-river/.test(r.id)).every((r) => r.stand === "narrows") && rows.filter((r) => /dash-point/.test(r.id)).every((r) => r.stand === "state"),
      "and its own stand: the Green's salmon rows at the Narrows, the Dash Point cutthroat row on the state beach", rows.filter((r) => /green|dash/.test(r.id)));
    // (the crew trip page's own picture is checked in tests/rigs-look-crew.smoke.mjs, with the stub crew)
    await nightAll(page, "November");
    // (E3, V2-4) the River tile at night: lit below its pill, never a dark slab (brightest 1% at least 105)
    await sky(page, "night", "#/water");
    await page.waitForSelector('[data-view="home"] [data-type-tile="river"] svg');
    await page.waitForTimeout(150);
    const rt = await page.evaluate(() => { const t = document.querySelector('[data-type-tile="river"]'), v = t.querySelector("svg").getBoundingClientRect(), pill = t.querySelector(".hotpill, .tag, .pill"), pb = pill ? pill.getBoundingClientRect().bottom : v.top + 34; return { x: v.left, y: Math.ceil(pb) + 2, w: v.width, h: Math.floor(v.bottom - pb - 4) }; });
    {
      const img = decodePng(await page.screenshot({ clip: { x: rt.x, y: rt.y, width: rt.w, height: rt.h } })), nn = img.w * img.h, Y = new Float32Array(nn);
      for (let i = 0; i < nn; i++) { const o = i * img.bpp; Y[i] = 0.2126 * img.px[o] + 0.7152 * img.px[o + 1] + 0.0722 * img.px[o + 2]; }
      Y.sort();
      ok(rt.h > 50 && Y[Math.floor(nn * 0.99)] >= 105, "the Water tab's River tile is lit at night below its pill (brightest 1% at least 105)", [rt, Math.round(Y[Math.floor(nn * 0.99)])]);
    }
    // (E3 fix-2, V2-3) and the Lake tile's water at night: the towns' glow over the far end lies on it (brightest 1% at least 105)
    {
      const lt = await page.evaluate(() => { const b = document.querySelector('[data-type-tile="lake"] svg').getBoundingClientRect(); return { x: b.left, y: b.top + b.height * 0.45, w: b.width, h: b.height * 0.55 }; });
      const img = decodePng(await page.screenshot({ clip: { x: lt.x, y: lt.y, width: lt.w, height: lt.h } })), nn = img.w * img.h, Y = new Float32Array(nn);
      for (let i = 0; i < nn; i++) { const o = i * img.bpp; Y[i] = 0.2126 * img.px[o] + 0.7152 * img.px[o + 1] + 0.0722 * img.px[o + 2]; }
      Y.sort();
      ok(lt.h > 30 && Y[Math.floor(nn * 0.99)] >= 105, "the Water tab's Lake tile is lit at night on its water (brightest 1% at least 105)", [lt, Math.round(Y[Math.floor(nn * 0.99)])]);
    }
    ok(!errors.length, "no page errors in the November week", errors);
    await ctx.close();
  }

  // ---- (E3, V2-4) every lamp at a spot stands clear of the title's chips ----------------------------
  // A lamp whose pole rises behind a chip with its head hidden reads as a pole holding the chip up: each
  // lamp head stands 8 px clear of every chip, or shows just under one (its head in sight). Les Davis,
  // Des Moines and Point Defiance are reached the way their weeks reach them: the nearer piers blown out.
  for (const [hash, blow] of [[T("2026-11-24", "squid-les-davis"), ["redondo", "des-moines-pier"]], [T("2026-11-24", "squid-des-moines"), ["redondo"]], [T("2026-11-26", "salmon-point-defiance"), ["redondo", "les-davis", "des-moines-pier"]]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(ctx, {});
    const LAT = { redondo: 47.349, "les-davis": 47.287, "des-moines-pier": 47.402 }, lats = blow.map((id) => LAT[id]), pad = (q) => String(q).padStart(2, "0"), DAYS7 = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
    await ctx.route(/open-meteo\.com/, (route) => {
      const u = route.request().url(), la = (new URL(u).searchParams.get("latitude") || "").split(",").map(Number), hit = (l) => lats.some((x) => Math.abs(x - l) < 0.002);
      if (/marine-api/.test(u)) return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(la.map((l) => { const time = [], wave = []; for (const d of DAYS7) for (let h = 0; h < 24; h++) { time.push(d + "T" + pad(h) + ":00"); wave.push(hit(l) ? 14 : 4); } return { hourly: { time, wave_height: wave } }; })) });
      const body = la.map((l) => { const time = [], t = [], pr = [], w = [], g = [], c = []; for (const d of DAYS7) for (let h = 0; h < 24; h++) { time.push(d + "T" + pad(h) + ":00"); t.push(45); pr.push(0); c.push(90); const b = hit(l) || d === DAYS7[2]; w.push(b ? 40 : 4); g.push(b ? 55 : 8); } return { hourly: { time, temperature_2m: t, precipitation: pr, wind_speed_10m: w, wind_gusts_10m: g, cloud_cover: c }, daily: { time: DAYS7, sunrise: DAYS7.map((d) => d + "T07:31"), sunset: DAYS7.map((d) => d + "T16:24") } }; });
      return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
    });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    await page.goto(base + "#/trips", { waitUntil: "load" });
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    const c = await card(page, hash);
    const heads = await page.evaluate(() => {
      const chips = [...document.querySelectorAll('[data-view="hot"] > .hero .chips > *')].map((q) => q.getBoundingClientRect());
      return [...document.querySelectorAll("#scene .w-bulb")].map((b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        return { x: Math.round(x), y: Math.round(y), bad: chips.some((q) => x > q.left - 8 && x < q.right + 8 && y > q.top - 8 && y < q.bottom + 8 && !(y > q.bottom + 1 && x > q.left + 4 && x < q.right - 4)) }; });
    });
    ok(c.spot && heads.length >= 2 && heads.every((h) => !h.bad), c.spot + ": no lamp head is hidden behind the title's chips or crowds one", heads);
    await ctx.close();
  }

  // ---- a September week: Dash Point by kayak, Westport crab --------------------------------------
  {
    const { ctx, page, errors } = await week(SEPT_DAYS, SEPT_NOW);
    for (const plan of ["coho-dash-point", "king-dash-point"]) {
      const c = await card(page, T("2026-09-19", plan));
      ok(c.spot === "dash-point" && c.stand === "city" && c.how === "kayak" && c.kayak >= 1, plan + ": the run card stands at the kayak launch, the kayak on the sand", c);
    }
    const pinkDP = await paintOf(page, "dash-point", "pink", "2027-09-10", "pink-dash-point", "sound");
    ok(pinkDP.stand === "city", "a pink trip at Dash Point (by kayak) is the kayak launch too", pinkDP);
    // (the cutthroat trip is not one of the day's six in September 2026, so
    // its picture is painted the way its run card paints it)
    const cutS = await paintOf(page, "dash-point", "cutthroat", "2026-09-19", "cutthroat-dash-point", "sound");
    ok(cutS.stand === "state" && cutS.kayak === 0, "and the cutthroat trip that same day is the state park beach", cutS);
    const crab = await card(page, T("2026-09-19", "crab-westport"));
    ok(crab.spot === "westport" && crab.stand === "float" && crab.kind === "pier", "Westport crab: the run card stands on Float 20", crab);
    const coho = await card(page, T("2026-09-20", "coho-green-river"));
    ok(coho.stand === "narrows", "a September coho trip on the Green: the Auburn Narrows", coho);
    const cards = await allCards(page);
    ok(cards.length >= 4 && cards.every((c) => c.spot && c.rainier === 0), "no run card this week has Rainier", cards.filter((c) => c.rainier || !c.spot).map((c) => c.key));
    await nightAll(page, "September");
    ok(!errors.length, "no page errors in the September week", errors);
    await ctx.close();
  }

  // ---- a spring week: Fox Island, two lakes, two piers ---------------------------------------------
  {
    const { ctx, page, errors } = await week(SPRING_DAYS, SPRING_NOW);
    const cards = await allCards(page);
    const fox = cards.filter((c) => c.spot === "fox-island"), rest = cards.filter((c) => c.spot !== "fox-island");
    ok(fox.length >= 1 && fox.every((c) => c.rainier === 1), "Fox Island's run card has Rainier, big and white across the water (proven there)", fox);
    ok(rest.length >= 4 && rest.every((c) => c.rainier === 0), "and no other run card of the week does", rest.filter((c) => c.rainier).map((c) => c.key));
    // (fix-2, V1-9) Rainier's summit stands clear of the title's tag
    await card(page, "#/trips/" + encodeURIComponent(fox[0].key));
    const summit = await page.evaluate(() => {
      const g = document.querySelector("#scene g.w-mtn[transform]"), m = g.getScreenCTM(), tags = [...document.querySelectorAll('[data-view="hot"] > .hero .chips > *')].map((c) => c.getBoundingClientRect());
      const x = 119 * m.a + m.e, y = 4.6 * m.d + m.f;
      return { x: Math.round(x), y: Math.round(y), clear: tags.every((c) => x < c.left - 4 || x > c.right + 4 || y < c.top - 4 || y > c.bottom + 4) };
    });
    ok(summit.clear, "Fox Island: Rainier's summit stands clear of the chips under the title", summit);
    await sky(page, "overcast", "#/trips");
    await page.waitForSelector("[data-day] [data-hot] .tile svg");
    // Two rows of the same kind of water have thumbnails of their own (the
    // gradient ids are numbered per drawing, so those are set aside).
    const thumbs = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll("[data-day] [data-hot]")].map((r) => [r.dataset.hot,
      { kind: r.querySelector(".tile").dataset.mini, spot: r.querySelector(".tile svg").getAttribute("data-spot"), art: r.querySelector(".tile svg").innerHTML.replace(/mn\d+/g, "") }])));
    const pairs = [["trout-fenwick", "trout-american"], ["salmon-fox-island", "crab-westport"]];
    for (const [a, b] of pairs) {
      const A = thumbs[a], B = thumbs[b];
      ok(A && B && A.kind === B.kind && A.spot !== B.spot && A.art !== B.art, "two " + (A && A.kind) + " rows, " + a + " and " + b + ": each thumbnail is its own spot's, not the same picture", A && B ? [A.kind, A.spot, B.kind, B.spot] : [a, b]);
    }
    await nightAll(page, "Spring");
    ok(!errors.length, "no page errors in the spring week", errors);
    await ctx.close();
  }

  // ---- a December week: Tokul and the Cowlitz, lit by the sky after dark ------------------------
  {
    const { ctx, page, errors } = await week(DEC_DAYS, DEC_NOW);
    const out = await nightAll(page, "December");
    ok(out.some((c) => c.spot === "tokul"), "the December week has its Tokul trip (lit at night above)", out.map((c) => c.spot));
    ok(!errors.length, "no page errors in the December week", errors);
    await ctx.close();
  }
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
