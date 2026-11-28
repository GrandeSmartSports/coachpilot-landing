// The look, in the library: Water, Fish and Learn, a fish's page, a spot's
// page, one card at a time (a knot, a rig drawing, a rule, a gear list) and
// the map.
// Run: node tests/rigs-look-library.smoke.mjs
//
// What this guards: every one of those screens opens on a painted picture
// with its first card crossing the waterline; every Fish tile shows that
// fish, drawn, and no two fish share a drawing; every Water tile carries a
// small painting of its own water; a lake trip, a razor clam dig and a surf
// perch trip stand under the lake and the ocean beach (the surf perch one in
// a spring week, when they run); a lake's second tile is Weather, not a
// tide, and its dock can be switched off; night is lit on both; the beach
// shows the trip's own people (a clam dig, or surf rods); a title that wraps
// keeps the picture showing under it and reads at dawn; a knot or a rig
// drawing stays on its dark card; a rule has its red edge; the gear list
// paints what is owned; the Fish and Water tabs paint what is on now; a new
// screen opens at its top; tides that did not load are said; the map is a
// float with gold pins; no row ends in three dots; and every word on every
// one of these screens can be read under all eight skies.
// Nothing here reaches a real server.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SKIES, SPRING_DAYS, SPRING_NOW, fake, unreadable, decodePng, contrast } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8809;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 600000);
watchdog.unref?.();

const PIER = "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo");
const LAKE = "#/trips/" + encodeURIComponent("2026-11-28~trout-w-l466");
const CLAMS = "#/trips/" + encodeURIComponent("2026-11-28~clams-ocean-shores");
// Every screen this stage owns: where it is, what it draws, the picture it
// stands under, and the card that crosses the waterline.
const SCREENS = [
  { name: "the Water tab", hash: "#/water", view: "home", scene: "sound", first: ".wtile.float" },
  { name: "a way to fish (Lake)", hash: "#/water/lake", view: "water", scene: "lake", first: '[data-view="water"] > .float.list' },
  { name: "a way to fish (Beach)", hash: "#/water/beach", view: "water", scene: "surf", first: '[data-view="water"] > .float.list' },
  { name: "a spot's page (Dash Point)", hash: "#/spot/dash-point", view: "spot", scene: "sound", first: '[data-view="spot"] > .float.list' },
  { name: "the Fish tab", hash: "#/fish", view: "fish", scene: "river", first: ".pickcard" },
  { name: "a fish's page (chum, the Green)", hash: "#/chum/green-river", view: "species", scene: "river", first: "[data-plate-card]" },
  { name: "a fish's page (squid, Redondo)", hash: "#/squid/redondo", view: "species", scene: "pier", first: "[data-plate-card]" },
  { name: "a fish's page (bass, Lake Fenwick)", hash: "#/bass/lake-fenwick", view: "species", scene: "lake", first: "[data-plate-card]" },
  { name: "a fish's page (clams, Ocean Shores)", hash: "#/clams/ocean-shores", view: "species", scene: "surf", first: "[data-plate-card]" },
  { name: "the Learn tab", hash: "#/learn", view: "learn", scene: "lake", first: "[data-learn-tiles] .ptile" },
  { name: "one part of Learn (Kayak)", hash: "#/learn/kayak", view: "learn", scene: "lake", first: '[data-section="Kayak"] .float.list' },
  { name: "a knot card", hash: "#/learn/knot-improved-clinch", view: "card", scene: "lake", first: ".card" },
  { name: "a rod card (a long title, all words)", hash: "#/learn/rod-length", view: "card", scene: "lake", first: ".card" },
  { name: "a rig card with its drawing", hash: "#/coho/green-river/salmon-float-eggs-build", view: "card", scene: "river", first: ".card" },
  { name: "a card with a law box", hash: "#/squid/redondo/squid-regs", view: "card", scene: "pier", first: ".card" },
  { name: "a card with links in its law box", hash: "#/king/green-river/salmon-license", view: "card", scene: "river", first: ".card" },
  { name: "a section page (the gear list)", hash: PIER + "/gear", view: "card", scene: "pier", first: ".card" },
  { name: "a section page (tide and weather)", hash: PIER + "/wx", view: "card", scene: "pier", first: ".card" },
  { name: "a section page (the rules on a lake trip)", hash: LAKE + "/rules", view: "card", scene: "lake", first: ".card" },
  { name: "a lake trip's run card", hash: LAKE, view: "hot", scene: "lake", first: '[data-view="hot"] [data-read]' },
  { name: "a razor clam dig's run card", hash: CLAMS, view: "hot", scene: "surf", first: '[data-view="hot"] [data-read]' },
  { name: "the map", hash: "#/trips/map", view: "map", scene: "sound", first: ".mapbox" }
];

