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
// out of the forecast the page keeps. Fix round 1 adds the directions: the
// water climbs the beach, the bank and the steps the right way as the tide
// and the river rise; land never sits under the highest tide; the lawn in
// front hides the pier's feet behind it; the moon is only where it can be;
// spotNow never throws and reads the phone's own day; thumbnails keep a
// beach empty after dark where its card says so.
//
// The clock is pinned to the Sound's own time zone, so the day a trip falls
// on is the same on any machine that runs this.
process.env.TZ = "America/Los_Angeles";
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
{
  const h = paint(bon, { now: { date: D } }).innerHTML;
  ok(!/class="w-(dock|decktop|planks|pp|pile2|t[2-5]|u[2-5])"/.test(h) && !/w-rail/.test(h) && /class="w-gravel"/.test(h), "Bonney Lake paints the gravel launch, with no dock, deck, piles or rail");
  // the launch goes under along a ragged edge: no slab running on past the waterline
  ok(!/class="w-rampw"/.test(h) && /class="w-gr3"/.test(h), "Bonney Lake's gravel thins out into the water: no slab past the waterline, stones in tones");
  const am = paint(S["american-lake"], { now: { date: D } }).innerHTML;
  ok(/class="w-ramp3"/.test(am) && /class="w-rampwet"/.test(am) && !/class="w-dock"/.test(am), "American Lake's concrete ramp darkens where the water reaches it, and no dock");
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
ok(!parts(les, "house").length && parts(les, "tree").length >= 1 && parts(les, "rocks").some((r) => r.cls === "w-riprap") && parts(les, "ground").some((g) => /lawn/.test(g.cls)), "Les Davis: a lawn, a shade tree, dark riprap; Duke's (about 165 m east, 73 degrees right of this facing) is outside the picture");
ok(les.eye > lp.deck + 1.1 && les.ground && les.ground.top >= les.tideRange + 0.3, "Les Davis: the eye stands above the pier's rail (the far shore shows over it), and a beach lies under the riprap");
const dm = S["des-moines-pier"], dp = parts(dm, "pier")[0], dmL = Math.hypot(dp.segs[0].b[0] - dp.segs[0].a[0], dp.segs[0].b[1] - dp.segs[0].a[1]) + Math.hypot(dp.segs[1].b[0] - dp.segs[1].a[0], dp.segs[1].b[1] - dp.segs[1].a[1]);
const dmLamps = Math.floor((dmL - dp.lamps.from) / dp.lamps.every) + 1;
ok(dmLamps >= 6 && dmLamps <= 9 && dp.deck >= 7 && dp.segs.length === 2, "Des Moines: the long high pier, a slight bend at its end, a row of lamp posts (" + dmLamps + ")");
ok(parts(dm, "rocks").some((r) => r.pts[0][0] < 0) && parts(dm, "log").length >= 1 && parts(dm, "shrub").length === 1, "Des Moines: the breakwater at the left, driftwood and a low shrub on the beach");
const dash = S["dash-point"].stands.city, dsp = parts(dash, "pier")[0];
ok(dsp && dsp.segs[1].b[0] > dsp.segs[1].a[0] && !dsp.crowd && !dsp.lamps && parts(dash, "kayak").length === 1, "Dash Point: from the kayak launch, the L turns right (east), closed: nobody on it and no lamps");
const pd = S["point-defiance"], pdw = parts(pd, "pier")[0];
ok(!parts(pd, "house").length && !parts(pd, "woods").length && !parts(pd, "float").length, "Point Defiance: from the dock the boathouse, the marina and the firs are behind you (OpenStreetMap), so none of them is in this picture");
ok(pdw && pdw.rail === "wood" && [].concat(pdw.lamps).every((l) => l.kind === "lantern") && parts(pd, "ground").length === 1, "Point Defiance: the deck under you, the lit wooden walkway along its edge with its rail and a lantern-top lamp post");

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
// the first point of a path of that class: its y
const firstY = (h, cls) => { const m = new RegExp('class="' + cls + '" d="M(-?[\\d.]+) (-?[\\d.]+)').exec(h); return m ? +m[2] : NaN; };
const flatY = (id, tide) => firstY(paint(S[id], { now: { tide, date: D } }).innerHTML, "w-flat");
ok(flatY("redondo", 0) < flatY("redondo", 0.5) && flatY("redondo", 0.5) < flatY("redondo", 1), "Redondo: the water's edge on the flats comes toward you as the tide rises", [flatY("redondo", 0), flatY("redondo", 0.5), flatY("redondo", 1)]);
ok(flatY("dash-point", 0) < flatY("dash-point", 1) && flatY("des-moines-pier", 0) < flatY("des-moines-pier", 1), "Dash Point and Des Moines: the tide's edge comes up the beach as it rises");
ok((lo("dash-point").match(/<ellipse/g) || []).length > (hi("dash-point").match(/<ellipse/g) || []).length, "Dash Point: low tide shows more of the flats than high tide");
ok(lo("les-davis") !== hi("les-davis") && /class="w-wet"/.test(lo("les-davis")), "Les Davis: the tide stands at a different height on the pilings");
const rLo = paint(S["green-river"], { fish: "coho", now: { river: 0, date: D } }).innerHTML, rHi = paint(S["green-river"], { fish: "coho", now: { river: 1, date: D } }).innerHTML;
const pc = (h, re) => { const m = re.exec(h); return m ? +m[1] : NaN; };
ok(pc(rLo, /var\(--shore\) (\d+)%/) > pc(rHi, /var\(--shore\) (\d+)%/) && pc(rHi, /var\(--bg\)\) (\d+)%\)/) > 40 && pc(rLo, /var\(--bg\)\) (\d+)%\)/) === 0, "the Green runs clear and dark when low, up and coloured with silt (not the sky) when high");
ok(!/class="w-driftw"/.test(rLo) && /class="w-driftw"/.test(rHi) && /class="w-siltl"/.test(rHi), "high water carries drift and leaves a line of silt on the bank");
const gLo = paint(S["green-river"], { now: { river: 0, date: D } }).innerHTML, gHi = paint(S["green-river"], { now: { river: 1, date: D } }).innerHTML;
ok((gLo.match(/w-st-/g) || []).length > 0 && gLo !== gHi, "Flaming Geyser: the gravel shows more at low water");
const glac = paint(S["puyallup-sumner"], { now: { river: 0, date: D } }).innerHTML;
ok(/var\(--hz\) 68%,var\(--r2\)\) 100%/.test(glac) && pc(glac, /var\(--bg\)\)+ (\d+)%\)/) >= 20 && !/var\(--hz\) 68%/.test(rLo), "the Puyallup is glacial: milky green-grey even when low (the Green is not)");
const calm = paint(S.redondo, { now: { wind: 0 } }).innerHTML, rough = paint(S.redondo, { now: { wind: 1 } }).innerHTML;
ok(!/w-caps/.test(calm) && /w-caps/.test(rough), "whitecaps come with the wind and not on glass");
const fogged = paint(S["fox-island"], { now: { fog: 0.8 } });
ok(fogged.dataset.fog === "" && fogged.props["--fog"] === "0.8" && /w-fog/.test(fogged.innerHTML), "fog veils the far things");
const full = paint(S.redondo, { now: { moon: 1 } }), dark = paint(S.redondo, { now: { moon: 0 } });
ok(full.props["--moon"] === "1" && dark.props["--moon"] === "0", "the moon's light is handed to the sky's night");
const rained = paint(S.redondo, { now: { rain: 0.7 } });
ok(rained.props["--rainx"] === "0.7" && !("--rain" in rained.props), "rain is handed to the scene's grain, never lowering the Rain sky's own");
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
ok(/w-farrock/.test(os("perch")) && !/w-farrock/.test(os("clams")), "Ocean Shores: the north jetty's tip at the surf perch stand, not on the Copalis dig");
// everything across the water by bearing: the jetty's tip and Copalis Rock
const osP = Object.assign({}, S["ocean-shores"], S["ocean-shores"].stands.perch), osC = Object.assign({}, S["ocean-shores"], S["ocean-shores"].stands.copalis);
const rel = (b, f) => ((((b - f) % 360) + 540) % 360) - 180;
ok(osP.jetty.tip === 203 && osP.jetty.tipX === undefined && Math.abs(rel(203, osP.facing)) <= osP.fov, "the north jetty is placed by its bearing (203), its tip at the edge of the surf perch picture");
const noStack = Object.assign({}, osC); delete noStack.stack;
ok(osC.stack && osC.stack.at === 347 && Math.abs(rel(347, osC.facing)) > 45 && paint(osC, { now: { date: D } }).innerHTML === paint(noStack, { now: { date: D } }).innerHTML, "Copalis Rock is placed by its bearing (84 degrees right): outside the clam picture, so not drawn");
const wpB = Object.assign({}, S.westport, S.westport.stands.beach);
ok(wpB.jetty.tip === 283 && osP.dune !== wpB.dune && osP.after === "empty" && wpB.after === "empty", "the two surf perch beaches: their own jetty sides and dunes, nobody after dark at either");
ok(paint(osP, { now: { date: D } }).innerHTML !== paint(Object.assign({}, osP, { spot: "westport" }), { now: { date: D } }).innerHTML, "a beach's people, log and dune are its own (seeded by its id)");
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
data.flow["green-river"].days = { "2026-11-24": { max: 1000 } };
const nowR = RIG.spotNow("redondo", "2026-11-24T09:00", data);
ok(Math.abs(nowR.tide - (2 + 9 * 0.5) / 12) < 0.02 && Math.abs(nowR.tideM - (2 + 9 * 0.5) * 0.3048) < 0.02 && Math.abs(nowR.wind - 0.5) < 0.01 && Math.abs(nowR.rain - 0.5) < 0.01 && nowR.date === "2026-11-24T09:00", "spotNow: Redondo's tide halfway up its flood (and in metres), a 9 mph breeze, some rain", nowR);
const nowG = RIG.spotNow("green-river", "2026-11-24T09:00", data);
ok(Math.abs(nowG.river - 0.5) < 0.01 && nowG.tide === undefined, "spotNow: the Green's flow that day through its own good line (1,000 of a 1,200 Go is 0.5), no tide on a river", nowG);
ok(JSON.stringify(RIG.spotNow("nowhere", "2026-11-24T09:00", data)) === JSON.stringify({ date: "2026-11-24T09:00" }), "spotNow: a spot with no data is just the moment");
// the trip's own day, not today's gauge; Go always paints clear, No-go always up
const sat = RIG.spotNow("green-river", new Date(2026, 10, 28, 8), { flow: { "green-river": { now: { cfs: 3500 }, days: { "2026-11-28": { max: 400 } } } } });
ok(sat.river < 0.3 && sat.date === "2026-11-28T08:00", "spotNow: a Saturday trip paints Saturday's forecast (400 cfs: clear), not today's 3,500", sat);
const cow = RIG.spotNow("cowlitz", "2026-11-24T09:00", { flow: { cowlitz: { days: { "2026-11-24": { max: 12000 } } } } }), grn = RIG.spotNow("green-river", "2026-11-24T09:00", { flow: { "green-river": { days: { "2026-11-24": { max: 1200 } } } } });
ok(Math.abs(cow.river - 0.6) < 0.01 && Math.abs(grn.river - 0.6) < 0.01, "spotNow: 'Go' at the Cowlitz and 'Go' at the Green paint the same water", [cow, grn]);
const nogo = RIG.spotNow("green-river", "2026-11-24T09:00", { flow: { "green-river": { days: { "2026-11-24": { max: 2600 } } } } });
ok(nogo.river === 1, "spotNow: past the no-go line the river paints fully up");
// odd input: never a throw, always the phone's own day
let threw2 = null, g1, g2, g3;
try { g1 = RIG.spotNow("redondo", "garbage", data); g2 = RIG.spotNow("redondo", 17.5, data); g3 = RIG.spotNow("redondo", "2026-11-24", data); } catch (e) { threw2 = e.message; }
ok(!threw2 && JSON.stringify(g1) === "{}" && JSON.stringify(g2) === "{}", "spotNow: a time it cannot read gives nothing and never throws", [threw2, g1, g2]);
ok(g3 && g3.date === "2026-11-24T12:00" && g3.tide != null, "spotNow: a bare day is that local day at noon (not UTC midnight, the evening before)", g3);
const eve = RIG.spotNow("redondo", new Date(2026, 10, 24, 19, 0), data);
ok(eve.date === "2026-11-24T19:00", "spotNow: an evening trip stays on its own day", eve);
ok(RIG.spotNow("redondo", new Date(2026, 10, 24, 19, 0), data, { moon: 0.42 }).moon === 0.42, "spotNow: the trip's own moon is passed through");

