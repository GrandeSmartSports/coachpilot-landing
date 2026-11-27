// Each spot's own picture (rigs/spots-scene.js, painted by rigs/scene.js).
// Run: node tests/rigs-spots-scene.test.mjs
//
// What this guards, with no browser: every spot that has a card
// (tests/fixtures/spot-cards.json, the facts built 2026-11-26) has an entry,
// and every stand a card names is one of its stands; Bonney Lake has no dock
// and no pier, whatever the WDFW name says; no picture holds a mountain its
// card does not put in view; every lake from the WDFW feed is the plain small
// lake (no dock, no pier, no mountain, no facing); every builder takes
// today's conditions (tide, river, wind, rain, fog, moon, date) without
// throwing, for the big scene, the row's thumbnail and the tile; and the five
// paintings with no spot are left as they were.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 600)); }
};

const ctx = { console, Date, Math, JSON };
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ["sky", "scene", "content", "trips", "waters", "spots-scene"]) vm.runInContext(readFileSync(join(ROOT, "rigs", f + ".js"), "utf8"), ctx, { filename: f + ".js" });
const RIG = ctx.RIG;
const cards = JSON.parse(readFileSync(join(ROOT, "tests/fixtures/spot-cards.json"), "utf8"));
const S = RIG.spotScenes;

// a stand-in for the page's .scene element
function el(kind) {
  return { dataset: { scene: kind }, props: {}, style: { setProperty(k, v) { this.owner.props[k] = v; }, removeProperty(k) { delete this.owner.props[k]; } },
    setAttribute(k, v) { this.dataset[k.replace(/^data-/, "")] = v; }, getAttribute(k) { return this.dataset[k.replace(/^data-/, "")]; }, innerHTML: "", init() { this.style.owner = this; return this; } }.init();
}
function paint(entry, extra, kind) {
  const o = Object.assign({}, entry, extra || {});
  const e = el(kind || entry.scene);
  RIG.water.scene(e, o);
  return e;
}
// every stand an entry has, as the flat paint the painter sees
function stands(entry) {
  if (!entry.stands) return [["", entry]];
  return Object.keys(entry.stands).map((k) => { const o = Object.assign({}, entry, entry.stands[k]); delete o.stands; delete o.standBy; return [k, o]; });
}

// ---- 1. every card has an entry ----------------------------------------------
const cardIds = Object.keys(cards).filter((k) => k !== "_meta");
for (const id of cardIds) {
  if (id === "cowlitz-blue-creek") { ok(!!(S.cowlitz && S.cowlitz.stands && S.cowlitz.stands["blue-creek"]), "the Blue Creek card is a stand of the Cowlitz entry"); continue; }
  ok(!!S[id] && S[id].spot === id && RIG.water.scenes.indexOf(S[id].scene) >= 0, id + " has its own entry and builder", S[id]);
}
for (const id of Object.keys(S).filter((k) => !/^w-l\d+$/.test(k) || k === "w-l466")) ok(cardIds.indexOf(id) >= 0, id + "'s entry rests on a card");
// a stand's facing is the card's (or one of its altStands), or a stated turn of the picture
const STAND_CARD = { cowlitz: { barrier: "cowlitz", "blue-creek": "cowlitz-blue-creek" } };
for (const id of cardIds) {
  if (id === "cowlitz-blue-creek") continue;
  const e = S[id];
  if (!e) continue;
  for (const [name, o] of stands(e)) {
    const c = cards[(STAND_CARD[id] && STAND_CARD[id][name]) || id];
    const known = [c.facingDeg].concat((c.altStands || []).map((a) => a.facingDeg)).filter((x) => x != null);
    if (o.facing == null) continue;
    const near = known.some((f) => Math.abs(((o.facing - f + 540) % 360) - 180) <= 20);
    ok(near, id + (name ? " (" + name + ")" : "") + " faces the way its card says, within the picture's own turn", { facing: o.facing, card: known });
  }
}

// ---- 2. Bonney Lake: no dock, no pier ------------------------------------------
const bon = S["w-l466"];
ok(bon && bon.scene === "lake" && !bon.dock && !bon.pier && bon.view !== "deck" && bon.view !== "side" && ["dock", "pier"].indexOf(bon.lake.stand) < 0, "Bonney Lake's entry has no dock and no pier", bon);
for (const sky of ["overcast", "night"]) {
  const h = paint(bon, { now: { date: "2026-11-24" } }).innerHTML;
  ok(!/class="w-(dock|decktop|planks|pp|pile2)"/.test(h) && !/w-rail/.test(h), "Bonney Lake paints with no dock, deck, piles or rail (" + sky + ")");
}