const server = await startServer(ROOT, PORT);
let browser;
try {
  browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  await fake(ctx);
  // Map tiles come from a real server. The pins and the chart under them do not.
  await ctx.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  const page = await ctx.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const base = `http://127.0.0.1:${PORT}/rigs/`;
  await page.goto(base + "#/trips", { waitUntil: "load" });
  await page.waitForSelector("[data-day] [data-hot]");

  const sky = async (id, hash) => {
    await page.evaluate(([i, h]) => {
      const p = RIG.sky.palettes[i];
      RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name });
      location.hash = "#/crew"; location.hash = h;
    }, [id, hash]);
    await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    await page.waitForTimeout(80);
  };
  const open = async (id, s) => {
    await sky(id, s.hash);
    await page.waitForSelector('[data-view="' + s.view + '"] ' + (s.view === "map" ? ".leaflet-marker-icon.mk" : ".hero h1"));
    await page.waitForSelector(s.first);
  };
  const painted = () => page.evaluate(() => {
    const s = document.getElementById("scene"), svg = s && s.querySelector("svg");
    return { kind: s && s.getAttribute("data-scene"), svgs: s ? s.querySelectorAll("svg").length : 0, kids: svg ? svg.querySelectorAll("*").length : 0, h: Math.round(s ? s.getBoundingClientRect().height : 0) };
  });
  // The first card starts on the picture and ends below it.
  const crosses = (sel) => page.evaluate((q) => {
    const s = document.getElementById("scene").getBoundingClientRect(), c = document.querySelector(q), b = c && c.getBoundingClientRect();
    return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), scene: Math.round(s.bottom), ok: b.top < s.bottom - 24 && b.bottom > s.bottom && b.top > s.top } : null;
  }, sel);
  // The title is in the sky: above the horizon of the picture, clear of the dock.
  const titled = () => page.evaluate(() => {
    const h = document.querySelector(".hero h1").getBoundingClientRect(), d = document.querySelector(".dock").getBoundingClientRect(), s = document.getElementById("scene").getBoundingClientRect();
    const lift = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--lift")) || 0;
    // the horizon is 176 of the picture's 330 units down, under the lift
    return { top: Math.round(h.top), bottom: Math.round(h.bottom), dock: Math.round(d.bottom), horizon: Math.round(lift + s.width * 176 / 390), lift };
  });
  // How much picture shows between the last chip under the title and the
  // first card (the approved run card shows 97 px; a thin line of trees is plain).
  // The share of a title's letters' box that sits on picture it cannot be
  // read against (under 3 to 1), with the title's own shadow taken off.
  const lowShare = async (pg, w) => {
    const info = await pg.evaluate(() => { const h = document.querySelector(".hero h1"), r = document.createRange(); r.selectNodeContents(h);
      const cx = document.createElement("canvas").getContext("2d"); cx.fillStyle = getComputedStyle(h).color; cx.fillRect(0, 0, 1, 1);
      return { rects: [...r.getClientRects()].map((b) => [b.left, b.top, b.width, b.height]), ink: [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3), t: h.textContent }; });
    const st = await pg.addStyleTag({ content: ".hero h1{color:transparent!important;text-shadow:none!important}" });
    const img = decodePng(await pg.screenshot());
    await st.evaluate((n) => n.remove());
    const k = img.w / w;
    let low = 0, n = 0;
    for (const [x, y, ww, hh] of info.rects) for (let yy = Math.floor(y * k); yy < (y + hh) * k; yy++) for (let xx = Math.floor(x * k); xx < (x + ww) * k; xx++) {
      const i = (yy * img.w + xx) * img.bpp; if (contrast(info.ink, [img.px[i], img.px[i + 1], img.px[i + 2]]) < 3) low++; n++; }
    return { t: info.t, share: low / n };
  };
  const strip = () => page.evaluate(() => {
    const hero = document.querySelector("[data-view] > .hero");
    let b = 0; for (const e of hero.children) if (e.offsetHeight) b = Math.max(b, e.getBoundingClientRect().bottom);
    let el = hero.nextElementSibling; while (el && !el.offsetHeight) el = el.nextElementSibling;
    const lead = el && el.querySelector(":scope > h2.sect.lead"), c = lead ? lead.nextElementSibling : el;
    return Math.round(c.getBoundingClientRect().top - b);
  });

  for (const id of ["overcast", "night", "golden"]) {
    for (const s of SCREENS) {
      await open(id, s);
      const p = await painted();
      ok(p.kind === s.scene && p.svgs >= 4 && p.kids > 30 && p.h > 200, id + ": " + s.name + " opens on a painted picture, the " + s.scene, p);
      const c = await crosses(s.first);
      ok(c && c.ok, id + ": its first card crosses the waterline", c);
      const t = await titled();
      ok(t.top >= t.dock - 2 && t.bottom < t.horizon + 4, id + ": its title stands in the sky, under the tabs and above the horizon", t);
      if (s.view !== "map") { const g = await strip(); ok(g >= 80, id + ": at least 80 px of the picture shows between the title's chips and the first card", g); }
      ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, id + ": " + s.name + " fits the phone");
    }
  }

  // ---- pictures, not outline icons ----------------------------------------
  await sky("overcast", "#/water");
  await page.waitForSelector("[data-type-tile] .pic svg");
  ok((await page.locator(".hero h1").innerText()).trim() === "Pick your water", "the Water tab has a title of its own, not the app's name", await page.locator(".hero h1").innerText());
  const water = await page.evaluate(() => [...document.querySelectorAll("[data-type-tile]")].map((t) => {
    const pic = t.querySelector(".pic"), svg = pic && pic.querySelector("svg"), b = pic && pic.getBoundingClientRect();
    return { id: t.dataset.typeTile, view: pic && pic.dataset.viewKind, shapes: svg ? svg.querySelectorAll("path, rect, circle, ellipse").length : 0, w: b ? Math.round(b.width) : 0, h: b ? Math.round(b.height) : 0, outline: !!t.querySelector(".ic") };
  }));
  ok(water.length === 7 && water.every((t) => t.shapes >= 12 && t.w >= 150 && t.h >= 90 && !t.outline), "every Water tile carries a painted thumbnail of its water, sized for the tile, and no outline icon", water);
  ok(new Set(water.map((t) => t.view)).size === 7, "and no two ways to fish share a painting", water.map((t) => t.view).join(","));
  await sky("overcast", "#/water/beach");
  await page.waitForSelector("[data-spot] .tile svg");
  const spots = await page.evaluate(() => [...document.querySelectorAll('[data-view="water"] .row[data-spot]')].map((r) => ({ id: r.dataset.spot, kind: (r.querySelector(".tile") || {}).dataset?.viewKind, shapes: r.querySelectorAll(".tile svg *").length })));
  ok(spots.length === 3 && spots.every((r) => r.shapes > 10) && spots.find((r) => r.id === "dash-point").kind === "sound" && spots.find((r) => r.id === "ocean-shores").kind === "surf",
    "each spot in the list has its own small painting: the Sound for Dash Point, the surf for the coast", spots);

  await sky("overcast", "#/fish");
  await page.waitForSelector(".pickcard [data-plate] svg");
  const fish = await page.evaluate(() => [...document.querySelectorAll(".pickcard[data-species]")].map((t) => {
    const a = t.querySelector("[data-plate]"), svg = a && a.querySelector("svg"), b = svg && svg.getBoundingClientRect();
    return { id: t.dataset.species, plate: a ? a.dataset.plate : "", shapes: svg ? svg.querySelectorAll("path, ellipse, circle").length : 0, w: b ? Math.round(b.width) : 0, h: b ? Math.round(b.height) : 0,
      // filled shapes with value, not an outline: gradients and more than one filled part
      fills: svg ? svg.querySelectorAll("linearGradient, radialGradient").length : 0 };
  }));
  const nSpecies = await page.evaluate(() => RIG.content.species.length);
  ok(fish.length === nSpecies && fish.every((f) => f.plate && f.shapes >= 15 && f.fills >= 1 && f.w >= 120 && f.h >= 40), "every Fish tile shows that fish, drawn in filled shapes", fish.filter((f) => !(f.plate && f.shapes >= 15 && f.w >= 120)));
  ok(new Set(fish.map((f) => f.plate)).size === nSpecies, "and no two fish share a drawing: a chum is not a coho", fish.map((f) => f.id + "=" + f.plate).join(","));
  // Colour comes from the sky: the same fish is painted differently by day and by night.
  const tone = () => page.evaluate(() => getComputedStyle(document.querySelector(".pickcard .fp-chum")).getPropertyValue("--f-back").trim() + "|" + getComputedStyle(document.querySelector(".pickcard .fp")).getPropertyValue("--shore").trim());
  const dayTone = await tone();
  await sky("night", "#/fish");
  await page.waitForSelector(".pickcard [data-plate] svg");
  ok(dayTone && dayTone !== await tone(), "a plate takes its colours from the sky, so it is painted again at night", dayTone);
  await sky("overcast", "#/spot/dash-point");
  await page.waitForSelector("[data-row-species] .fishtile svg");
  const atSpot = await page.evaluate(() => [...document.querySelectorAll("[data-row-species]")].map((r) => ({ id: r.dataset.rowSpecies, plate: (r.querySelector("[data-plate]") || {}).dataset?.plate || "", hint: (r.querySelector(".tx > span") || {}).textContent || "" })));
  ok(atSpot.length === 5 && atSpot.every((r) => r.plate && r.hint.length > 12 && !/…$/.test(r.hint)), "a spot lists its fish with a drawing each and the whole of its line", atSpot);
  await sky("overcast", "#/chum/green-river");
  await page.waitForSelector("[data-plate-card] svg");
  const plate = await page.evaluate(() => { const c = document.querySelector("[data-plate-card]"), a = c.querySelector(".art"), f = a.querySelector(".fp"); return { names: c.querySelector(".names").innerText, grain: f.getAttribute("filter") || "", over: Math.round(c.getBoundingClientRect().top - a.getBoundingClientRect().top), badges: document.querySelectorAll('[data-view="species"] .row .badge').length }; });
  ok(/Chum salmon/.test(plate.names) && /Oncorhynchus keta/.test(plate.names) && /grain/.test(plate.grain) && plate.over >= 12, "a fish's page opens on its plate, named, the drawing riding up over the card's lip", plate);
  ok(plate.badges >= 4 && await page.locator('[data-view="species"] .panel.list').count() >= 2, "and its cards follow as grouped rows that say what each one holds", plate);
  await sky("overcast", "#/learn");
  await page.waitForSelector("[data-learn-tiles] .ptile .pic svg");
  const learn = await page.evaluate(() => [...document.querySelectorAll("[data-sec-tile]")].map((t) => ({ id: t.dataset.secTile, href: t.getAttribute("href"), shapes: t.querySelectorAll(".pic svg *").length, what: (t.querySelector(".pic") || {}).dataset?.plate || (t.querySelector(".pic") || {}).dataset?.viewKind })));
  // (the parts the switch in rigs/index.html has on: Knots and Casting today)
  const on = await page.evaluate(() => ["knots", "casting", "guides", "gear"].filter((x) => RIG.libReady[x]));
  ok(learn.map((t) => t.id).join() === on.join() && on.length >= 2 && learn.every((t) => t.shapes >= 8 && t.href === "#/learn/" + t.id) && new Set(learn.map((t) => t.what)).size === on.length,
    "Learn opens on a picture tile for each part that is on (" + on.join(", ") + "), each its own picture", learn);

  // ---- the new scenes: the lake and the ocean beach -----------------------
  const pick = await page.evaluate(() => ({
    lake: RIG.picture.scene({ planId: "trout-fenwick", spot: "lake-fenwick" }), stocked: RIG.picture.scene({ planId: "trout-w-l466", spot: "w-l466" }),
    kayak: RIG.picture.scene({ planId: "trout-tapps", spot: "lake-tapps" }), perch: RIG.picture.scene({ planId: "surfperch-ocean-shores", spot: "ocean-shores" }),
    perch2: RIG.picture.scene({ planId: "surfperch-westport", spot: "westport" }), clams: RIG.picture.scene({ planId: "clams-ocean-shores", spot: "ocean-shores" }),
    squid: RIG.picture.scene({ planId: "squid-redondo", spot: "redondo" }), chum: RIG.picture.scene({ planId: "chum-green-river", spot: "green-river" }), src: RIG.picture.scene({ planId: "cutthroat-dash-point", spot: "dash-point" }),
    scenes: RIG.water.scenes.join(",") }));
  ok(pick.lake === "lake" && pick.stocked === "lake" && pick.kayak === "lake", "a lake trip stands under the lake", pick);
  ok(pick.perch === "surf" && pick.perch2 === "surf" && pick.clams === "surf", "a surf perch trip and a razor clam dig stand under the ocean beach", pick);
  ok(pick.squid === "pier" && pick.chum === "river" && pick.src === "sound" && pick.scenes === "sound,pier,river,lake,surf", "and the three scenes that were there keep their trips", pick);
  for (const id of ["overcast", "night", "golden", "dawn"]) {
    for (const [hash, kind, mini] of [[LAKE, "lake", "lake"], [CLAMS, "surf", "surf"]]) {
      await sky(id, hash);
      await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
      const p = await painted(), c = await crosses('[data-view="hot"] [data-read]');
      ok(p.kind === kind && p.kids > 30 && c && c.ok, id + ": a " + (kind === "lake" ? "lake trip's" : "razor clam dig's") + " run card stands under the " + kind + ", its read crossing the waterline, the plan under it", [p, c]);
    }
  }
  await sky("overcast", "#/trips");
  await page.waitForSelector("[data-day] [data-hot]");
  const rows = await page.evaluate(() => [...document.querySelectorAll("[data-hot]")].map((r) => ({ id: r.dataset.hot, kind: r.querySelector(".tile").dataset.mini, kids: r.querySelectorAll(".tile svg *").length })));
  ok(rows.some((r) => /^trout-/.test(r.id)) && rows.filter((r) => /^trout-/.test(r.id)).every((r) => r.kind === "lake" && r.kids > 5) &&
    rows.some((r) => /^clams-/.test(r.id)) && rows.filter((r) => /^clams-/.test(r.id)).every((r) => r.kind === "surf" && r.kids > 5), "on Hot Trips a lake trip's row is a lake and a clam dig's row is the surf", rows.filter((r) => /^trout-|^clams-/.test(r.id)));
  // Night is lit, on both: Bonney Lake is painted as its own place now (a
  // gravel launch, no dock, houses round it), lit by your own light on the
  // water off the launch, and the clam dig by lanterns down the beach. By
  // day they are out. The beach shows the trip's own people: a razor clam
  // dig is diggers with clam guns, surf perch is long rods, whatever the sky.
  const lit = () => page.evaluate(() => { const s = document.getElementById("scene"), on = [...s.querySelectorAll(".w-lampson")], seen = (q) => [...s.querySelectorAll(q)].filter((g) => getComputedStyle(g).opacity !== "0").length;
    return { scene: s.getAttribute("data-scene"), lamps: on.length, shapes: on.reduce((a, g) => a + g.querySelectorAll("*").length, 0), on: on.length ? getComputedStyle(on[0]).opacity : "",
      diggers: seen(".w-diggers"), anglers: seen(".w-anglers, .w-dayonly"), road: parseFloat(getComputedStyle(s).getPropertyValue("--road")) }; });
  await sky("night", LAKE);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  const lakeLit = await lit();
  // (fix-1, function-3 and function-5) Bonney Lake closes at dusk (its card), so nobody is there by a
  // light of their own: its night is the houses' windows across the water and the towns' glow on the
  // low cloud, lying on the still water as a sheen
  const lakeOwn = await page.evaluate(() => { const s = document.getElementById("scene"), g = s.querySelector(".w-glow"), rd = s.querySelector(".w-road"); return { own: s.querySelectorAll(".w-ownlamp").length, spot: s.dataset.spot || "", windows: s.querySelectorAll(".w-window rect").length,
    glow: g ? +getComputedStyle(g).opacity : 0, road: rd ? +getComputedStyle(rd).opacity : 0, moon: s.dataset.moonpos }; });
  ok(lakeLit.scene === "lake" && lakeOwn.spot === "w-l466" && lakeOwn.own === 0 && lakeOwn.windows >= 6 && lakeOwn.glow >= 0.2 && lakeOwn.road >= 0.12,
    "at night the lake is lit by what is true there: the houses' windows across and the towns' glow on the cloud and the water; no one's own light at a lake that closes at dusk", [lakeLit, lakeOwn]);
  await sky("night", CLAMS);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  const digLit = await lit();
  ok(digLit.scene === "surf" && digLit.shapes > 60 && digLit.on === "1" && digLit.diggers === 1 && digLit.anglers === 0, "at night the razor clam dig is lit by its lanterns, and nobody is holding a surf rod", digLit);
  await sky("overcast", CLAMS);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  const digDay = await lit();
  ok(digDay.on === "0" && digDay.diggers === 1 && digDay.anglers === 0, "by day the dig is still a dig: diggers with clam guns, the lanterns out, no surf rods", digDay);
  await sky("golden", "#/clams/ocean-shores");
  await page.waitForSelector("[data-plate-card]");
  const clamPage = await lit();
  ok(clamPage.diggers === 1 && clamPage.anglers === 0, "and the Clams page shows the dig too, not a surf angler", clamPage);
  await sky("night", "#/spot/westport");
  await page.waitForSelector('[data-view="spot"] [data-row-species]');
  const westNight = await lit();
  // Westport's own beach is day use only (its card): after dark it is empty, and never a clam dig
  ok(westNight.scene === "surf" && westNight.anglers === 0 && westNight.diggers === 0, "Westport, where the app has surf perch and no clams, is an empty beach at night (day use only), never a clam dig", westNight);
  await sky("overcast", "#/spot/westport");
  await page.waitForSelector('[data-view="spot"] [data-row-species]');
  const westDay = await lit();
  ok(westDay.scene === "surf" && westDay.anglers === 1 && westDay.diggers === 0, "and by day its people hold surf rods", westDay);

  // A lake has no tide: its second tile is Weather, the wind through the trip
  // and the temperature, and its weather page has no tide box.
  await sky("overcast", LAKE);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="wx"]');
  const lakeWx = await page.evaluate(() => { const w = document.querySelector('[data-sec-row="wx"]'), big = w.querySelector(".bignum"); return { head: w.querySelector(":scope > b").textContent.trim(), text: w.innerText, bars: w.querySelectorAll("svg.windbars rect.w-w").length, gusts: w.querySelectorAll("svg.windbars rect.w-g").length, curve: w.querySelectorAll("svg .t-line").length,
    big: big ? big.firstChild.textContent.trim() : "", ten: !!w.querySelector("svg.windbars .t-base") && /10 mph/.test((w.querySelector("svg.windbars text") || {}).textContent || "") }; });
  ok(lakeWx.head === "Weather" && !/tide/i.test(lakeWx.text) && lakeWx.bars >= 6 && lakeWx.gusts === lakeWx.bars && lakeWx.curve === 0 && /^45°$/.test(lakeWx.big) && /dry/i.test(lakeWx.text) && /Wind to 4\s+mph/.test(lakeWx.text) && lakeWx.ten,
    "a lake trip's second tile is Weather: the temperature big, dry or rain, a bar of wind for each half hour on a baseline with the 10 mph line named, and no tide line", lakeWx);
  await sky("overcast", LAKE + "/wx");
  await page.waitForSelector('[data-view="card"] .hrs');
  const lakeWxPage = await page.evaluate(() => ({ title: document.querySelector(".hero h1").textContent.trim(), tide: /tide/i.test(document.querySelector('[data-view="card"] .card').innerText),
    first: (document.querySelector('[data-view="card"] .card > :not(h3)') || {}).dataset?.wxWind !== undefined, bars: document.querySelectorAll("[data-wx-wind] svg.windbars rect.w-w").length,
    times: getComputedStyle(document.querySelector(".hrs td")).fontFamily }));
  ok(lakeWxPage.title === "Weather" && !lakeWxPage.tide && lakeWxPage.first && lakeWxPage.bars >= 6 && /Barlow/.test(lakeWxPage.times), "and its page is called Weather, opens on the wind bars card wide, has no tide box, and its times are in the heading face", lakeWxPage);
  await sky("overcast", PIER + "/wx");
  await page.waitForSelector("[data-wx-tide] svg .t-line");
  const pierWx = await page.evaluate(() => ({ first: (document.querySelector('[data-view="card"] .card > :not(h3)') || {}).dataset?.wxTide !== undefined, win: document.querySelectorAll("[data-wx-tide] .t-win").length, turns: document.querySelectorAll("[data-wx-tide] .t-now").length,
    lead: (document.querySelector("[data-wx-tide] figcaption b") || {}).textContent || "", wide: Math.round(document.querySelector("[data-wx-tide] svg").getBoundingClientRect().width) }));
  ok(pierWx.first && pierWx.win === 1 && pierWx.turns >= 1 && /slack/i.test(pierWx.lead) && pierWx.wide >= 280, "a pier's Tide and weather page opens on its tide, card wide, the trip's hours shaded and the slack named", pierWx);
  await sky("overcast", CLAMS);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="wx"]');
  ok(/^Tide and weather/.test(await page.locator('[data-sec-row="wx"] > b').innerText()) && await page.locator('[data-sec-row="wx"] svg .t-line').count() === 1, "the coast keeps its tide and weather tile with its tide curve");

  // The lake's dock is one of its options, and each lake's own card says:
  // Bonney Lake (stage E) has a gravel launch and no dock or pier, whatever
  // the WDFW name says, and is still lit at night; a lake that has one
  // (Lake Fenwick's short pier) shows it.
  await sky("night", LAKE);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  const noDock = await page.evaluate(() => { const s = document.getElementById("scene"); let p = {}; try { p = JSON.parse(s.dataset.paint || "{}"); } catch (e) { /* none */ }
    return { kind: s.dataset.scene, spot: p.spot, stand: p.lake && p.lake.stand, deck: s.querySelectorAll(".w-decktop, .w-dock").length, gravel: s.querySelectorAll(".w-gravel").length, lit: s.querySelectorAll(".w-lampson *").length, reeds: s.querySelectorAll(".w-reed, .w-sedge").length }; });
  await sky("night", "#/bass/lake-fenwick/bass-watch-wacky");
  await page.waitForSelector('[data-view="card"] .card');
  const dock = await page.evaluate(() => { const s = document.getElementById("scene"); return { spot: s.dataset.spot || "", deck: s.querySelectorAll(".w-dock").length }; });
  ok(noDock.kind === "lake" && noDock.spot === "w-l466" && noDock.stand === "gravel" && noDock.deck === 0 && noDock.gravel >= 1 && noDock.lit > 2 && noDock.reeds > 0 && dock.spot === "lake-fenwick" && dock.deck >= 1,
    "Bonney Lake has a gravel launch and no dock, still lit at night, and the dock comes back for a lake that has one (Lake Fenwick's pier)", [noDock, dock]);
  const viewNoDock = await page.evaluate(() => [RIG.water.view("lake"), RIG.water.view("lake", { dock: false })].map((v) => (v.match(/w-decktop/g) || []).length));
  ok(viewNoDock[0] === 1 && viewNoDock[1] === 0, "and the tile painting of a lake takes the same switch", viewNoDock);
  // The card follows the spot everywhere it is painted: a card at that lake
  // and the Hot Trips row of a trip there. Bonney Lake's row is its own
  // picture, with no dock in it.
  await sky("overcast", LAKE + "/gear");
  await page.waitForSelector('[data-view="card"] .card');
  const cardDock = await page.evaluate(() => { const s = document.getElementById("scene"); return { spot: s.dataset.spot || "", deck: s.querySelectorAll(".w-decktop, .w-dock").length, hash: location.hash }; });
  await sky("overcast", "#/trips");
  await page.waitForSelector('[data-hot="trout-w-l466"] .tile svg');
  const rowDock = await page.evaluate(() => { const own = document.querySelector('[data-hot="trout-w-l466"] .tile svg').innerHTML, pal = RIG.sky.palettes.overcast;
    return { row: /M24 37\.6L48 34\.4/.test(own), plain: /M24 37\.6L48 34\.4/.test(RIG.water.mini("lake", pal)), off: /M24 37\.6L48 34\.4/.test(RIG.water.mini("lake", pal, { dock: false })) }; });
  ok(cardDock.spot === "w-l466" && cardDock.deck === 0 && !rowDock.row && rowDock.plain && !rowDock.off,
    "a lake with no dock has none on its cards or on its Hot Trips row either", [cardDock, rowDock]);

  // ---- what is on now, painted ------------------------------------------------
  await sky("overcast", "#/fish");
  await page.waitForSelector(".pickcard [data-plate] svg");
  const now = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".pickcard[data-species]")].map((t) => [t.dataset.species,
    { now: t.dataset.now, tag: (t.querySelector(".st") || {}).textContent || "", gold: !!t.querySelector(".st.tag.hot"), bg: getComputedStyle(t).backgroundImage + getComputedStyle(t).backgroundColor, faded: t.querySelector(".art svg") ? getComputedStyle(t.querySelector(".art svg")).opacity : "" }])));
  ok(now.chum.gold && now.squid.gold && now.clams.gold && /hot this week/i.test(now.squid.tag), "on the Fish tab a fish with a hot trip this week wears the gold tag", now);
  ok(now.pink.now === "off" && /Back in July 2027/.test(now.pink.tag) && now.pink.bg !== now.coho.bg && +now.pink.faded < 1 && now.surfperch.now === "off" && /Back in March/.test(now.surfperch.tag),
    "a fish out of season is pressed in and faded, with the month it comes back", [now.pink, now.surfperch, now.coho.bg]);
  ok(now.cutthroat.now === "hot" || now.cutthroat.now === "on", "and one running now says so", now.cutthroat);
  await sky("overcast", "#/water");
  await page.waitForSelector("[data-type-tile] .pic svg");
  const hotTypes = await page.evaluate(() => [...document.querySelectorAll("[data-type-tile][data-hot-type]")].filter((t) => t.querySelector(".st.tag.hot")).map((t) => t.dataset.typeTile));
  ok(hotTypes.includes("pier") && hotTypes.includes("river") && hotTypes.includes("beach") && !hotTypes.includes("fly"), "a way to fish with a hot trip this week wears the gold tag on the Water tab", hotTypes);
  // Perch and trout is two fish, drawn as both; come from a trout trip, the trout stands in front.
  await sky("overcast", "#/fish");
  await page.waitForSelector('[data-species="perch"] [data-plate] svg');
  const pair = await page.evaluate(() => { const t = document.querySelector('.pickcard[data-species="perch"]'), a = t.querySelector("[data-plate]");
    return { name: t.querySelector(".nm").textContent, plates: a.querySelectorAll("svg").length, two: a.dataset.plate2, w: Math.round(a.querySelector("svg").getBoundingClientRect().width) }; });
  ok(pair.name === "Perch and trout" && pair.plates === 2 && pair.two === "rainbow" && pair.w >= 100, "Perch and trout is named in words and shows both fish", pair);
  await sky("overcast", LAKE);
  await page.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
  await page.evaluate(() => { location.hash = "#/perch/lake-fenwick"; });
  await page.waitForSelector("[data-plate-card] .names b");
  const fromTrout = await page.evaluate(() => [...document.querySelectorAll("[data-plate-card] .names b")].map((b) => b.textContent));
  ok(fromTrout[0] === "Rainbow trout" && fromTrout[1] === "Yellow perch", "come from a trout trip, its page names the trout first and draws it in front", fromTrout);

  // ---- a new screen opens at its top ------------------------------------------
  await sky("overcast", "#/fish");
  await page.waitForSelector('.pickcard[data-species="clams"]');
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(100);
  await page.locator('.pickcard[data-species="clams"]').click();
  await page.waitForSelector('[data-view="species"] [data-plate-card]');
  await page.waitForTimeout(100);
  const top = await page.evaluate(() => ({ y: Math.round(scrollY), h1: Math.round(document.querySelector(".hero h1").getBoundingClientRect().top), dock: Math.round(document.querySelector(".dock").getBoundingClientRect().bottom) }));
  ok(top.y === 0 && top.h1 >= top.dock - 2, "a fish tapped at the bottom of the Fish tab opens its page at the top, its title under the tabs", top);

  // ---- more than one kind of surface ----------------------------------------
  await sky("overcast", "#/coho/green-river/salmon-float-eggs-build");
  await page.waitForSelector('[data-view="card"] .dia svg');
  const dia = await page.evaluate(() => { const d = document.querySelector(".dia"), c = d.closest(".card"), m = getComputedStyle(d).backgroundImage + getComputedStyle(d).backgroundColor, n = (getComputedStyle(d).getPropertyValue("--panel") || "").trim();
    const db = d.getBoundingClientRect(), cb = c.getBoundingClientRect(); return { panel: n, edge: Math.round(db.left - cb.left) + "," + Math.round(cb.right - db.right) + "," + Math.round(db.top - cb.top), first: c.querySelector(":scope > :not(h3):not(.box)") === d }; });
  ok(dia.panel === "#141a20" && dia.edge === "0,0,0", "the rig drawing stays on its dark card under a bright sky, and fills the top of the card edge to edge", dia);
  await sky("overcast", "#/learn/knot-improved-clinch");
  await page.waitForSelector('[data-view="card"] .tyer .rail button');
  const band = await page.evaluate(() => ({ top: Math.round(document.querySelector(".tyer").getBoundingClientRect().top), tyer: (getComputedStyle(document.querySelector(".tyer")).getPropertyValue("--panel") || "").trim(), steps: document.querySelectorAll(".tyer .rail button").length }));
  ok(band.top < 560 && band.tyer === "#141a20" && band.steps >= 3, "a knot card's drawing starts on screen one under the whole picture, and keeps its dark card and its steps", band);
  await sky("overcast", "#/squid/redondo/squid-regs");
  await page.waitForSelector('[data-view="card"] .box.law');
  const law = await page.evaluate(() => { const cs = (el, p) => getComputedStyle(el, p), root = cs(document.documentElement), b = document.querySelector(".card .box.law"), plain = document.querySelector(".card .box:not(.law):not(.red):not(.tip)"), red = document.querySelector(".card .box.red");
    const col = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3).join(","); };
    return { edge: col(cs(b, "::before").backgroundColor), no: col(root.getPropertyValue("--no")), w: cs(b, "::before").width, pressed: /inset/.test(cs(b).boxShadow), head: col(cs(b.querySelector("b")).color),
      plain: plain ? cs(plain).backgroundColor : "none", red: red ? cs(red).backgroundColor : "", add: !!document.querySelector(".card .addtrip") }; });
  ok(law.edge === law.no && law.w === "4px" && law.pressed && law.head === law.no, "a rule is pressed in, with the red edge and a red heading", law);
  ok(law.plain === "rgba(0, 0, 0, 0)" && law.red && law.red !== "rgba(0, 0, 0, 0)" && law.add, "and beside it a plain note is open text, an alarm is tinted, and Add to trip is a button of its own", law);
  await sky("overcast", PIER + "/gear");
  await page.waitForSelector('[data-view="card"] .gear li');
  const gear = await page.evaluate(() => { const li = [...document.querySelectorAll(".gear li")], bg = (q) => { const e = document.querySelector(q); return e ? getComputedStyle(e).backgroundColor : ""; };
    return { n: li.length, ticks: li.filter((l) => l.querySelector(".gtick")).length, tags: li.filter((l) => l.querySelector(".tag")).length, have: bg(".gear .have .gtick"), need: bg(".gear .need .gtick"), todo: bg(".gear .todo .gtick"),
      check: getComputedStyle(document.querySelector(".gear .have .gtick"), "::after").borderBottomWidth }; });
  ok(gear.n === 10 && gear.ticks === 10 && gear.tags === 10 && new Set([gear.have, gear.need, gear.todo]).size === 3 && parseFloat(gear.check) >= 2,
    "the gear list paints its state: a real tick on what is owned, and to get and to check each look different", gear);

  // ---- the map ----------------------------------------------------------------
  for (const id of ["overcast", "night"]) {
    await open(id, SCREENS[SCREENS.length - 1]);
    const map = await page.evaluate(() => { const cs = getComputedStyle, box = document.querySelector(".mapbox"), hot = document.querySelector(".leaflet-marker-icon.mk.hot i"), lab = document.querySelector(".leaflet-marker-icon.mk.hot b"), leg = document.querySelector(".legend"), at = document.querySelector(".leaflet-control-attribution");
      const col = (c) => { const x = document.createElement("canvas").getContext("2d"); x.fillStyle = c; x.fillRect(0, 0, 1, 1); return [...x.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const gold = col(cs(document.documentElement).getPropertyValue("--gold")), px = cs(hot).backgroundImage;
      return { chart: /gradient/.test(cs(box).backgroundImage), lifted: /rgb|color/.test(cs(box).boxShadow), goldPin: /gradient/.test(px), glow: cs(hot).boxShadow.split("rgb").length + cs(hot).boxShadow.split("color(").length > 4, gold,
        label: lab ? cs(lab).backgroundColor : "", legend: cs(leg).backgroundColor, credit: at ? cs(at).backgroundColor : "", chips: document.querySelectorAll("[data-days] .chip").length, lit: document.querySelectorAll('[data-days] .chip[aria-current="true"]').length, dark: document.documentElement.getAttribute("data-dark") }; });
    ok(map.chart && map.lifted && map.goldPin && map.glow, id + ": the map is a lifted card with a chart under its pins, and a hot pin is gold and glows", map);
    ok(map.label !== "rgba(0, 0, 0, 0)" && map.legend !== "rgba(0, 0, 0, 0)" && map.credit !== "rgba(0, 0, 0, 0)" && map.chips === 8 && map.lit === 1, id + ": its labels, legend, credit and days are kit parts on glass", map);
  }
  // An open pin's card is read like any other: its trip lines on the well.
  for (const id of ["golden", "night"]) {
    await open(id, SCREENS[SCREENS.length - 1]);
    // a pin of one spot opens its card; a group zooms in until it splits
    for (let k = 0; k < 3 && !(await page.locator(".leaflet-marker-icon.mk.hot:not(.group)").count()); k++) {
      await page.locator(".leaflet-marker-icon.mk.hot.group").first().click();
      await page.waitForTimeout(400);
    }
    await page.locator(".leaflet-marker-icon.mk.hot:not(.group)").first().click();
    await page.waitForSelector(".leaflet-popup .pt");
    // The map moves under a resized window, so each line is read against the
    // solid surface it sits on (the card, or a trip's pressed-in well).
    const pairs = await page.evaluate(() => {
      const cx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      const rgb = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); return [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const wrap = getComputedStyle(document.querySelector(".leaflet-popup-content-wrapper")).backgroundImage.match(/(color\([^)]*\)|rgba?\([^)]*\)|oklab\([^)]*\))/);
      return [...document.querySelectorAll(".leaflet-popup-content b, .leaflet-popup-content small, .leaflet-popup-content .pt, .leaflet-popup-content .pt span")].map((e) => {
        const pt = e.closest(".pt");
        return { t: (e.firstChild && e.firstChild.textContent || "").trim().slice(0, 24), ink: rgb(getComputedStyle(e).color), bg: rgb(pt ? getComputedStyle(pt).backgroundColor : wrap ? wrap[1] : "#fff"), px: parseFloat(getComputedStyle(e).fontSize) };
      });
    });
    const weakPop = pairs.filter((p) => contrast(p.ink, p.bg) < (p.px >= 24 ? 3 : 4.5)).map((p) => p.t + " " + contrast(p.ink, p.bg).toFixed(2));
    ok(pairs.length >= 3 && weakPop.length === 0, id + ": an open pin's card can be read, its trip lines too", weakPop.length ? weakPop : pairs.length);
  }

  // ---- a row never ends in three dots --------------------------------------
  for (const w of [390, 360]) {
    await page.setViewportSize({ width: w, height: 844 });
    const dotted = [];
    const hashes = await page.evaluate(() => {
      const out = ["#/learn"];
      RIG.content.species.forEach((sp) => (sp.locations || []).forEach((l) => out.push("#/" + sp.id + "/" + l.id)));
      RIG.content.spots.forEach((s) => out.push("#/spot/" + s.id));
      RIG.content.types.forEach((t) => out.push("#/water/" + t.id));
      return out;
    });
    for (const h of hashes.concat([PIER, LAKE, CLAMS, "#/trips/" + encodeURIComponent("2026-11-29~salmon-redondo"), "#/trips/" + encodeURIComponent("2026-11-29~cutthroat-dash-point")])) {
      await page.evaluate((x) => { location.hash = "#/crew"; location.hash = x; }, h);
      await page.waitForTimeout(60);
      // (a row's tags are pills that wrap: each pill whole, two lines of them at most)
      const bad = await page.evaluate(() => [...document.querySelectorAll("#app .row .tx > span")].filter((e) => /…$|\.\.\.$/.test(e.textContent) || e.scrollWidth > e.clientWidth + 1 ||
        (e.matches(".tags") ? e.getBoundingClientRect().height > 64 || [...e.children].some((p) => p.scrollWidth > p.clientWidth + 1) : e.getBoundingClientRect().height > 44)).map((e) => e.textContent.slice(0, 50)));
      bad.forEach((b) => dotted.push(h + ": " + b));
    }
    ok(dotted.length === 0, "at " + w + " px no row in the library or on a run card ends in three dots, is cut, or runs past two lines", dotted.slice(0, 6).join(" | "));
    // A run card's day chip and its HOT or GOOD tag share one row: the tag
    // never floats alone over the picture.
    const rows = [];
    for (const h of [LAKE, CLAMS, "#/trips/" + encodeURIComponent("2026-11-29~salmon-redondo")]) {
      await page.evaluate((x) => { location.hash = "#/crew"; location.hash = x; }, h);
      await page.waitForSelector('[data-view="hot"] .hero .chips .tag');
      rows.push(await page.evaluate(() => new Set([...document.querySelectorAll('[data-view="hot"] .hero .chips > *')].map((c) => Math.round(c.getBoundingClientRect().top / 8))).size));
    }
    ok(rows.every((n) => n === 1), "at " + w + " px a run card's chips stay on one row", rows);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ---- a title that wraps reads at dawn ---------------------------------------
  // Dawn is the hard sky: a pale title made for the dark upper sky. With its
  // own shadow taken off, less than 12% of a title's letters' box may sit on
  // picture it cannot be read against (3 to 1).
  for (const w of [360, 390]) {
    await page.setViewportSize({ width: w, height: 844 });
    const weak = [];
    for (const h of [LAKE, CLAMS, "#/trips/" + encodeURIComponent("2026-11-29~salmon-redondo"), "#/squid/redondo/squid-feel", "#/learn/rod-length"]) {
      await sky("dawn", h);
      await page.waitForSelector(".hero h1");
      const s = await lowShare(page, w);
      if (s.share >= 0.12) weak.push(s.t + " " + s.share.toFixed(2));
    }
    ok(weak.length === 0, "at " + w + " px under dawn every wrapped title reads against the picture behind it", weak);
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // ---- readable under every sky the engine has -------------------------------
  for (const id of SKIES) {
    const bad = [];
    let n = 0;
    for (const s of SCREENS) {
      await open(id, s);
      const r = await unreadable(page);
      n += r.n;
      if (r.n < 8 || r.bad.length) bad.push(s.name + ": " + (r.bad.slice(0, 4).join(" | ") || "only " + r.n + " checked"));
    }
    ok(bad.length === 0, id + ": every word on every library screen and the map can be read (" + n + " checked)", bad.slice(0, 5).join(" || "));
  }
  // One motion still: the shimmer on the water, nothing in a tile or a plate.
  await sky("overcast", "#/water");
  const moving = await page.evaluate(() => document.getAnimations().map((a) => a.animationName || "other"));
  ok(moving.length >= 1 && moving.every((x) => x === "shim"), "the only thing that moves on a library screen is the shimmer on the water", moving.join(","));
  ok(await page.evaluate(() => document.querySelectorAll("#scene, .scene").length) === 1, "still one scene on the page: the tiles are views, not scenes");
  ok(errors.length === 0, "no page errors", errors.join(" | "));

  // Surf perch run March to October: in a spring week a surf perch trip is on
  // Hot Trips, painted as the surf, and its run card stands under the ocean
  // beach, readable under every sky.
  {
    const c3 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c3, { days: SPRING_DAYS, now: SPRING_NOW });
    const p3 = await c3.newPage();
    await p3.clock.setFixedTime(SPRING_NOW);
    const errs3 = []; p3.on("pageerror", (e) => errs3.push(e.message));
    await p3.goto(base + "#/trips", { waitUntil: "load" });
    await p3.waitForSelector("[data-day] [data-hot]");
    const perchRows = await p3.evaluate(() => [...document.querySelectorAll('[data-hot^="surfperch-"]')].map((r) => ({ id: r.dataset.hot, kind: r.querySelector(".tile").dataset.mini, kids: r.querySelectorAll(".tile svg *").length })));
    ok(perchRows.length >= 1 && perchRows.every((r) => r.kind === "surf" && r.kids > 5), "in spring a surf perch trip is on Hot Trips, its row painted as the surf", perchRows);
    const PERCH = "#/trips/" + encodeURIComponent(SPRING_DAYS[5] + "~surfperch-westport");
    for (const id of SKIES) {
      await p3.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/crew"; location.hash = h; }, [id, PERCH]);
      await p3.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
      await p3.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
      await p3.waitForTimeout(80);
      const got = await p3.evaluate(() => {
        const s = document.getElementById("scene"), sb = s.getBoundingClientRect(), b = document.querySelector('[data-view="hot"] [data-read]').getBoundingClientRect();
        return { kind: s.dataset.scene, kids: s.querySelectorAll("svg *").length, crosses: b.top < sb.bottom - 24 && b.bottom > sb.bottom };
      });
      const r = await unreadable(p3);
      ok(got.kind === "surf" && got.kids > 30 && got.crosses && r.n >= 8 && r.bad.length === 0, id + ": a surf perch trip's run card stands under the ocean beach, its read crossing the waterline, every word readable", [got, r.bad.slice(0, 4)]);
    }
    // (fix-1, look-14) Lake Fenwick's run card: its near shore tree stands clear of the title's tags,
    // so the title, the chips and the tag read under every sky
    const FEN = "#/trips/" + encodeURIComponent(SPRING_DAYS[5] + "~trout-fenwick"), fenBad = [];
    for (const id of SKIES) {
      await p3.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/crew"; location.hash = h; }, [id, FEN]);
      await p3.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
      await p3.waitForSelector('[data-view="hot"] [data-sec-row="plan"]');
      await p3.waitForTimeout(80);
      const r = await unreadable(p3, ".hero");
      if (r.n < 4 || r.bad.length) fenBad.push(id + ": " + (r.bad.join(" | ") || "only " + r.n));
    }
    ok(fenBad.length === 0, "Lake Fenwick's run card: its title, chips and tag read under every sky", fenBad.join(" || "));
    // and its long title reads at dawn, at 360 and at 390
    const perchDawn = [];
    for (const w of [360, 390]) {
      await p3.setViewportSize({ width: w, height: 844 });
      await p3.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/crew"; location.hash = h; }, ["dawn", PERCH]);
      await p3.waitForFunction(() => document.documentElement.getAttribute("data-sky") === "dawn");
      await p3.waitForSelector('[data-view="hot"] .hero h1');
      await p3.waitForTimeout(80);
      perchDawn.push(+(await lowShare(p3, w)).share.toFixed(3));
    }
    ok(perchDawn.every((s) => s < 0.12), "a surf perch trip's long title reads against the picture at dawn", perchDawn);
    ok(errs3.length === 0, "no page errors in the spring week", errs3.join(" | "));
    await c3.close();
  }

  // The map with tiles: a pinned clock stops Leaflet's fades and its pan, so
  // this one runs its clock. A stand-in image serves as every tile.
  {
    const c6 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c6);
    const img = readFileSync(resolve(ROOT, "rigs/icon-v4-180.png"));
    await c6.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: "image/png", body: img }));
    const p6 = await c6.newPage();
    await p6.clock.install({ time: NOW });
    await p6.goto(base + "#/trips/map", { waitUntil: "load" });
    await p6.waitForSelector(".leaflet-tile-loaded");
    await p6.clock.runFor(1500);
    for (let k = 0; k < 3 && !(await p6.locator(".leaflet-marker-icon.mk.hot:not(.group)").count()); k++) {
      await p6.locator(".leaflet-marker-icon.mk.hot.group").first().click();
      await p6.clock.runFor(1200);
    }
    await p6.locator(".leaflet-marker-icon.mk.hot:not(.group)").first().click();
    await p6.waitForSelector(".leaflet-popup .pt");
    await p6.clock.runFor(1200);
    await p6.waitForTimeout(300);
    const m6 = await p6.evaluate(() => { const box = document.querySelector(".mapbox").getBoundingClientRect(), pop = document.querySelector(".leaflet-popup-content-wrapper").getBoundingClientRect();
      return { tiles: [...document.querySelectorAll(".leaflet-tile")].filter((t) => getComputedStyle(t).opacity === "1").length, inside: pop.top >= box.top - 1 && pop.bottom <= box.bottom + 1 && pop.left >= box.left - 1 && pop.right <= box.right + 1 }; });
    ok(m6.tiles >= 1 && m6.inside, "with tiles the map shows them, and an open pin's card pans into the map", m6);
    await c6.close();
  }

  // Rain is painted into the wind bars under every sky, the dark ones too.
  {
    const c4 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c4, { rain: { "2026-11-28": [8, 9] } });
    const p4 = await c4.newPage();
    await p4.clock.setFixedTime(NOW);
    await p4.goto(base + "#/trips", { waitUntil: "load" });
    await p4.waitForSelector("[data-day] [data-hot]");
    const flat = [];
    for (const id of SKIES) {
      await p4.evaluate(([i, h]) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/crew"; location.hash = h; }, [id, LAKE]);
      await p4.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
      await p4.waitForSelector('[data-sec-row="wx"] svg.windbars');
      const r = await p4.evaluate(() => { const w = document.querySelector('[data-sec-row="wx"]'), wet = w.querySelector(".w-w.wet"), dry = w.querySelector(".w-w:not(.wet)");
        return { wet: wet ? getComputedStyle(wet).fill : "", dry: dry ? getComputedStyle(dry).fill : "", drops: w.querySelectorAll(".w-r").length, word: /rain/i.test(w.innerText) }; });
      if (!r.wet || r.wet === r.dry || !r.drops || !r.word) flat.push(id + " " + JSON.stringify(r));
    }
    ok(flat.length === 0, "a wet half hour is painted into the wind bars, with rain falling over it, under all eight skies", flat.slice(0, 3));
    await c4.close();
  }

  // Tides that did not load are said, never passed off as a lake: a pier and
  // a clam dig keep their Tide and weather part and say what is missing.
  {
    const c5 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c5, { noTides: true });
    const p5 = await c5.newPage();
    await p5.clock.setFixedTime(NOW);
    await p5.goto(base + "#/trips", { waitUntil: "load" });
    await p5.waitForSelector("[data-day] [data-hot]");
    const said = [];
    for (const h of [PIER, CLAMS]) {
      await p5.evaluate((x) => { location.hash = "#/crew"; location.hash = x; }, h);
      await p5.waitForSelector('[data-view="hot"] [data-sec-row="wx"]');
      const tile = (await p5.locator('[data-sec-row="wx"]').innerText()).replace(/\s+/g, " ");
      await p5.evaluate((x) => { location.hash = x; }, h + "/wx");
      await p5.waitForSelector('[data-view="card"] .card');
      const page5 = { title: (await p5.locator(".hero h1").innerText()).trim(), box: (await p5.locator(".card .box.red").allInnerTexts()).join(" ") };
      said.push({ h, ok: /^Tide and weather/.test(tile) && /Tides did not load/.test(tile) && page5.title === "Tide and weather" && /tides did not load/i.test(page5.box), tile, page5 });
    }
    ok(said.every((s) => s.ok), "with no tides from NOAA, a pier and a clam dig say the tides did not load and keep their Tide and weather part", said.filter((s) => !s.ok));
    await c5.close();
  }

  // The drawings are one more file on top of the app. Without it, or without
  // the painter, the library still lists everything: plainer, never empty.
  for (const [file, what] of [["fish.js", "the fish drawings"], ["scene.js", "the painter"]]) {
    const c2 = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(c2);
    await c2.route(new RegExp("/rigs/" + file.replace(".", "\\.")), (r) => r.abort());
    const p2 = await c2.newPage();
    await p2.clock.setFixedTime(NOW);
    const errs2 = []; p2.on("pageerror", (e) => errs2.push(e.message));
    await p2.goto(base + "#/fish", { waitUntil: "load" });
    await p2.waitForSelector(".pickcard[data-species]");
    // (the app's own fish: the lake fish come after, with rigs/lakes.js)
    const f = await p2.evaluate(() => ({ tiles: document.querySelectorAll(".pickcard[data-species]").length, named: [...document.querySelectorAll(".pickcard[data-species] .nm")].filter((n) => n.textContent.trim()).length, wide: document.documentElement.scrollWidth }));
    await p2.goto(base + "#/water", { waitUntil: "load" });
    await p2.waitForSelector("[data-type-tile]");
    const w = await p2.evaluate(() => ({ tiles: document.querySelectorAll("[data-type-tile]").length, held: [...document.querySelectorAll("[data-type-tile] .pic")].filter((x) => x.querySelector("svg") || /gradient/.test(getComputedStyle(x).backgroundImage)).length }));
    await p2.goto(base + "#/chum/green-river", { waitUntil: "load" });
    await p2.waitForSelector('[data-view="species"] [data-row]');
    const sp = await p2.evaluate(() => document.querySelectorAll('[data-view="species"] [data-row]').length);
    ok(f.tiles === 12 && f.named === 12 && f.wide <= 390 && w.tiles === 7 && w.held === 7 && sp >= 10 && errs2.length === 0, "without " + what + " Fish, Water and a fish's page still list everything, each tile holding its place", [f, w, sp, errs2.join(" | ")]);
    await c2.close();
  }
} catch (e) {
  fail++; console.log("FAIL threw", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