// ---- 12. which way the water goes as it rises (fix round 1) ------------------------------------
// the surf: the wash comes up the sand toward you with the tide
const surfY = (tide) => firstY(paint(S["ocean-shores"], { activity: "perch", now: { tide, date: D } }).innerHTML, "w-wash");
ok(surfY(0) < surfY(0.5) && surfY(0.5) < surfY(1) && surfY(1) - surfY(0) >= 20, "the surf: the wash line comes toward you as the tide rises, and far enough to see", [surfY(0), surfY(1)]);
// a river's own bank: the water climbs it toward you as the river rises
const bankY = (id, cls, lvl, x) => firstY(paint(S[id], Object.assign({ now: { river: lvl, date: D } }, x || {})).innerHTML, cls);
ok(bankY("green-river", "w-lawn", 0, { fish: "coho" }) < bankY("green-river", "w-lawn", 1, { fish: "coho" }), "the Narrows: high water climbs the meadow bank toward you");
ok(bankY("puyallup-orting", "w-levee", 0) < bankY("puyallup-orting", "w-levee", 1) && bankY("puyallup-sumner", "w-lawn", 0) < bankY("puyallup-sumner", "w-lawn", 1), "Orting and Sumner: high water climbs the levee and the point toward you");
ok(/class="w-mudb"/.test(paint(S["puyallup-sumner"], { now: { river: 0, date: D } }).innerHTML), "low water leaves a strip of mud and gravel along the bank");
// Flaming Geyser's gravel: less of it as the river rises
ok(bankY("green-river", "w-barg", 0) < bankY("green-river", "w-barg", 1), "Flaming Geyser: the gravel at your feet goes under as the river rises");
// the Cowlitz steps: the farthest (lowest) tier goes under first
const tiers = (lvl) => { const m = /class="w-conc" d="([^"]*)"/.exec(paint(S.cowlitz, { now: { river: lvl, date: D } }).innerHTML); return m ? (m[1].match(/Z/g) || []).length : 0; };
ok(tiers(0) === 3 && tiers(0.35) === 3 && tiers(0.6) === 2 && tiers(1) === 1, "the Cowlitz platforms: the river covers the lowest tier first, then the next", [tiers(0), tiers(0.35), tiers(0.6), tiers(1)]);
// no land under the highest tide: each beach's top is above its range, and so is every thing on it
for (const id of Object.keys(S)) for (const [name, o] of stands(S[id])) {
  if (!o.ground) continue;
  const rng = o.tideRange == null ? 3.7 : o.tideRange, low = (o.parts || []).filter((p) => ["shrub", "log", "ground"].indexOf(p.t) >= 0 || (p.t === "rocks" && p.dry)).filter((p) => (p.y == null ? 99 : p.y) < rng + 0.3 && !(p.pts && p.pts.some((q) => q[2] >= rng + 0.3)));
  ok(o.ground.top >= rng + 0.3 && !low.length, id + (name ? " (" + name + ")" : "") + ": its beach top and everything on the dry beach stand above the highest tide", { top: o.ground.top, rng, low });
  const pl = RIG.water.place(Object.assign({}, o, { now: { tide: 1, date: D } }));
  ok(pl.wl < o.ground.top && pl.edgeZ > o.ground.shore, id + (name ? " (" + name + ")" : "") + ": at the top of the tide a strip of dry beach still shows");
}
// minus tides: the page's metres go below the low datum, and the flats show more
ok(RIG.water.place(Object.assign({}, S["dash-point"], S["dash-point"].stands.city, { now: { tideM: -0.8 } })).edgeZ > RIG.water.place(Object.assign({}, S["dash-point"], S["dash-point"].stands.city, { now: { tide: 0 } })).edgeZ, "a minus tide uncovers more of the Dash Point flats than a zero tide");
// the lawn in front hides the pier's feet behind it: ground is painted in its place among the things, not under all of them
const ldh = paint(S["les-davis"], { now: { tide: 0, date: D } }).innerHTML;
ok(ldh.indexOf('class="w-lawnlit"') > ldh.indexOf('class="w-brace'), "Les Davis: the lawn is painted after (over) the pier's bents beyond it, so no pile runs down across the lawn");
// the moon only where it can be at that hour
const mp = (id, when, x) => paint(Object.assign({}, S[id], x || {}), { now: { date: when } }).dataset.moonpos;
ok(mp("lake-fenwick", "2026-11-24T19:00") === "ahead" && mp("dash-point", "2026-11-24T19:00") !== "ahead" && mp("redondo", "2026-11-24T19:00") === "behind", "the full moon of Nov 24 at 7 PM is ahead at Lake Fenwick (east), never on the water at north-facing Dash Point, behind you at Redondo");
ok(mp("lake-fenwick", "2026-11-24T10:00") === "down" && mp("w-l2668", "2026-11-24T19:00") === "none", "the moon down by day paints no moon; a lake with no facing gets none on its water");
for (const id of ["dash-point", "point-defiance", "les-davis", "american-lake"]) for (const h of ["18:00", "20:00", "22:00", "02:00"]) {
  const when = (h === "02:00" ? "2026-11-25T" : "2026-11-24T") + h, o = Object.assign({}, S[id], S[id].stands ? S[id].stands[S[id].stand] : {}), m = RIG.water.moonSky(new Date(+when.slice(0, 4), +when.slice(5, 7) - 1, +when.slice(8, 10), +when.slice(11, 13)));
  if (mp(id, when) === "ahead") ok(m.alt > 0 && Math.abs(rel(m.az, o.facing)) <= (o.fov || 45), id + " at " + when + ": a moon on the water only where it really stands in the picture");
}
// a beach that is empty after dark stays empty in its row's thumbnail
for (const [id, act] of [["westport", "perch"], ["ocean-shores", "perch"]]) {
  const m = RIG.water.mini("surf", pal.night, Object.assign({ now: { date: D } }, S[id], { activity: act }));
  ok(!/r="5" fill="url\(#mn\d+g\)"/.test(m) && !/M25.2 39.6/.test(m), id + " (surf perch): the night thumbnail has no one on the beach and no headlamp");
}
for (const id of ["fox-island", "green-river", "lake-fenwick", "tokul"]) {
  const m = RIG.water.mini(S[id].scene, pal.night, Object.assign({ now: { date: D } }, S[id]));
  ok(!/fill="url\(#mn\d+g\)"/.test(m), id + ": a spot that closes at dusk has no lamp in its night thumbnail");
}
// Lake Tapps' drawdown is a season on the day painted
const tp = (d) => /class="w-stump"/.test(paint(S["lake-tapps"], { now: { date: d } }).innerHTML);
ok(tp("2026-11-24") && !tp("2027-06-15"), "Lake Tapps: stumps and mud in the drawdown, not once it is full again");
// the Sumner crowd is the opener's
const crowd = (d) => { const m = /class="w-figh" d="([^"]*)"/.exec(paint(S["puyallup-sumner"], { now: { date: d } }).innerHTML); return m ? m[1].length : 0; };
ok(crowd("2026-08-22") > crowd("2026-11-24"), "Sumner: the opening-weekend crowd only around the opener");
// 128th St E has no facing: its river runs along the view, no side to it
ok(S["puyallup-128th"].river.flow === "along", "128th St E: looking along the river under the bridge, so it runs neither left nor right");
// the feed lakes: each its own bank and shore, none a dock
ok(JSON.stringify(RIG.spotScene("w-l2668").lake.bank) !== JSON.stringify(RIG.spotScene("w-l1536").lake.bank) || JSON.stringify(RIG.spotScene("w-l2668").lake.point) !== JSON.stringify(RIG.spotScene("w-l1536").lake.point), "Kapowsin and Green Lake: a bank and a point of their own");

console.log("\n" + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
