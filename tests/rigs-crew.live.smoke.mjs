// The whole crew, walked in the real page against the DEPLOYED server, by the
// two ZZTEST people at once, each in their own browser at phone width: a trip
// planned from a Hot Trip with its gear list, going, a note pinned to the gear
// part of the run card, a list line handed over and one ticked, two catches
// (one with a real photo), alerts, quiet hours, the Tell row, the test button,
// and then all of it taken away again through the same page.
//
// The page is served from this checkout by tests/helpers/rigs-server.mjs.
// Supabase is NOT stubbed: sign-in sessions, the crew function, CastAI's own
// catch log and the catch-photos store are the live ones. Only the planner's
// inputs are stand-ins (the forecast, tides, river flow, and the rules and
// waters feeds), so there is always a Hot Trip to plan from.
//
// It touches only the crew named "ZZTEST crew" and stops before any write if
// that is not the crew both accounts are on. NOTHING REAL IS EVER SENT: the
// two accounts have no phone number, so a text for them can only end
// "skipped", no phone is ever set up for alerts, and no sign-in code is ever
// asked for (the sessions come from the accounts' passwords). The catches are
// real rows in catch_logs and one real file in catch-photos, both under the
// ZZTEST member's own id, and both are deleted before the end. It sweeps at
// the start too, so a run that died halfway does not pile up under the next.
//
// Skips (exit 0, prints "skip") when ~/.cortex/rigcard-test.json is missing or
// the network is down. Not part of "npm test". Takes about two minutes.
// Run: npm run test:crew-live-page
import { chromium } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join as pathJoin, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8805;
const BASE = "https://geigvuysptjvvqanumld.supabase.co";
const FN = BASE + "/functions/v1/castai-crew";
const KEY = "sb_publishable_m6EWBWxKPeOaVpPQOVDjyg_sTRWlnbe"; // publishable, the same one the page carries
const CREW = "ZZTEST crew";
const PHOTOS = BASE + "/storage/v1/object/public/catch-photos/";
const MARK = "ZZTEST page walk"; // every note and catch this test writes starts with it
const ALL_OFF = { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false };
const PHONE = /\(?\b\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
  return !!c;
};
const skip = (why) => { console.log("skip  " + why); process.exit(0); };
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const FILE = pathJoin(homedir(), ".cortex", "rigcard-test.json");
if (!existsSync(FILE)) skip("no ~/.cortex/rigcard-test.json, so the live page walk is not run");
const creds = JSON.parse(readFileSync(FILE, "utf8"));

// ---- talking to the server from here, outside the page ----------------------
// Used to check what the page did, to sweep before the walk, and for the two
// things the page has no screen for (reading and clearing a person's own alerts).
async function call(token, body) {
  const headers = { "Content-Type": "application/json", apikey: KEY };
  if (token) headers.Authorization = "Bearer " + token;
  try {
    const r = await fetch(FN, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    const text = await r.text();
    let parsed = {};
    try { parsed = JSON.parse(text) || {}; } catch { parsed = {}; }
    return { status: r.status, body: parsed, text };
  } catch (e) {
    return { status: 0, body: {}, text: "network: " + e.message };
  }
}
async function signIn(who) {
  const r = await fetch(BASE + "/auth/v1/token?grant_type=password", {
    method: "POST", headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ email: who.email, password: who.password }), signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.access_token || "", refresh: j.refresh_token || "", at: Date.now() + (j.expires_in || 3600) * 1000, id: (j.user && j.user.id) || "" };
}
const rest = (who, method, path) => fetch(BASE + path, { method, headers: { apikey: KEY, Authorization: "Bearer " + who.token }, signal: AbortSignal.timeout(30000) });
async function logRows(who, filter) {
  const r = await rest(who, "GET", "/rest/v1/catch_logs?user_id=eq." + who.id + filter + "&select=id,user_id,species,length,notes,photo_url,spot_name,state_code");
  return r.ok ? r.json() : null;
}
// What the photo's public address answers. fresh asks past any copy a cache in between may hold.
async function photoStatus(url, fresh) {
  const r = await fetch(url + (fresh ? "?v=" + Date.now() : ""), { signal: AbortSignal.timeout(30000) });
  const buf = Buffer.from(await r.arrayBuffer());
  return { status: r.status, type: r.headers.get("content-type") || "", jpeg: buf[0] === 0xff && buf[1] === 0xd8, size: buf.length };
}

const hello = await call(null, { action: "hello" });
if (hello.status === 0) skip("no network, so the live page walk is not run (" + hello.text + ")");
ok(hello.status === 200 && hello.body.ok === true, "the crew function answers", hello.text);

let owner, member;
try {
  owner = await signIn(creds.owner);
  member = await signIn(creds.member);
} catch (e) {
  skip("the sign-in server could not be reached, so the live page walk is not run (" + e.message + ")");
}
if (!ok(owner.status === 200 && owner.token && member.status === 200 && member.token && owner.id !== member.id, "both ZZTEST accounts sign in with their passwords, no code asked for", owner.status + " " + member.status)) {
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(1);
}

