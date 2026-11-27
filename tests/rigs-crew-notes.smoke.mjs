// Notes pinned to a part of the run card, the list, catches, new dots and the
// Tell row, on a crew trip, in the real page at phone width.
// Run: node tests/rigs-crew-notes.smoke.mjs
//
// Nothing here reaches a real server. The weather, the tides, the crew
// function, CastAI's catch log and the photo store are all stand-ins, and a
// catch-all route fails the test if the page asks Supabase for anything a
// test did not expect.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8803;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 280000);
watchdog.unref?.();

const NOW = new Date("2026-11-23T12:00:00-08:00"); // a Monday, noon
const STORE = "https://geigvuysptjvvqanumld.supabase.co/storage/v1/object/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PHONE = /\(?\b\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// A real picture, made here: a flat colour, any size.
function png(w, h, rgb) {
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = table[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4), td = Buffer.concat([Buffer.from(type), data]), sum = Buffer.alloc(4);
    len.writeUInt32BE(data.length); sum.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, sum]);
  };
  const head = Buffer.alloc(13); head.writeUInt32BE(w, 0); head.writeUInt32BE(h, 4); head[8] = 8; head[9] = 2;
  const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) row.set(rgb, 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", head),
    chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}
const FISH = png(2000, 1500, [40, 110, 150]); // what a phone hands over: bigger than the crew needs
const SMALL = png(320, 240, [200, 120, 40]);  // what the photo store serves back

// ---- the forecast: a calm week ----------------------------------------------
const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
function wxPoint() {
  const time = [], t = [], p = [], w = [], g = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); t.push(45); p.push(0); w.push(4); g.push(8); }
  return { hourly: { time, temperature_2m: t, precipitation: p, wind_speed_10m: w, wind_gusts_10m: g },
    daily: { time: DAYS, sunrise: DAYS.map((d) => `${d}T07:31`), sunset: DAYS.map((d) => `${d}T16:24`) } };
}
function marine() {
  const time = [], wave = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); wave.push(4); }
  return { hourly: { time, wave_height: wave } };
}
const tides = { predictions: DAYS.flatMap((d) => [
  { t: `${d} 04:30`, v: "11.0", type: "H" }, { t: `${d} 11:00`, v: "2.0", type: "L" },
  { t: `${d} 17:15`, v: "12.0", type: "H" }, { t: `${d} 21:00`, v: "-0.5", type: "L" }]) };
async function weather(ctx) {
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => json(r, 200, { checked: NOW.toISOString(), rules: [] }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => json(r, 200, { observed: { data: [{ validTime: "2026-11-23T19:00:00Z", primary: 0.41 }] },
    forecast: { data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }));
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    const u = route.request().url(), n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
    return json(route, 200, /marine-api/.test(u) ? Array.from({ length: n }, marine) : /open-meteo/.test(u) ? Array.from({ length: n }, wxPoint) : tides);
  });
}

// ---- the crew function, CastAI's catch log and the photo store ---------------
// A stand-in that remembers what it was told, and holds to the server's rules:
// a repeated clientId is one row, only the adder or the owner renames or
// deletes a line, only the writer or the owner deletes a note, a catch is
// linked only when its row is in that person's own catch log.
const COACH = { id: "u-coach", name: "Coach Grande" }, RUSS = { id: "u-russ", name: "Russell" }, DAD = { id: "u-dad", name: "Dad" };
const PEOPLE = { "u-coach": COACH, "u-russ": RUSS, "u-dad": DAD };
const membersWith = (alerts) => [
  { id: "u-coach", name: "Coach Grande", role: "owner", alerts: alerts.includes("u-coach"), signIn: "code" },
  { id: "u-russ", name: "Russell", role: "member", alerts: alerts.includes("u-russ"), signIn: "link" },
  { id: "u-dad", name: "Dad", role: "member", alerts: alerts.includes("u-dad"), signIn: "code" }];
let stampN = 0;
const stamp = () => new Date(Date.parse("2026-11-23T18:00:00Z") + (++stampN) * 1000).toISOString();
const mkTrip = (o) => Object.assign({ id: "t-x", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid at Redondo", date: "2026-11-28",
  from: null, to: null, status: "planned", note: null, by: COACH, going: [{ ...COACH, answer: "going" }, { ...RUSS, answer: "going" }],
  counts: { comments: 0, list: 0, listDone: 0, catches: 0 }, updatedAt: stamp() }, o);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
const copy = (v) => JSON.parse(JSON.stringify(v));

// opts: who ("owner"|"member"), alerts [ids], trips, comments {tripId: []}, list {tripId: []}, catches {tripId: []}.
// ctl.down = true makes every call to Supabase fail like no signal. ctl.refuse(body) returning words makes
// the crew function refuse that one call with those words.
async function crew(ctx, opts = {}) {
  const who = opts.who === "member" ? RUSS : COACH, owner = opts.who !== "member";
  const db = { trips: copy(opts.trips || []), comments: copy(opts.comments || {}), list: copy(opts.list || {}), catches: copy(opts.catches || {}),
    logs: {}, photos: {}, byClient: {}, n: 0 };
  const calls = { fn: [], landed: [], other: [], rest: [], restLanded: [], store: [], storeLanded: [], photoGets: 0 };
  const ctl = { down: false, refuse: null };
  const members = membersWith(opts.alerts || ["u-coach"]);
  const rows = (part, id) => db[part][id] || (db[part][id] = []);
  const note = (c) => ({ id: c.id, section: c.section || null, body: c.body, by: PEOPLE[c.by] ? { ...PEOPLE[c.by] } : null, at: c.at, mine: c.by === who.id });
  const line = (i) => ({ id: i.id, label: i.label, assignedTo: i.assignedTo ? { ...PEOPLE[i.assignedTo] } : null, done: !!i.done, mine: i.createdBy === who.id });
  const fish = (f) => ({ id: f.id, species: f.species, lengthIn: f.lengthIn == null ? null : f.lengthIn, weightLb: f.weightLb == null ? null : f.weightLb,
    lure: f.lure || "", notes: f.notes || "", photoUrl: f.photoUrl || null, by: { ...PEOPLE[f.by] }, at: f.at, mine: f.by === who.id });
  const seen = (id) => rows("comments", id).filter((c) => !c.hidden);
  const full = (t) => Object.assign({}, t, { counts: { comments: seen(t.id).length, list: rows("list", t.id).length,
    listDone: rows("list", t.id).filter((i) => i.done).length, catches: rows("catches", t.id).length } });
  const state = () => ({ me: who, crew: { id: "c1", name: "ZZTEST crew", role: owner ? "owner" : "member" }, members, trips: db.trips.map(full).sort(byDate), sms: true });
  const touch = (id) => { const t = db.trips.find((x) => x.id === id); if (t) t.updatedAt = stamp(); };
  const whereIs = (part, rowId) => Object.keys(db[part]).find((k) => db[part][k].some((r) => r.id === rowId));

  await ctx.route(/geigvuysptjvvqanumld\.supabase\.co/, (r) => { calls.other.push(r.request().method() + " " + r.request().url()); return json(r, 404, { error: "not stubbed" }); });
  await ctx.route(/\/auth\/v1\//, (r) => json(r, 200, {}));
  // The photo store: PUT and DELETE with the person's own token, GET in the open.
  await ctx.route(/\/storage\/v1\/object\/catch-photos\//, (r) => {
    const q = r.request(), h = q.headers(), path = new URL(q.url()).pathname.split("/catch-photos/")[1];
    const call = { m: q.method(), path, type: h["content-type"], upsert: h["x-upsert"], auth: h.authorization, key: h.apikey };
    calls.store.push(call);
    if (ctl.down) return r.abort();
    calls.storeLanded.push(call);
    if (call.m === "PUT") { db.photos[path] = true; return json(r, 200, { Key: "catch-photos/" + path }); }
    if (call.m === "DELETE") { delete db.photos[path]; return json(r, 200, { message: "Successfully deleted" }); }
    return json(r, 405, { error: "method" });
  });
  await ctx.route(/\/storage\/v1\/object\/public\/catch-photos\//, (r) => {
    calls.photoGets++;
    if (ctl.down) return r.abort();
    return r.fulfill({ status: 200, contentType: "image/png", headers: CORS, body: SMALL });
  });
  // CastAI's own catch log, written by the person themselves.
  await ctx.route(/\/rest\/v1\/catch_logs/, (r) => {
    const q = r.request(), h = q.headers();
    if (q.method() === "POST") {
      const row = JSON.parse(q.postData() || "{}"), call = { m: "POST", row, prefer: h.prefer, auth: h.authorization };
      calls.rest.push(call);
      if (ctl.down) return r.abort();
      calls.restLanded.push(call);
      db.logs[row.id] = row;
      return r.fulfill({ status: 201, headers: CORS, body: "" });
    }
    const id = (new URL(q.url()).searchParams.get("id") || "").replace(/^eq\./, ""), call = { m: q.method(), id, auth: h.authorization };
    calls.rest.push(call);
    if (ctl.down) return r.abort();
    calls.restLanded.push(call);
    delete db.logs[id];
    return r.fulfill({ status: 204, headers: CORS, body: "" });
  });
  await ctx.route(/functions\/v1\/castai-crew/, async (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    calls.fn.push(body);
    if (ctl.down) return r.abort();
    const a = body.action, find = () => db.trips.find((t) => t.id === body.tripId);
    const answer = (status, b) => { if (status === 200) calls.landed.push(body); return json(r, status, b); };
    const gone = () => answer(404, { error: "That trip is not here any more." });
    const no = ctl.refuse && ctl.refuse(body);
    if (no) return answer(400, { error: no });
    if (a === "hello") return answer(200, { ok: true, sms: true, vapidKey: "BKey" });
    if (a === "state") return answer(200, state());
    if (a === "prefs_get") return answer(200, { prefs: { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: true, pushSubs: 0 });
    if (a === "trip") {
      const t = find();
      return t ? answer(200, { trip: full(t), comments: seen(t.id).map(note), list: rows("list", t.id).map(line), catches: rows("catches", t.id).map(fish) }) : gone();
    }
    if (a === "trip_create") {
      const t = mkTrip({ id: "t-new-" + (++db.n), planId: body.planId, spotId: body.spotId, species: body.species, title: body.title, date: body.date,
        from: body.from == null ? null : body.from, to: body.to == null ? null : body.to, status: body.status || "idea", note: body.note || null,
        by: who, going: [{ ...who, answer: "going" }] });
      db.trips.push(t);
      (body.seedList || []).forEach((label, i) => rows("list", t.id).push({ id: t.id + "-s" + i, label, assignedTo: null, done: false, createdBy: who.id }));
      return answer(200, { ok: true, trip: full(t) });
    }
    if (a === "trip_update") {
      const t = find();
      if (!t) return gone();
      for (const k of ["status", "date", "from", "to", "note", "title"]) if (k in body) t[k] = body[k] === "" ? null : body[k];
      t.updatedAt = stamp();
      return answer(200, { ok: true, trip: full(t) });
    }
    if (a === "trip_delete") { const i = db.trips.findIndex((t) => t.id === body.tripId); if (i < 0) return gone(); db.trips.splice(i, 1); return answer(200, { ok: true }); }
    if (a === "going") {
      const t = find();
      if (!t) return gone();
      t.going = t.going.filter((g) => g.id !== who.id).concat([{ ...who, answer: body.answer }]);
      t.updatedAt = stamp();
      return answer(200, { ok: true, going: t.going });
    }
    if (a === "comment_add") {
      if (!find()) return gone();
      const key = "c:" + body.clientId;
      if (!db.byClient[key]) {
        db.byClient[key] = { id: "c-" + (++db.n), section: body.section || null, body: body.body, by: who.id, at: stamp() };
        rows("comments", body.tripId).push(db.byClient[key]); touch(body.tripId);
      }
      return answer(200, { ok: true, comment: note(db.byClient[key]) });
    }
    if (a === "comment_delete") {
      const tid = whereIs("comments", body.commentId), c = tid && db.comments[tid].find((x) => x.id === body.commentId);
      if (!c || c.hidden) return answer(404, { error: "That note is not here any more." });
      if (c.by !== who.id && !owner) return answer(403, { error: "Only the person who wrote it can delete it." });
      c.hidden = true; touch(tid);
      return answer(200, { ok: true });
    }
    if (a === "list_add") {
      if (!find()) return gone();
      const key = "i:" + body.clientId;
      if (!db.byClient[key]) {
        db.byClient[key] = { id: "i-" + (++db.n), label: body.label, assignedTo: body.assignedTo || null, done: false, createdBy: who.id };
        rows("list", body.tripId).push(db.byClient[key]); touch(body.tripId);
      }
      return answer(200, { ok: true, item: line(db.byClient[key]) });
    }
    if (a === "list_update") {
      const tid = whereIs("list", body.itemId), it = tid && db.list[tid].find((x) => x.id === body.itemId);
      if (!it) return answer(404, { error: "That line is not here any more." });
      if ("label" in body && it.createdBy !== who.id && !owner) return answer(403, { error: "Only the person who added it can rename it." });
      if ("done" in body) it.done = !!body.done;
      if ("assignedTo" in body) it.assignedTo = body.assignedTo || null;
      if ("label" in body) it.label = body.label;
      touch(tid);
      return answer(200, { ok: true, item: line(it) });
    }
    if (a === "list_delete") {
      const tid = whereIs("list", body.itemId), it = tid && db.list[tid].find((x) => x.id === body.itemId);
      if (!it) return answer(404, { error: "That line is not here any more." });
      if (it.createdBy !== who.id && !owner) return answer(403, { error: "Only the person who added it can delete it." });
      db.list[tid] = db.list[tid].filter((x) => x !== it); touch(tid);
      return answer(200, { ok: true });
    }
    if (a === "catch_link") {
      if (!find()) return gone();
      const log = db.logs[body.catchId];
      if (!log || log.user_id !== who.id) return answer(404, { error: "That catch is not in your catch log." });
      let f = rows("catches", body.tripId).find((x) => x.id === body.catchId);
      if (!f) {
        const mine = STORE + "public/catch-photos/" + who.id + "/";
        f = { id: log.id, species: log.species, lengthIn: log.length, weightLb: log.weight, lure: log.lure, notes: log.notes,
          photoUrl: typeof log.photo_url === "string" && log.photo_url.startsWith(mine) ? log.photo_url : null, by: who.id, at: log.catch_date };
        rows("catches", body.tripId).push(f); touch(body.tripId);
      }
      return answer(200, { ok: true, catch: fish(f) });
    }
    if (a === "catch_delete") {
      const tid = whereIs("catches", body.catchId), f = tid && db.catches[tid].find((x) => x.id === body.catchId);
      if (!f) return answer(404, { error: "That catch is not on a trip." });
      if (f.by !== who.id) return answer(403, { error: "Only the person who caught it can take it off." });
      db.catches[tid] = db.catches[tid].filter((x) => x !== f); touch(tid);
      return answer(200, { ok: true });
    }
    return answer(400, { error: "unknown action" });
  });
  return { calls, db, ctl };
}