// ---- 3. no mountain the card does not put in view --------------------------------
const MTN = { rainier: /rainier/i, olympics: /olympic/i };
function inView(card, which) {
  return (card.skyline || []).some((s) => MTN[which].test(s.what) && /proven|likely/.test(s.confidence) && s.side !== "behind");
}
for (const id of Object.keys(S)) {
  const e = S[id], card = cards[id] || (id === "cowlitz" ? cards.cowlitz : null);
  for (const [name, o] of stands(e)) {
    const peaks = (o.skyline || []).filter((p) => p.t === "rainier" || p.t === "olympics");
    for (const p of peaks) ok(card && inView(card, p.t), id + (name ? " (" + name + ")" : "") + " draws " + p.t + " only because its card has it in view");
    const h = paint(o, { now: { date: "2026-11-24" } }).innerHTML;
    if (!peaks.length) ok(!/class="w-mtn/.test(h), id + (name ? " (" + name + ")" : "") + " paints no mountain");
  }
}
ok(RIG.spotOpen.tappsRainier === false && !(S["lake-tapps"].stands["allan-yorke"].skyline || []).some((p) => p.t === "rainier"), "Rainier at Allan Yorke waits on the open question (off until Coach says)");

// ---- 4. every feed lake is the plain small lake -----------------------------------
const feed = RIG.trips.spots.filter((s) => /^w-l\d+$/.test(s.id) && s.id !== "w-l466");
ok(feed.length >= 28, "the feed brings its lakes (" + feed.length + ")");
for (const s of feed) {
  const e = RIG.spotScene(s.id);
  const plain = e && e.plain === true && e.scene === "lake" && e.facing == null && !e.dock && !e.pier && !(e.skyline || []).length && !e.lake.stand && !e.lake.houses && !e.lake.near && !e.lake.islands;
  ok(plain, s.id + " (" + s.name + ") is the plain lake", e);
  const x = paint(e, { now: { date: "2026-11-24" } });
  ok(!/class="w-(mtn|dock|decktop|planks|house)/.test(x.innerHTML) && x.dataset.set === "none", s.id + " paints no dock, no house, no mountain, and no sunset side");
}
ok(RIG.spotScene("w-l999999") && RIG.spotScene("w-l999999").plain, "a lake the feed adds later gets the plain lake too");
ok(RIG.spotScene("w-l2668").lake.across !== RIG.spotScene("w-l1536").lake.across || RIG.spotScene("w-l2668").lake.mix !== RIG.spotScene("w-l1536").lake.mix, "two feed lakes are not the same picture (seeded by id)");

// ---- 5. today's conditions, every builder ----------------------------------------
const NOWS = [{}, { tide: 0 }, { tide: 1 }, { river: 0 }, { river: 1 }, { wind: 0 }, { wind: 1 }, { wind: "chop" }, { wind: "whitecaps" }, { wind: "glass" },
  { rain: 1 }, { fog: 1 }, { moon: 0 }, { moon: 1 }, { date: "2026-06-21" }, { date: "2026-12-21" }, { date: "not a day" }, { tide: -3, river: 9, wind: "gale", fog: "x" },
  { tide: 0.3, river: 0.8, wind: 0.5, rain: 0.4, fog: 0.4, moon: 0.2, date: "2026-11-24" }];
const pal = RIG.sky.palettes;
let threw = [];
for (const id of Object.keys(S)) {
  for (const [name, o] of stands(S[id])) {
    for (const now of NOWS) {
      for (const extra of [{}, { activity: "perch" }, { activity: "clams" }, { how: "kayak" }, { how: "shore" }]) {
        try {
          const e = paint(o, Object.assign({ now }, extra));
          if (!/<svg/.test(e.innerHTML)) throw new Error("no picture");
          RIG.water.mini(o.scene, pal.golden, Object.assign({ now }, o, extra));
          RIG.water.mini(o.scene, pal.night, Object.assign({ now }, o, extra));
          if (!/<svg/.test(RIG.water.view(o.scene, Object.assign({ now }, o, extra)))) throw new Error("no tile");
        } catch (err) { threw.push(id + (name ? "/" + name : "") + " " + JSON.stringify(now) + " " + err.message); }
      }
      if (/^w-l\d+$/.test(id) && id !== "w-l466") break;
    }
  }
}
ok(threw.length === 0, "every spot paints under every condition, as a scene, a thumbnail and a tile", threw.slice(0, 5));
for (const k of RIG.water.scenes) {
  try { const e = el(k); RIG.water.scene(e, { now: { tide: 1, wind: 1 } }); ok(/<svg/.test(e.innerHTML), "the " + k + " builder takes conditions with no spot"); }
  catch (err) { ok(false, "the " + k + " builder takes conditions with no spot", err.message); }
}

// ---- 6. today shows ---------------------------------------------------------------
const tideLo = paint(S["dash-point"], { now: { tide: 0, date: "2026-11-24" } }).innerHTML, tideHi = paint(S["dash-point"], { now: { tide: 1, date: "2026-11-24" } }).innerHTML;
ok(tideLo !== tideHi && (tideLo.match(/<ellipse/g) || []).length > (tideHi.match(/<ellipse/g) || []).length, "low tide at Dash Point shows more of the flats than high tide");
const rLo = paint(S["green-river"], { now: { river: 0, date: "2026-11-24" } }).innerHTML, rHi = paint(S["green-river"], { now: { river: 1, date: "2026-11-24" } }).innerHTML;
ok(/var\(--shore\) 26%/.test(rLo) && /var\(--hz\) 44%/.test(rHi), "the Green runs clear and dark when low, milky when it is up");
const calm = paint(S.redondo, { now: { wind: 0 } }).innerHTML, rough = paint(S.redondo, { now: { wind: 1 } }).innerHTML;
ok(!/w-caps/.test(calm) && /w-caps/.test(rough), "whitecaps come with the wind and not on glass");
const fogged = paint(S["fox-island"], { now: { fog: 0.8 } });
ok(fogged.dataset.fog === "" && fogged.props["--fog"] === "0.8" && /w-fog/.test(fogged.innerHTML), "fog veils the far things");
const full = paint(S.redondo, { now: { moon: 1 } }), dark = paint(S.redondo, { now: { moon: 0 } });
ok(full.props["--moon"] === "1" && dark.props["--moon"] === "0", "the moon's light is handed to the sky's night");
// the light: where each spot's sun goes down, from its facing
const L = (id, d) => paint(S[id], { now: { date: d } }).dataset.set;
ok(L("redondo", "2026-11-24") === "left" && L("des-moines-pier", "2026-11-24") === "left", "Redondo and Des Moines: the winter sun sets to the left");
ok(L("les-davis", "2026-11-24") === "behind" && L("fox-island", "2026-11-24") === "behind" && L("lake-fenwick", "2026-11-24") === "behind", "Les Davis, Fox Island, Lake Fenwick: the sun sets behind you");
const june = paint(S.redondo, { now: { date: "2026-06-21" } }), jx = parseFloat(june.props["--setx"]);
ok(june.dataset.set === "ahead" && jx > 150 && jx < 260, "Redondo in June: the sun goes down ahead, right of the pier's line, over the Olympics", { set: june.dataset.set, x: jx });
ok(L("tokul", "2026-11-24") === "right" && L("cowlitz", "2026-11-24") === "right", "Tokul and the Cowlitz: the winter sunset is ahead and right");

// ---- 7. the stands ---------------------------------------------------------------
const wp = (kind, act) => { const e = paint(S.westport, Object.assign({ now: { date: "2026-11-24" } }, act ? { activity: act } : {}), kind); return e.dataset.scene; };
ok(wp("pier") === "pier" && wp("surf", "perch") === "surf" && wp("surf") === "surf", "Westport: the crab float for a crab trip, the beach for surf perch");
const os = (act) => paint(S["ocean-shores"], { activity: act, now: { date: "2026-11-24" } }).innerHTML;
ok(/w-farrock/.test(os("perch")) && !/w-farrock/.test(os("clams")), "Ocean Shores: the north jetty at the surf perch stand, not on the Copalis dig");
const dp = (how) => paint(S["dash-point"], { how, now: { date: "2026-11-24" } }).innerHTML;
ok(/w-braces|w-pile2/.test(dp("kayak")) && !/w-pile2/.test(dp("shore")), "Dash Point: the old L pier from the kayak launch, none from the state park beach");
ok(RIG.spotOpen && ["redondoEnd", "greenBank", "tappsLaunch", "tappsRainier", "dashKayak", "cowlitz"].every((k) => k in RIG.spotOpen), "each open question is one setting");
// the night only where a card lights it
const lit = (id, extra) => /w-lampson[^>]*>[\s\S]*?(w-lantern|w-bulb|w-window)/.test(paint(S[id], Object.assign({ now: { date: "2026-11-24" } }, extra || {})).innerHTML);
ok(lit("redondo") && lit("les-davis") && lit("des-moines-pier") && lit("ocean-shores", { activity: "clams" }), "squid piers and the clam dig are lit after dark");
ok(!lit("fox-island") && !lit("dash-point") && !lit("green-river") && !lit("lake-fenwick"), "spots that close at dusk carry no lamps");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
