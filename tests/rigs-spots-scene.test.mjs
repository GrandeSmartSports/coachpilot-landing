// Each spot's own picture (rigs/spots-scene.js, painted by rigs/scene.js).
// Run: node tests/rigs-spots-scene.test.mjs
//
// What this guards, with no browser: every spot that has a card
// (tests/fixtures/spot-cards.json, the facts as of 2026-11-27 with Coach's own
// pictures) has an entry or is a named stand of one; Bonney Lake has no dock
// and no pier, whatever the WDFW name says; no picture holds a mountain its
// card does not put in view (and none at any Puyallup spot); what Coach's
// pictures settled is there (Redondo's T-head, lamps, float and ramp; Les
// Davis's shelters and Duke's; the Des Moines lamp row and breakwater; the
// Dash Point L, closed and empty; the white boathouse); the Green paints the
// Auburn Narrows for a salmon trip and Flaming Geyser otherwise; every lake
// from the WDFW feed is the plain small lake; every builder takes today's
// conditions (tide, river, wind, rain, fog, moon, date) without throwing, for
// the big scene, the row's thumbnail and the tile; today shows (tide on the
// flats, the river's colour, wind, fog, moon); and RIG.spotNow reads today
// out of the forecast the page keeps.
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
const D = "2026-11-24";

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
// the card a stand rests on
function cardOf(id, o) { return cards[o.card || id]; }
const parts = (o, t) => (o.parts || []).filter((p) => p.t === t);

// ---- 1. every card has an entry --------------------------------------------------
const cardIds = Object.keys(cards).filter((k) => k !== "_meta");
for (const id of cardIds) {
  const c = cards[id];
  if (c.appId && c.isAppId === false) {
    const host = S[c.appId], st = host && host.stands && Object.values(host.stands).find((s) => s.card === id);
    ok(!!st, id + " is a stand of the " + c.appId + " entry");
    continue;
  }
  if (id === "green-river") { ok(!!S[id] && !!S[id].stands, "green-river (the old Fenster card) is the Green's entry, painted from its two newer cards"); continue; }
  ok(!!S[id] && S[id].spot === id && RIG.water.scenes.indexOf(S[id].scene) >= 0, id + " has its own entry and builder", S[id]);
}
for (const id of Object.keys(S).filter((k) => !/^w-l\d+$/.test(k) || k === "w-l466")) ok(cardIds.indexOf(id) >= 0, id + "'s entry rests on a card");
// a stand faces the way its card says (or its altStands), or it names the
// picture it was painted from (facingFrom) and stays near the card's line
for (const id of Object.keys(S).filter((k) => !/^w-l\d+$/.test(k) || k === "w-l466")) {
  for (const [name, o] of stands(S[id])) {
    const c = cardOf(id, o);
    if (o.facing == null) { ok(c.facingDeg == null || c.facingDeg === undefined || id === "puyallup-128th", id + (name ? " (" + name + ")" : "") + " has no facing only where its card leaves it blank"); continue; }
    const known = [c.facingDeg].concat((c.altStands || []).map((a) => a.facingDeg)).filter((x) => x != null);
    const off = Math.min(...known.map((f) => Math.abs(((o.facing - f + 540) % 360) - 180)));
    ok(off <= 20 || (o.facingFrom && off <= 40), id + (name ? " (" + name + ")" : "") + " faces the way its card says" + (o.facingFrom ? " (from " + o.facingFrom + ")" : ""), { facing: o.facing, card: known });
  }
}

// ---- 2. Bonney Lake: no dock, no pier ------------------------------------------------
const bon = S["w-l466"];
ok(bon && bon.scene === "lake" && !bon.dock && !bon.pier && !bon.parts && bon.view !== "deck" && bon.view !== "side" && ["dock", "pier"].indexOf(bon.lake.stand) < 0 && bon.lake.stand === "gravel", "Bonney Lake's entry is a gravel launch with no dock and no pier", bon);
for (const sky of ["overcast", "night"]) {
  const h = paint(bon, { now: { date: D } }).innerHTML;
  ok(!/class="w-(dock|decktop|planks|pp|pile2|t[2-5]|u[2-5])"/.test(h) && !/w-rail/.test(h) && /class="w-gravel"/.test(h), "Bonney Lake paints the gravel launch, with no dock, deck, piles or rail (" + sky + ")");
}