const phone = { viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" };
const SESSION = { token: "tok-123", refresh: "ref-123", at: NOW.getTime() + 36e5, userId: "u-coach" };
const seed = (page, key, value) => page.addInitScript(([k, v]) => { if (!sessionStorage.getItem("seeded:" + k)) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem("seeded:" + k, "1"); } }, [key, value]);
const signIn = (page, who) => seed(page, "rig.session.v1", Object.assign({}, SESSION, who === "member" ? { userId: "u-russ" } : {}));
const text = (p, sel) => p.locator(sel).first().innerText();
const texts = async (p, sel) => (await p.locator(sel).allInnerTexts()).map((t) => t.trim());
const attrs = (p, sel, name) => p.locator(sel).evaluateAll((els, n) => els.map((e) => e.getAttribute(n)), name);
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);
async function fits(p, what) {
  const w = await p.evaluate(() => document.documentElement.scrollWidth), t = await screenText(p);
  ok(w <= 390, what + ": nothing runs off the side at 390 px", w);
  ok(!PHONE.test(t) && !EMAIL.test(t), what + ": no phone number or email on screen", t.match(PHONE) || t.match(EMAIL));
}
// Every tap target on the screen is 44 px tall or more.
const short = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44)
  .map((e) => (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30)), sel);
const TAPS = '[data-view="crewtrip"] button, [data-view="crewtrip"] a:not(.back), [data-view="crewtrip"] input:not([type="file"]), [data-view="crewtrip"] textarea, [data-view="crewtrip"] label.cw-act';
async function open(ctx, url, who) {
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  let dialogs = 0; p.on("dialog", (d) => { dialogs++; d.dismiss(); });
  if (who) await signIn(p, who);
  p.errs = errs; p.dialogs = () => dialogs;
  if (url) await p.goto(url, { waitUntil: "load" });
  return p;
}
const online = (p) => p.evaluate(() => window.dispatchEvent(new Event("online")));
const waiting = (p) => p.evaluate(async () => (await window.RIG.crew.pending()).count);
// Wait until nothing is left in the queue. (waitForFunction does not wait on
// a promise: it would take the promise itself for a yes.)
const drained = async (p) => { for (let i = 0; i < 200; i++) { if (await waiting(p) === 0) return true; await later(50); } return false; };
const landedN = (calls, action, test) => calls.landed.filter((b) => b.action === action && (!test || test(b))).length;
// On a crew trip the page drops a second tap that lands on the same spot a
// moment after the first: a double tap must not reach a control that has
// slid under the thumb, or fire the same one twice. A person is slower than
// that; a test that means two taps in one spot has to wait.
const settle = () => later(450);

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();

  // --------------------------------------------------------------------
  // Notes: on a part of the run card, and on the whole trip. Russell, a member.
  {
    const trips = [mkTrip({ id: "t-sat" })];
    const comments = { "t-sat": [
      { id: "c1", section: "gear", body: "Bring the long net", by: "u-coach", at: "2026-11-21T00:12:00Z" },
      { id: "c2", section: "gear", body: "I have one", by: "u-russ", at: "2026-11-21T01:30:00Z" },
      { id: "c3", section: null, body: "Meet at the pier at 4", by: "u-coach", at: "2026-11-22T18:05:00Z" },
      { id: "c4", section: "how", body: "Slow lift, then let it drop", by: "u-dad", at: "2026-11-10T00:12:00Z" }] };
    const ctx = await browser.newContext(phone);
    const { calls, db, ctl } = await crew(ctx, { who: "member", trips, comments });
    await weather(ctx);
    const p = await open(ctx, null, "member");
    await seed(p, "rig.crewseen.v1", {});
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector('[data-cw-trip="t-sat"] [data-cw-new]');
    ok(true, "a trip this phone has not opened has a dot on the Trips tab");
    await p.locator('[data-cw-trip="t-sat"]').click();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-count="gear"]');

    // Counts and dots on the run card rows.
    ok((await text(p, '[data-cw-count="gear"]')).trim() === "2 notes" && (await text(p, '[data-cw-count="how"]')).trim() === "1 note" && await p.locator('[data-cw-count="what"]').count() === 0,
      "each run card row shows how many notes it holds, and none when it holds none", await texts(p, "[data-cw-count]"));
    ok(await p.locator('[data-sec-row="gear"] [data-cw-newnote]').count() === 1 && await p.locator('[data-sec-row="how"] [data-cw-newnote]').count() === 1 &&
      await p.locator('[data-sec-row="what"] [data-cw-newnote]').count() === 0, "a row holding a note this phone has not looked at has a dot");

    // Notes on the whole trip sit on the trip page.
    const tripNotes = await attrs(p, '[data-cw-notes=""] [data-cw-note]', "data-cw-note");
    ok(tripNotes.join() === "c3", "notes on the whole trip sit on the trip page, and only those", tripNotes.join());
    const c3 = (await text(p, '[data-cw-note="c3"]')).replace(/\s+/g, " ");
    ok(/Coach/.test(c3) && !/Grande/.test(c3) && /Sun 10:05 AM/.test(c3) && /Meet at the pier at 4/.test(c3), "a note has a first name, a short time and the words", c3);
    ok(await p.locator('[data-cw-notes=""] [data-cw-note-text]').count() === 1, "with a box to add one");
    ok(await p.locator('[data-view="crewtrip"] .cw-go').count() === 0, "and no second gold thing on the trip page", await p.locator('[data-view="crewtrip"] .cw-go').count());

    // A section: the section, then its notes, oldest first.
    await p.locator('[data-view="crewtrip"] [data-sec-row="gear"]').click();
    await p.waitForSelector('[data-view="crewtrip"][data-sec="gear"] [data-cw-note="c1"]');
    ok(p.url().endsWith("#/crew/trip/t-sat/gear"), "a section opens at #/crew/trip/<id>/<section>", p.url());
    ok((await attrs(p, "[data-cw-note]", "data-cw-note")).join() === "c1,c2", "its notes, oldest first, and nobody else's", (await attrs(p, "[data-cw-note]", "data-cw-note")).join());
    const under = await p.evaluate(() => {
      const card = document.querySelector('[data-card="gear"]'), notes = document.querySelector('[data-cw-notes="gear"] [data-cw-note]');
      return !!(card.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok(under, "under the section itself");
    ok((await text(p, '[data-cw-note="c1"] [data-cw-note-who]')).trim() === "Coach" && (await text(p, '[data-cw-note="c1"] [data-cw-note-at]')).trim() === "Fri 4:12 PM" &&
      (await text(p, '[data-cw-note="c1"] [data-cw-note-body]')).trim() === "Bring the long net", "first name, a time like Fri 4:12 PM, the words", await text(p, '[data-cw-note="c1"]'));
    ok(await p.locator('[data-cw-note="c2"] [data-cw-note-del]').count() === 1 && await p.locator('[data-cw-note="c1"] [data-cw-note-del]').count() === 0,
      "your own note has a Delete, someone else's does not");
    ok(await p.locator("[data-cw-reply], [data-cw-react]").count() === 0 && !/reply|typing/i.test(await text(p, '[data-cw-notes="gear"]')), "a note, not a chat: no replies, no reactions");
    ok((await texts(p, '[data-cw-tell="note"] [data-cw-tell-id]')).join() === "Coach" && (await attrs(p, '[data-cw-tell="note"] [data-cw-tell-id]', "aria-pressed")).join() === "true",
      "the Tell row names who has alerts on, ticked", await texts(p, "[data-cw-tell] [data-cw-tell-id]"));
    ok(/^Tell:/.test((await text(p, '[data-cw-tell="note"]')).trim()), "and reads Tell:", await text(p, '[data-cw-tell="note"]'));
    ok((await short(p, TAPS)).length === 0, "every control on a section with notes is a full tap target", await short(p, TAPS));
    await fits(p, "a section with notes");

    // A tap that is not on a control stays on the page. (A section page carries
    // data-sec, which elsewhere in the app means "open that part of Learn".)
    await p.locator("[data-cw-note-text]").click();
    await p.locator('[data-view="crewtrip"] h1').click();
    await p.locator('[data-card="gear"] p.when').click();
    await later(150);
    ok(p.url().endsWith("#/crew/trip/t-sat/gear") && await p.locator('[data-view="crewtrip"][data-sec="gear"]').count() === 1, "tapping into the note box, or on the section's own words, stays on the section", p.url());
    await settle();

    // Nothing typed: it says so and sends nothing.
    await p.locator('[data-cw-note-add="gear"]').click();
    await p.waitForFunction(() => /write/i.test(document.querySelector("[data-cw-note-msg]")?.innerText || ""));
    ok(calls.fn.filter((b) => b.action === "comment_add").length === 0, "an empty note says so and sends nothing", await text(p, "[data-cw-note-msg]"));

    // Add one, with a double tap.
    await p.locator("[data-cw-note-text]").fill("Two nets is fine");
    await settle();
    await p.locator('[data-cw-note-add="gear"]').dblclick();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-note]")].some((e) => /Two nets is fine/.test(e.innerText) && !e.querySelector("[data-cw-wait]")));
    const adds = calls.landed.filter((b) => b.action === "comment_add");
    ok(adds.length === 1 && adds[0].tripId === "t-sat" && adds[0].section === "gear" && adds[0].body === "Two nets is fine" && UUID.test(adds[0].clientId || ""),
      "a note on a section is sent once, pinned to that section, under a client id", adds);
    ok(same(adds[0] && adds[0].tell, ["u-coach"]), "with the ticked names as tell", adds[0] && adds[0].tell);
    ok(await p.locator("[data-cw-note-text]").inputValue() === "" && (await attrs(p, "[data-cw-note]", "data-cw-note")).join() === "c1,c2,c-1", "it joins the end of the list and the box empties",
      (await attrs(p, "[data-cw-note]", "data-cw-note")).join());
    ok((await attrs(p, '[data-cw-tell="note"] [data-cw-tell-id]', "aria-pressed")).join() === "true", "a double tap did not untick anyone");

    // Back on the trip: the count moved, the dot for the section just read is gone.
    await p.locator('[data-view="crewtrip"] [data-up]').click();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-count="gear"]');
    ok((await text(p, '[data-cw-count="gear"]')).trim() === "3 notes", "the row count follows", await text(p, '[data-cw-count="gear"]'));
    ok(await p.locator('[data-sec-row="gear"] [data-cw-newnote]').count() === 0 && await p.locator('[data-sec-row="how"] [data-cw-newnote]').count() === 1,
      "the dot goes from the section that was opened, and stays on the one that was not");

    // A note on the whole trip, telling nobody.
    await p.locator('[data-cw-tell="note"] [data-cw-tell-id="u-coach"]').click();
    ok((await attrs(p, '[data-cw-tell="note"] [data-cw-tell-id]', "aria-pressed")).join() === "false", "a tap unticks a name");
    await p.locator('[data-cw-notes=""] [data-cw-note-text]').fill("I will drive");
    await p.locator('[data-cw-note-add=""]').click();
    await p.waitForFunction(() => [...document.querySelectorAll('[data-cw-notes=""] [data-cw-note]')].some((e) => /I will drive/.test(e.innerText) && !e.querySelector("[data-cw-wait]")));
    const whole = calls.landed.filter((b) => b.action === "comment_add")[1] || {};
    ok(whole.body === "I will drive" && !whole.section, "a note on the whole trip is sent with no section", whole);
    ok(same(whole.tell, []), "with nobody ticked it sends an empty tell", whole.tell);
    ok(await p.locator('[data-sec-row] [data-cw-count]').count() === 2 && (await text(p, '[data-cw-count="gear"]')).trim() === "3 notes", "and it is not counted on any section row");
    await p.locator('[data-cw-tell="note"] [data-cw-tell-id="u-coach"]').click();

    // Delete: yours only, asked once, inside the page.
    await p.locator('[data-cw-note="c-2"] [data-cw-note-del]').click();
    await p.waitForSelector('[data-cw-note-del-yes="c-2"]');
    ok(p.dialogs() === 0 && calls.fn.filter((b) => b.action === "comment_delete").length === 0, "Delete asks first, inside the page, and deletes nothing yet");
    await settle();
    await p.locator("[data-cw-ask-no]").click();
    await p.waitForSelector('[data-cw-note="c-2"] [data-cw-note-del]');
    ok(await p.locator("[data-cw-note-del-yes]").count() === 0, "Keep keeps it");
    await settle();
    await p.locator('[data-cw-note="c-2"] [data-cw-note-del]').click();
    await p.waitForSelector('[data-cw-note-del-yes="c-2"]');
    await settle();
    await p.locator('[data-cw-note-del-yes="c-2"]').dblclick();
    await p.waitForFunction(() => !document.querySelector('[data-cw-note="c-2"]'));
    await drained(p);
    ok(landedN(calls, "comment_delete", (b) => b.commentId === "c-2") === 1 && db.comments["t-sat"].find((c) => c.id === "c-2").hidden === true, "the second tap deletes it, once", calls.fn.filter((b) => /delete/.test(b.action)));

    // No signal at the pier.
    ctl.down = true;
    await p.locator('[data-cw-notes=""] [data-cw-note-text]').fill("Tide is early, be there by 3");
    await p.locator('[data-cw-note-add=""]').click();
    await p.waitForFunction(() => [...document.querySelectorAll('[data-cw-notes=""] [data-cw-note]')].some((e) => /Tide is early/.test(e.innerText) && /waiting to send/i.test(e.innerText)));
    ok(true, "a note made with no signal shows at once, marked waiting to send");
    ok(!db.comments["t-sat"].some((c) => /Tide is early/.test(c.body)), "and the server has not heard it");
    ok(await p.locator('[data-cw-notes=""] [data-cw-note-text]').inputValue() === "", "the box is empty again");
    await fits(p, "a trip page with a note waiting");
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => [...document.querySelectorAll('[data-cw-notes=""] [data-cw-note]')].some((e) => /Tide is early/.test(e.innerText) && /waiting to send/i.test(e.innerText)));
    ok((await attrs(p, '[data-cw-notes=""] [data-cw-note]', "data-cw-note"))[0] === "c3", "after the app is closed and opened it is still there, after the notes already seen");
    ok(landedN(calls, "comment_add", (b) => /Tide is early/.test(b.body)) === 0, "nothing went while there was no signal");
    // A waiting note can be taken back, and then it never goes.
    await p.locator('[data-cw-notes=""] [data-cw-note-text]').fill("Never mind this one");
    await p.locator('[data-cw-note-add=""]').click();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-note]")].some((e) => /Never mind this one/.test(e.innerText) && /waiting to send/i.test(e.innerText)));
    const nm = await p.evaluate(() => [...document.querySelectorAll("[data-cw-note]")].find((e) => /Never mind this one/.test(e.innerText)).getAttribute("data-cw-note"));
    await p.locator(`[data-cw-note="${nm}"] [data-cw-note-del]`).click();
    await p.waitForSelector(`[data-cw-note-del-yes="${nm}"]`);
    await settle();
    await p.locator(`[data-cw-note-del-yes="${nm}"]`).click();
    await p.waitForFunction(() => ![...document.querySelectorAll("[data-cw-note]")].some((e) => /Never mind this one/.test(e.innerText)));
    // Signal back.
    ctl.down = false;
    await online(p);
    await p.waitForFunction(() => [...document.querySelectorAll('[data-cw-notes=""] [data-cw-note]')].some((e) => /Tide is early/.test(e.innerText) && !e.querySelector("[data-cw-wait]")));
    await p.evaluate(() => window.RIG.crew.flush());
    await online(p);
    await later(300);
    ok(landedN(calls, "comment_add", (b) => /Tide is early/.test(b.body)) === 1 && db.comments["t-sat"].filter((c) => /Tide is early/.test(c.body)).length === 1,
      "when the signal returns it sends, exactly once", landedN(calls, "comment_add", (b) => /Tide is early/.test(b.body)));
    ok(landedN(calls, "comment_add", (b) => /Never mind/.test(b.body)) === 0, "and the one taken back never went");
    ok(await waiting(p) === 0, "nothing is left waiting");

    // A waiting note the server then refuses: it leaves the screen, and the page says why.
    ctl.down = true;
    await p.locator('[data-cw-notes=""] [data-cw-note-text]').fill("This one is refused");
    await settle();
    await p.locator('[data-cw-note-add=""]').click();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-note]")].some((e) => /This one is refused/.test(e.innerText) && /waiting to send/i.test(e.innerText)));
    ctl.refuse = (b) => (b.action === "comment_add" && /refused/.test(b.body) ? "That trip is closed to notes." : "");
    ctl.down = false;
    await online(p);
    await p.waitForFunction(() => ![...document.querySelectorAll("[data-cw-note]")].some((e) => /This one is refused/.test(e.innerText)));
    await p.waitForFunction(() => /not sent/i.test(document.querySelector("[data-cw-note-msg]")?.innerText || ""), null, { timeout: 5000 }).catch(() => {});
    ok(/not sent/i.test(await text(p, "[data-cw-note-msg]")) && /closed to notes/.test(await text(p, "[data-cw-note-msg]")), "a waiting note the server then refuses leaves the screen, and the page says so, with the reason",
      await text(p, "[data-cw-note-msg]"));
    ok(await waiting(p) === 0 && !db.comments["t-sat"].some((c) => /refused/.test(c.body)), "and it is not sent again");
    ctl.refuse = null;

    // A new note from someone else, on a section already read: the dot is back.
    // (Your own writes are squared with the server a moment after they land,
    // so they cannot hide what someone else does next.)
    await p.waitForFunction(() => !JSON.parse(localStorage.getItem("rig.crewseen.v1") || "{}")["~t-sat"]);
    db.comments["t-sat"].push({ id: "c9", section: "gear", body: "Mine is 8 ft", by: "u-dad", at: "2026-11-23T19:30:00Z" });
    db.trips[0].updatedAt = stamp();
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector('[data-cw-trip="t-sat"] [data-cw-new]');
    ok(true, "something new from the crew puts the dot back on the Trips tab");
    await p.locator('[data-cw-trip="t-sat"]').click();
    await p.waitForFunction(() => (document.querySelector('[data-cw-count="gear"]')?.innerText || "").trim() === "4 notes");
    ok(await p.locator('[data-sec-row="gear"] [data-cw-newnote]').count() === 1, "and on the section row that holds the newer note");
    // Your own note never raises a dot.
    await p.locator('[data-view="crewtrip"] [data-sec-row="what"]').click();
    await p.waitForSelector('[data-view="crewtrip"][data-sec="what"] [data-cw-note-text]');
    await p.locator("[data-cw-note-text]").fill("Never fished squid before");
    await p.locator('[data-cw-note-add="what"]').click();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-note]")].some((e) => /Never fished squid/.test(e.innerText) && !e.querySelector("[data-cw-wait]")));
    await p.goto(base + "#/crew/trip/t-sat", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-count="what"]');
    ok(await p.locator('[data-sec-row="what"] [data-cw-newnote]').count() === 0, "your own note never puts a dot on a row");
    await p.locator('[data-view="crewtrip"] [data-up]').click();
    await p.waitForSelector('[data-cw-trip="t-sat"]');
    await later(300);
    ok(await p.locator('[data-cw-trip="t-sat"] [data-cw-new]').count() === 0, "opening the trip marked it seen: no dot on the Trips tab");

    // An older note carries its date.
    await p.goto(base + "#/crew/trip/t-sat/how", { waitUntil: "load" });
    await p.waitForSelector('[data-cw-note="c4"]');
    ok((await text(p, '[data-cw-note="c4"] [data-cw-note-at]')).trim() === "Nov 9, 4:12 PM", "a note more than a few days old carries its date", await text(p, '[data-cw-note="c4"] [data-cw-note-at]'));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();

    // Coach, the owner, on the same notes: he can delete anyone's.
    const ctx2 = await browser.newContext(phone);
    const o = await crew(ctx2, { who: "owner", trips, comments });
    await weather(ctx2);
    const q = await open(ctx2, base + "#/crew/trip/t-sat/gear", "owner");
    await q.waitForSelector('[data-view="crewtrip"][data-sec="gear"] [data-cw-note="c2"]');
    ok(await q.locator('[data-cw-note="c2"] [data-cw-note-del]').count() === 1 && await q.locator('[data-cw-note="c1"] [data-cw-note-del]').count() === 1, "the owner can delete any note");
    await q.locator('[data-cw-note="c2"] [data-cw-note-del]').click();
    await q.waitForSelector('[data-cw-note-del-yes="c2"]');
    await settle();
    await q.locator('[data-cw-note-del-yes="c2"]').click();
    await q.waitForFunction(() => !document.querySelector('[data-cw-note="c2"]'));
    await drained(q);
    ok(landedN(o.calls, "comment_delete", (b) => b.commentId === "c2") === 1, "and it goes");
    ok(q.errs.length === 0 && o.calls.other.length === 0, "no page errors, nothing unexpected asked", q.errs.concat(o.calls.other).join(" | "));
    await ctx2.close();

    // A note pinned to a part the run card no longer shows (the weather, once
    // the day is past the forecast) is not lost: it sits with the trip's notes.
    const far = [mkTrip({ id: "t-far", date: "2026-12-12" }),
      mkTrip({ id: "t-lake", date: "2026-12-12", planId: "trout-fenwick", spotId: "lake-fenwick", species: "perch", title: "Perch and trout, Lake Fenwick" })];
    const ctx3 = await browser.newContext(phone);
    await crew(ctx3, { who: "member", trips: far, comments: { "t-far": [{ id: "w1", section: "wx", body: "Wind looked bad on the long range", by: "u-coach", at: "2026-11-22T18:05:00Z" }],
      "t-lake": [{ id: "w2", section: "wx", body: "Cold front on the long range", by: "u-coach", at: "2026-11-22T18:06:00Z" }] } });
    await weather(ctx3);
    const w = await open(ctx3, base + "#/crew/trip/t-far", "member");
    await w.waitForSelector('[data-view="crewtrip"] [data-cw-note-text]');
    ok(await w.locator('[data-sec-row="wx"]').count() === 0 && await w.locator('[data-cw-notes=""] [data-cw-note="w1"]').count() === 1 &&
      /Tide and weather/.test(await text(w, '[data-cw-note="w1"]')), "a note on a part the run card no longer shows sits with the trip's notes, and says which part it was on",
      await w.locator('[data-cw-notes=""]').innerText());
    // On a lake that part is Weather: a lake has no tide.
    await w.evaluate(() => { location.hash = "#/crew/trip/t-lake"; });
    await w.waitForSelector('[data-cw-note="w2"]');
    const lakePart = await text(w, '[data-cw-note="w2"] [data-cw-note-part]');
    ok(/^weather$/i.test(lakePart.trim()), "and on a lake trip it says Weather, not Tide and weather", lakePart);
    await ctx3.close();
  }

  // --------------------------------------------------------------------
  // The list. Russell, a member; Coach made the trip and its seeded lines.
  {
    const trips = [mkTrip({ id: "t-sat" })];
    const mk = (id, label, assignedTo, done, createdBy) => ({ id, label, assignedTo, done, createdBy: createdBy || "u-coach" });
    const list = { "t-sat": [
      mk("i1", "Rod: 9 ft, light power, fast action", "u-russ", true), mk("i2", "Reel with 10 to 15 lb braid", "u-russ", true), mk("i3", "Squid jigs, size 2.0 to 2.5", "u-coach", true),
      mk("i4", "White work light", "u-coach", false), mk("i5", "Ryobi 18V packs", "u-coach", true), mk("i6", "Carabiner and a second safety tether for the light", "u-coach", true),
      mk("i7", "Bucket, plus a cooler with ice", null, true), mk("i8", "Headlamp", null, false), mk("i9", "Rag for ink, warm layers, rain shell", null, false),
      mk("i10", "Fishing license", null, true), mk("i11", "Thermos", null, false), mk("i12", "Hand warmers", "u-russ", false, "u-russ")] };
    const ctx = await browser.newContext(phone);
    const { calls, db, ctl } = await crew(ctx, { who: "member", trips, list });
    await weather(ctx);
    const p = await open(ctx, base + "#/crew/trip/t-sat", "member");
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-item="i1"]');
    const sum = async () => (await text(p, "[data-cw-list-sum]")).trim();
    const item = (id) => db.list["t-sat"].find((i) => i.id === id);
    ok(await sum() === "7 of 12 packed. Russell has 3, Coach has 4, 5 nobody.", "the summary on top: how many are packed, and who has how many", await sum());
    ok(await p.locator("[data-cw-item]").count() === 12, "one line for each thing on the list");
    const row = await p.evaluate(() => {
      const li = document.querySelector('[data-cw-item="i1"]'), k = [...li.children].filter((e) => e.offsetParent);
      return { tick: k[0].matches("[data-cw-tick]") && k[0].getAttribute("aria-checked"), label: k[1].innerText.trim(), who: k[2].matches("[data-cw-who]") && k[2].innerText.trim() };
    });
    ok(row.tick === "true" && row.label === "Rod: 9 ft, light power, fast action" && row.who === "Russell", "a line is a tick, the words and who has it", row);
    ok((await text(p, '[data-cw-who="i3"]')).trim() === "Coach" && (await text(p, '[data-cw-who="i8"]')).trim().toLowerCase() === "nobody" &&
      await p.locator('[data-cw-tick="i8"]').getAttribute("aria-checked") === "false", "a first name, or nobody; ticked or not");
    ok(await p.locator("[data-cw-panel]").count() === 0, "no picker until a name is tapped");
    ok((await short(p, TAPS)).length === 0, "every control on the trip page with its list is a full tap target", await short(p, TAPS));
    await fits(p, "a trip page with the list");

    // Tick and untick.
    await p.locator('[data-cw-tick="i4"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-tick="i4"]').getAttribute("aria-checked") === "true" && !document.querySelector('[data-cw-item="i4"] [data-cw-wait]'));
    const ticks = calls.landed.filter((b) => b.action === "list_update");
    ok(ticks.length === 1 && ticks[0].itemId === "i4" && ticks[0].done === true && !("assignedTo" in ticks[0]) && !("tell" in ticks[0]), "a tick sends done for that line and nothing else", ticks);
    ok(await sum() === "8 of 12 packed. Russell has 3, Coach has 4, 5 nobody.", "and the summary follows", await sum());
    await settle();
    await p.locator('[data-cw-tick="i4"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-tick="i4"]').getAttribute("aria-checked") === "false" && !document.querySelector('[data-cw-item="i4"] [data-cw-wait]'));
    ok(item("i4").done === false, "a second tap unticks it");

    // Who has it: a small picker of first names, and Nobody.
    await p.locator('[data-cw-who="i8"]').click();
    await p.waitForSelector('[data-cw-item="i8"] [data-cw-panel]');
    ok((await texts(p, '[data-cw-item="i8"] [data-cw-give]')).join() === "Coach,Russell,Dad,Nobody", "tapping who has it opens the crew's first names, plus Nobody", await texts(p, "[data-cw-give]"));
    ok((await texts(p, '[data-cw-item="i8"] [data-cw-tell="list"] [data-cw-tell-id]')).join() === "Coach", "with the Tell row");
    ok(await p.locator('[data-cw-item="i8"] [data-cw-item-rename], [data-cw-item="i8"] [data-cw-item-del]').count() === 0, "a line someone else added: no rename, no delete");
    ok((await short(p, TAPS)).length === 0, "every control in the picker is a full tap target", await short(p, TAPS));
    await fits(p, "the list with a picker open");
    await p.locator('[data-cw-item="i8"] [data-cw-give="u-dad"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-who="i8"]').innerText.trim() === "Dad" && !document.querySelector('[data-cw-item="i8"] [data-cw-wait]'));
    const gave = calls.landed.filter((b) => b.action === "list_update" && "assignedTo" in b);
    ok(gave.length === 1 && gave[0].itemId === "i8" && gave[0].assignedTo === "u-dad" && !("done" in gave[0]), "picking a name sends who has it", gave);
    ok(same(gave[0] && gave[0].tell, ["u-coach"]), "with the ticked names as tell", gave[0] && gave[0].tell);
    ok(await p.locator("[data-cw-panel]").count() === 0 && await sum() === "7 of 12 packed. Russell has 3, Coach has 4, Dad has 1, 4 nobody.", "the picker shuts and the summary follows", await sum());
    await p.locator('[data-cw-who="i8"]').click();
    await p.waitForSelector('[data-cw-item="i8"] [data-cw-panel]');
    ok(await p.locator('[data-cw-item="i8"] [data-cw-give="u-dad"]').getAttribute("aria-pressed") === "true", "the picker shows who has it now");
    await p.locator('[data-cw-item="i8"] [data-cw-give=""]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-who="i8"]').innerText.trim().toLowerCase() === "nobody" && !document.querySelector('[data-cw-item="i8"] [data-cw-wait]'));
    ok(item("i8").assignedTo === null && calls.landed.filter((b) => b.action === "list_update" && b.itemId === "i8").pop().assignedTo === null, "Nobody takes the name off");

    // Add a line at the bottom.
    await p.locator("[data-cw-item-add]").click();
    await p.waitForFunction(() => /say what/i.test(document.querySelector("[data-cw-list-msg]")?.innerText || ""));
    ok(landedN(calls, "list_add") === 0, "an empty line says so and adds nothing");
    await p.locator("[data-cw-item-new]").fill("Landing net");
    await settle();
    await p.locator("[data-cw-item-add]").dblclick();
    await p.waitForFunction(() => { const l = [...document.querySelectorAll("[data-cw-item]")].pop(); return /Landing net/.test(l.innerText) && !l.querySelector("[data-cw-wait]"); });
    const added = calls.landed.filter((b) => b.action === "list_add");
    ok(added.length === 1 && added[0].tripId === "t-sat" && added[0].label === "Landing net" && UUID.test(added[0].clientId || "") && !added[0].assignedTo, "Add puts one new line at the bottom, once", added);
    ok(await p.locator("[data-cw-item]").count() === 13 && await p.locator("[data-cw-item-new]").inputValue() === "" && /of 13 packed/.test(await sum()), "the list grows by one and the box empties", await sum());
    ok(db.list["t-sat"].filter((i) => i.done).length === 7 && (await attrs(p, '[data-cw-tick][aria-checked="true"]', "data-cw-tick")).length === 7 && await p.locator("[data-cw-panel]").count() === 0,
      "a double tap on Add ticked nothing and opened nothing by accident", db.list["t-sat"].filter((i) => i.done).map((i) => i.id));
    const newId = added[0] ? db.byClient["i:" + added[0].clientId].id : "";

    // Rename and delete: only for the person who added the line.
    await p.locator(`[data-cw-who="${newId}"]`).click();
    await p.waitForSelector(`[data-cw-item="${newId}"] [data-cw-item-rename]`);
    ok(await p.locator(`[data-cw-item="${newId}"] [data-cw-item-del]`).count() === 1, "a line you added has Rename and Delete");
    await p.locator(`[data-cw-item="${newId}"] [data-cw-item-rename]`).click();
    await p.waitForSelector("[data-cw-item-name]");
    ok(await p.locator("[data-cw-item-name]").inputValue() === "Landing net", "Rename opens the words to change");
    await p.locator("[data-cw-item-name]").fill("Long landing net");
    await settle();
    await p.locator("[data-cw-item-save]").click();
    await p.waitForFunction((id) => /Long landing net/.test(document.querySelector(`[data-cw-item="${id}"] [data-cw-item-label]`)?.innerText || "") && !document.querySelector(`[data-cw-item="${id}"] [data-cw-wait]`), newId);
    const ren = calls.landed.filter((b) => b.action === "list_update" && "label" in b);
    ok(ren.length === 1 && ren[0].itemId === newId && ren[0].label === "Long landing net" && item(newId).label === "Long landing net", "Save sends the new words", ren);
    await p.locator('[data-cw-who="i12"]').click();
    await p.waitForSelector('[data-cw-item="i12"] [data-cw-item-del]');
    await p.locator('[data-cw-item="i12"] [data-cw-item-del]').click();
    await p.waitForSelector('[data-cw-item-del-yes="i12"]');
    ok(p.dialogs() === 0 && landedN(calls, "list_delete") === 0, "Delete asks first, inside the page");
    await settle();
    await p.locator('[data-cw-item-del-yes="i12"]').dblclick();
    await p.waitForFunction(() => !document.querySelector('[data-cw-item="i12"]'));
    await drained(p);
    ok(landedN(calls, "list_delete", (b) => b.itemId === "i12") === 1 && !item("i12"), "then deletes the line, once", calls.fn.filter((b) => /delete/.test(b.action)));
    ok(/of 12 packed/.test(await sum()), "and the summary follows", await sum());

    // No signal: a tick and a name show at once and go later, once each.
    ctl.down = true;
    await p.locator('[data-cw-tick="i9"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-tick="i9"]').getAttribute("aria-checked") === "true" && /waiting to send/i.test(document.querySelector('[data-cw-item="i9"]').innerText));
    ok(item("i9").done === false, "a tick made with no signal shows at once, marked waiting, and the server has not heard it");
    await p.locator('[data-cw-who="i11"]').click();
    await p.waitForSelector('[data-cw-item="i11"] [data-cw-panel]');
    await p.locator('[data-cw-item="i11"] [data-cw-give="u-russ"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-who="i11"]').innerText.trim() === "Russell" && /waiting to send/i.test(document.querySelector('[data-cw-item="i11"]').innerText));
    ok(item("i11").assignedTo === null, "so does a name");
    const sumOff = await sum();
    ok(/^8 of 12 packed\. Russell has 3, Coach has 4, 5 nobody\.$/.test(sumOff), "the summary counts what is waiting", sumOff);
    await fits(p, "the list with a tick and a name waiting");
    // A new line with no signal, ticked while it still waits.
    await p.locator("[data-cw-item-new]").fill("Extra jigs");
    await settle();
    await p.locator("[data-cw-item-add]").click();
    await p.waitForFunction(() => { const l = [...document.querySelectorAll("[data-cw-item]")].pop(); return /Extra jigs/.test(l.innerText) && /waiting to send/i.test(l.innerText); });
    const qid = await p.evaluate(() => [...document.querySelectorAll("[data-cw-item]")].pop().getAttribute("data-cw-item"));
    await p.locator(`[data-cw-tick="${qid}"]`).click();
    await p.waitForFunction((id) => document.querySelector(`[data-cw-tick="${id}"]`)?.getAttribute("aria-checked") === "true", qid);
    ok(/^9 of 13 packed\./.test(await sum()) && !db.list["t-sat"].some((i) => i.label === "Extra jigs"), "a line added with no signal shows at once and can be ticked while it waits", await sum());
    await p.reload({ waitUntil: "load" });
    await p.waitForFunction(() => document.querySelector('[data-cw-tick="i9"]')?.getAttribute("aria-checked") === "true" && document.querySelector('[data-cw-who="i11"]')?.innerText.trim() === "Russell");
    ok(await p.locator('[data-cw-item="i9"] [data-cw-wait]').count() === 1 && await p.locator('[data-cw-item="i11"] [data-cw-wait]').count() === 1, "both are still there, still waiting, after the app is closed and opened");
    const before = { tick: landedN(calls, "list_update", (b) => b.itemId === "i9"), give: landedN(calls, "list_update", (b) => b.itemId === "i11") };
    ctl.down = false;
    await online(p);
    await p.waitForFunction(() => !document.querySelector("[data-cw-list] [data-cw-wait]") && document.querySelector('[data-cw-tick="i9"]').getAttribute("aria-checked") === "true");
    await p.evaluate(() => window.RIG.crew.flush());
    await online(p);
    await later(300);
    ok(before.tick === 0 && landedN(calls, "list_update", (b) => b.itemId === "i9" && b.done === true) === 1 && item("i9").done === true, "the tick sends when the signal returns, exactly once", landedN(calls, "list_update", (b) => b.itemId === "i9"));
    ok(before.give === 0 && landedN(calls, "list_update", (b) => b.itemId === "i11" && b.assignedTo === "u-russ") === 1 && item("i11").assignedTo === "u-russ", "and so does the name", landedN(calls, "list_update", (b) => b.itemId === "i11"));
    const extra = db.list["t-sat"].filter((i) => i.label === "Extra jigs");
    ok(landedN(calls, "list_add", (b) => b.label === "Extra jigs") === 1 && extra.length === 1 && extra[0].done === true &&
      landedN(calls, "list_update", (b) => b.itemId === (extra[0] || {}).id && b.done === true) === 1, "the new line goes up once, and its tick follows it under the line's real id",
      calls.landed.filter((b) => /^list_/.test(b.action)).slice(-4));
    ok(await waiting(p) === 0, "nothing is left waiting");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();

    // Coach, the owner: any line can be renamed or deleted.
    const ctx2 = await browser.newContext(phone);
    const o = await crew(ctx2, { who: "owner", trips, list });
    await weather(ctx2);
    const q = await open(ctx2, base + "#/crew/trip/t-sat", "owner");
    await q.waitForSelector('[data-view="crewtrip"] [data-cw-item="i12"]');
    await q.locator('[data-cw-who="i12"]').click();
    await q.waitForSelector('[data-cw-item="i12"] [data-cw-panel]');
    ok(await q.locator('[data-cw-item="i12"] [data-cw-item-rename]').count() === 1 && await q.locator('[data-cw-item="i12"] [data-cw-item-del]').count() === 1, "the owner can rename and delete a line someone else added");
    ok(await q.locator("[data-cw-tell]").count() === 0, "and with nobody else's alerts on there is no Tell row");
    await q.locator('[data-cw-item="i12"] [data-cw-give="u-dad"]').click();
    await q.waitForFunction(() => document.querySelector('[data-cw-who="i12"]').innerText.trim() === "Dad" && !document.querySelector('[data-cw-item="i12"] [data-cw-wait]'));
    const g = o.calls.landed.filter((b) => b.action === "list_update").pop() || {};
    ok(g.assignedTo === "u-dad" && !("tell" in g), "so nothing about telling is sent", g);
    ok(q.errs.length === 0 && o.calls.other.length === 0, "no page errors, nothing unexpected asked", q.errs.concat(o.calls.other).join(" | "));
    await ctx2.close();

    // A trip with nothing on its list yet.
    const ctx3 = await browser.newContext(phone);
    await crew(ctx3, { who: "member", trips });
    await weather(ctx3);
    const e = await open(ctx3, base + "#/crew/trip/t-sat", "member");
    await e.waitForSelector('[data-view="crewtrip"] [data-cw-item-new]');
    ok(/nothing on the list yet/i.test(await text(e, "[data-cw-list-sum]")) && await e.locator("[data-cw-item]").count() === 0, "an empty list says so, with the box to add the first line", await text(e, "[data-cw-list-sum]"));
    ok(await e.locator("[data-cw-catches] [data-cw-catchbox]").count() === 0 && await e.locator("[data-cw-catch-open]").count() === 0, "and a trip whose day has not come has no catches part");
    await ctx3.close();
  }

  // --------------------------------------------------------------------
  // Catches. Russell, on a trip that is today. Coach has already logged one.
  {
    const trips = [mkTrip({ id: "t-today", date: "2026-11-23" }), mkTrip({ id: "t-later", date: "2026-11-28", title: "Squid at Des Moines Pier", planId: "squid-des-moines", spotId: "des-moines-pier" })];
    const coachPhoto = STORE + "public/catch-photos/u-coach/f1.jpg";
    const catches = { "t-today": [{ id: "f1", species: "Squid", lengthIn: 11, weightLb: null, lure: "Green jig", notes: "On the drop", photoUrl: coachPhoto, by: "u-coach", at: "2026-11-23T19:40:00Z" }],
      "t-later": [{ id: "f2", species: "Squid", lengthIn: null, weightLb: null, lure: "", notes: "", photoUrl: null, by: "u-coach", at: "2026-11-23T19:45:00Z" }] };
    const ctx = await browser.newContext(phone);
    const { calls, db, ctl } = await crew(ctx, { who: "member", trips, catches });
    await weather(ctx);
    const p = await open(ctx, base + "#/crew/trip/t-today", "member");
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-catch="f1"]');
    const shown = (sel) => p.waitForFunction((s) => { const i = document.querySelector(s); return !!i && i.complete && i.naturalWidth > 0; }, sel);

    // The list of catches: photo, who, what, size, lure, note, time.
    await shown('[data-cw-catch="f1"] [data-cw-photo] img');
    const f1 = (await text(p, '[data-cw-catch="f1"]')).replace(/\s+/g, " ");
    ok((await text(p, '[data-cw-catch="f1"] [data-cw-catch-who]')).trim() === "Coach" && (await text(p, '[data-cw-catch="f1"] [data-cw-catch-what]')).trim() === "Squid" &&
      (await text(p, '[data-cw-catch="f1"] [data-cw-catch-size]')).trim() === "11 in" && /Green jig/.test(f1) && /On the drop/.test(f1) && /Mon 11:40 AM/.test(f1),
      "a catch shows who, what, size, lure, note and time", f1);
    ok(await p.locator('[data-cw-catch="f1"] [data-cw-catch-del]').count() === 0, "someone else's catch has no Delete");
    ok(/^Log a fish$/.test((await text(p, "[data-cw-catch-open]")).trim()) && await p.locator("[data-cw-catch-form]").count() === 0, "once the day has come there is Log a fish, and the form waits behind it");
    const thumb = await p.locator('[data-cw-catch="f1"] [data-cw-photo]').boundingBox();
    ok(thumb.width <= 120 && thumb.height <= 120 && thumb.height >= 44, "the photo is small in the list", thumb);
    ok((await short(p, TAPS)).length === 0, "every control on the trip page with catches is a full tap target", await short(p, TAPS));
    await fits(p, "a trip page with a catch");

    // Tap the photo: large, inside the page.
    const urlBefore = p.url();
    await p.locator('[data-cw-catch="f1"] [data-cw-photo]').click();
    await p.waitForSelector("[data-cw-photo-big] img");
    await shown("[data-cw-photo-big] img");
    const big = await p.locator("[data-cw-photo-big] img").boundingBox();
    ok(p.url() === urlBefore && big.width > 200 && big.width <= 390 && await p.context().pages().length === 1, "a tap shows the photo large, inside the page", big);
    await fits(p, "the large photo");
    await settle();
    await p.locator("[data-cw-photo-close]").click();
    await p.waitForFunction(() => !document.querySelector("[data-cw-photo-big]"));
    ok(await p.locator('[data-cw-catch="f1"]').count() === 1, "and Close puts it away");

    // Log a fish, with no photo.
    await p.locator("[data-cw-catch-open]").click();
    await p.waitForSelector("[data-cw-catch-form] [data-cw-catch-species]");
    ok(await p.locator("[data-cw-catch-species]").inputValue() === "Squid", "the fish is filled in from the trip", await p.locator("[data-cw-catch-species]").inputValue());
    const kinds = await p.evaluate(() => ({ len: document.querySelector("[data-cw-catch-len]").inputMode, wt: document.querySelector("[data-cw-catch-wt]").inputMode,
      photo: document.querySelector("[data-cw-catch-photo]").type + ":" + document.querySelector("[data-cw-catch-photo]").accept + ":" + document.querySelector("[data-cw-catch-photo]").hasAttribute("capture"),
      lens: /inch/i.test(document.querySelector("[data-cw-catch-len]").closest("label").innerText), wts: /pound/i.test(document.querySelector("[data-cw-catch-wt]").closest("label").innerText) }));
    ok(kinds.len === "decimal" && kinds.wt === "decimal" && kinds.lens && kinds.wts, "length in inches and weight in pounds, on number keyboards", kinds);
    ok(kinds.photo === "file:image/*:false", "the photo is the phone's own picker: camera or library", kinds.photo);
    ok((await texts(p, '[data-cw-tell="catch"] [data-cw-tell-id]')).join() === "Coach", "the Tell row is on the form");
    ok((await short(p, TAPS)).length === 0, "every control on the form is a full tap target", await short(p, TAPS));
    await fits(p, "the log a fish form");
    await p.locator("[data-cw-catch-species]").fill("");
    await p.locator("[data-cw-catch-save]").click();
    await p.waitForFunction(() => /which fish/i.test(document.querySelector("[data-cw-catch-msg]")?.innerText || ""));
    await p.locator("[data-cw-catch-species]").fill("Market squid");
    await p.locator("[data-cw-catch-len]").fill("fourteen");
    await settle();
    await p.locator("[data-cw-catch-save]").click();
    await p.waitForFunction(() => /number/i.test(document.querySelector("[data-cw-catch-msg]")?.innerText || ""));
    ok(calls.rest.length === 0 && calls.store.length === 0, "no fish named, or a length that is not a number, says so and sends nothing");
    await p.locator("[data-cw-catch-len]").fill("14");
    await p.locator("[data-cw-catch-wt]").fill("1.5");
    await p.locator("[data-cw-catch-lure-in]").fill("Pink jig");
    await p.locator("[data-cw-catch-note-in]").fill("First cast");
    await settle();
    await p.locator("[data-cw-catch-save]").dblclick();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-catch]")].some((e) => /Market squid/.test(e.innerText) && !e.querySelector("[data-cw-wait]")));
    const posts = calls.restLanded.filter((c) => c.m === "POST"), row = (posts[0] || {}).row || {};
    ok(posts.length === 1 && UUID.test(row.id || "") && row.user_id === "u-russ" && row.species === "Market squid" && row.length === 14 && row.weight === 1.5 && row.lure === "Pink jig" &&
      row.notes === "First cast" && row.state_code === "WA" && row.spot_name === "Redondo Pier" && !("photo_url" in row) && !isNaN(Date.parse(row.catch_date)),
      "it is written once to that person's own CastAI catch log, in inches and pounds", row);
    ok(posts[0] && posts[0].prefer === "resolution=merge-duplicates" && posts[0].auth === "Bearer tok-123", "with their own token, safe to resend", posts[0] && [posts[0].prefer, posts[0].auth]);
    ok(calls.store.length === 0, "no photo, so nothing goes to the photo store");
    const links = calls.landed.filter((b) => b.action === "catch_link");
    ok(links.length === 1 && links[0].tripId === "t-today" && links[0].catchId === row.id && same(links[0].tell, ["u-coach"]), "then linked to the trip, once, with the ticked names as tell", links);
    const mine = `[data-cw-catch="${row.id}"]`;
    ok((await text(p, mine + " [data-cw-catch-who]")).trim() === "Russell" && (await text(p, mine + " [data-cw-catch-size]")).trim() === "14 in, 1.5 lb" && /Pink jig/.test(await text(p, mine)) && /First cast/.test(await text(p, mine)),
      "it joins the catches, with its size, lure and note", (await text(p, mine)).replace(/\s+/g, " "));
    ok(await p.locator(mine + " [data-cw-photo]").count() === 0 && await p.locator(mine + " [data-cw-catch-del]").count() === 1, "no photo to show, and Delete because it is yours");
    ok(await p.locator("[data-cw-catch-form]").count() === 0 && await p.locator("[data-cw-catch-open]").count() === 1, "the form shuts when the fish is in");

    // With a photo.
    await p.locator("[data-cw-catch-open]").click();
    await p.waitForSelector("[data-cw-catch-form] [data-cw-catch-species]");
    ok(await p.locator("[data-cw-catch-species]").inputValue() === "Squid" && await p.locator("[data-cw-catch-len]").inputValue() === "" && await p.locator("[data-cw-catch-preview]").count() === 0, "the form starts clean the next time");
    await p.locator("[data-cw-catch-photo]").setInputFiles({ name: "fish.png", mimeType: "image/png", buffer: FISH });
    await shown("[data-cw-catch-preview]");
    const pre = await p.locator("[data-cw-catch-preview]").boundingBox();
    ok(pre.width <= 160 && pre.height <= 160 && pre.width >= 40, "the chosen photo shows small before it is sent", pre);
    ok(calls.store.length === 0, "and nothing is sent by choosing it");
    await fits(p, "the form with a photo chosen");
    await p.locator("[data-cw-catch-save]").click();
    await p.waitForFunction(() => document.querySelectorAll("[data-cw-catch] [data-cw-photo]").length === 2 && !document.querySelector("[data-cw-catches] [data-cw-wait]"));
    const puts = calls.storeLanded.filter((c) => c.m === "PUT"), row2 = (calls.restLanded.filter((c) => c.m === "POST")[1] || {}).row || {};
    ok(puts.length === 1 && puts[0].path === "u-russ/" + row2.id + ".jpg" && puts[0].type === "image/jpeg" && puts[0].upsert === "true" && puts[0].auth === "Bearer tok-123",
      "the photo goes up once, as a JPEG, to that person's own folder", puts);
    ok(row2.photo_url === STORE + "public/catch-photos/u-russ/" + row2.id + ".jpg" && !("length" in row2) && !("weight" in row2) && !("lure" in row2) && !("notes" in row2),
      "the catch log row carries the photo's address, and none of the parts left empty", row2);
    ok(landedN(calls, "catch_link", (b) => b.catchId === row2.id) === 1, "and it is linked once");
    const mine2 = `[data-cw-catch="${row2.id}"]`;
    await shown(mine2 + " [data-cw-photo] img");
    ok(true, "its photo shows in the list");

    // Delete your own: the link, the row and the photo.
    await p.locator(mine2 + " [data-cw-catch-del]").click();
    await p.waitForSelector(`[data-cw-catch-del-yes="${row2.id}"]`);
    ok(p.dialogs() === 0 && landedN(calls, "catch_delete") === 0, "Delete asks first, inside the page");
    await settle();
    await p.locator(`[data-cw-catch-del-yes="${row2.id}"]`).dblclick();
    await p.waitForFunction((s) => !document.querySelector(s), mine2);
    await drained(p);
    ok(landedN(calls, "catch_delete", (b) => b.catchId === row2.id) === 1 && !db.catches["t-today"].some((f) => f.id === row2.id), "then the link goes, once");
    ok(calls.restLanded.filter((c) => c.m === "DELETE" && c.id === row2.id).length === 1 && !db.logs[row2.id], "the row leaves their CastAI catch log, once", calls.rest.filter((c) => c.m === "DELETE"));
    ok(calls.storeLanded.filter((c) => c.m === "DELETE" && c.path === "u-russ/" + row2.id + ".jpg").length === 1 && !db.photos["u-russ/" + row2.id + ".jpg"], "and the photo leaves the store, once", calls.store.filter((c) => c.m === "DELETE"));

    // A photo already seen opens with no signal.
    const kept = () => p.evaluate(async (u) => !!(window.caches && await (await caches.open("rigphotos-v1")).match(u)), coachPhoto);
    for (let i = 0; i < 100 && !(await kept()); i++) await later(50);
    ok(await kept(), "a photo that has been on screen is kept on the phone");
    ctl.down = true;
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-catch="f1"]');
    await shown('[data-cw-catch="f1"] [data-cw-photo] img');
    ok(true, "with no signal a catch that was seen still opens, with its photo");
    await p.locator('[data-cw-catch="f1"] [data-cw-photo]').click();
    await shown("[data-cw-photo-big] img");
    ok(true, "large too");
    await settle();
    await p.locator("[data-cw-photo-close]").click();
    await p.waitForFunction(() => !document.querySelector("[data-cw-photo-big]"));

    // A fish at the pier, with no signal: it shows at once with its photo, and goes up once.
    const n0 = { put: calls.storeLanded.filter((c) => c.m === "PUT").length, post: calls.restLanded.filter((c) => c.m === "POST").length, link: landedN(calls, "catch_link") };
    await p.locator("[data-cw-catch-open]").click();
    await p.waitForSelector("[data-cw-catch-form] [data-cw-catch-species]");
    await p.locator("[data-cw-catch-wt]").fill("2");
    await p.locator("[data-cw-catch-photo]").setInputFiles({ name: "fish.png", mimeType: "image/png", buffer: FISH });
    await shown("[data-cw-catch-preview]");
    await p.locator("[data-cw-catch-save]").click();
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-catch]")].some((e) => /waiting to send/i.test(e.innerText) && e.querySelector("[data-cw-photo] img")));
    const wid = await p.evaluate(() => [...document.querySelectorAll("[data-cw-catch]")].find((e) => /waiting to send/i.test(e.innerText)).getAttribute("data-cw-catch"));
    const wsel = `[data-cw-catch="${wid}"]`;
    await shown(wsel + " [data-cw-photo] img");
    const dims = await p.locator(wsel + " [data-cw-photo] img").evaluate((i) => [i.naturalWidth, i.naturalHeight]);
    ok(dims[0] === 1600 && dims[1] === 1200, "a catch made with no signal shows at once with its photo, shrunk to 1600 px on the long side", dims);
    ok((await text(p, wsel + " [data-cw-catch-size]")).trim() === "2 lb" && /waiting to send/i.test(await text(p, wsel)), "marked waiting to send", (await text(p, wsel)).replace(/\s+/g, " "));
    ok(await p.locator("[data-cw-catch-form]").count() === 0, "and the form shuts");
    ok(calls.storeLanded.filter((c) => c.m === "PUT").length === n0.put && calls.restLanded.filter((c) => c.m === "POST").length === n0.post && landedN(calls, "catch_link") === n0.link, "nothing has reached a server");
    await fits(p, "a trip page with a catch waiting");
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector(wsel);
    await shown(wsel + " [data-cw-photo] img");
    ok(/waiting to send/i.test(await text(p, wsel)), "it is still there with its photo, still waiting, after the app is closed and opened");
    ctl.down = false;
    await online(p);
    await p.waitForFunction((s) => document.querySelector(s) && !document.querySelector(s + " [data-cw-wait]"), wsel);
    await p.evaluate(() => window.RIG.crew.flush());
    await online(p);
    await later(400);
    ok(calls.storeLanded.filter((c) => c.m === "PUT").length === n0.put + 1 && calls.restLanded.filter((c) => c.m === "POST").length === n0.post + 1 && landedN(calls, "catch_link") === n0.link + 1,
      "when the signal returns the photo, the catch and the link each go up exactly once",
      [calls.storeLanded.filter((c) => c.m === "PUT").length - n0.put, calls.restLanded.filter((c) => c.m === "POST").length - n0.post, landedN(calls, "catch_link") - n0.link]);
    ok(db.catches["t-today"].some((f) => f.id === wid && f.weightLb === 2 && /u-russ/.test(f.photoUrl || "")) && await waiting(p) === 0, "the crew has it, and nothing is left waiting");
    await shown(wsel + " [data-cw-photo] img");
    ok(await p.locator(wsel + " [data-cw-photo] img").count() === 1, "and its photo is still on the row");

    // A trip whose day has not come, but which holds a catch: the part shows.
    await p.goto(base + "#/crew/trip/t-later", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-later"] [data-cw-catch="f2"]');
    ok(await p.locator("[data-cw-catch-open]").count() === 1 && await p.locator('[data-cw-catch="f2"] [data-cw-photo]').count() === 0 && await p.locator('[data-cw-catch="f2"] [data-cw-catch-size]').count() === 0,
      "a trip that already holds a catch shows it whatever the day, with no photo or size when there is none");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    // Signing out takes the kept photos off the phone.
    ok(await p.evaluate(() => caches.has("rigphotos-v1")), "(the kept photos are there while signed in)");
    await p.evaluate(() => window.RIG.crew.signOut());
    for (let i = 0; i < 40 && await p.evaluate(() => caches.has("rigphotos-v1")); i++) await later(50);
    ok(!(await p.evaluate(() => caches.has("rigphotos-v1"))), "signing out takes the kept photos off the phone");
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // The Tell row on every screen that can alert someone. Russell; Coach and Dad have alerts on.
  {
    const trips = [
      mkTrip({ id: "t-idea", date: "2026-11-27", status: "idea", by: COACH }),
      mkTrip({ id: "t-on", date: "2026-11-28", status: "planned", by: COACH, title: "Squid at Les Davis Pier", planId: "squid-les-davis", spotId: "les-davis" }),
      mkTrip({ id: "t-mine", title: "Chum on the Green", planId: "chum-green-river", spotId: "green-river", species: "chum", date: "2026-11-28", status: "planned", by: RUSS, going: [{ ...RUSS, answer: "going" }] })];
    const ctx = await browser.newContext(phone);
    const { calls } = await crew(ctx, { who: "member", trips, alerts: ["u-coach", "u-dad", "u-russ"] });
    await weather(ctx);
    const p = await open(ctx, base, "member");
    await p.waitForSelector('[data-day="2026-11-24"] [data-hot="squid-redondo"]');
    const names = async (key) => (await texts(p, `[data-cw-tell="${key}"] [data-cw-tell-id]`)).join();
    const ticked = async (key) => (await attrs(p, `[data-cw-tell="${key}"] [data-cw-tell-id]`, "aria-pressed")).join();
    const last = (action) => calls.landed.filter((b) => b.action === action).pop() || {};

    // Planning a trip.
    await p.locator("[data-cw-plan]").click();
    await p.waitForSelector('[data-view="crewnew"] [data-cw-tell="new"]');
    ok(await names("new") === "Coach,Dad" && await ticked("new") === "true,true", "planning a trip: the Tell row has everyone else with alerts on, all ticked, and never yourself", await names("new"));
    ok((await short(p, '[data-view="crewnew"] button')).length === 0, "its names are full tap targets", await short(p, '[data-view="crewnew"] button'));
    await p.locator('[data-cw-tell="new"] [data-cw-tell-id="u-dad"]').click();
    ok(await ticked("new") === "true,false", "a tap unticks one");
    await p.locator("[data-cw-what]").selectOption("squid-redondo");
    ok(await ticked("new") === "true,false", "and the form changing under it does not tick it again");
    await fits(p, "the plan a trip screen with the Tell row");
    await p.locator("[data-cw-create]").click();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-title]');
    ok(same(last("trip_create").tell, ["u-coach"]), "planning sends the ticked ids as tell", last("trip_create").tell);

    // A Hot Trip.
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector('[data-day="2026-11-24"] [data-hot="squid-redondo"]');
    await p.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').click();
    await p.waitForSelector('[data-view="hot"] [data-cw-tell="hot"]');
    ok(await names("hot") === "Coach,Dad" && await ticked("hot") === "true,true", "a Hot Trip's buttons: the Tell row, all ticked again", await ticked("hot"));
    ok((await short(p, "[data-cw-make] button, [data-cw-make] a")).length === 0 && await p.locator('[data-view="hot"] .cw-go').count() === 1, "full tap targets, and still one gold button");
    await fits(p, "a run card with the Tell row");
    await p.locator('[data-cw-do="idea"]').click();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-title]');
    ok(last("trip_create").status === "idea" && same(last("trip_create").tell, ["u-coach", "u-dad"]), "Float it sends everyone ticked", last("trip_create").tell);

    // Calling an idea on.
    await p.goto(base + "#/crew/trip/t-idea", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-idea"] [data-cw-tell="status"]');
    ok(await names("status") === "Coach,Dad", "a trip's status buttons: the Tell row");
    await p.locator('[data-cw-tell="status"] [data-cw-tell-id="u-coach"]').click();
    await p.locator('[data-cw-tell="status"] [data-cw-tell-id="u-dad"]').click();
    await p.locator('[data-cw-status="planned"]').click();
    await p.waitForFunction(() => (document.querySelector('[data-view="crewtrip"] [data-cw-tag]')?.innerText || "").trim().toLowerCase() === "on");
    ok(last("trip_update").status === "planned" && same(last("trip_update").tell, []), "It is on with nobody ticked sends an empty tell", last("trip_update"));

    // A planned trip that is not yours: nothing to call, so no row at the foot.
    await p.goto(base + "#/crew/trip/t-on", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-on"] [data-cw-tell="note"]');
    ok(await p.locator('[data-cw-tell="status"]').count() === 0 && await names("note") === "Coach,Dad", "no status to change means no Tell row there, and the note box keeps its own");

    // Your own planned trip: moving the day tells, a new note does not, done does not, delete does.
    await p.goto(base + "#/crew/trip/t-mine/edit", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-edit-form] [data-cw-tell="edit"]');
    ok(await names("edit") === "Coach,Dad" && await ticked("edit") === "true,true", "the edit screen: the Tell row");
    await p.locator("[data-cw-edit-note]").click();
    await later(150);
    ok(p.url().endsWith("#/crew/trip/t-mine/edit") && await p.locator("[data-cw-edit-form]").count() === 1, "tapping into a box on the edit screen stays on the edit screen", p.url());
    await fits(p, "the edit screen with the Tell row");
    await p.locator("[data-cw-edit-date]").fill("2026-11-29");
    await p.locator("[data-cw-save]").click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-mine"] [data-cw-acts]', { state: "attached" });
    ok(last("trip_update").date === "2026-11-29" && same(last("trip_update").tell, ["u-coach", "u-dad"]), "moving the day sends tell", last("trip_update"));
    await p.goto(base + "#/crew/trip/t-mine/edit", { waitUntil: "load" });
    await p.waitForSelector("[data-cw-edit-note]");
    await p.locator("[data-cw-edit-note]").fill("Park at the bridge");
    await p.locator("[data-cw-save]").click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-mine"] [data-cw-acts]', { state: "attached" });
    ok(last("trip_update").note === "Park at the bridge" && !("tell" in last("trip_update")), "a changed note alerts nobody, so it sends no tell", last("trip_update"));
    ok(await p.locator('[data-cw-tell="status"]').count() === 1, "a planned trip of yours can be called off, so the row is at its foot");
    await p.locator('[data-cw-status="done"]').click();
    await p.waitForFunction(() => (document.querySelector('[data-view="crewtrip"] [data-cw-tag]')?.innerText || "").trim().toLowerCase() === "done");
    ok(last("trip_update").status === "done" && !("tell" in last("trip_update")), "marking it done alerts nobody, so it sends no tell", last("trip_update"));
    ok(await p.locator('[data-cw-tell="status"]').count() === 0, "and a done trip has no Tell row at its foot");
    await p.locator("[data-cw-delete]").click();
    await p.waitForSelector("[data-cw-delete-yes]");
    ok(await names("status") === "Coach,Dad", "deleting asks, with the Tell row");
    await p.locator('[data-cw-tell="status"] [data-cw-tell-id="u-coach"]').click();
    await settle();
    await p.locator("[data-cw-delete-yes]").click();
    await p.waitForSelector('[data-view="trips"]');
    ok(last("trip_delete").tripId === "t-mine" && same(last("trip_delete").tell, ["u-dad"]), "and delete sends the ticked ids", last("trip_delete"));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();

    // Coach, and nobody else has alerts on: no Tell row anywhere, and no tell is sent.
    const today = [mkTrip({ id: "t-idea", date: "2026-11-23", status: "idea", by: COACH })];
    const ctx2 = await browser.newContext(phone);
    const o = await crew(ctx2, { who: "owner", trips: today, alerts: ["u-coach"] });
    await weather(ctx2);
    const q = await open(ctx2, base, "owner");
    await q.waitForSelector('[data-day="2026-11-24"] [data-hot="squid-redondo"]');
    const none = async (what) => ok(await q.locator("[data-cw-tell]").count() === 0, "nobody else has alerts on: no Tell row on " + what, await q.locator("[data-cw-tell]").count());
    const lastO = (action) => o.calls.landed.filter((b) => b.action === action).pop() || {};
    await q.locator("[data-cw-plan]").click();
    await q.waitForSelector('[data-view="crewnew"] [data-cw-what]');
    await none("the plan a trip screen");
    await q.locator("[data-cw-what]").selectOption("squid-redondo");
    await q.locator("[data-cw-date]").fill("2026-11-25");
    await q.locator("[data-cw-create]").click();
    await q.waitForSelector('[data-view="crewtrip"] [data-cw-title]');
    ok(lastO("trip_create").planId === "squid-redondo" && !("tell" in lastO("trip_create")), "and planning sends no tell at all", Object.keys(lastO("trip_create")));
    await q.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"), { waitUntil: "load" });
    await q.waitForSelector('[data-view="hot"] [data-cw-do="planned"]');
    await none("a Hot Trip");
    await q.goto(base + "#/crew/trip/t-idea", { waitUntil: "load" });
    await q.waitForSelector('[data-view="crewtrip"][data-trip="t-idea"] [data-cw-note-text]');
    await q.locator("[data-cw-catch-open]").click();
    await q.waitForSelector("[data-cw-catch-form]");
    await none("a trip page, its note box or its catch form");
    await q.locator('[data-cw-notes=""] [data-cw-note-text]').fill("See you there");
    await q.locator('[data-cw-note-add=""]').click();
    await q.waitForFunction(() => [...document.querySelectorAll("[data-cw-note]")].some((e) => /See you there/.test(e.innerText) && !e.querySelector("[data-cw-wait]")));
    ok(lastO("comment_add").body === "See you there" && !("tell" in lastO("comment_add")), "a note sends no tell", Object.keys(lastO("comment_add")));
    await q.locator('[data-cw-status="planned"]').click();
    await q.waitForFunction(() => (document.querySelector('[data-view="crewtrip"] [data-cw-tag]')?.innerText || "").trim().toLowerCase() === "on");
    ok(same(Object.keys(lastO("trip_update")).sort(), ["action", "status", "tripId"]), "It is on sends the status and nothing else", Object.keys(lastO("trip_update")));
    await q.goto(base + "#/crew/trip/t-idea/gear", { waitUntil: "load" });
    await q.waitForSelector('[data-view="crewtrip"][data-sec="gear"] [data-cw-note-text]');
    await none("a section");
    ok(q.errs.length === 0 && o.calls.other.length === 0, "no page errors, nothing unexpected asked", q.errs.concat(o.calls.other).join(" | "));
    await ctx2.close();
  }

  // --------------------------------------------------------------------
  // Signed out: a section link is the sign-in screen, and asks for nothing else.
  {
    const ctx = await browser.newContext(phone);
    const { calls } = await crew(ctx, { who: "member", trips: [mkTrip({ id: "t-sat" })] });
    await weather(ctx);
    const p = await open(ctx, base + "#/crew/trip/t-sat/gear");
    await p.waitForSelector("[data-signin] [data-phone]");
    await later(300);
    ok(await p.locator('[data-view="crewtrip"], [data-cw-note], [data-cw-item], [data-cw-catch], [data-cw-tell]').count() === 0, "signed out, a section link shows the sign-in screen and nothing of the trip");
    ok(calls.fn.every((b) => b.action === "hello") && calls.rest.length === 0 && calls.store.length === 0 && calls.photoGets === 0, "and asks the servers for nothing but hello", calls.fn.map((b) => b.action));
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-call]");
    ok(await p.locator("[data-cw-tell], [data-cw-note], [data-cw-item], [data-cw-catch]").count() === 0, "signed out, the Trips tab has none of it either");
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }
} catch (e) {
  fail++; console.log("FAIL threw", e.message.split("\n")[0]);
} finally {
  clearTimeout(watchdog);
  if (browser) await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