// The one check that comes before any write: both are on the ZZTEST crew and nothing else.
const st0 = await call(owner.token, { action: "state" }), st0m = await call(member.token, { action: "state" });
const rightCrew = st0.status === 200 && st0m.status === 200 && st0.body.crew && st0.body.crew.name === CREW && st0.body.crew.role === "owner" &&
  st0m.body.crew && st0m.body.crew.name === CREW && st0m.body.crew.id === st0.body.crew.id && st0m.body.crew.role === "member";
if (!ok(rightCrew, "both are on the crew named ZZTEST crew, and that is the only crew this test will touch", (st0.body.crew && st0.body.crew.name) + " / " + (st0m.body.crew && st0m.body.crew.name))) {
  console.log("\nStopped before writing anything.");
  console.log(`\n${pass} passed, ${fail} failed`); process.exit(1);
}
const OWNER_NAME = st0.body.me.name, MEMBER_NAME = st0m.body.me.name;
const first = (n) => String(n || "").trim().split(/\s+/)[0];

// What a run that died may have left: trips on the ZZTEST crew, this test's own
// rows in the member's catch log with their photos, switches, and unsent alerts.
async function sweep() {
  let trips = 0, rows = 0;
  const st = await call(owner.token, { action: "state" });
  for (const t of (st.body.trips || [])) { await call(owner.token, { action: "trip_delete", tripId: t.id, tell: [] }); trips++; }
  for (const who of [owner, member]) {
    const mine = await logRows(who, "&notes=like." + encodeURIComponent(MARK + "*"));
    for (const r of (mine || [])) {
      await rest(who, "DELETE", "/rest/v1/catch_logs?id=eq." + r.id);
      await rest(who, "DELETE", "/storage/v1/object/catch-photos/" + who.id + "/" + r.id + ".jpg").catch(() => null);
      rows++;
    }
    await call(who.token, Object.assign({ action: "prefs_set" }, ALL_OFF));
    await call(who.token, { action: "outbox_clear" });
  }
  return { trips, rows };
}
const swept = await sweep();
if (swept.trips || swept.rows) console.log("note  swept what an earlier run left behind:", JSON.stringify(swept));

// ---- the planner's inputs: a calm week, starting today ----------------------
const TODAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const plusDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDate = (iso) => { const d = new Date(iso + "T12:00:00Z"); return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()] + " " + ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()] + " " + d.getUTCDate(); };
const DAYS = Array.from({ length: 7 }, (_, i) => plusDays(TODAY, i));
const pad = (n) => String(n).padStart(2, "0");
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
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
async function planner(ctx) {
  await ctx.route(/castai-waters/, (r) => r.abort());
  await ctx.route(/castai-rules/, (r) => json(r, 200, { checked: new Date().toISOString(), rules: [] }));
  await ctx.route(/api\.water\.noaa\.gov/, (r) => json(r, 200, { observed: { data: [{ validTime: `${TODAY}T19:00:00Z`, primary: 0.41 }] },
    forecast: { data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }));
  await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
    const u = route.request().url(), n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
    return json(route, 200, /marine-api/.test(u) ? Array.from({ length: n }, marine) : /open-meteo/.test(u) ? Array.from({ length: n }, wxPoint) : tides);
  });
}

// ---- the page ---------------------------------------------------------------
const watchdog = setTimeout(() => { console.log("FAIL watchdog: the walk took more than six minutes\n\n0 passed, 1 failed"); process.exit(1); }, 360000);
watchdog.unref?.();
const server = await startServer(ROOT, PORT);
const base = `http://127.0.0.1:${PORT}/rigs/`;
const WAIT = 20000;
// Wait for something to be true of the page. Answers whether it came true.
async function until(fn, ms = WAIT) {
  const end = Date.now() + ms;
  for (;;) {
    let v = false;
    try { v = await fn(); } catch { v = false; }
    if (v) return v;
    if (Date.now() > end) return false;
    await later(120);
  }
}
const text = (p, sel) => p.locator(sel).first().innerText().catch(() => "");
const count = (p, sel) => p.locator(sel).count();
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth);
// Nothing left waiting to send on this phone.
const drained = (p) => until(() => p.evaluate(() => window.RIG.crew.pending().then((q) => q.count === 0)));
// Two taps on the same spot inside 400 ms are a double tap, and the page drops the second.
const settle = () => later(450);
const checked = async (p, key) => (await p.locator('[data-al-sw="' + key + '"]').getAttribute("aria-checked")) === "true";
const settled = (p, key, want) => until(async () => await checked(p, key) === want && await p.locator('[data-al-sw="' + key + '"]').getAttribute("aria-busy") !== "true");

let browser, tripId = "", catchIds = [], photoUrl = "";
const sent = []; // every request either page made to Supabase, to prove what was never asked
async function person(who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles" });
  await planner(ctx);
  ctx.on("request", (q) => { if (/supabase\.co/.test(q.url())) sent.push(q.method() + " " + q.url().replace(BASE, "")); });
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  // The session, in the shape rigs/crew.js keeps it. Seeded once, so a reload keeps whatever the page holds by then.
  await p.addInitScript((s) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("rig.session.v1", JSON.stringify(s)); sessionStorage.setItem("seeded", "1"); } },
    { token: who.token, refresh: who.refresh, at: who.at, userId: who.id });
  return { ctx, p, errs };
}