// ---- 3. no mountain the card does not put in view ----------------------------------------
const MTN = { rainier: /rainier/i, olympics: /olympic/i };
function inView(card, which) {
  return (card.skyline || []).some((s) => MTN[which].test(s.what) && /proven|likely/.test(s.confidence) && s.side !== "behind" && !/not visible|^no /i.test(s.what));
}
for (const id of Object.keys(S)) {
  for (const [name, o] of stands(S[id])) {
    const card = cardOf(id, o) || null;
    const peaks = (o.skyline || []).filter((p) => p.t === "rainier" || p.t === "olympics");
    for (const p of peaks) ok(card && inView(card, p.t), id + (name ? " (" + name + ")" : "") + " draws " + p.t + " only because its card has it in view");
    const h = paint(o, { now: { date: D } }).innerHTML;
    if (!peaks.length) ok(!/class="w-mtn/.test(h), id + (name ? " (" + name + ")" : "") + " paints no mountain");
  }
}
for (const id of ["puyallup-sumner", "puyallup-orting", "puyallup-128th"]) ok(!(S[id].skyline || []).length && !/w-mtn/.test(paint(S[id], { now: { date: D } }).innerHTML), id + ": no Rainier (no photo proves the view from these banks)");
ok(RIG.spotOpen.tappsRainier === false && !(S["lake-tapps"].stands["allan-yorke"].skyline || []).some((p) => p.t === "rainier"), "Rainier at Allan Yorke waits on the open question (off until settled)");
ok(!(S["des-moines-pier"].skyline || []).some((p) => p.t === "rainier") && !(S.redondo.skyline || []).some((p) => p.t === "rainier"), "no Rainier at Redondo or Des Moines (behind you)");

// ---- 4. what Coach's pictures settled -------------------------------------------------------
const red = S.redondo, rp = parts(red, "pier")[0];
ok(rp && rp.segs.length === 2 && rp.segs[1].w > rp.segs[0].w && Math.abs(rp.segs[1].a[1] - rp.segs[1].b[1]) < 0.01, "Redondo: a straight pier ending in a T-head wider than its walk");
ok([].concat(rp.lamps).some((l) => l.kind === "arm") && [].concat(rp.lamps).reduce((n, l) => n + Math.floor(((l.to == null ? 99 : l.to) - (l.from || 0)) / l.every + 1), 0) >= 3 && rp.rail === "wood", "Redondo: tall single-arm lamp posts (three or four) and wooden rails");
ok(parts(red, "float").length === 1 && parts(red, "float")[0].a[0] < 0 && parts(red, "ramp").length === 1 && parts(red, "rail").length === 1, "Redondo: the ramp, its float and pilings to the left, the seawall rail at your feet");
const les = S["les-davis"], lp = parts(les, "pier")[0];
ok(lp && lp.segs.length === 2 && (lp.shelters || []).length >= 2 && lp.lamps, "Les Davis: the long T with small roofed shelters and lamp posts");
ok(parts(les, "house").some((h) => h.piles && h.at[0] > 0) && parts(les, "tree").length >= 1 && parts(les, "rocks").length >= 1 && parts(les, "ground").some((g) => g.cls === "w-lawn"), "Les Davis: Duke's on pilings to the right, a lawn, a shade tree, the riprap");
const dm = S["des-moines-pier"], dp = parts(dm, "pier")[0], dmL = Math.hypot(dp.segs[0].b[0] - dp.segs[0].a[0], dp.segs[0].b[1] - dp.segs[0].a[1]) + Math.hypot(dp.segs[1].b[0] - dp.segs[1].a[0], dp.segs[1].b[1] - dp.segs[1].a[1]);
const dmLamps = Math.floor((dmL - dp.lamps.from) / dp.lamps.every) + 1;
ok(dmLamps >= 6 && dmLamps <= 9 && dp.deck >= 7 && dp.segs.length === 2, "Des Moines: the long high pier, a slight bend at its end, a row of lamp posts (" + dmLamps + ")");
ok(parts(dm, "rocks").some((r) => r.pts[0][0] < 0) && parts(dm, "log").length >= 1 && parts(dm, "shrub").length === 1, "Des Moines: the breakwater at the left, driftwood and a low shrub on the beach");
const dash = S["dash-point"].stands.city, dsp = parts(dash, "pier")[0];
ok(dsp && dsp.segs[1].b[0] > dsp.segs[1].a[0] && !dsp.crowd && !dsp.lamps && parts(dash, "kayak").length === 1, "Dash Point: from the kayak launch, the L turns right (east), closed: nobody on it and no lamps");
const pd = S["point-defiance"], bh = parts(pd, "house")[0];
ok(bh && bh.wall === "w-wallw" && bh.roofc === "w-roofg" && bh.roof === "hip" && bh.at[0] > 0 && parts(pd, "lamp").every((l) => l.kind === "lantern"), "Point Defiance: the white boathouse with its pale green hipped roof at the side, lantern-top lamp posts");

// ---- 5. the Green: two places, chosen by the trip ------------------------------------------
const g = S["green-river"], pick = (fish) => { const e = paint(g, Object.assign({ now: { date: D } }, fish ? { fish } : {})); return e.innerHTML; };
ok(RIG.spotGreenStand("coho") === "narrows" && RIG.spotGreenStand("chum") === "narrows" && RIG.spotGreenStand("pink") === "narrows" && RIG.spotGreenStand("king") === "narrows", "a salmon trip on the Green is the Auburn Narrows");
ok(RIG.spotGreenStand("steelhead") === "geyser" && RIG.spotGreenStand(undefined) === "geyser" && g.stand === "geyser", "the Green's own page and a steelhead trip are Flaming Geyser");
ok(g.stands.narrows.card === "green-auburn-narrows" && g.stands.geyser.card === "green-flaming-geyser", "each of the Green's places rests on its own card");
ok(!g.stands.narrows.river.bar && !g.stands.narrows.river.bridge && !g.stands.narrows.river.span && g.stands.narrows.river.flow === "left", "the Narrows: no gravel bar, no bridge (unproven), the river right to left");
ok(g.stands.geyser.river.bar && !g.stands.geyser.river.valley && g.stands.geyser.river.ridge === 4 && g.stands.geyser.river.flow === "left", "Flaming Geyser: gravel at your feet, a low ridge (not a cliff) across, the river right to left");
ok(pick("coho") !== pick() && pick("steelhead") === pick(), "the painting follows the trip's fish");

// ---- 6. the Puyallup, ready for the trips build ----------------------------------------------
const pu = (id) => S[id].river;
ok(pu("puyallup-sumner").join === "right" && pu("puyallup-sumner").glacial && pu("puyallup-sumner").flow === "right", "Sumner: the gray-green Puyallup in front, the White joining off to the right");
ok(pu("puyallup-orting").braid && pu("puyallup-orting").levee && pu("puyallup-orting").bridge === "right", "Orting: a braided gravel river, the levee trail at your feet, the road bridge to the right");
ok(pu("puyallup-128th").span && pu("puyallup-128th").fields && S["puyallup-128th"].facing == null && paint(S["puyallup-128th"], { now: { date: D } }).dataset.set === "none", "128th St E: the bridge deck and rail across, farm fields, and nothing that depends on a facing");

// ---- 7. every feed lake is the plain small lake ------------------------------------------
const feed = RIG.trips.spots.filter((s) => /^w-l\d+$/.test(s.id) && s.id !== "w-l466");
ok(feed.length >= 28, "the feed brings its lakes (" + feed.length + ")");
for (const s of feed) {
  const e = RIG.spotScene(s.id);
  const plain = e && e.plain === true && e.scene === "lake" && e.facing == null && !e.dock && !e.pier && !e.parts && !(e.skyline || []).length && !e.lake.stand && !e.lake.houses && !e.lake.near && !e.lake.islands;
  ok(plain, s.id + " (" + s.name + ") is the plain lake", e);
  const x = paint(e, { now: { date: D } });
  ok(!/class="w-(mtn|dock|decktop|planks|house)/.test(x.innerHTML) && x.dataset.set === "none", s.id + " paints no dock, no house, no mountain, and no sunset side");
}
ok(RIG.spotScene("w-l999999") && RIG.spotScene("w-l999999").plain, "a lake the feed adds later gets the plain lake too");
ok(RIG.spotScene("w-l2668").lake.across !== RIG.spotScene("w-l1536").lake.across || RIG.spotScene("w-l2668").lake.mix !== RIG.spotScene("w-l1536").lake.mix, "two feed lakes are not the same picture (seeded by id)");

// ---- 8. today's conditions, every builder ----------------------------------------------
const NOWS = [{}, { tide: 0 }, { tide: 1 }, { river: 0 }, { river: 1 }, { wind: 0 }, { wind: 1 }, { wind: "chop" }, { wind: "whitecaps" }, { wind: "glass" },
  { rain: 1 }, { fog: 1 }, { moon: 0 }, { moon: 1 }, { date: "2026-06-21" }, { date: "2026-12-21" }, { date: "not a day" }, { tide: -3, river: 9, wind: "gale", fog: "x" },
  { tide: 0.3, river: 0.8, wind: 0.5, rain: 0.4, fog: 0.4, moon: 0.2, date: D }];
const pal = RIG.sky.palettes;
const threw = [];
for (const id of Object.keys(S)) {
  for (const [name, o] of stands(S[id])) {
    for (const now of NOWS) {
      for (const extra of [{}, { activity: "perch" }, { activity: "clams" }, { how: "kayak" }, { how: "shore" }, { fish: "coho" }]) {
        try {
          const e = paint(o, Object.assign({ now }, extra));
          if (!/<svg/.test(e.innerHTML) || /NaN|undefined/.test(e.innerHTML)) throw new Error("no picture, or a broken number in it");
          for (const k of ["golden", "night", "overcast"]) if (/NaN/.test(RIG.water.mini(o.scene, pal[k], Object.assign({ now }, o, extra)))) throw new Error("thumbnail NaN");
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

// ---- 9. today shows ---------------------------------------------------------------
const lo = (id, x) => paint(S[id], Object.assign({ now: { tide: 0, date: D } }, x || {})).innerHTML, hi = (id, x) => paint(S[id], Object.assign({ now: { tide: 1, date: D } }, x || {})).innerHTML;
ok(/class="w-flat"/.test(lo("redondo")) && !/class="w-flat"/.test(hi("redondo")), "Redondo: low tide leaves the flats under the seawall, high tide covers them");
ok((lo("dash-point").match(/<ellipse/g) || []).length > (hi("dash-point").match(/<ellipse/g) || []).length, "Dash Point: low tide shows more of the flats than high tide");
ok(lo("les-davis") !== hi("les-davis") && /class="w-wet"/.test(lo("les-davis")), "Les Davis: the tide stands at a different height on the pilings");
const rLo = paint(S["green-river"], { fish: "coho", now: { river: 0, date: D } }).innerHTML, rHi = paint(S["green-river"], { fish: "coho", now: { river: 1, date: D } }).innerHTML;
ok(/var\(--shore\) 26%/.test(rLo) && /var\(--hz\) 44%/.test(rHi), "the Green runs clear and dark when low, milky when it is up");
const gLo = paint(S["green-river"], { now: { river: 0, date: D } }).innerHTML, gHi = paint(S["green-river"], { now: { river: 1, date: D } }).innerHTML;
ok((gLo.match(/w-st-/g) || []).length > 0 && gLo !== gHi, "Flaming Geyser: the gravel shows more at low water");
const glac = paint(S["puyallup-sumner"], { now: { river: 0, date: D } }).innerHTML;
ok(/var\(--hz\) 30%/.test(glac), "the Puyallup is glacial: milky even when low");
const calm = paint(S.redondo, { now: { wind: 0 } }).innerHTML, rough = paint(S.redondo, { now: { wind: 1 } }).innerHTML;
ok(!/w-caps/.test(calm) && /w-caps/.test(rough), "whitecaps come with the wind and not on glass");
const fogged = paint(S["fox-island"], { now: { fog: 0.8 } });
ok(fogged.dataset.fog === "" && fogged.props["--fog"] === "0.8" && /w-fog/.test(fogged.innerHTML), "fog veils the far things");
const full = paint(S.redondo, { now: { moon: 1 } }), dark = paint(S.redondo, { now: { moon: 0 } });
ok(full.props["--moon"] === "1" && dark.props["--moon"] === "0", "the moon's light is handed to the sky's night");
const rained = paint(S.redondo, { now: { rain: 0.7 } });
ok(rained.props["--rain"] === "0.7", "rain is handed to the scene's grain");
// the light: where each spot's sun goes down, from its facing
const L = (id, d, x) => paint(S[id], Object.assign({ now: { date: d } }, x || {})).dataset.set;
ok(L("redondo", D) === "left" && L("des-moines-pier", D) === "ahead", "Redondo: the winter sun sets left; Des Moines from the beach park: over the pier, ahead");
ok(L("les-davis", D) === "behind" && L("fox-island", D) === "behind" && L("lake-fenwick", D) === "behind", "Les Davis, Fox Island, Lake Fenwick: the sun sets behind you");
const june = paint(S.redondo, { now: { date: "2026-06-21" } }), jx = parseFloat(june.props["--setx"]);
ok(june.dataset.set === "ahead" && jx > 150 && jx < 260, "Redondo in June: the sun goes down ahead, over the Olympics", { set: june.dataset.set, x: jx });
ok(L("tokul", D) === "right" && L("cowlitz", D) === "right", "Tokul and the Cowlitz: the winter sunset is ahead and right");

// ---- 10. the stands and the night --------------------------------------------------------------
const wp = (kind, act) => { const e = paint(S.westport, Object.assign({ now: { date: D } }, act ? { activity: act } : {}), kind); return e.dataset.scene; };
ok(wp("pier") === "pier" && wp("surf", "perch") === "surf" && wp("surf") === "surf", "Westport: the crab float for a crab trip, the beach for surf perch");
const os = (act) => paint(S["ocean-shores"], { activity: act, now: { date: D } }).innerHTML;
ok(/w-farrock/.test(os("perch")) && !/w-farrock/.test(os("clams")), "Ocean Shores: the north jetty at the surf perch stand, not on the Copalis dig");
const dsh = (how) => paint(S["dash-point"], { how, now: { date: D } }).innerHTML;
ok(/class="w-s[2-5]"/.test(dsh("kayak")) && !/class="w-s[2-5]"/.test(dsh("shore")), "Dash Point: the old L pier from the kayak launch, none from the state park beach");
ok(RIG.spotOpen && ["tappsLaunch", "tappsRainier", "cowlitz", "westportCrab", "pointDefiance"].every((k) => k in RIG.spotOpen), "each open question is one setting");
const lit = (id, extra) => /w-lampson[^>]*>[\s\S]*?(w-lantern|w-bulb|w-window|lamp\))/.test(paint(S[id], Object.assign({ now: { date: D } }, extra || {})).innerHTML);
ok(lit("redondo") && lit("les-davis") && lit("des-moines-pier") && lit("point-defiance") && lit("ocean-shores", { activity: "clams" }), "squid piers, the boathouse dock and the clam dig are lit after dark");
ok(!lit("fox-island") && !lit("dash-point") && !lit("green-river") && !lit("lake-fenwick") && !lit("tokul"), "spots that close at dusk carry no lamps");
ok(/w-crowd/.test(paint(S.redondo, { now: { date: D } }).innerHTML) && !/w-crowd/.test(dsh("kayak")), "a squid crowd on Redondo's T after dark; nobody on the closed Dash Point pier");

// ---- 11. today, out of what the page already keeps ----------------------------------------------
const data = {
  tides: { "9446248": [{ t: "2026-11-24 06:00", v: 2, type: "L" }, { t: "2026-11-24 12:00", v: 11, type: "H" }] },
  flow: { "green-river": { now: { cfs: 1000, at: "x" } } },
  wx: { redondo: { hours: [{ t: "2026-11-24T09:00", wind: 9, rain: 0.05 }] } }
};
const nowR = RIG.spotNow("redondo", "2026-11-24T09:00", data);
ok(Math.abs(nowR.tide - (2 + 9 * 0.5) / 12) < 0.02 && Math.abs(nowR.wind - 0.5) < 0.01 && Math.abs(nowR.rain - 0.5) < 0.01 && nowR.date === "2026-11-24", "spotNow: Redondo's tide halfway up its flood, a 9 mph breeze, some rain", nowR);
const nowG = RIG.spotNow("green-river", "2026-11-24T09:00", data);
ok(Math.abs(nowG.river - 0.5) < 0.01 && nowG.tide === undefined, "spotNow: the Green's flow against its no-go line, no tide on a river", nowG);
ok(JSON.stringify(RIG.spotNow("nowhere", "2026-11-24T09:00", data)) === JSON.stringify({ date: "2026-11-24" }), "spotNow: a spot with no data is just the day");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
