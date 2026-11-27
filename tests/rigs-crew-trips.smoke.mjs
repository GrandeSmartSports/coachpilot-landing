// The call, crew trips on the Trips tab, planning a trip and a trip's own
// page, in the real page at phone width. Run: node tests/rigs-crew-trips.smoke.mjs
//
// Nothing here reaches a real server. The weather, the tides and the crew
// function are all stand-ins, and a catch-all route fails the test if the
// page asks Supabase for anything a test did not expect.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8802;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 280000);
watchdog.unref?.();

const SITE = "https://coachpilot.org/rigs/";
const NOW = new Date("2026-11-23T12:00:00-08:00"); // a Monday, noon
const TOKEN = "Ab3_dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const PHONE = /\(?\b\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const ASK = /\bsign(ed|ing)?[ -]?(in|out|up)\b|\blog ?in\b|\bcrew\b|\bjoin\b|\bcode\b/i;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const pad = (n) => String(n).padStart(2, "0");

// ---- the forecast: a calm week, or one where a day (or every day) blows ----
const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
function wxPoint(windy) {
  const time = [], t = [], p = [], w = [], g = [];
  for (const d of DAYS) for (let h = 0; h < 24; h++) {
    time.push(`${d}T${pad(h)}:00`); t.push(45); p.push(0);
    const bad = windy === "all" || windy === d;
    w.push(bad ? 28 : 4); g.push(bad ? 42 : 8);
  }
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
// Returns a switch: set .down = true and every forecast call fails like no signal.
async function weather(ctx, { windy = "" } = {}) {
  const sw = { down: false };
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => sw.down ? r.abort() : json(r, 200, { checked: NOW.toISOString(), rules: [] }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => sw.down ? r.abort() : json(r, 200, { observed: { data: [{ validTime: "2026-11-23T19:00:00Z", primary: 0.41 }] },
    forecast: { data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }));
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    if (sw.down) return route.abort();
    const u = route.request().url(), n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
    return json(route, 200, /marine-api/.test(u) ? Array.from({ length: n }, marine) : /open-meteo/.test(u) ? Array.from({ length: n }, () => wxPoint(windy)) : tides);
  });
  return sw;
}

// ---- the crew function: a small stand-in that remembers its trips ----------
const COACH = { id: "u-coach", name: "Coach Grande" }, RUSS = { id: "u-russ", name: "Russell" }, DAD = { id: "u-dad", name: "Dad" };
const MEMBERS = [
  { id: "u-coach", name: "Coach Grande", role: "owner", alerts: true, signIn: "code" },
  { id: "u-russ", name: "Russell", role: "member", alerts: false, signIn: "link" },
  { id: "u-dad", name: "Dad", role: "member", alerts: false, signIn: "code" }];
let stampN = 0;
const stamp = () => new Date(Date.parse("2026-11-23T18:00:00Z") + (++stampN) * 1000).toISOString();
const mkTrip = (o) => Object.assign({ id: "t-x", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid at Redondo", date: "2026-11-24",
  from: null, to: null, status: "planned", note: null, by: COACH, going: [{ ...COACH, answer: "going" }],
  counts: { comments: 0, list: 0, listDone: 0, catches: 0 }, updatedAt: stamp() }, o);
const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