try {
  browser = await chromium.launch();
  const O = await person(owner), M = await person(member);
  const op = O.p, mp = M.p;

  // ---- the owner plans a trip from a Hot Trip --------------------------------
  await op.goto(base, { waitUntil: "load" });
  ok(await until(() => count(op, '[data-view="trips"] [data-day]').then((n) => n === 7)), "the owner's week is on screen");
  ok(await until(() => count(op, "[data-cw-trips]").then((n) => n === 1)), "with the Crew trips group above it");
  ok(await count(op, "[data-cw-trip]") === 0, "and no crew trips yet");
  const pick = await op.evaluate((today) => {
    for (const sec of document.querySelectorAll("[data-day]")) {
      const iso = sec.getAttribute("data-day");
      if (iso <= today) continue;
      for (const a of sec.querySelectorAll("[data-hot]")) {
        const id = a.getAttribute("data-hot"), run = window.RIG.trips.runs && window.RIG.trips.runs[id];
        const gear = ((run && run.gear) || []).map((g) => String(g.i || "").trim().slice(0, 120).trim()).filter(Boolean).slice(0, 40);
        if (gear.length) return { iso, planId: id, name: a.querySelector("b").innerText.trim(), gear };
      }
    }
    return null;
  }, TODAY);
  if (!ok(!!pick, "the week has a Hot Trip with a run card and a gear list to plan from", await text(op, "[data-week]"))) throw new Error("no Hot Trip to plan from");
  console.log("note  planning:", pick.name, "on", pick.iso, "with", pick.gear.length, "gear lines");
  await op.locator('[data-day="' + pick.iso + '"] [data-hot="' + pick.planId + '"]').first().click();
  ok(await until(() => count(op, '[data-view="hot"] [data-cw-do="planned"]').then((n) => n === 1)), "the Hot Trip's run card offers We are doing this");
  ok(await count(op, '[data-view="hot"] [data-cw-tell]') === 0, "with nobody to tell yet: the other person has alerts off, so there is no Tell row");
  await op.locator('[data-cw-do="planned"]').click();
  ok(await until(() => op.evaluate(() => /^#\/crew\/trip\/[0-9a-f-]{36}$/.test(location.hash))), "We are doing this lands on the new trip's own page", await op.evaluate(() => location.hash));
  tripId = await op.evaluate(() => location.hash.split("/")[3] || "");
  ok(await until(() => count(op, "[data-cw-item]").then((n) => n === pick.gear.length)), "the list arrives seeded from that trip's own gear", (await count(op, "[data-cw-item]")) + " of " + pick.gear.length);
  const labels = await op.locator("[data-cw-item] [data-cw-item-label] > span:first-child").allInnerTexts();
  ok(same(labels.map((l) => l.trim()), pick.gear), "line for line, in the run card's order", labels.slice(0, 3));
  ok((await text(op, "[data-cw-title]")).trim() === pick.name && /^On$/i.test((await text(op, "[data-cw-tag]")).trim()), "the page says what it is, and that it is on", await text(op, "[data-cw-title]"));
  ok((await text(op, "[data-cw-by]")).trim() === "Made by " + first(OWNER_NAME), "and who made it", await text(op, "[data-cw-by]"));
  ok(await until(() => count(op, '[data-cw-names="going"] li').then((n) => n === 1)), "the maker is down as going");
  ok(await wide(op) <= 390, "the trip page fits the phone", await wide(op));

  // The day has to have come before a fish can be logged, so the owner moves it to today.
  await op.locator("[data-cw-edit]").click();
  ok(await until(() => count(op, "[data-cw-edit-date]").then((n) => n === 1)), "Edit opens the change screen");
  await op.locator("[data-cw-edit-date]").fill(TODAY);
  await op.locator("[data-cw-save]").click();
  ok(await until(async () => (await text(op, "[data-cw-when]")).includes(dayDate(TODAY))), "the owner moves the trip to today, and the page says so", await text(op, "[data-cw-when]") + " | " + await text(op, "[data-cw-edit-msg]"));
  const afterMove = await call(owner.token, { action: "trip", tripId });
  ok(afterMove.status === 200 && afterMove.body.trip.date === TODAY && afterMove.body.trip.status === "planned" && afterMove.body.trip.planId === pick.planId && afterMove.body.list.length === pick.gear.length,
    "the server holds the same trip: planned, today, with the list", afterMove.text.slice(0, 200));

  // ---- the member sees it, answers, and pins a note to the gear ----------------
  await mp.goto(base, { waitUntil: "load" });
  ok(await until(() => count(mp, '[data-cw-trip="' + tripId + '"]').then((n) => n === 1)), "the member sees the trip in Crew trips");
  ok(await count(mp, '[data-cw-trip="' + tripId + '"] [data-cw-new]') === 1, "with a new dot on it");
  await mp.locator('[data-cw-trip="' + tripId + '"]').click();
  ok(await until(() => count(mp, '[data-cw-answer="going"]').then((n) => n === 1)), "the member opens the trip");
  await mp.locator('[data-cw-answer="going"]').click();
  ok(await until(async () => await count(mp, '[data-cw-names="going"] li') === 2 && await count(mp, '[data-cw-names="going"] li[data-waiting]') === 0 && await count(mp, "[data-cw-waiting]") === 0),
    "the member answers Going, and it lands", await text(mp, "[data-cw-going]"));
  ok(await mp.locator('[data-cw-answer="going"]').getAttribute("aria-pressed") === "true", "Going shows as their answer");
  await mp.locator('[data-sec-row="gear"]').click();
  ok(await until(() => count(mp, '[data-view="crewtrip"][data-sec="gear"] [data-cw-note-text]').then((n) => n === 1)), "the gear part of the run card opens, with a note box");
  await mp.locator("[data-cw-note-text]").fill(MARK + ": I will bring the net.");
  await mp.locator('[data-cw-note-add="gear"]').click();
  ok(await until(async () => await count(mp, "[data-cw-note]") === 1 && await count(mp, "[data-cw-note][data-waiting]") === 0), "the member pins a note to the gear, and it lands");
  ok((await text(mp, "[data-cw-note-body]")).trim() === MARK + ": I will bring the net." && (await text(mp, "[data-cw-note-who]")).trim() === first(MEMBER_NAME), "with their words and their name", await text(mp, "[data-cw-note]"));
  await drained(mp);

  // ---- the owner sees the note, hands over a line and ticks one -----------------
  await op.reload({ waitUntil: "load" });
  ok(await until(async () => /^1 note$/.test((await text(op, '[data-cw-count="gear"]')).trim())), "the owner sees one note on the gear row", await text(op, '[data-sec-row="gear"]'));
  ok(await count(op, '[data-cw-newnote="gear"]') === 1, "with a new dot, since someone else wrote it");
  ok(await until(() => count(op, '[data-cw-names="going"] li').then((n) => n === 2)), "and both people under Going");
  const items = await op.locator("[data-cw-item]").evaluateAll((els) => els.map((e) => e.getAttribute("data-cw-item")));
  await op.locator('[data-cw-who="' + items[0] + '"]').click();
  ok(await until(() => count(op, '[data-cw-panel] [data-cw-give="' + member.id + '"]').then((n) => n === 1)), "Who has it offers the member");
  ok(await count(op, "[data-cw-tell]") === 0, "still no Tell row anywhere on the trip: nobody else has alerts on");
  await op.locator('[data-cw-panel] [data-cw-give="' + member.id + '"]').click();
  ok(await until(async () => (await text(op, '[data-cw-who="' + items[0] + '"]')).trim() === first(MEMBER_NAME) && await count(op, '[data-cw-item="' + items[0] + '"][data-waiting]') === 0),
    "the owner hands the first line to the member", await text(op, '[data-cw-item="' + items[0] + '"]'));
  await op.locator('[data-cw-tick="' + items[1] + '"]').click();
  ok(await until(async () => await op.locator('[data-cw-tick="' + items[1] + '"]').getAttribute("aria-checked") === "true" && await count(op, '[data-cw-item="' + items[1] + '"][data-waiting]') === 0),
    "and ticks the second");
  await drained(op);
  const sum = (await text(op, "[data-cw-list-sum]")).trim();
  ok(sum === "1 of " + pick.gear.length + " packed. " + first(MEMBER_NAME) + " has 1, " + (pick.gear.length - 1) + " nobody.", "the list sums it up", sum);
  const afterList = await call(member.token, { action: "trip", tripId });
  const l0 = (afterList.body.list || []).find((i) => i.id === items[0]), l1 = (afterList.body.list || []).find((i) => i.id === items[1]);
  ok(l0 && l0.assignedTo && l0.assignedTo.id === member.id && l1 && l1.done === true && afterList.body.comments.length === 1 && afterList.body.comments[0].section === "gear" &&
    afterList.body.trip.going.some((g) => g.id === member.id && g.answer === "going"), "the server holds all of it: the answer, the note on gear, the line handed over, the tick", afterList.text.slice(0, 200));

  // ---- the member logs two fish, one with a photo ---------------------------------
  await mp.goto(base + "#/crew/trip/" + tripId, { waitUntil: "load" });
  await mp.reload({ waitUntil: "load" });
  ok(await until(async () => (await text(mp, '[data-cw-who="' + items[0] + '"]')).trim() === first(MEMBER_NAME) && await mp.locator('[data-cw-tick="' + items[1] + '"]').getAttribute("aria-checked") === "true"),
    "the member sees the line with their name on it, and the tick");
  ok(await until(() => count(mp, "[data-cw-catch-open]").then((n) => n === 1)), "the day has come, so Log a fish is there");
  await mp.locator("[data-cw-catch-open]").click();
  ok(await until(() => count(mp, "[data-cw-catch-form]").then((n) => n === 1)) && (await mp.locator("[data-cw-catch-species]").inputValue()).trim().length > 0, "the form opens with the fish already named");
  const species = (await mp.locator("[data-cw-catch-species]").inputValue()).trim();
  await mp.locator("[data-cw-catch-len]").fill("9");
  await mp.locator("[data-cw-catch-note-in]").fill(MARK + ": no photo");
  await mp.locator("[data-cw-catch-save]").click();
  ok(await until(async () => await count(mp, "[data-cw-catch]") === 1 && await count(mp, "[data-cw-catch][data-waiting]") === 0 && await count(mp, "[data-cw-catch-form]") === 0),
    "a fish with no photo is saved", await text(mp, "[data-cw-catchbox]"));
  ok(await count(mp, "[data-cw-catch] [data-cw-photo]") === 0 && /9 in/.test(await text(mp, "[data-cw-catch-size]")), "it shows with its size and no picture", await text(mp, "[data-cw-catch]"));
  await drained(mp);

  // A tiny JPEG, made here.
  const b64 = await mp.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 48; const g = c.getContext("2d"); g.fillStyle = "#2a6e96"; g.fillRect(0, 0, 64, 48); g.fillStyle = "#e8c15a"; g.fillRect(18, 16, 28, 14); return c.toDataURL("image/jpeg", 0.8).split(",")[1]; });
  await settle();
  await mp.locator("[data-cw-catch-open]").click();
  await until(() => count(mp, "[data-cw-catch-form]").then((n) => n === 1));
  await mp.locator("[data-cw-catch-photo]").setInputFiles({ name: "zztest-fish.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") });
  ok(await until(() => count(mp, "[data-cw-catch-preview]").then((n) => n === 1)), "the picked photo shows small before anything is sent");
  await mp.locator("[data-cw-catch-len]").fill("11.5");
  await mp.locator("[data-cw-catch-note-in]").fill(MARK + ": with a photo");
  await mp.locator("[data-cw-catch-save]").click();
  ok(await until(async () => await count(mp, "[data-cw-catch]") === 2 && await count(mp, "[data-cw-catch][data-waiting]") === 0 && await count(mp, "[data-cw-catch-form]") === 0, 40000),
    "a fish with a photo is saved", await text(mp, "[data-cw-catchbox]"));
  await drained(mp);
  ok(!/photo did not go up/i.test(await text(mp, "[data-cw-catch-msg]")), "and the photo went up with it", await text(mp, "[data-cw-catch-msg]"));
  catchIds = await mp.locator("[data-cw-catch]").evaluateAll((els) => els.map((e) => e.getAttribute("data-cw-catch")));
  const withPhoto = await mp.locator("[data-cw-catch]").evaluateAll((els) => els.filter((e) => e.querySelector("[data-cw-photo]")).map((e) => e.getAttribute("data-cw-catch")));
  ok(withPhoto.length === 1, "one of the two catches carries a picture", withPhoto.length);
  photoUrl = PHOTOS + member.id + "/" + withPhoto[0] + ".jpg";
  ok(await mp.locator("img[data-cw-img]").first().getAttribute("data-cw-img") === photoUrl, "its address is the member's own folder in catch-photos", await mp.locator("img[data-cw-img]").first().getAttribute("data-cw-img").catch(() => "none"));
  ok(await until(() => mp.evaluate(() => { const i = document.querySelector("img[data-cw-img]"); return !!i && i.complete && i.naturalWidth > 0; })), "and the picture really loads on the member's screen");
  // The CastAI path: real rows in catch_logs, a real file in catch-photos, both the member's own.
  const rows = await logRows(member, "&id=in.(" + catchIds.join(",") + ")");
  const rowPhoto = (rows || []).find((r) => r.id === withPhoto[0]), rowPlain = (rows || []).find((r) => r.id !== withPhoto[0]);
  ok(rows && rows.length === 2 && rows.every((r) => r.user_id === member.id && r.species === species && r.state_code === "WA" && r.spot_name), "both catches are rows in CastAI's own catch_logs, owned by the member", rows);
  ok(rowPhoto && rowPhoto.photo_url === photoUrl && Number(rowPhoto.length) === 11.5 && rowPlain && !rowPlain.photo_url && Number(rowPlain.length) === 9, "with the size in inches, and the photo's address on the one that has it", rows);
  const up = await photoStatus(photoUrl);
  ok(up.status === 200 && /image\/jpeg/.test(up.type) && up.jpeg && up.size > 100, "the file is really in the catch-photos store, a JPEG, at its public address", up);

  // ---- both people see the catches -----------------------------------------------
  await op.reload({ waitUntil: "load" });
  ok(await until(() => count(op, "[data-cw-catch]").then((n) => n === 2)), "the owner sees both catches");
  ok(await until(() => op.evaluate(() => { const i = document.querySelector("img[data-cw-img]"); return !!i && i.complete && i.naturalWidth > 0; })), "with the photo");
  ok((await op.locator("[data-cw-catch-who]").allInnerTexts()).every((n) => n.trim() === first(MEMBER_NAME)) && await count(op, "[data-cw-catch-del]") === 0, "under the member's name, and not the owner's to delete");
  ok(await count(mp, "[data-cw-catch-del]") === 2, "the member can delete their own");
  for (const [who, p] of [["owner", op], ["member", mp]]) {
    const words = await screenText(p);
    ok(!PHONE.test(words) && !EMAIL.test(words), "no phone number or email on the " + who + "'s trip page", words.match(PHONE) || words.match(EMAIL));
  }
  ok(await wide(op) <= 390 && await wide(mp) <= 390, "the full trip page fits the phone for both", [await wide(op), await wide(mp)]);

  // ---- alerts: the member ---------------------------------------------------------
  await mp.goto(base + "#/crew", { waitUntil: "load" });
  ok(await until(() => count(mp, '[data-al-sw="texts"]').then((n) => n === 1)), "the member's crew screen has the Alerts group");
  ok(await checked(mp, "texts") === false && await checked(mp, "push") === false && /off/i.test(await text(mp, "[data-al-sum]")), "everything starts off");
  ok(await count(mp, "[data-al] [data-addnum-open]") === 1, "there is no number on the account, so Add my number is offered");
  await mp.locator('[data-al-sw="texts"]').click();
  ok(await until(() => count(mp, "[data-addnum-phone]").then((n) => n === 1)), "Text me asks for the number first");
  ok(await checked(mp, "texts") === false && /off/i.test(await text(mp, "[data-al-sum]")), "and does not pretend to be on");
  let prefs = await call(member.token, { action: "prefs_get" });
  ok(prefs.body.prefs && prefs.body.prefs.texts === false && prefs.body.hasPhone === false, "the server agrees: texts off, no number", prefs.text);
  await mp.locator("[data-al-test]").click();
  ok(await until(async () => /^Nothing is switched on\.$/.test((await text(mp, "[data-al-test-line]")).trim())), "Send me a test answers: nothing is switched on", await text(mp, "[data-al-test-msg]"));

  // Texts switched on underneath (the server takes it without a number; nothing can reach them).
  const forced = await mp.evaluate(() => window.RIG.crew.prefsSet({ texts: true }));
  ok(forced.prefs && forced.prefs.texts === true && forced.hasPhone === false, "texts switched on through the client, still with no number", forced);
  await mp.reload({ waitUntil: "load" });
  ok(await until(() => count(mp, "[data-al-kinds]").then((n) => n === 1)), "opened again, the four kinds and quiet hours show");
  ok(await checked(mp, "texts") === true && /no number/i.test(await text(mp, '[data-al-sw="texts"]')) && /off/i.test(await text(mp, "[data-al-sum]")), "Text me reads on, and says plainly that no text can reach them", await text(mp, '[data-al-sw="texts"]') + " | " + await text(mp, "[data-al-sum]"));
  ok(await until(() => count(mp, '[data-member="' + member.id + '"] [data-member-alerts]').then((n) => n === 1)), "their own row in the crew carries the alerts mark");
  await mp.locator("[data-al-test]").click();
  ok(await until(async () => /nothing was sent/i.test(await text(mp, "[data-al-test-line]")) && /no number/i.test(await text(mp, "[data-al-test-line]"))), "a test now says nothing was sent, and why", await text(mp, "[data-al-test-msg]"));
  // Quiet hours save and read back.
  ok(await mp.locator("[data-al-quiet-from]").inputValue() === "21" && await mp.locator("[data-al-quiet-to]").inputValue() === "6", "quiet hours start at 9 PM to 6 AM");
  await mp.locator("[data-al-quiet-from]").selectOption("13");
  ok(await until(async () => /1 PM/.test(await text(mp, "[data-al-quiet-note]"))), "a new quiet start saves", await text(mp, "[data-al-quiet-note]") + " | " + await text(mp, '[data-al-said="quiet"]'));
  await mp.locator("[data-al-quiet-to]").selectOption("13");
  ok(await until(async () => /no quiet hours/i.test(await text(mp, "[data-al-quiet-note]"))), "the same hour twice reads no quiet hours", await text(mp, "[data-al-quiet-note]"));
  await mp.locator('[data-al-sw="evTrips"]').click();
  ok(await settled(mp, "evTrips", false), "a kind switches off");
  await mp.reload({ waitUntil: "load" });
  ok(await until(() => count(mp, "[data-al-quiet-from]").then((n) => n === 1)) && await mp.locator("[data-al-quiet-from]").inputValue() === "13" && await mp.locator("[data-al-quiet-to]").inputValue() === "13" && await checked(mp, "evTrips") === false,
    "opened again, quiet hours and the kind read back as saved");
  prefs = await call(member.token, { action: "prefs_get" });
  ok(prefs.body.prefs.quietFrom === 13 && prefs.body.prefs.quietTo === 13 && prefs.body.prefs.evTrips === false && prefs.body.prefs.evNotes === true && prefs.body.prefs.texts === true, "and the server holds the same", prefs.text);
  ok(await wide(mp) <= 390, "the member's crew screen fits the phone", await wide(mp));

  // ---- alerts: the owner, and the Tell row ---------------------------------------
  await op.goto(base + "#/crew", { waitUntil: "load" });
  ok(await until(() => count(op, '[data-member="' + member.id + '"] [data-member-alerts]').then((n) => n === 1)), "the owner's crew list marks the member: alerts on");
  ok(await count(op, '[data-member="' + owner.id + '"] [data-member-alerts]') === 0, "and not the owner, whose alerts are off");
  ok(await until(() => count(op, '[data-al-sw="texts"]').then((n) => n === 1)) && await checked(op, "texts") === false && await checked(op, "push") === false, "the owner's own alerts are all off");
  await op.locator("[data-al-test]").click();
  ok(await until(async () => /^Nothing is switched on\.$/.test((await text(op, "[data-al-test-line]")).trim())), "the owner's test answers: nothing is switched on", await text(op, "[data-al-test-msg]"));
  for (const [who, p] of [["owner", op], ["member", mp]]) {
    const words = await screenText(p);
    ok(!PHONE.test(words) && !EMAIL.test(words), "no phone number or email on the " + who + "'s crew screen", words.match(PHONE) || words.match(EMAIL));
  }

  await op.goto(base + "#/crew/trip/" + tripId, { waitUntil: "load" });
  const pill = '[data-cw-notes=""] [data-cw-tell="note"] [data-cw-tell-id="' + member.id + '"]';
  ok(await until(() => count(op, pill).then((n) => n === 1)), "now the owner's note box has a Tell row, with the member on it");
  ok(await op.locator(pill).getAttribute("aria-pressed") === "true" && (await text(op, pill)).trim() === first(MEMBER_NAME) && await count(op, '[data-cw-notes=""] [data-cw-tell-id]') === 1, "ticked, by first name, and nobody else", await text(op, '[data-cw-notes=""] [data-cw-tell]'));
  const noteRows = async () => ((await call(member.token, { action: "outbox" })).body.rows || []).filter((r) => r.kind === "note" && r.tripId === tripId);
  ok((await noteRows()).length === 0, "the member has heard nothing about notes so far");
  await op.locator('[data-cw-notes=""] [data-cw-note-text]').fill(MARK + ": told to the member");
  await op.locator('[data-cw-note-add=""]').click();
  ok(await until(async () => await count(op, '[data-cw-notes=""] [data-cw-note]') === 1 && await count(op, "[data-cw-note][data-waiting]") === 0), "the owner adds a note with the member ticked");
  let heard = [];
  await until(async () => { heard = await noteRows(); return heard.length === 1 && heard[0].status !== "queued"; }, 30000);
  ok(heard.length === 1 && heard[0].status === "skipped" && heard[0].why === "no phone" && heard[0].channel === null, "the member is told, and with no number on the account the text ends skipped: nothing real is sent", heard);
  ok(heard.length === 1 && /left a note/.test(heard[0].title) && heard[0].url === "https://coachpilot.org/rigs/#/crew/trip/" + tripId, "the alert names what happened and links to the trip", heard[0]);
  await op.locator(pill).click();
  ok(await op.locator(pill).getAttribute("aria-pressed") === "false", "the owner unticks the member");
  await op.locator('[data-cw-notes=""] [data-cw-note-text]').fill(MARK + ": told to nobody");
  await op.locator('[data-cw-note-add=""]').click();
  ok(await until(async () => await count(op, '[data-cw-notes=""] [data-cw-note]') === 2 && await count(op, "[data-cw-note][data-waiting]") === 0), "and adds another note");
  await drained(op);
  await later(4000);
  ok((await noteRows()).length === 1, "this time the member is told nothing: the sender chose", await noteRows());

  // ---- taking it all away again, through the page ---------------------------------
  await mp.goto(base + "#/crew/trip/" + tripId, { waitUntil: "load" });
  ok(await until(() => count(mp, "[data-cw-catch-del]").then((n) => n === 2)), "the member opens the trip to take the catches back");
  for (const id of catchIds) {
    await settle();
    await mp.locator('[data-cw-catch-del="' + id + '"]').click();
    await until(() => count(mp, '[data-cw-catch-del-yes="' + id + '"]').then((n) => n === 1));
    await settle();
    await mp.locator('[data-cw-catch-del-yes="' + id + '"]').click();
    await until(() => count(mp, '[data-cw-catch="' + id + '"]').then((n) => n === 0));
  }
  ok(await count(mp, "[data-cw-catch]") === 0, "the member deletes both catches on the page", await text(mp, "[data-cw-catchbox]"));
  ok(await drained(mp), "and nothing is left waiting to send");
  ok((await text(mp, "[data-cw-catch-msg]")).trim() === "", "with no complaint from the server", await text(mp, "[data-cw-catch-msg]"));
  const goneRows = await logRows(member, "&id=in.(" + catchIds.join(",") + ")");
  ok(Array.isArray(goneRows) && goneRows.length === 0, "the rows are gone from the member's CastAI catch log", goneRows);
  // The plain address, the very one that was just read above, so a cache in between has had its chance to keep a copy.
  let photoGone = null;
  await until(async () => { photoGone = await photoStatus(photoUrl); return photoGone.status === 400 || photoGone.status === 404; }, 30000);
  const photoFresh = await photoStatus(photoUrl, true);
  ok(photoGone && (photoGone.status === 400 || photoGone.status === 404), "and the photo's public address no longer hands it out", { plain: photoGone, pastAnyCache: photoFresh });
  ok(photoFresh.status === 400 || photoFresh.status === 404, "asked past any cache, the store itself says it is gone", photoFresh);
  const noCatch = await call(owner.token, { action: "trip", tripId });
  ok(noCatch.status === 200 && noCatch.body.catches.length === 0, "the trip has no catches for anyone", noCatch.text.slice(0, 200));
  catchIds = []; photoUrl = "";

  await op.reload({ waitUntil: "load" });
  ok(await until(() => count(op, "[data-cw-delete]").then((n) => n === 1)), "the owner opens the trip to delete it");
  await op.locator("[data-cw-delete]").click();
  await until(() => count(op, "[data-cw-delete-yes]").then((n) => n === 1));
  await settle();
  await op.locator("[data-cw-delete-yes]").click();
  ok(await until(() => op.evaluate(() => /^#\/trips\/?$/.test(location.hash))), "Delete lands back on the week", await op.evaluate(() => location.hash) + " " + await text(op, "[data-cw-trip-msg]"));
  ok(await until(() => count(op, "[data-cw-trips]").then((n) => n === 1)) && await count(op, "[data-cw-trip]") === 0, "with no crew trips on it");
  const goneTrip = await call(member.token, { action: "trip", tripId });
  ok(goneTrip.status === 404, "the trip is gone for the member too", goneTrip.status + " " + goneTrip.text);
  tripId = "";

  // The switches go back to where a new person starts, through the client both pages carry.
  const resetO = await op.evaluate((all) => window.RIG.crew.prefsSet(all), ALL_OFF);
  const resetM = await mp.evaluate((all) => window.RIG.crew.prefsSet(all), ALL_OFF);
  ok(same(resetO.prefs, ALL_OFF) && same(resetM.prefs, ALL_OFF), "both people's alert settings are back to all off, quiet 9 PM to 6 AM", [resetO.prefs, resetM.prefs]);
  await mp.goto(base + "#/crew", { waitUntil: "load" });
  ok(await until(async () => await count(mp, '[data-al-sw="texts"]') === 1 && await checked(mp, "texts") === false && await count(mp, "[data-al-kinds]") === 0), "and the member's screen reads off again");
  await call(owner.token, { action: "outbox_clear" });
  await call(member.token, { action: "outbox_clear" });

  // ---- what was never asked, and what is left ---------------------------------------
  ok(!sent.some((u) => /\/auth\/v1\/(otp|verify|user)\b/.test(u)), "no sign-in code was asked for and no number was added", sent.filter((u) => /\/auth\/v1\//.test(u)));
  ok(!sent.some((u) => /push_subscribe/.test(u)) && sent.some((u) => /functions\/v1\/castai-crew/.test(u)) && sent.some((u) => /^PUT \/storage\/v1\/object\/catch-photos\//.test(u)) && sent.some((u) => /^POST \/rest\/v1\/catch_logs/.test(u)),
    "the page really talked to the live crew function, catch log and photo store");
  const end = await call(owner.token, { action: "state" });
  ok(end.status === 200 && end.body.crew.name === CREW && end.body.members.length === 2 && end.body.trips.length === 0 && end.body.members.every((m) => m.alerts === false),
    "the ZZTEST crew ends with its two members, no trips, and alerts off", end.text.slice(0, 300));
  const endO = await call(owner.token, { action: "prefs_get" }), endM = await call(member.token, { action: "prefs_get" });
  ok(same(endO.body.prefs, ALL_OFF) && same(endM.body.prefs, ALL_OFF) && endO.body.pushSubs === 0 && endM.body.pushSubs === 0, "both people's switches are as a new person's, with no phone set up", [endO.body, endM.body]);
  const left = await logRows(member, "&notes=like." + encodeURIComponent(MARK + "*")), leftO = await logRows(owner, "&notes=like." + encodeURIComponent(MARK + "*"));
  ok(Array.isArray(left) && left.length === 0 && Array.isArray(leftO) && leftO.length === 0, "nothing of this test is left in anyone's catch log", [left, leftO]);
  const boxO = await call(owner.token, { action: "outbox" }), boxM = await call(member.token, { action: "outbox" });
  ok((boxO.body.rows || []).length === 0 && (boxM.body.rows || []).length === 0, "and no alert of this test is left waiting or on record", [boxO.body.rows, boxM.body.rows]);
  ok(O.errs.length === 0 && M.errs.length === 0, "no page errors on either phone", O.errs.concat(M.errs).join(" | "));
} catch (e) {
  fail++; console.log("FAIL threw", String(e && e.message).split("\n")[0]);
} finally {
  // Whatever happened above, the ZZTEST crew is left clean.
  try {
    const s = await sweep();
    if (tripId || catchIds.length || photoUrl) console.log("note  the walk stopped early, swept:", JSON.stringify(s));
    if (photoUrl) await rest(member, "DELETE", "/storage/v1/object/catch-photos/" + photoUrl.slice(PHOTOS.length)).catch(() => null);
  } catch (e) { console.log("note  the last sweep could not run:", e.message); }
  clearTimeout(watchdog);
  if (browser) await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