// opts: who ("owner"|"member"), trips, stateDelay, noCrew. ctl.down = true makes every crew call fail like no signal.
async function crew(ctx, opts = {}) {
  const who = opts.who === "member" ? RUSS : COACH;
  const db = { trips: (opts.trips || []).map((t) => JSON.parse(JSON.stringify(t))), n: 0 };
  const calls = { fn: [], landed: [], other: [], verify: [], otp: 0 };
  const ctl = { down: false };
  const state = () => ({ me: who, crew: opts.noCrew ? null : { id: "c1", name: "ZZTEST crew", role: opts.who === "member" ? "member" : "owner" },
    members: MEMBERS, trips: db.trips.slice().sort(byDate), sms: true });
  await ctx.route(/geigvuysptjvvqanumld\.supabase\.co/, (r) => { calls.other.push(r.request().method() + " " + r.request().url()); return json(r, 404, { error: "not stubbed" }); });
  await ctx.route(/\/auth\/v1\/otp/, (r) => { calls.otp++; return json(r, 200, {}); });
  await ctx.route(/\/auth\/v1\/verify/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    calls.verify.push(b);
    if (b.type !== "magiclink" && b.token !== "123456") return json(r, 403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
    return json(r, 200, { access_token: "tok-123", refresh_token: "ref-123", expires_in: 3600, user: { id: who.id } });
  });
  await ctx.route(/functions\/v1\/castai-crew/, async (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    calls.fn.push(body);
    if (ctl.down) return r.abort();
    const a = body.action, find = () => db.trips.find((t) => t.id === body.tripId);
    const answer = (status, b) => { if (status === 200) calls.landed.push(body); return json(r, status, b); };
    if (a === "hello") return answer(200, { ok: true, sms: true, vapidKey: "BKey" });
    if (a === "join") return body.token === TOKEN ? answer(200, Object.assign({ ok: true, name: who.name, crew: "ZZTEST crew", by: "Coach" }, body.peek ? {} : { token_hash: "hash-1" }))
      : answer(410, { error: "That link is not good any more. Ask for a new one." });
    if (a === "state") { if (opts.stateDelay) await later(opts.stateDelay); return answer(200, state()); }
    if (a === "prefs_get") return answer(200, { prefs: { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: true, pushSubs: 0 });
    if (a === "trip") { const t = find(); return t ? answer(200, { trip: t, comments: [], list: [], catches: [] }) : answer(404, { error: "That trip is not here any more." }); }
    if (a === "trip_create") {
      const t = mkTrip({ id: "t-new-" + (++db.n), planId: body.planId, spotId: body.spotId, species: body.species, title: body.title, date: body.date,
        from: body.from == null ? null : body.from, to: body.to == null ? null : body.to, status: body.status || "idea", note: body.note || null,
        by: who, going: [{ ...who, answer: "going" }], counts: { comments: 0, list: (body.seedList || []).length, listDone: 0, catches: 0 } });
      db.trips.push(t);
      return answer(200, { ok: true, trip: t });
    }
    if (a === "trip_update") {
      const t = find();
      if (!t) return answer(404, { error: "That trip is not here any more." });
      for (const k of ["status", "date", "from", "to", "note", "title"]) if (k in body) t[k] = body[k] === "" ? null : body[k];
      t.updatedAt = stamp();
      return answer(200, { ok: true, trip: t });
    }
    if (a === "trip_delete") { const i = db.trips.findIndex((t) => t.id === body.tripId); if (i < 0) return answer(404, { error: "gone" }); db.trips.splice(i, 1); return answer(200, { ok: true }); }
    if (a === "going") {
      const t = find();
      if (!t) return answer(404, { error: "That trip is not here any more." });
      t.going = t.going.filter((g) => g.id !== who.id).concat([{ ...who, answer: body.answer }]);
      t.updatedAt = stamp();
      return answer(200, { ok: true, going: t.going });
    }
    return answer(200, { ok: true });
  });
  return { calls, db, ctl };
}

const phone = { viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" };
const SESSION = { token: "tok-123", refresh: "ref-123", at: NOW.getTime() + 36e5, userId: "u-coach" };
const seed = (page, key, value) => page.addInitScript(([k, v]) => { if (!sessionStorage.getItem("seeded:" + k)) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem("seeded:" + k, "1"); } }, [key, value]);
const signIn = (page, who) => seed(page, "rig.session.v1", Object.assign({}, SESSION, who === "member" ? { userId: "u-russ" } : {}));
const text = (p, sel) => p.locator(sel).first().innerText();
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth);
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);
async function fits(p, what) {
  const w = await wide(p), t = await screenText(p);
  ok(w <= 390, what + ": nothing runs off the side at 390 px", w);
  ok(!PHONE.test(t) && !EMAIL.test(t), what + ": no phone number or email on screen", t.match(PHONE) || t.match(EMAIL));
}
// Every tap target on the screen that this stage added is 44 px tall or more.
const short = (p, sel) => p.evaluate((s) => [...document.querySelectorAll(s)].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44)
  .map((e) => (e.innerText || e.getAttribute("aria-label") || e.tagName).trim().slice(0, 30)), sel);
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

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();

  // --------------------------------------------------------------------
  // The call, for everyone. Signed out: no crew group, no plan buttons.
  {
    const ctx = await browser.newContext(phone);
    const { calls } = await crew(ctx);
    await weather(ctx);
    const p = await open(ctx, base);
    await p.waitForSelector("[data-call] [data-call-go]");
    ok((await text(p, "[data-call-headline]")).trim() === "Thursday evening. Razor clams, Copalis and Mocrocks.", "the call says when and what, in plain words", await text(p, "[data-call-headline]"));
    ok((await text(p, "[data-call-why]")).trim() === "Go, best 5:35 to 7:35 PM. WDFW dig at Copalis, low 7:35 PM, -1.8 ft.",
      "then one line of why: the trip's own read, its answer and its reason, in the same words", await text(p, "[data-call-why]"));
    ok((await text(p, "[data-call-leave]")).trim() === "Leave by 2:50 PM.", "then the next step: when to leave", await text(p, "[data-call-leave]"));
    ok(/^See the plan$/i.test((await text(p, "[data-call-go]")).trim()), "and one button: See the plan");
    const same = await p.evaluate(() => {
      const c = window.RIG.trips.cached();
      const plan = window.RIG.trips.plan({ today: "2026-11-23", wx: c.wx, tides: c.tides, flow: c.flow, waters: c.waters });
      const call = window.RIG.trips.theCall(plan, { nowHour: 12 });
      const top = Math.max(...plan.days.flatMap((d) => d.trips.map((t) => t.score)));
      return { planId: call.trip.planId, iso: call.day.iso, score: call.trip.score, top, headline: call.headline };
    });
    ok(same.score === same.top && same.headline === (await text(p, "[data-call-headline]")).trim(), "it is the highest score the week computed", same);
    ok(await p.locator('[data-view="trips"] .cw-go').count() === 1, "one gold button on the Trips tab", await p.locator('[data-view="trips"] .cw-go').count());
    const order = await p.evaluate(() => {
      const call = document.querySelector("[data-call]"), week = document.querySelector("[data-week]");
      return !!(call.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok(order, "the call sits above the week");
    ok(await p.locator("[data-day]").count() === 7 && await p.locator('[data-day="2026-11-26"] [data-hot="clams-ocean-shores"]').count() === 1,
      "the week below is still whole, with that trip still in its day");
    ok(await p.locator("[data-call] [data-hot], [data-call] [data-day]").count() === 0, "and the call is not a second copy of the row");
    ok(!ASK.test(await text(p, "[data-call]")), "the call says nothing about signing in", await text(p, "[data-call]"));
    ok(await p.locator("[data-cw-trips]").count() === 0 && await p.locator("[data-cw-plan]").count() === 0, "signed out: no crew trips group and no Plan a trip row");
    ok((await short(p, "[data-call] a, [data-call] button")).length === 0, "the call's button is a full tap target", await short(p, "[data-call] a, [data-call] button"));
    await fits(p, "the Trips tab, signed out");

    await p.locator("[data-call-go]").click();
    await p.waitForSelector('[data-view="hot"][data-run="clams-ocean-shores"]');
    ok(decodeURIComponent(p.url()).endsWith("#/trips/2026-11-26~clams-ocean-shores"), "See the plan opens that trip's run card, for that day", p.url());
    ok(await p.locator("[data-cw-do], [data-cw-open-trip], [data-cw-make]").count() === 0, "signed out: a run card has no plan buttons");
    const card = await screenText(p);
    ok(!ASK.test(card), "signed out: the run card says nothing about signing in", card.match(ASK));
    for (const tab of ["water", "fish", "learn"]) {
      await p.locator(`.top [data-tab="${tab}"]`).click();
      await p.waitForFunction((t) => document.querySelector('.top [data-tab="' + t + '"]').getAttribute("aria-selected") === "true", tab);
      ok(await p.locator("[data-cw-trips], [data-cw-plan], [data-cw-do], [data-cw-make], [data-call]").count() === 0, "signed out, the " + tab + " tab has no crew group, no plan buttons and no call");
    }
    await later(300);
    ok(calls.fn.length === 0 && calls.other.length === 0, "signed out, none of that asked the crew servers for anything", calls.fn.concat(calls.other));
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // A week with nothing good: it says so and why, and makes no trip up.
  {
    const ctx = await browser.newContext(phone);
    await crew(ctx);
    await weather(ctx, { windy: "all" });
    const p = await open(ctx, base);
    await p.waitForSelector("[data-call][data-call-none]");
    ok((await text(p, "[data-call-headline]")).trim() === "Nothing worth the drive this week.", "a week with nothing good says so", await text(p, "[data-call-headline]"));
    ok((await text(p, "[data-call-why]")).trim() === "Gusts to 42 mph today, and weather every day after.", "and why, from the days' own notes", await text(p, "[data-call-why]"));
    ok(await p.locator("[data-call-go]").count() === 0 && await p.locator("[data-call] a").count() === 0 && await p.locator("[data-call-leave]").count() === 0,
      "with no trip made up: no button, no leave time");
    ok(await p.locator("[data-hot]").count() === 0 && await p.locator("[data-day]").count() === 7, "the week below shows the same seven days, with nothing listed");
    await fits(p, "the Trips tab on a blown-out week");
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Signed in and on a crew: the Crew trips group, between the call and the week.
  {
    const trips = [
      mkTrip({ id: "t-past", title: "Chum on the Green", planId: "chum-green-river", spotId: "green-river", species: "chum", date: "2026-11-21", status: "planned" }),
      mkTrip({ id: "t-done", title: "Squid at Des Moines Pier", planId: "squid-des-moines", spotId: "des-moines-pier", date: "2026-11-23", status: "done" }),
      mkTrip({ id: "t-far", title: "Squid at Les Davis Pier", planId: "squid-les-davis", spotId: "les-davis", date: "2026-12-12", status: "idea", by: RUSS, going: [{ ...RUSS, answer: "maybe" }] }),
      mkTrip({ id: "t-sat", title: "Squid at Redondo", date: "2026-11-28", status: "planned",
        going: [{ ...COACH, answer: "going" }, { ...RUSS, answer: "going" }, { ...DAD, answer: "maybe" }] }),
      mkTrip({ id: "t-wed", title: "Winter salmon from Redondo Pier", planId: "salmon-redondo", spotId: "redondo", species: "king", date: "2026-11-25", status: "idea", by: RUSS,
        going: [{ ...RUSS, answer: "going" }, { ...COACH, answer: "out" }] })];
    const ctx = await browser.newContext(phone);
    const { calls } = await crew(ctx, { trips, stateDelay: 1200 });
    await weather(ctx);
    const p = await open(ctx, null, "owner");
    // What this phone saved last time: only Wednesday's idea, already seen.
    const wed = trips.find((t) => t.id === "t-wed");
    await seed(p, "rig.crew.v1", { me: COACH, crew: { id: "c1", name: "ZZTEST crew", role: "owner" }, members: MEMBERS, trips: [wed], sms: true, at: NOW.getTime() - 6e5 });
    await seed(p, "rig.crewseen.v1", { "t-wed": wed.updatedAt, "t-far": trips.find((t) => t.id === "t-far").updatedAt });
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-cw-trips] [data-cw-trip]");
    ok(calls.landed.filter((b) => b.action === "state").length === 0 && await p.locator("[data-cw-trip]").count() === 1 && await p.locator('[data-cw-trip="t-wed"]').count() === 1,
      "the saved crew trips show at once, before the server has answered", calls.landed.length);
    await p.waitForSelector('[data-cw-trip="t-sat"]');
    await p.waitForSelector("[data-call]");
    const rows = await p.locator("[data-cw-trips] [data-cw-trip]").evaluateAll((els) => els.map((e) => e.getAttribute("data-cw-trip")));
    ok(rows.join() === "t-wed,t-sat,t-far", "then the fresh ones: every trip that is not done and not past, soonest first", rows.join());
    const wedRow = (await text(p, '[data-cw-trip="t-wed"]')).replace(/\s+/g, " ");
    const satRow = (await text(p, '[data-cw-trip="t-sat"]')).replace(/\s+/g, " ");
    ok(/Winter salmon from Redondo Pier/.test(wedRow) && /Wed Nov 25/.test(wedRow), "a row has its title, day and date", wedRow);
    ok((await text(p, '[data-cw-trip="t-wed"] [data-cw-tag]')).trim().toLowerCase() === "idea" && (await text(p, '[data-cw-trip="t-sat"] [data-cw-tag]')).trim().toLowerCase() === "on",
      "an Idea or On tag", wedRow + " | " + satRow);
    ok(/Sat Nov 28/.test(satRow) && /Coach and Russell going/.test(satRow) && !/Dad/.test(satRow) && !/Grande/.test(satRow), "who is going, by first name, and only those going", satRow);
    ok(/^sat\s*28$/i.test((await text(p, '[data-cw-trip="t-sat"] .datestamp')).trim()) && await p.locator('[data-cw-trip="t-sat"] .av').count() === 2, "the card carries a date stamp and a face for each one going",
      await text(p, '[data-cw-trip="t-sat"] .datestamp'));
    ok(/Russell/.test(wedRow) && !/Coach/.test(wedRow), "someone who is out is not listed as going", wedRow);
    ok(await p.locator('[data-cw-trip="t-sat"] [data-cw-new]').count() === 1 && await p.locator('[data-cw-trip="t-wed"] [data-cw-new]').count() === 0,
      "a small dot on the trip this phone has not seen, none on the one it has");
    ok(await p.locator("[data-cw-plan]").getAttribute("href") === "#/crew/new" && /Plan a trip/.test(await text(p, "[data-cw-plan]")), "a Plan a trip row goes to #/crew/new");
    ok(/^new$/i.test((await text(p, '[data-cw-trip="t-sat"] [data-cw-new]')).trim()), "the mark on an unseen trip says New, in a word", await text(p, '[data-cw-trip="t-sat"] [data-cw-new]'));
    // Planning a trip and past trips sit at the foot with the crew row, so
    // the week starts straight under the crew's trips.
    const foot = await p.evaluate(() => {
      const plan = document.querySelector("[data-cw-plan]"), past = document.querySelector("[data-cw-past]"), crewRow = document.querySelector("[data-crew-open]");
      const grp = document.querySelector("[data-cw-trips]"), week = document.querySelector("[data-week]");
      const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { order: after(week, plan) && after(plan, past) && after(past, crewRow), oneList: plan.parentElement === crewRow.parentElement && past.parentElement === plan.parentElement,
        top: [...grp.querySelectorAll("a, button")].every((e) => e.matches("[data-cw-trip]")) };
    });
    ok(foot.order && foot.oneList && foot.top, "Plan a trip and Past trips are rows at the foot, in one list with the crew row; on top there are only the trips", foot);
    const where = await p.evaluate(() => {
      const call = document.querySelector("[data-call]"), grp = document.querySelector("[data-cw-trips]"), week = document.querySelector("[data-week]");
      const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return after(call, grp) && after(grp, week);
    });
    ok(where, "the group sits between the call and the week");
    ok(/Crew trips/i.test(await text(p, "[data-cw-trips] h2")), "under the heading Crew trips");

    // Past and done trips wait behind one row.
    ok(await p.locator('[data-cw-trip="t-past"], [data-cw-trip="t-done"]').count() === 0 && await p.locator("[data-cw-past]").count() === 1 &&
      /Past trips/.test(await text(p, "[data-cw-past]")), "past and done trips are behind a Past trips row, closed");
    await p.locator("[data-cw-past]").click();
    await p.waitForSelector('[data-cw-trip="t-past"]');
    ok(await p.locator('[data-cw-trip="t-done"]').count() === 1 && (await text(p, '[data-cw-trip="t-done"] [data-cw-tag]')).trim().toLowerCase() === "done", "a tap opens them, the done one tagged Done");
    // A past trip this phone has not opened says so in a word, the same pill
    // the trip card has, never a lone dot.
    const pastNew = await p.locator('[data-cw-trip="t-past"] [data-cw-new]').evaluateAll((els) => els.map((e) => ({ t: e.textContent.trim(), pill: e.classList.contains("pill"), w: Math.round(e.getBoundingClientRect().width) })));
    ok(pastNew.length === 1 && /^new$/i.test(pastNew[0].t) && pastNew[0].pill && pastNew[0].w > 30, "an unseen past trip is marked New, in a word", pastNew);
    ok((await short(p, "[data-cw-trips] a, [data-cw-trips] button")).length === 0, "every crew trips row is a full tap target", await short(p, "[data-cw-trips] a, [data-cw-trips] button"));
    await fits(p, "the Trips tab with crew trips");
    await p.locator("[data-cw-past]").click();
    await p.waitForFunction(() => !document.querySelector('[data-cw-trip="t-past"]'));
    ok(true, "and a second tap closes them");
    ok(await p.locator('[data-view="trips"] .cw-go').count() === 1, "still one gold button on the Trips tab");

    // Opening a trip clears its dot.
    await p.locator('[data-cw-trip="t-sat"]').click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-sat"] [data-cw-title]');
    await p.locator('[data-view="crewtrip"] [data-up]').click();
    await p.waitForSelector('[data-cw-trip="t-sat"]');
    ok(await p.locator('[data-cw-trip="t-sat"] [data-cw-new]').count() === 0, "a trip that has been opened loses its dot");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();

    // Signed in, but on no crew: no group.
    const ctx2 = await browser.newContext(phone);
    await crew(ctx2, { noCrew: true });
    await weather(ctx2);
    const p2 = await open(ctx2, base, "owner");
    await p2.waitForSelector("[data-call]");
    await later(400);
    ok(await p2.locator("[data-cw-trips]").count() === 0, "signed in but on no crew: no crew trips group");
    await ctx2.close();
  }

  // --------------------------------------------------------------------
  // A Hot Trip run card, signed in: We are doing this, and Float it.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db, ctl } = await crew(ctx, { who: "member" });
    await weather(ctx);
    const p = await open(ctx, base, "member");
    await p.waitForSelector('[data-day="2026-11-24"] [data-hot="squid-redondo"]');
    await p.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').click();
    await p.waitForSelector('[data-view="hot"] [data-cw-do="planned"]');
    ok(/^We are doing this$/i.test((await text(p, '[data-cw-do="planned"]')).trim()) && /^Float it$/i.test((await text(p, '[data-cw-do="idea"]')).trim()), "a run card has We are doing this and Float it");
    const under = await p.evaluate(() => {
      const rows = [...document.querySelectorAll('[data-view="hot"] [data-sec-row]')], btn = document.querySelector("[data-cw-do]");
      return !!(rows[rows.length - 1].compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok(under, "under the headline rows");
    const place = await p.evaluate(() => {
      const make = document.querySelector('[data-view="hot"] [data-cw-make]'), more = document.querySelector("[data-more]"), idea = document.querySelector('[data-cw-do="idea"]'), go = document.querySelector('[data-cw-do="planned"]');
      const a = go.getBoundingClientRect(), b = idea.getBoundingClientRect();
      return { beforeMore: !more || !!(make.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING), quiet: idea.classList.contains("quiet"), sideBySide: Math.abs(a.top - b.top) < 2 && b.left >= a.right,
        pinned: /sticky|fixed/.test(getComputedStyle(make).position) };
    });
    ok(place.beforeMore && place.quiet && place.sideBySide && !place.pinned, "the two buttons close the card, before Go deeper: the gold one and the quiet one beside it", place);
    ok(await p.locator('[data-view="hot"] .cw-go').count() === 1, "one gold button on the run card", await p.locator('[data-view="hot"] .cw-go').count());
    ok((await short(p, "[data-cw-make] button, [data-cw-make] a")).length === 0, "both are full tap targets");
    await fits(p, "a run card with the plan buttons");

    // No signal: it says so, makes nothing, and stays put.
    ctl.down = true;
    await p.locator('[data-cw-do="planned"]').click();
    await p.waitForFunction(() => /no signal/i.test(document.querySelector("[data-cw-make-msg]")?.innerText || ""));
    ok(db.trips.length === 0 && await p.locator('[data-view="hot"]').count() === 1, "with no signal it says so and makes nothing");
    ctl.down = false;

    await p.locator('[data-cw-do="planned"]').dblclick();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-title]');
    const made = calls.landed.filter((b) => b.action === "trip_create");
    const gear = await p.evaluate(() => window.RIG.trips.runs["squid-redondo"].gear.map((g) => g.i));
    ok(made.length === 1, "a double tap makes one trip", made.length);
    const b = made[0] || {};
    ok(b.planId === "squid-redondo" && b.spotId === "redondo" && b.species === "squid" && b.title === "Squid at Redondo" && b.date === "2026-11-24" && b.status === "planned",
      "We are doing this sends that trip, planned", b);
    ok(Math.abs(b.from - 17) < 0.01 && Math.abs(b.to - 20.5) < 0.01, "with the window the run card showed", [b.from, b.to]);
    ok(Array.isArray(b.seedList) && b.seedList.join("|") === gear.join("|") && b.seedList.length === 10, "and the run card's gear lines as the start of the list, labels only", b.seedList);
    ok(/^[0-9a-f-]{36}$/.test(b.clientId || ""), "under a client id, so a resend cannot double it", b.clientId);
    ok(p.url().endsWith("#/crew/trip/t-new-1") && (await text(p, "[data-cw-title]")).trim() === "Squid at Redondo", "then it lands on the new trip's page", p.url());
    ok((await text(p, '[data-view="crewtrip"] [data-cw-tag]')).trim().toLowerCase() === "on", "tagged On");

    // The same plan and day again: it opens that trip, it does not make a second.
    await p.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo"), { waitUntil: "load" });
    await p.waitForSelector('[data-view="hot"] [data-cw-open-trip]');
    ok(await p.locator("[data-cw-do]").count() === 0, "the same plan and day already made: no buttons to make it again");
    ok(await p.locator('[data-view="hot"] .cw-go').count() === 1, "still one gold button");
    await p.locator("[data-cw-open-trip]").click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-new-1"]');
    ok(calls.fn.filter((x) => x.action === "trip_create").length === 2 && db.trips.length === 1, "it opens that trip, and no second one is made", db.trips.length);

    // Float it: an idea. Long and blank gear lines are cleaned before they go.
    await p.goto(base + "#/trips/" + encodeURIComponent("2026-11-26~clams-ocean-shores"), { waitUntil: "load" });
    await p.waitForSelector('[data-view="hot"] [data-cw-do="idea"]');
    await p.evaluate(() => {
      window.RIG.trips.runs["clams-ocean-shores"].gear = [{ i: "   ", s: "need" }].concat(Array.from({ length: 45 }, (_, i) => ({ i: "  " + i + " " + "x".repeat(130) + "  ", s: "need" })));
    });
    await p.locator('[data-cw-do="idea"]').click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-new-2"]');
    const f = calls.landed.filter((x) => x.action === "trip_create")[1] || {};
    ok(f.status === "idea" && f.planId === "clams-ocean-shores" && f.spotId === "ocean-shores" && f.date === "2026-11-26", "Float it sends it as an idea", f);
    ok(f.seedList.length === 40 && f.seedList.every((l) => l.length === 120 && l === l.trim()) && f.seedList[0].startsWith("0 x"), "gear lines are trimmed, cut to 120 characters, and stop at 40", [f.seedList.length, f.seedList[0].length]);
    ok((await text(p, '[data-view="crewtrip"] [data-cw-tag]')).trim().toLowerCase() === "idea", "and its page is tagged Idea");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Planning from scratch: #/crew/new.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db } = await crew(ctx);
    await weather(ctx);
    const p = await open(ctx, base + "#/crew/new", "owner");
    await p.waitForSelector('[data-view="crewnew"] [data-cw-what]');
    const groups = await p.locator("[data-cw-what] optgroup").evaluateAll((els) => els.map((g) => ({ fish: g.label, names: [...g.querySelectorAll("option")].map((o) => o.textContent) })));
    const names = groups.flatMap((g) => g.names);
    ok(groups.some((g) => g.fish === "Squid" && g.names.includes("Squid at Redondo")) && groups.some((g) => g.fish === "King" && g.names.includes("Winter salmon from Redondo Pier")),
      "what: the app's plans, grouped by fish", groups.map((g) => g.fish).join(","));
    ok(!names.includes("Bass, Lake Fenwick") && !names.includes("Coho from the kayak, Dash Point"), "only what is in season on the chosen day");
    ok(!names.includes("Pinks, Dash Point") && !names.includes("Winter steelhead on the Green") && !names.includes("Trout from the kayak, Lake Tapps"), "and only plans whose rules are confirmed");
    ok(names.every((n) => !/\d{2,}\s*(min|mph|cfs)|score/i.test(n)), "names only");
    const d = await p.locator("[data-cw-date]").evaluate((e) => ({ type: e.type, min: e.min, max: e.max, value: e.value }));
    ok(d.type === "date" && d.min === "2026-11-23" && d.max === "2027-01-22" && d.value === "2026-11-23", "the date is a native date box, today to 60 days out", d);
    ok(await p.locator('[data-view="crewnew"] .cw-go').count() === 1, "one gold button on the screen", await p.locator('[data-view="crewnew"] .cw-go').count());
    ok(await p.locator("[data-cw-note]").getAttribute("maxlength") === "280", "the note stops at 280");
    ok(await p.locator("[data-cw-cond]").count() === 0, "no conditions line until there is a pick");
    ok((await short(p, '[data-view="crewnew"] button, [data-view="crewnew"] select, [data-view="crewnew"] input, [data-view="crewnew"] a:not(.back)')).length === 0, "every control is a full tap target",
      await short(p, '[data-view="crewnew"] button, [data-view="crewnew"] select, [data-view="crewnew"] input, [data-view="crewnew"] a:not(.back)'));
    await fits(p, "the plan a trip screen");

    // Nothing picked: it says so and sends nothing.
    await p.locator("[data-cw-create]").click();
    await p.waitForFunction(() => /pick/i.test(document.querySelector("[data-cw-new-msg]")?.innerText || ""));
    ok(calls.fn.filter((b) => b.action === "trip_create").length === 0, "with nothing picked it says so and sends nothing");

    // Tapping a trip in the What list opens its read right under it, one at
    // a time, with the way to its full run card.
    await p.locator('[data-cw-day="2026-11-28"]').click();
    await p.waitForFunction(() => document.querySelectorAll("[data-cw-pickplan]").length >= 2);
    const rowIds = await p.locator("[data-cw-pickplan]").evaluateAll((els) => els.map((e) => e.dataset.cwPickplan));
    const sq = rowIds.find((x) => /^squid-/.test(x)) || rowIds[0], other = rowIds.find((x) => x !== sq);
    ok(await p.locator("[data-cw-read]").count() === 0, "no read until a row is tapped");
    await p.locator(`[data-cw-pickplan="${sq}"]`).click();
    await p.waitForSelector(`[data-cw-read="${sq}"] [data-read-headline]`);
    const rd = await p.evaluate((id) => {
      const row = document.querySelector(`[data-cw-pickplan="${id}"]`), box = document.querySelector(`[data-cw-read="${id}"]`), go = box.querySelector("[data-read-go]");
      return { under: row.nextElementSibling === box, expanded: row.getAttribute("aria-expanded"), pressed: row.getAttribute("aria-pressed"),
        head: box.querySelector("[data-read-headline]").textContent, why: (box.querySelector("[data-read-reason]") || {}).textContent || "",
        lines: [...box.querySelectorAll("[data-read-line] dt")].map((d) => d.textContent).join(","), fig: box.querySelectorAll("[data-read-fig] svg path, [data-read-fig] svg rect").length,
        go: go && go.getAttribute("href"), cond: document.querySelectorAll("[data-cw-cond]").length };
    }, sq);
    ok(rd.under && rd.expanded === "true" && rd.pressed === "true", "a tapped row is picked, and its read opens right under it", rd);
    ok(/^Go, best 5:00 to 6:30 PM$/.test(rd.head) && /^High slack 5:15 PM, right at dark\. Leave by \d+:\d\d PM, \d+ min drive\.$/.test(rd.why),
      "the read leads with the answer, then why those hours and when to leave", rd.head + " | " + rd.why);
    ok(rd.lines === "Tide,Rain,Wind,Expect,Or" && rd.fig >= 4, "then a small picture of the hours and its labelled lines: Tide, Rain, Wind, Expect, Or", rd);
    ok(rd.go === "#/trips/" + encodeURIComponent("2026-11-28~" + sq), "with a link to the full run card", rd.go);
    ok(rd.cond === 0, "the read says it all: no second call line under the list while it is open");
    ok((await short(p, "[data-cw-read] a, [data-cw-pickplan]")).length === 0, "its link and the rows are full tap targets");
    await fits(p, "the plan a trip screen with a read open");
    await p.locator(`[data-cw-pickplan="${other}"]`).click();
    await p.waitForSelector(`[data-cw-read="${other}"] [data-read-headline]`);
    ok(await p.locator("[data-cw-read]").count() === 1 && await p.locator(`[data-cw-read="${sq}"]`).count() === 0, "one read at a time: tapping another row moves it there");
    await p.locator(`[data-cw-pickplan="${other}"]`).click();
    await p.waitForFunction(() => !document.querySelector("[data-cw-read]"));
    ok(await p.locator(`[data-cw-pickplan="${other}"]`).getAttribute("aria-pressed") === "true", "tapping the open row again closes its read, and it stays picked");
    await p.locator(`[data-cw-pickplan="${sq}"]`).click();
    await p.waitForSelector(`[data-cw-read="${sq}"] [data-read-go]`);
    await p.locator(`[data-cw-read="${sq}"] [data-read-go]`).click();
    await p.waitForSelector(`[data-view="hot"][data-run="${sq}"] [data-read] [data-read-headline]`);
    ok((await text(p, '[data-view="hot"] [data-read-headline]')).trim() === rd.head, "the link opens that trip's run card, which leads with the same read");
    await p.goBack();
    await p.waitForSelector(`[data-cw-read="${sq}"] [data-read-headline]`);
    await p.locator(`[data-cw-pickplan="${sq}"]`).click();
    await p.waitForFunction(() => !document.querySelector("[data-cw-read]"));
    await p.locator('[data-cw-day="2026-11-23"]').click();

    // Plan and day chosen: the conditions line is there at once.
    await p.locator("[data-cw-what]").selectOption("squid-redondo");
    await p.waitForSelector('[data-cw-cond][data-status="ok"]');
    ok((await text(p, "[data-cw-cond-slot] .seal")).trim() === "Hot" && /\w/.test(await text(p, "[data-cw-cond]")) && !/^Hot\b/.test((await text(p, "[data-cw-cond]")).trim()),
      "the call shows as soon as plan and day are chosen: Hot on the seal, the reasons beside it, the word said once", await text(p, "[data-cw-cond]"));
    ok(await p.locator("[data-cw-cond-slot] .cw-callpic").count() === 1, "with the water's own small picture beside it");
    ok(await p.locator("[data-cw-cond-slot] [data-read] [data-read-line]").count() >= 3 && await p.locator("[data-cw-cond-slot] [data-read-headline]").count() === 0,
      "and a trip picked from the list gets its read's lines under the call (the seal is its answer)");
    await p.locator("[data-cw-date]").fill("2026-12-20");
    await p.waitForSelector('[data-cw-cond][data-status="nodata"]');
    ok(/forecast reaches 7 days out/i.test(await text(p, "[data-cw-cond]")), "and follows the day: past the forecast it says so", await text(p, "[data-cw-cond]"));
    ok(await p.locator("[data-cw-what]").inputValue() === "squid-redondo", "the pick is kept when the day changes and it is still in season");
    await p.locator("[data-cw-date]").fill("2026-11-24");
    await p.waitForSelector('[data-cw-cond][data-status="ok"]');
    await p.locator("[data-cw-from]").fill("09:00");
    await p.locator("[data-cw-to]").fill("13:00");
    await p.waitForSelector('[data-cw-cond][data-status="nogo"]');
    ok((await text(p, "[data-cw-cond-slot] .seal")).trim() === "No" && /^This one fishes after dark/.test((await text(p, "[data-cw-cond]")).trim()), "and the window: squid at nine in the morning is a no-go", await text(p, "[data-cw-cond]"));
    await p.locator("[data-cw-from]").fill("17:00");
    await p.locator("[data-cw-to]").fill("16:00");
    await p.locator("[data-cw-create]").click();
    await p.waitForFunction(() => /after the start/i.test(document.querySelector("[data-cw-new-msg]")?.innerText || ""));
    ok(calls.fn.filter((b) => b.action === "trip_create").length === 0, "an end before the start says so and sends nothing");
    await p.locator("[data-cw-to]").fill("21:30");
    ok(await p.locator('[data-cw-pick="idea"]').getAttribute("aria-pressed") === "true" && /Just an idea/.test(await text(p, '[data-cw-pick="idea"]')) && /It is on/.test(await text(p, '[data-cw-pick="planned"]')),
      "It is on, or Just an idea, starting as an idea");
    await p.locator('[data-cw-pick="planned"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-pick="planned"]').getAttribute("aria-pressed") === "true");
    ok(await p.locator("[data-cw-from]").inputValue() === "17:00" && await p.locator("[data-cw-what]").inputValue() === "squid-redondo", "switching it keeps everything typed");
    await p.locator("[data-cw-note]").fill("Bring the big cooler");
    await p.locator("[data-cw-create]").dblclick();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-title]');
    const made = calls.landed.filter((b) => b.action === "trip_create");
    const b = made[0] || {};
    ok(made.length === 1 && db.trips.length === 1, "a double tap makes one trip", made.length);
    ok(b.planId === "squid-redondo" && b.spotId === "redondo" && b.species === "squid" && b.title === "Squid at Redondo" && b.date === "2026-11-24" &&
      b.from === 17 && b.to === 21.5 && b.status === "planned" && b.note === "Bring the big cooler", "it sends the pick, the day, the window, the status and the note", b);
    ok(Array.isArray(b.seedList) && b.seedList.length === 10 && b.seedList[0] === "Rod: 9 ft, light power, fast action", "and that plan's gear lines for the list", b.seedList);
    ok(p.url().endsWith("#/crew/trip/t-new-1"), "then it lands on the trip page", p.url());
    ok(/Tue Nov 24/.test(await text(p, "[data-cw-when]")) && /5:00 PM to 9:30 PM/.test(await text(p, "[data-cw-when]")), "which shows the day and the window", await text(p, "[data-cw-when]"));
    ok(/Bring the big cooler/.test(await screenText(p)), "and the note");

    // The form starts clean the next time.
    await p.goto(base + "#/crew/new", { waitUntil: "load" });
    await p.waitForSelector("[data-cw-what]");
    ok(await p.locator("[data-cw-what]").inputValue() === "" && await p.locator("[data-cw-note]").inputValue() === "", "the form is empty the next time");
    // A pick that falls out of season when the day moves is dropped, and says so.
    await p.locator("[data-cw-date]").fill("2026-11-26");
    await p.waitForFunction(() => [...document.querySelectorAll("[data-cw-what] option")].some((o) => o.value === "clams-ocean-shores"));
    ok(true, "a dig day puts the dig in the list");
    await p.locator("[data-cw-what]").selectOption("clams-ocean-shores");
    await p.waitForSelector("[data-cw-cond]");
    await p.locator("[data-cw-date]").fill("2026-12-05");
    await p.waitForFunction(() => /not in season on that day/i.test(document.querySelector("[data-cw-new-msg]")?.innerText || ""));
    ok(await p.locator("[data-cw-what]").inputValue() === "" && await p.locator("[data-cw-cond]").count() === 0 &&
      !(await p.locator("[data-cw-what] option").evaluateAll((els) => els.map((o) => o.value))).includes("clams-ocean-shores"), "a pick that is out of season on the new day is dropped, and it says so");
    // A plan with no optional parts sends none of them.
    await p.locator("[data-cw-what]").selectOption("salmon-redondo");
    await p.locator("[data-cw-date]").fill("2026-11-28");
    await p.waitForSelector('[data-cw-cond][data-status="ok"]');
    ok((await text(p, "[data-cw-cond-slot] .seal")).trim() === "Go" && !/^Go\b/.test((await text(p, "[data-cw-cond]")).trim()), "a good day that is not hot reads Go", await text(p, "[data-cw-cond]"));
    await p.locator("[data-cw-create]").click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-new-2"]');
    const c = calls.landed.filter((x) => x.action === "trip_create")[1] || {};
    ok(c.status === "idea" && !("from" in c) && !("to" in c) && !("note" in c) && c.title === "Winter salmon from Redondo Pier" && c.species === "king" && c.spotId === "redondo", "no window and no note: none is sent, and it is an idea", c);
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // The trip page: every conditions answer has its own plain line.
  {
    const trips = [
      mkTrip({ id: "t-hot", date: "2026-11-24" }),
      mkTrip({ id: "t-go", title: "Winter salmon from Redondo Pier", planId: "salmon-redondo", spotId: "redondo", species: "king", date: "2026-11-28", status: "idea", by: RUSS }),
      mkTrip({ id: "t-river", title: "Chum on the Green", planId: "chum-green-river", spotId: "green-river", species: "chum", date: "2026-11-28" }),
      mkTrip({ id: "t-nogo", date: "2026-11-25" }),
      mkTrip({ id: "t-dark", title: "Sea-run cutthroat, Dash Point beach", planId: "cutthroat-dash-point", spotId: "dash-point", species: "cutthroat", date: "2026-11-27", from: 16.5, to: 20.5 }),
      mkTrip({ id: "t-closed", title: "Coho from the kayak, Dash Point", planId: "coho-dash-point", spotId: "dash-point", species: "coho", date: "2026-11-28" }),
      mkTrip({ id: "t-soon", title: "Squid at Les Davis Pier", planId: "squid-les-davis", spotId: "les-davis", date: "2026-11-30" }),
      mkTrip({ id: "t-far", title: "Squid at Les Davis Pier", planId: "squid-les-davis", spotId: "les-davis", date: "2026-12-12" }),
      mkTrip({ id: "t-ghost", title: "Somewhere new", planId: "ghost-plan", spotId: "ghost", species: "squid", date: "2026-11-26" }),
      mkTrip({ id: "t-shut", date: "2026-11-24", status: "done", counts: { comments: 0, list: 0, listDone: 0, catches: 2 },
        note: "Meet at the north end of the pier by the bait shop, bring the long net and the headlamps, and text if you are running late because parking fills up fast on a clear night like this one." }),
      mkTrip({ id: "t-slow", title: "Perch and trout, Lake Fenwick", planId: "trout-fenwick", spotId: "lake-fenwick", species: "perch", date: "2026-11-28" }),
      mkTrip({ id: "t-gone-by", title: "Chum on the Green", planId: "chum-green-river", spotId: "green-river", species: "chum", date: "2026-11-21" })];
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    const { calls } = await crew(ctx, { trips });
    await weather(ctx, { windy: "2026-11-25" });
    const p = await open(ctx, base + "#/crew/trip/t-hot", "owner");
    const at = async (id, status) => {
      await p.goto(base + "#/crew/trip/" + id, { waitUntil: "load" });
      await p.waitForSelector(`[data-view="crewtrip"][data-trip="${id}"] [data-cw-cond][data-status="${status}"]`);
      return (await text(p, "[data-cw-cond]")).trim();
    };
    const colour = (sel, name) => p.evaluate(([s, n]) => {
      const probe = document.createElement("span"); probe.style.color = "var(" + n + ")"; document.body.appendChild(probe);
      const want = getComputedStyle(probe).color; probe.remove();
      return getComputedStyle(document.querySelector(s)).color === want;
    }, [sel, name]);

    const seal = async () => (await text(p, '[data-view="crewtrip"] [data-cw-plan] .seal')).trim();
    const hot = await at("t-hot", "ok");
    ok(await seal() === "Hot" && /^High slack right at dark, /.test(hot) && /[^.]\.$/.test(hot), "ok and hot: Hot on the seal, the top reasons beside it, said once", hot);
    ok((await text(p, "[data-cw-title]")).trim() === "Squid at Redondo" && /Tue Nov 24/.test(await text(p, "[data-cw-when]")), "the page has the title, the day and the date", await text(p, "[data-cw-when]"));
    ok(/5:00 PM to 10:00 PM/.test(await text(p, "[data-cw-when]")), "and the window the conditions give it when the crew set none", await text(p, "[data-cw-when]"));
    ok((await text(p, '[data-view="crewtrip"] [data-cw-tag]')).trim().toLowerCase() === "on" && /Coach/.test(await text(p, "[data-cw-by]")) && !/Grande/.test(await text(p, "[data-cw-by]")),
      "an On tag, and who made it, by first name", await text(p, "[data-cw-by]"));
    // The run card under it: the same headline rows a Hot Trip uses.
    const secRows = await p.locator('[data-view="crewtrip"] [data-sec-row]').evaluateAll((els) => els.map((e) => e.getAttribute("data-sec-row") + "=" + e.getAttribute("href")));
    ok(secRows.join().startsWith("plan=#/crew/trip/t-hot/plan,what=#/crew/trip/t-hot/what,gear=#/crew/trip/t-hot/gear") && secRows.some((r) => r.startsWith("wx=")) && secRows.some((r) => r.startsWith("rules=")),
      "the run card's headline rows, each opening its section under this trip", secRows.join());
    ok(await p.locator('[data-view="crewtrip"] a.rule[data-sec-row="rules"]').count() === 1 && await p.locator('[data-view="crewtrip"] .panel.list [data-sec-row="rules"]').count() === 0,
      "Rules is its own red-edged card under the rows, as on the run card");
    // The plan is the card on the waterline, as on a Hot Trip: leave, fish, done.
    const planTxt = (await text(p, '[data-sec-row="plan"]')).replace(/\s+/g, " ");
    ok(/Leave by 4:10 PM/.test(planTxt) && /5:00 PM Fish/.test(planTxt) && /10:00 PM Done/.test(planTxt) && await p.locator('[data-sec-row="plan"].float [data-cw-cond]').count() === 1,
      "the plan card carries this trip's own times, under its go call", planTxt);
    // Notes and the list are on the page (tests/rigs-crew-notes.smoke.mjs walks them); catches wait for the day.
    const mounts = await p.evaluate(() => ({ note: !!document.querySelector('[data-view="crewtrip"] [data-cw-notes=""] [data-cw-note-text]'),
      list: !!document.querySelector('[data-view="crewtrip"] [data-cw-list] [data-cw-item-new]'),
      catches: document.querySelector('[data-view="crewtrip"] [data-cw-catches]').innerHTML.trim().length }));
    ok(mounts.note && mounts.list && mounts.catches === 0, "a box for a note on the whole trip, the list with its add line, and no catches part before the day", mounts);
    // Text the crew.
    const href = await p.locator("[data-cw-text]").getAttribute("href");
    ok(href === "sms:&body=" + encodeURIComponent("Squid at Redondo, Tue Nov 24. Leave by 4:10 PM. " + SITE + "#/crew/trip/t-hot"),
      "Text the crew opens Messages with the title, the day, when to leave and the link to this trip", decodeURIComponent(href || ""));
    ok(/^Text the crew$/i.test((await text(p, "[data-cw-text]")).trim()), "on a button that says Text the crew");
    ok(/opens messages/i.test(await text(p, "[data-cw-text-note]")) && /you pick who/i.test(await text(p, "[data-cw-text-note]")), "and says it opens Messages, and that you pick who gets it", await text(p, "[data-cw-text-note]"));
    ok((await short(p, '[data-view="crewtrip"] button, [data-view="crewtrip"] a:not(.back)')).length === 0, "every button and row on the trip page is a full tap target",
      await short(p, '[data-view="crewtrip"] button, [data-view="crewtrip"] a:not(.back)'));
    ok(await p.locator('[data-view="crewtrip"] .cw-go').count() === 0 && await p.locator('[data-view="crewtrip"] .gold').count() === 1 && await p.locator('[data-view="crewtrip"] .gold[data-cw-text]').count() === 1,
      "one gold thing on the trip page, and it is Text the crew: the answers are tiles, not gold", await p.locator('[data-view="crewtrip"] .gold').count());
    await fits(p, "a trip page");

    // A section: the crew's gear has no have, get or check tags.
    await p.locator('[data-view="crewtrip"] [data-sec-row="gear"]').click();
    await p.waitForSelector('[data-view="crewtrip"][data-sec="gear"] [data-card="gear"]');
    ok(p.url().endsWith("#/crew/trip/t-hot/gear"), "a section opens at #/crew/trip/<id>/<section>", p.url());
    ok(await p.locator('[data-view="crewtrip"] .gear li').count() === 10 && await p.locator('[data-view="crewtrip"] .tag').count() === 0, "the gear section lists the gear with no have, get or check tags",
      await p.locator('[data-view="crewtrip"] .tag').count());
    ok(!/you own|to get,|to check/i.test(await text(p, '[data-card="gear"]')), "and no line about what Coach owns", (await text(p, '[data-card="gear"]')).slice(0, 80));
    ok(await p.locator('[data-view="crewtrip"] [data-cw-notes="gear"]').count() === 1, "with a mount point for that section's notes");
    ok(await p.locator("[data-up]").getAttribute("href") === "#/crew/trip/t-hot", "back goes to the trip");
    const next = await p.locator(".pn .next").getAttribute("href");
    ok(/^#\/crew\/trip\/t-hot\/[a-z]+$/.test(next || ""), "next stays inside the trip", next);
    await fits(p, "a trip's gear section");
    await p.goto(base + "#/trips/" + encodeURIComponent("2026-11-24~squid-redondo") + "/gear", { waitUntil: "load" });
    await p.waitForSelector('[data-view="card"] .gear');
    ok(await p.locator('[data-view="card"] .tag').count() === 10, "a Hot Trip's own gear card still has its tags");

    const go = await at("t-go", "ok");
    ok(await seal() === "Go" && /^(Low|High) (tide|slack) [\d:]+ [AP]M\. Moving water, /.test(go), "ok and good: Go on the seal, the line leads with the tide's turn, then the top reasons", go);
    ok((await text(p, '[data-view="crewtrip"] [data-cw-tag]')).trim().toLowerCase() === "idea" && /Russell/.test(await text(p, "[data-cw-by]")), "an idea is tagged Idea, with its maker");
    const river = await at("t-river", "ok");
    ok(await seal() === "Hot" && /^[\d,]+ cfs, \w+\. Good flow, /.test(river) && await p.locator('[data-view="crewtrip"] [data-sec-row="river"]').count() === 1, "a river trip leads with its flow, the number first, and has its river row", river);
    // Even a one line call is a card that crosses the waterline.
    const condBox = await p.evaluate(() => { const c = document.querySelector("[data-cw-cond]").closest(".float").getBoundingClientRect(), s = document.getElementById("scene").getBoundingClientRect(); return { top: Math.round(c.top), bottom: Math.round(c.bottom), scene: Math.round(s.bottom) }; });
    ok(condBox.top < condBox.scene - 24 && condBox.bottom > condBox.scene, "the go or no-go card starts on the picture and ends below it", condBox);

    const nogo = await at("t-nogo", "nogo");
    ok(await seal() === "No" && nogo === "Gusts to 42 mph.", "nogo: No on the seal, and why", nogo);
    ok(await colour("[data-cw-cond]", "--no"), "in the no colour");
    const bare = await p.locator('[data-view="crewtrip"] [data-sec-row]').evaluateAll((els) => els.map((e) => e.getAttribute("data-sec-row")));
    ok(bare.includes("gear") && bare.includes("how") && bare.includes("rules") && !bare.includes("wx") && !bare.includes("river"), "a no-go still shows the run card, without the weather rows", bare.join());
    ok(!/Leave by/.test(await text(p, '[data-view="crewtrip"] [data-cw-run]')) && !/Leave by/.test(await text(p, "[data-cw-plan]")), "and without times it cannot stand behind, in the rows or the plan card", (await text(p, "[data-cw-plan]")).slice(0, 120));
    ok((await text(p, "[data-cw-plan] .seal")).trim().toLowerCase() === "no" && await p.locator("[data-cw-plan] .seal.no").count() === 1, "its seal says No, in red");
    // The page's clock is pinned, so two taps any seconds apart at the same
    // spot read as a double tap; this one lands off the row's middle.
    await p.locator('[data-view="crewtrip"] [data-sec-row="what"]').click({ position: { x: 40, y: 20 } });
    await p.waitForSelector('[data-view="crewtrip"][data-sec="what"]');
    ok(!/why this day/i.test(await text(p, '[data-card="what"]')), "its What it is section has no why this day", (await text(p, '[data-card="what"]')).slice(0, 80));
    const noLeave = await (async () => { await at("t-nogo", "nogo"); return decodeURIComponent(await p.locator("[data-cw-text]").getAttribute("href")); })();
    ok(noLeave === "sms:&body=Squid at Redondo, Wed Nov 25. " + SITE + "#/crew/trip/t-nogo", "and its text gives no leave time", noLeave);

    const dark = await at("t-dark", "dark");
    ok(await seal() === "Dark" && /sunset is 4:24 PM/i.test(dark), "dark: says it will be dark, and when the sun sets", dark);
    const closed = await at("t-closed", "closed");
    ok(/out of season/i.test(closed), "closed: says it is out of season that day", closed);
    const soon = await at("t-soon", "nodata");
    ok(soon === "The forecast reaches 7 days out. Check back tomorrow.", "nodata, a week out: check back tomorrow", soon);
    const far = await at("t-far", "nodata");
    ok(far === "The forecast reaches 7 days out. Check back Sun Dec 6.", "nodata, further out: the day the forecast will reach it", far);
    const slow = await at("t-slow", "ok");
    ok(await seal() === "Slow" && !/^Go\b/.test(slow), "ok but under the week's cut: Slow on the seal", slow);
    const goneBy = await at("t-gone-by", "past");
    ok(goneBy === "That day has passed.", "a day that has passed says so, with no forecast talk", goneBy);
    // A trip that is done: the seal and one line, never a time to leave.
    await p.goto(base + "#/crew/trip/t-shut", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-shut"] [data-cw-plan]');
    const shut = (await text(p, "[data-cw-plan]")).replace(/\s+/g, " ");
    ok((await text(p, "[data-cw-plan] .seal")).trim() === "Done" && /This trip is done\./.test(shut) && !/Leave by|min drive|Fish|Done Leave/.test(shut.replace(/^.*?done\./i, "")) && await p.locator("[data-cw-plan] .tl").count() === 0,
      "a done trip's plan card is the seal and one line: no leave time, no timeline", shut);
    // The trip's note is not on the picture: it is a line on the plan card.
    ok(await p.locator(".hero [data-cw-tripnote]").count() === 0 && await p.locator("[data-cw-plan] [data-cw-tripnote]").count() === 1 &&
      await p.evaluate(() => { const n = document.querySelector("[data-cw-tripnote]"); return n.getBoundingClientRect().height <= parseFloat(getComputedStyle(n).lineHeight) * 2 + 1; }),
      "a long note sits on the plan card, held to two lines, not on the picture");
    ok(await p.locator(".hero .chips > *").count() === 2, "and the picture keeps one row of chips: back, and the day", await p.locator(".hero .chips > *").count());
    const ghost = await at("t-ghost", "unknown");
    ok(/no plan for this one/i.test(ghost), "unknown: says the app has no plan for it", ghost);
    ok(await p.locator('[data-view="crewtrip"] [data-cw-answer]').count() === 3, "and the trip still takes answers");
    await fits(p, "a trip the app has no plan for");

    // A trip that is gone says so.
    await p.goto(base + "#/crew/trip/t-nope", { waitUntil: "load" });
    await p.waitForSelector("[data-cw-gone]");
    ok(/not here any more/i.test(await text(p, "[data-cw-gone]")), "a deleted trip says it is not here any more", await text(p, "[data-cw-gone]"));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Going, maybe, out. One made with no signal waits, then sends once.
  {
    const trips = [mkTrip({ id: "t-sat", date: "2026-11-28", going: [{ ...COACH, answer: "going" }, { ...RUSS, answer: "going" }, { ...DAD, answer: "maybe" }] })];
    const ctx = await browser.newContext(phone);
    const { calls, db, ctl } = await crew(ctx, { who: "member", trips });
    await weather(ctx);
    const p = await open(ctx, base + "#/crew/trip/t-sat", "member");
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-answer="going"][aria-pressed="true"]');
    const labels = (await p.locator("[data-cw-answer]").allInnerTexts()).map((t) => t.trim());
    // Set in capitals on the tiles, so compared without case.
    ok(labels.join().toLowerCase() === "going,maybe,out", "three buttons: Going, Maybe, Out", labels.join());
    ok(await p.evaluate(() => [...document.querySelectorAll("[data-cw-answer]")].every((b) => { const t = b.closest(".rs").getBoundingClientRect(), r = b.getBoundingClientRect(); return r.height >= 44 && t.height >= 100; })),
      "each answer is a tile you can tap anywhere, its button a full tap target");
    ok(await p.locator('.rs[data-on] [data-cw-answer="going"]').count() === 1, "and your answer's tile is the lifted one");
    const under = async () => Object.fromEntries(await Promise.all(["going", "maybe", "out"].map(async (a) => [a, (await p.locator(`[data-cw-names="${a}"] li`).allInnerTexts()).map((t) => t.trim()).join(",")])));
    const pressed = async () => (await p.locator('[data-cw-answer][aria-pressed="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-cw-answer")))).join();
    let u = await under();
    ok(u.going === "Coach,Russell" && u.maybe === "Dad" && u.out === "", "names under each, first names only", u);
    ok(await pressed() === "going", "yours is the one highlighted", await pressed());

    await p.locator('[data-cw-answer="maybe"]').click();
    await p.waitForFunction(() => document.querySelector('[data-cw-answer="maybe"]').getAttribute("aria-pressed") === "true" && !document.querySelector("[data-cw-waiting]"));
    u = await under();
    const sent = calls.landed.filter((b) => b.action === "going");
    ok(sent.length === 1 && sent[0].tripId === "t-sat" && sent[0].answer === "maybe", "a tap sends your answer", sent);
    ok(u.going === "Coach" && u.maybe === "Dad,Russell" && await pressed() === "maybe", "and your name moves under it", u);

    // No signal at the pier.
    ctl.down = true;
    await p.locator('[data-cw-answer="out"]').click();
    await p.waitForSelector('[data-cw-answer="out"][aria-pressed="true"]');
    await p.waitForFunction(() => /waiting to send/i.test(document.querySelector("[data-cw-waiting]")?.innerText || ""));
    u = await under();
    ok(u.out === "Russell" && u.maybe === "Dad", "with no signal your answer still shows at once", u);
    ok(/waiting to send/i.test(await text(p, "[data-cw-waiting]")), "marked as waiting to send", await text(p, "[data-cw-waiting]"));
    ok(db.trips[0].going.find((g) => g.id === "u-russ").answer === "maybe", "and the server has not heard it yet");
    await fits(p, "a trip page with an answer waiting");
    // Close the app and open it again, still no signal.
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector('[data-cw-answer="out"][aria-pressed="true"]');
    ok(/waiting to send/i.test(await text(p, "[data-cw-waiting]")), "it is still waiting after the app is closed and opened");
    ok(/no signal/i.test(await text(p, "[data-cw-trip-note]")), "and the page says it is showing the saved copy", await text(p, "[data-cw-trip-note]"));
    ok((await text(p, "[data-cw-title]")).trim() === "Squid at Redondo", "the whole trip opens from the saved copy");
    // The Trips tab shows the waiting answer too.
    ok(calls.landed.filter((b) => b.action === "going").length === 1, "nothing was sent while there was no signal");

    // Signal back.
    ctl.down = false;
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await p.waitForFunction(() => !document.querySelector("[data-cw-waiting]") && document.querySelector('[data-cw-answer="out"]').getAttribute("aria-pressed") === "true");
    const outs = () => calls.landed.filter((b) => b.action === "going" && b.answer === "out").length;
    ok(outs() === 1 && db.trips[0].going.find((g) => g.id === "u-russ").answer === "out", "when the signal returns it sends", outs());
    await p.evaluate(() => window.RIG.crew.flush());
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    await later(300);
    ok(outs() === 1, "once");
    ok(await p.evaluate(async () => (await window.RIG.crew.pending()).count) === 0, "and nothing is left waiting");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Status buttons: shown and hidden by who you are and where the trip stands.
  {
    const trips = [
      mkTrip({ id: "t-idea", date: "2026-11-27", status: "idea", by: COACH }),
      mkTrip({ id: "t-on", date: "2026-11-28", status: "planned", by: COACH }),
      mkTrip({ id: "t-mine", title: "Chum on the Green", planId: "chum-green-river", spotId: "green-river", species: "chum", date: "2026-11-28", status: "planned", by: RUSS, note: "Meet at the bridge", going: [{ ...RUSS, answer: "going" }] }),
      mkTrip({ id: "t-today", planId: "squid-des-moines", spotId: "des-moines-pier", title: "Squid at Des Moines Pier", date: "2026-11-23", status: "planned", by: COACH }),
      mkTrip({ id: "t-done", planId: "squid-les-davis", spotId: "les-davis", title: "Squid at Les Davis Pier", date: "2026-11-23", status: "done", by: COACH })];
    const acts = async (p) => {
      const s = await p.locator('[data-view="crewtrip"] [data-cw-status]').evaluateAll((els) => els.map((e) => e.getAttribute("data-cw-status") + ":" + e.innerText.trim()));
      return s.concat(await p.locator('[data-view="crewtrip"] [data-cw-edit]').count() ? ["edit"] : [], await p.locator('[data-view="crewtrip"] [data-cw-delete]').count() ? ["delete"] : []).join(" | ");
    };
    const at = async (p, id) => { await p.goto(base + "#/crew/trip/" + id, { waitUntil: "load" }); await p.waitForSelector(`[data-view="crewtrip"][data-trip="${id}"] [data-cw-acts]`, { state: "attached" }); return acts(p); };

    // Russell, a member.
    const ctx = await browser.newContext(phone);
    const { calls, db } = await crew(ctx, { who: "member", trips });
    await weather(ctx);
    const p = await open(ctx, base, "member");
    await p.waitForSelector('[data-cw-trip="t-idea"]');
    let a = await at(p, "t-idea");
    ok(a === "planned:It is on", "a member on someone else's idea: It is on, and nothing else", a);
    a = await at(p, "t-on");
    ok(a === "", "a member on someone else's planned trip: no status buttons, no edit, no delete", a);
    a = await at(p, "t-today");
    ok(a === "done:Mark it done", "once the day has come anyone can mark it done", a);
    a = await at(p, "t-done");
    ok(a === "" && await p.locator('[data-view="crewtrip"] [data-cw-answer]').count() === 0, "a done trip that is not yours: nothing to press", a);
    a = await at(p, "t-mine");
    ok(a === "idea:Call it off | done:Mark it done | edit | delete", "the maker of a planned trip: call it off, mark it done early, edit, delete", a);

    // Anyone can call an idea on.
    await at(p, "t-idea");
    await p.locator('[data-cw-status="planned"]').dblclick();
    await p.waitForFunction(() => (document.querySelector('[data-view="crewtrip"] [data-cw-tag]')?.innerText || "").trim().toLowerCase() === "on");
    const ups = calls.landed.filter((b) => b.action === "trip_update");
    ok(ups.length === 1 && ups[0].tripId === "t-idea" && ups[0].status === "planned" && Object.keys(ups[0]).sort().join() === "action,status,tell,tripId" && ups[0].tell.join() === "u-coach",
      "It is on sends the new status and who to tell (Coach has alerts on), once", ups);
    ok(await acts(p) === "", "and then the buttons follow the new state: not the maker, so none");

    // The maker edits the day, the window and the note.
    await at(p, "t-mine");
    await p.locator("[data-cw-edit]").click();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-edit-form]');
    ok(p.url().endsWith("#/crew/trip/t-mine/edit"), "edit opens on its own screen", p.url());
    ok(await p.locator("[data-cw-edit-date]").inputValue() === "2026-11-28" && await p.locator("[data-cw-edit-note]").inputValue() === "Meet at the bridge" && await p.locator("[data-cw-edit-from]").inputValue() === "",
      "with the trip's day, window and note filled in");
    ok(await p.locator('[data-view="crewtrip"] .cw-go').count() === 1, "one gold button on the edit screen");
    await fits(p, "the edit screen");
    await p.locator("[data-cw-edit-date]").fill("2026-11-29");
    await p.locator("[data-cw-edit-from]").fill("08:00");
    await p.locator("[data-cw-edit-to]").fill("12:30");
    await p.locator("[data-cw-edit-note]").fill("Meet at the boat launch");
    await p.locator("[data-cw-save]").dblclick();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-mine"] [data-cw-acts]', { state: "attached" });
    const ed = calls.landed.filter((b) => b.action === "trip_update" && b.tripId === "t-mine");
    ok(ed.length === 1 && ed[0].date === "2026-11-29" && ed[0].from === 8 && ed[0].to === 12.5 && ed[0].note === "Meet at the boat launch" && !("status" in ed[0]) && !("title" in ed[0]),
      "save sends the day, the window and the note, once", ed);
    ok(/Sun Nov 29/.test(await text(p, "[data-cw-when]")) && /8:00 AM to 12:30 PM/.test(await text(p, "[data-cw-when]")) && /Meet at the boat launch/.test(await screenText(p)), "and the trip page shows them", await text(p, "[data-cw-when]"));
    // Someone who cannot edit does not get the edit screen by typing its address.
    await p.goto(base + "#/crew/trip/t-on/edit", { waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-on"] [data-cw-acts]', { state: "attached" });
    ok(await p.locator("[data-cw-edit-form]").count() === 0, "someone who cannot edit does not get the edit screen");

    // Delete asks once, inside the page.
    await at(p, "t-mine");
    await p.locator("[data-cw-delete]").click();
    await p.waitForSelector("[data-cw-delete-yes]");
    ok(p.dialogs() === 0 && /delete/i.test(await text(p, "[data-cw-delete-ask]")), "delete asks once, inside the page", await text(p, "[data-cw-delete-ask]"));
    ok(calls.fn.filter((b) => b.action === "trip_delete").length === 0, "nothing is deleted by the first tap");
    await p.locator("[data-cw-delete-no]").click();
    await p.waitForSelector("[data-cw-delete]");
    ok(await p.locator("[data-cw-delete-yes]").count() === 0 && db.trips.some((t) => t.id === "t-mine"), "Keep keeps it");
    await p.locator("[data-cw-delete]").click();
    await p.locator("[data-cw-delete-yes]").dblclick();
    await p.waitForSelector('[data-view="trips"]');
    ok(calls.landed.filter((b) => b.action === "trip_delete" && b.tripId === "t-mine").length === 1 && !db.trips.some((t) => t.id === "t-mine"), "the second tap deletes it, once");
    await p.waitForSelector("[data-cw-trips]");
    ok(await p.locator('[data-cw-trip="t-mine"]').count() === 0 && p.dialogs() === 0, "and lands on the Trips tab without it");
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();

    // Coach, the owner: the same trips.
    const ctx2 = await browser.newContext(phone);
    const o = await crew(ctx2, { who: "owner", trips });
    await weather(ctx2);
    const q = await open(ctx2, base, "owner");
    await q.waitForSelector('[data-cw-trip="t-idea"]');
    a = await at(q, "t-mine");
    ok(a === "idea:Call it off | done:Mark it done | edit | delete", "the owner on someone else's planned trip: everything the maker has", a);
    a = await at(q, "t-idea");
    ok(a === "planned:It is on | edit | delete", "the owner on an idea: It is on, edit, delete, and no done for a day that has not come", a);
    a = await at(q, "t-done");
    ok(a === "planned:Reopen it | delete", "the owner on a done trip: reopen it, or delete", a);
    await at(q, "t-mine");
    await q.locator('[data-cw-status="idea"]').click();
    await q.waitForFunction(() => (document.querySelector('[data-view="crewtrip"] [data-cw-tag]')?.innerText || "").trim().toLowerCase() === "idea");
    ok(o.calls.landed.some((b) => b.action === "trip_update" && b.tripId === "t-mine" && b.status === "idea"), "Call it off sends it back to an idea");
    await at(q, "t-on");
    await q.locator('[data-cw-status="done"]').click();
    await q.waitForFunction(() => (document.querySelector('[data-view="crewtrip"] [data-cw-tag]')?.innerText || "").trim().toLowerCase() === "done");
    ok(o.calls.landed.some((b) => b.action === "trip_update" && b.tripId === "t-on" && b.status === "done"), "Mark it done sends done");
    // With no signal a status change says so and changes nothing.
    await at(q, "t-idea");
    o.ctl.down = true;
    await q.locator('[data-cw-status="planned"]').click();
    await q.waitForFunction(() => /no signal/i.test(document.querySelector("[data-cw-trip-msg]")?.innerText || ""));
    ok((await text(q, '[data-view="crewtrip"] [data-cw-tag]')).trim().toLowerCase() === "idea", "with no signal a status change says so and changes nothing");
    ok(o.calls.other.length === 0 && calls.other.length === 0, "nothing unexpected was asked of Supabase", o.calls.other.concat(calls.other));
    ok(q.errs.length === 0, "no page errors", q.errs.join(" | "));
    await ctx2.close();
  }

  // --------------------------------------------------------------------
  // No signal at all, and the app was closed: everything already seen opens.
  {
    const trips = [mkTrip({ id: "t-sat", date: "2026-11-28", going: [{ ...COACH, answer: "going" }, { ...RUSS, answer: "maybe" }] })];
    const ctx = await browser.newContext(phone);
    const { calls, db, ctl } = await crew(ctx, { who: "member", trips });
    const sky = await weather(ctx);
    const p = await open(ctx, base, "member");
    await p.waitForSelector('[data-cw-trip="t-sat"]');
    await p.locator('[data-cw-trip="t-sat"]').click();
    await p.waitForSelector('[data-view="crewtrip"] [data-cw-cond][data-status="ok"]');
    await p.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100)); });
    // The page itself can only come from the phone's own copy, and every server is out of reach.
    await ctx.setOffline(true); ctl.down = true; sky.down = true;
    const before = calls.landed.length;
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-sat"] [data-cw-title]');
    await p.waitForSelector("[data-cw-trip-note]");
    ok((await text(p, "[data-cw-title]")).trim() === "Squid at Redondo" && /Sat Nov 28/.test(await text(p, "[data-cw-when]")), "with no signal a trip that was opened before still opens");
    ok((await text(p, '[data-view="crewtrip"] [data-cw-plan] .seal')).trim() === "Hot" && /\w/.test(await text(p, "[data-cw-cond]")), "with its conditions, from the forecast the phone saved", await text(p, "[data-cw-cond]"));
    ok((await p.locator('[data-cw-names="going"] li').allInnerTexts()).join() === "Coach" && await p.locator('[data-view="crewtrip"] [data-sec-row]').count() >= 8, "who is going, and the run card");
    ok(/no signal/i.test(await text(p, "[data-cw-trip-note]")), "and it says this is the saved copy", await text(p, "[data-cw-trip-note]"));
    await p.locator('[data-view="crewtrip"] [data-sec-row="how"]').click();
    await p.waitForSelector('[data-view="crewtrip"][data-sec="how"] [data-card="how"]');
    ok(true, "a section opens with no signal");
    await p.locator("[data-up]").click();
    await p.locator('[data-cw-answer="going"]').click();
    await p.waitForFunction(() => /waiting to send/i.test(document.querySelector("[data-cw-waiting]")?.innerText || ""));
    ok((await p.locator('[data-cw-names="going"] li').allInnerTexts()).join() === "Coach,Russell", "an answer given there shows at once, as waiting");
    // The Trips tab: the call and the crew's trips, from what was saved.
    await p.locator('[data-view="crewtrip"] [data-up]').click();
    await p.waitForSelector('[data-view="trips"] [data-cw-trip="t-sat"]');
    await p.waitForSelector("[data-call] [data-call-go]");
    ok(/Coach and Russell going/.test(await text(p, '[data-cw-trip="t-sat"]')), "the Trips tab shows the crew trip with the waiting answer counted", await text(p, '[data-cw-trip="t-sat"]'));
    ok((await text(p, "[data-call-headline]")).trim().length > 10, "and the call, from the saved forecast");
    // Planning needs a signal, and says so without losing what was typed.
    await p.locator("[data-cw-plan]").click();
    await p.waitForSelector('[data-view="crewnew"] [data-cw-what]');
    await p.locator("[data-cw-what]").selectOption("squid-redondo");
    await p.locator("[data-cw-note]").fill("Bring ice");
    await p.locator("[data-cw-create]").click();
    await p.waitForFunction(() => /no signal/i.test(document.querySelector("[data-cw-new-msg]")?.innerText || ""));
    ok(await p.locator("[data-cw-what]").inputValue() === "squid-redondo" && await p.locator("[data-cw-note]").inputValue() === "Bring ice" && db.trips.length === 1,
      "planning a trip with no signal says so, makes nothing and keeps what was typed");
    ok(calls.landed.length === before, "nothing reached the server while there was no signal", calls.landed.slice(before).map((b) => b.action));
    // Signal back: the answer goes, once.
    await ctx.setOffline(false); ctl.down = false; sky.down = false;
    await p.evaluate(() => window.dispatchEvent(new Event("online")));
    // Polled by hand: waitForFunction takes a promise itself for a yes.
    for (let i = 0; i < 200 && await p.evaluate(async () => (await window.RIG.crew.pending()).count) > 0; i++) await later(50);
    ok(calls.landed.filter((b) => b.action === "going" && b.answer === "going").length === 1 && db.trips[0].going.find((g) => g.id === "u-russ").answer === "going", "the waiting answer sends once when the signal returns");
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // A texted trip link on a phone that is signed out: sign in, then the trip.
  {
    const trips = [mkTrip({ id: "t-sat", date: "2026-11-28" })];
    const ctx = await browser.newContext(phone);
    const { calls } = await crew(ctx, { who: "member", trips });
    await weather(ctx);
    const p = await open(ctx, base + "#/crew/trip/t-sat");
    await p.waitForSelector("[data-signin] [data-phone]");
    ok(p.url().endsWith("#/crew/trip/t-sat") && await p.locator('[data-view="crewtrip"]').count() === 0, "signed out, a trip link shows the sign-in screen, at the same address", p.url());
    ok(calls.fn.every((b) => b.action === "hello"), "and asks the crew servers for nothing but hello", calls.fn.map((b) => b.action));
    await p.locator("[data-phone]").fill("253 555 0147");
    await p.locator("[data-sendcode]").click();
    await p.waitForSelector("[data-code]");
    await p.locator("[data-code]").fill("123456");
    await p.locator("[data-verify]").click();
    await p.waitForSelector('[data-view="crewtrip"][data-trip="t-sat"] [data-cw-title]');
    ok(p.url().endsWith("#/crew/trip/t-sat"), "after signing in it goes on to the trip", p.url());
    ok(p.errs.length === 0, "no page errors", p.errs.join(" | "));
    await ctx.close();

    const ctx2 = await browser.newContext(phone);
    await crew(ctx2);
    await weather(ctx2);
    const p2 = await open(ctx2, base + "#/crew/new");
    await p2.waitForSelector("[data-signin]");
    ok(await p2.locator('[data-view="crewnew"]').count() === 0, "signed out, the plan a trip address shows the sign-in screen too");
    await p2.locator("[data-join-paste]").fill("Coach added you to the fishing crew on Rig Card. Tap to join: " + SITE + "#/join/" + TOKEN);
    await p2.locator("[data-join-send]").click();
    await p2.waitForSelector('[data-view="crewnew"] [data-cw-what]');
    ok(p2.url().endsWith("#/crew/new"), "and a link pasted there signs in and stays on the page they were headed for", p2.url());
    await ctx2.close();
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
