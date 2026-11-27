// Alerts on the crew screen, in the real page at phone width: the two ways to
// be told (a text, an alert on this phone), the four kinds, quiet hours, the
// test button, the "alerts on" mark by a member's name, and what the service
// worker shows for a push and where a tap on it goes.
// Run: node tests/rigs-crew-alerts.smoke.mjs
//
// Nothing here reaches a real server, sends a text or shows a real alert. The
// crew function and the sign-in server are stand-ins, the phone's own alert
// plumbing (permission, the push subscription) is a stand-in inside the page,
// and a catch-all route fails the test if the page asks Supabase for anything
// a test did not expect.
import { chromium } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8804;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 280000);
watchdog.unref?.();

const PHONE = /\(?\b\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const ALL_OFF = { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false };
const SWITCHES = ["texts", "push", "evTrips", "evStatus", "evNotes", "evGearCatches", "textsStopped"];

// The crew function, remembering what it was told the way the real one does.
// opts: who ("owner"|"member"), prefs, hasPhone, subs (how many phones are set up), others { id: alertsOn }, trips.
// ctl.down fails every call like no signal, ctl.hang never answers one. ctl.set(body) and ctl.get() may answer for
// prefs_set and prefs_get: { status, body }, "hang" or "down". ctl.test is what test_alert answers.
async function stub(ctx, opts = {}) {
  const me = opts.who === "owner" ? { id: "u-coach", name: "Coach Grande" } : { id: "u-russ", name: "Russell" };
  const db = { prefs: Object.assign({}, ALL_OFF, opts.prefs || {}), hasPhone: opts.hasPhone !== false, subs: opts.subs || 0, endpoints: [] };
  const calls = { fn: [], other: [], user: [], verify: [] };
  const ctl = { down: false, hang: false, set: null, get: null, test: { ok: true, push: "none", text: "none" } };
  const others = Object.assign({ "u-coach": false, "u-russ": false, "u-dad": false }, opts.others || {});
  const members = () => [
    { id: "u-coach", name: "Coach Grande", role: "owner", signIn: "code" },
    { id: "u-russ", name: "Russell", role: "member", signIn: "link" },
    { id: "u-dad", name: "Dad", role: "member", signIn: "code" }]
    .map((m) => Object.assign(m, { alerts: m.id === me.id ? !!(db.prefs.texts || db.prefs.push) : !!others[m.id] }));
  const prefsAnswer = () => ({ prefs: Object.assign({}, db.prefs), hasPhone: db.hasPhone, pushSubs: db.subs, pushFails: 0 });

  await ctx.route(/geigvuysptjvvqanumld\.supabase\.co/, (r) => { calls.other.push(r.request().method() + " " + r.request().url()); return json(r, 404, { error: "not stubbed" }); });
  await ctx.route(/open-meteo|tidesandcurrents|api\.water\.noaa\.gov|castai-rules|castai-waters/, (r) => r.abort());
  await ctx.route(/\/auth\/v1\/logout/, (r) => r.fulfill({ status: 204, headers: CORS, body: "" }));
  await ctx.route(/\/auth\/v1\/user/, (r) => {
    calls.user.push(JSON.parse(r.request().postData() || "{}"));
    return ctl.down ? r.abort() : json(r, 200, { id: me.id });
  });
  await ctx.route(/\/auth\/v1\/verify/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    calls.verify.push(b);
    if (ctl.down) return r.abort();
    if (b.type !== "phone_change" || b.token !== "654321") return json(r, 403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
    db.hasPhone = true;
    return json(r, 200, { access_token: "tok-123", refresh_token: "ref-123", expires_in: 3600, user: { id: me.id } });
  });
  await ctx.route(/functions\/v1\/castai-crew/, async (r) => {
    const body = JSON.parse(r.request().postData() || "{}"), a = body.action;
    calls.fn.push(body);
    if (ctl.hang) return;
    if (ctl.down) return r.abort();
    const custom = a === "prefs_set" && ctl.set ? await ctl.set(body) : a === "prefs_get" && ctl.get ? await ctl.get(body) : undefined;
    if (custom === "hang") return;
    if (custom === "down") return r.abort();
    if (custom) return json(r, custom.status, custom.body);
    if (a === "hello") return json(r, 200, { ok: true, sms: true, vapidKey: "BKey" });
    if (a === "state") return json(r, 200, { me, crew: { id: "c1", name: "ZZTEST crew", role: opts.who === "owner" ? "owner" : "member" }, members: members(), trips: opts.trips || [], sms: true });
    if (a === "trip") {
      const t = (opts.trips || []).find((x) => x.id === body.tripId);
      return t ? json(r, 200, { trip: t, comments: [], list: [], catches: [] }) : json(r, 404, { error: "That trip is not here any more." });
    }
    if (a === "prefs_get") return json(r, 200, prefsAnswer());
    if (a === "prefs_set") {
      for (const k of SWITCHES) if (k in body) db.prefs[k] = !!body[k];
      for (const k of ["quietFrom", "quietTo"]) if (k in body) db.prefs[k] = Number(body[k]);
      return json(r, 200, prefsAnswer());
    }
    if (a === "push_subscribe") { if (!db.endpoints.includes(body.endpoint)) { db.endpoints.push(body.endpoint); db.subs++; } return json(r, 200, { ok: true }); }
    if (a === "push_unsubscribe") { if (db.endpoints.includes(body.endpoint)) { db.endpoints = db.endpoints.filter((e) => e !== body.endpoint); db.subs--; } return json(r, 200, { ok: true }); }
    if (a === "test_alert") return json(r, ctl.test.status || 200, ctl.test.status ? ctl.test.body : ctl.test);
    return json(r, 200, { ok: true });
  });
  return { calls, db, ctl };
}

// The phone's own side of alerts, inside the page: the permission question and
// the subscription. perm is what the phone answers when asked ("granted" or
// "denied"). already: permission was given before. sub: this phone is set up
// already. standalone: running from the Home Screen. none: a browser with no
// alerts at all. touch: how many fingers the screen takes (an iPad says it is a
// Mac, and is known by this). What it holds lives in sessionStorage so a reload keeps it.
const phoneSide = (page, o = {}) => page.addInitScript((o) => {
  const S = window.sessionStorage;
  if (S.getItem("al.init") === null) { S.setItem("al.init", "1"); S.setItem("al.perm", o.already ? "granted" : "default"); S.setItem("al.sub", o.sub ? "1" : ""); S.setItem("al.asked", "0"); }
  if (o.standalone) Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true });
  if (o.touch) Object.defineProperty(Navigator.prototype, "maxTouchPoints", { get: () => o.touch, configurable: true });
  if (o.none) { delete window.PushManager; delete window.Notification; return; }
  Object.defineProperty(window.Notification, "permission", { get: () => S.getItem("al.perm"), configurable: true });
  window.Notification.requestPermission = () => {
    S.setItem("al.asked", String(Number(S.getItem("al.asked")) + 1));
    S.setItem("al.perm", o.perm === "denied" ? "denied" : "granted");
    return Promise.resolve(S.getItem("al.perm"));
  };
  const mk = () => ({ endpoint: "https://push.example.com/send/abc123",
    toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "BPubKey", auth: "authKey" } }; },
    unsubscribe() { S.setItem("al.sub", ""); return Promise.resolve(true); } });
  window.PushManager.prototype.getSubscription = function () { return Promise.resolve(S.getItem("al.sub") ? mk() : null); };
  window.PushManager.prototype.subscribe = function () { S.setItem("al.sub", "1"); return Promise.resolve(mk()); };
}, o);
const asked = (p) => p.evaluate(() => Number(sessionStorage.getItem("al.asked")));

const phone = { viewport: { width: 390, height: 844 } };
const signIn = (page, userId) => page.addInitScript((s) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("rig.session.v1", JSON.stringify(s)); sessionStorage.setItem("seeded", "1"); } },
  { token: "tok-123", refresh: "ref-123", at: Date.now() + 36e5, userId });
const text = (p, sel) => p.locator(sel).first().innerText();
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth);
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);
const sw = (p, key) => p.locator('[data-al-sw="' + key + '"]');
const on = async (p, key) => (await sw(p, key).getAttribute("aria-checked")) === "true";
const sets = (calls) => calls.fn.filter((b) => b.action === "prefs_set");
// A page element's words once they match, or whatever they are when the wait runs out.
const waitText = async (p, sel, re, ms = 4000) => {
  const end = Date.now() + ms;
  let t = "";
  while (Date.now() < end) {
    t = await p.locator(sel).first().innerText().catch(() => "");
    if (re.test(t)) return t;
    await later(60);
  }
  return t;
};
const waitOn = async (p, key, want, ms = 4000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await on(p, key).catch(() => null) === want && await sw(p, key).getAttribute("aria-busy").catch(() => "true") !== "true") return true;
    await later(60);
  }
  return false;
};
// Two taps on the same spot inside 400 ms are a double tap, and the page drops the second.
const settle = () => later(450);
async function open(ctx, o = {}) {
  const p = await ctx.newPage();
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  if (o.fast) await p.addInitScript((ms) => { window.RIG = window.RIG || {}; window.RIG.fetchTimeout = ms; }, o.fast);
  await phoneSide(p, o.phone || {});
  await signIn(p, o.userId || "u-russ");
  await p.goto(base + "#/crew", { waitUntil: "load" });
  if (o.wait !== false) await p.waitForSelector(o.wait || "[data-al-sw]");
  return { p, errs };
}

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
const origin = `http://127.0.0.1:${PORT}`;
try {
  browser = await chromium.launch();

  // --------------------------------------------------------------------
  // Signed out there is no word about alerts anywhere.
  {
    const ctx = await browser.newContext(phone);
    const { calls } = await stub(ctx);
    const p = await ctx.newPage();
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-signin]");
    ok(await p.locator("[data-al]").count() === 0 && !/alert/i.test(await screenText(p)), "signed out, the crew screen says nothing about alerts");
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-week]");
    ok(!/alert|text me/i.test(await screenText(p)), "and neither does the week");
    ok(!calls.fn.some((b) => /prefs|push|test_alert/.test(b.action)), "and nothing about alerts is asked of the server", calls.fn.map((b) => b.action));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Everything starts off. Texts on, the four kinds, quiet hours, read back.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db } = await stub(ctx);
    const { p, errs } = await open(ctx);
    ok(await p.locator("[data-al]").count() === 1 && /alerts/i.test(await text(p, "[data-al] h2")), "signed in, the crew screen has an Alerts group");
    ok(await on(p, "texts") === false && await on(p, "push") === false, "everything starts off");
    ok(/^Text me$/.test((await text(p, '[data-al-sw="texts"] b')).trim()) && /^Alert this phone$/.test((await text(p, '[data-al-sw="push"] b')).trim()), "the two ways are Text me and Alert this phone");
    ok(/off/i.test(await text(p, "[data-al-sum]")), "the headline says it is off", await text(p, "[data-al-sum]"));
    ok(await p.locator("[data-al-kinds]").count() === 0 && await p.locator("[data-al-quiet]").count() === 0, "with nothing on there are no kinds or quiet hours to read through");
    ok(await p.locator("[data-al-test]").count() === 1 && /^Send me a test$/.test((await text(p, "[data-al-test]")).trim()), "Send me a test is there");
    ok(await p.locator("[data-al] .cw-go").count() === 0 && await p.locator('[data-view="crew"] .cw-go').count() === await p.locator("[data-crew-card] .cw-go").count() && await p.locator('[data-view="crew"] .cw-go').count() <= 1,
      "alerts add no gold button: the only one is the first card's next step");
    ok(await p.locator("[data-addnum]").count() === 0, "an account with a number is not asked for one");
    ok(await p.locator('[data-member="u-russ"] [data-member-alerts]').count() === 0, "my own row has no alerts mark yet");
    const below = await p.evaluate(() => {
      const al = document.querySelector("[data-al]"), list = document.querySelector(".cw-list"), out = document.querySelector("[data-signout]");
      return !!(list.compareDocumentPosition(al) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(al.compareDocumentPosition(out) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok(below, "the group sits under the people and above Sign out");

    await sw(p, "texts").click();
    ok(await waitOn(p, "texts", true), "Text me switches on");
    ok(sets(calls).length === 1 && sets(calls)[0].texts === true && Object.keys(sets(calls)[0]).sort().join() === "action,texts", "one save, of that one switch", sets(calls));
    ok(db.prefs.texts === true, "and the server has it");
    ok(/texts/i.test(await text(p, "[data-al-sum]")) && !/off/i.test(await text(p, "[data-al-sum]")), "the headline says texts are on", await text(p, "[data-al-sum]"));
    await p.waitForSelector("[data-al-kinds]");
    const kinds = await p.locator("[data-al-kinds] [data-al-sw]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-al-sw"), e.querySelector("b").innerText.trim(), e.getAttribute("aria-checked")]));
    ok(JSON.stringify(kinds.map((k) => k[0])) === JSON.stringify(["evTrips", "evStatus", "evNotes", "evGearCatches"]), "then the four kinds, in Coach's order", kinds);
    ok(/new trip or idea/i.test(kinds[0][1]) && /on, moved or called off/i.test(kinds[1][1]) && /note on a trip you are on/i.test(kinds[2][1]) && /gear handed to you, and catches/i.test(kinds[3][1]), "in plain words", kinds.map((k) => k[1]));
    ok(kinds.every((k) => k[2] === "true"), "all four on by default");
    ok(await p.locator("[data-al-quiet-from]").inputValue() === "21" && await p.locator("[data-al-quiet-to]").inputValue() === "6", "quiet hours start at 9 PM to 6 AM");
    ok(/9 PM/.test(await text(p, "[data-al-quiet-note]")) && /6 AM/.test(await text(p, "[data-al-quiet-note]")), "and say so", await text(p, "[data-al-quiet-note]"));
    const hours = await p.locator("[data-al-quiet-from] option").allInnerTexts();
    ok(hours.length === 24 && hours[0].trim() === "12 AM" && hours[13].trim() === "1 PM" && hours[23].trim() === "11 PM", "the pickers are the 24 hours by name", hours.slice(0, 3));
    await p.waitForSelector('[data-member="u-russ"] [data-member-alerts]');
    ok(/alerts on/i.test(await text(p, '[data-member="u-russ"] [data-member-alerts]')), "my row in the crew now carries the alerts mark");

    await settle();
    await sw(p, "evNotes").click();
    ok(await waitOn(p, "evNotes", false), "a kind switches off");
    ok(sets(calls).length === 2 && sets(calls)[1].evNotes === false && db.prefs.evNotes === false, "and is saved", sets(calls)[1]);
    ok(await on(p, "evTrips") && await on(p, "evStatus") && await on(p, "evGearCatches") && await on(p, "texts"), "the others stay as they were");

    await p.locator("[data-al-quiet-from]").selectOption("22");
    await waitText(p, "[data-al-quiet-note]", /10 PM/);
    ok(db.prefs.quietFrom === 22 && sets(calls)[2].quietFrom === 22 && !("quietTo" in sets(calls)[2]), "a new quiet start is saved on the change", sets(calls)[2]);
    ok(/10 PM/.test(await text(p, "[data-al-quiet-note]")), "and the line follows it", await text(p, "[data-al-quiet-note]"));
    await p.locator("[data-al-quiet-to]").selectOption("22");
    const none = await waitText(p, "[data-al-quiet-note]", /no quiet hours/i);
    ok(/no quiet hours/i.test(none) && db.prefs.quietTo === 22, "the same hour twice means no quiet hours", none);
    await p.locator("[data-al-quiet-to]").selectOption("7");
    await waitText(p, "[data-al-quiet-note]", /7 AM/);

    const big = await p.evaluate(() => [...document.querySelectorAll("[data-al] button, [data-al] select")].map((e) => [e.getAttribute("data-al-sw") || e.tagName, Math.round(e.getBoundingClientRect().height), Math.round(e.getBoundingClientRect().width)]).filter((x) => x[1] < 44 || x[2] < 44));
    ok(big.length === 0, "every switch, picker and button is 44 px or more", big);
    ok(await wide(p) <= 390, "nothing runs off the side at phone width", await wide(p));
    const words = await screenText(p);
    ok(!PHONE.test(words) && !EMAIL.test(words), "no phone number or email is on the screen", words.match(PHONE) || words.match(EMAIL));

    // Leave and come back: it reads back what was saved.
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("[data-al-kinds]");
    ok(await on(p, "texts") && await on(p, "evNotes") === false && await p.locator("[data-al-quiet-from]").inputValue() === "22" && await p.locator("[data-al-quiet-to]").inputValue() === "7",
      "opened again, the switches and quiet hours read back as saved");

    await sw(p, "texts").click();
    ok(await waitOn(p, "texts", false) && db.prefs.texts === false, "Text me switches off again");
    await p.waitForFunction(() => !document.querySelector("[data-al-kinds]"));
    ok(await p.locator('[data-member="u-russ"] [data-member-alerts]').count() === 0, "and the alerts mark leaves my row");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // A double tap is one change, not on and off again.
  {
    const ctx = await browser.newContext(phone);
    const { calls } = await stub(ctx);
    const { p } = await open(ctx);
    await sw(p, "texts").dblclick();
    ok(await waitOn(p, "texts", true), "a double tap on a switch leaves it on");
    await later(300);
    ok(sets(calls).length === 1, "and saves once", sets(calls).length);
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // A save that fails never looks saved.
  {
    const ctx = await browser.newContext(phone);
    const { calls, ctl, db } = await stub(ctx);
    const { p, errs } = await open(ctx);
    ctl.set = () => ({ status: 500, body: { error: "Something went wrong on our end. Try again." } });
    await sw(p, "texts").click();
    const said = await waitText(p, '[data-al-said="texts"]', /not saved/i);
    ok(/went wrong/i.test(said) && /not saved/i.test(said), "a server fault says so, and that it was not saved", said);
    ok(await on(p, "texts") === false && db.prefs.texts === false, "and the switch is back off");
    ok(await p.locator("[data-al-kinds]").count() === 0 && /off/i.test(await text(p, "[data-al-sum]")), "nothing else on the screen pretends it is on");

    ctl.set = () => "down";
    await settle();
    await sw(p, "texts").click();
    const gone = await waitText(p, '[data-al-said="texts"]', /no signal/i);
    ok(/no signal/i.test(gone) && /not saved/i.test(gone) && await on(p, "texts") === false, "no signal says no signal, not saved, and stays off", gone);

    // A 200 that is not the function's own answer is not a yes.
    ctl.set = () => ({ status: 200, body: { ok: true } });
    await settle();
    await sw(p, "texts").click();
    const odd = await waitText(p, '[data-al-said="texts"]', /not saved/i);
    ok(/not saved/i.test(odd) && await on(p, "texts") === false, "an answer without the settings in it is not taken for a yes", odd);

    // While the answer is on its way the row says Saving, and a second tap changes nothing.
    let release;
    const held = new Promise((r) => { release = r; });
    ctl.set = async () => { await held; return undefined; };
    await settle();
    const before = sets(calls).length;
    await sw(p, "texts").click();
    await p.waitForSelector('[data-al-sw="texts"][aria-busy="true"]');
    ok(/saving/i.test(await text(p, '[data-al-sw="texts"]')), "while it is being saved the row says Saving", await text(p, '[data-al-sw="texts"]'));
    await settle();
    await sw(p, "texts").click();
    await later(200);
    ok(sets(calls).length === before + 1, "a tap while it is saving sends nothing more", sets(calls).length - before);
    release();
    ok(await waitOn(p, "texts", true) && db.prefs.texts === true, "and when the yes arrives it is on");
    ok(!/saving/i.test(await text(p, '[data-al-sw="texts"]')), "with Saving gone");
    ctl.set = null;

    // Quiet hours: a failed save puts the picker back.
    await p.waitForSelector("[data-al-quiet-from]");
    ctl.set = () => ({ status: 400, body: { error: "Quiet hours are whole hours from 0 to 23." } });
    await p.locator("[data-al-quiet-from]").selectOption("3");
    const q = await waitText(p, '[data-al-said="quiet"]', /not saved/i);
    ok(/whole hours/i.test(q) && /not saved/i.test(q), "a refused quiet hour says why", q);
    ok(await p.locator("[data-al-quiet-from]").inputValue() === "21" && db.prefs.quietFrom === 21, "and the picker goes back to what is saved");
    ctl.set = () => ({ status: 500, body: { error: "Something went wrong on our end. Try again." } });
    await settle();
    await sw(p, "evTrips").click();
    const k = await waitText(p, '[data-al-said="kinds"]', /not saved/i);
    ok(/not saved/i.test(k) && await on(p, "evTrips") === true, "a kind that did not save stays as it was, and says so", k);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // A line that never answers ends in words, not in Saving for ever.
  {
    const ctx = await browser.newContext(phone);
    const { ctl } = await stub(ctx);
    const { p } = await open(ctx, { fast: 1500 });
    ctl.set = () => "hang";
    await sw(p, "texts").click();
    const t = await waitText(p, '[data-al-said="texts"]', /no signal/i, 6000);
    ok(/no signal/i.test(t) && await on(p, "texts") === false && await sw(p, "texts").getAttribute("aria-busy") !== "true", "a dead line gives up, says no signal, and the switch is off", t);
    await ctx.close();
  }

  // The settings themselves cannot be loaded.
  {
    const ctx = await browser.newContext(phone);
    const { ctl, calls } = await stub(ctx);
    ctl.get = () => ({ status: 500, body: { error: "Something went wrong on our end. Try again." } });
    const { p } = await open(ctx, { wait: "[data-al-msg]" });
    const t = await waitText(p, "[data-al-msg]", /went wrong/i);
    ok(/went wrong/i.test(t) && await p.locator("[data-al-sw]").count() === 0, "settings that will not load say so, and draw no switches to guess with", t);
    ok(await p.locator("[data-al-retry]").count() === 1, "with Try again");
    ctl.get = null;
    await p.locator("[data-al-retry]").click();
    await p.waitForSelector("[data-al-sw]");
    ok(await on(p, "texts") === false, "Try again loads them");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    await ctx.close();
  }

  // Seen once, then no signal: the last settings this phone saw, said plainly.
  {
    const ctx = await browser.newContext(phone);
    const { ctl, db } = await stub(ctx, { prefs: { texts: true, quietFrom: 20 } });
    const { p } = await open(ctx, { wait: "[data-al-kinds]", fast: 4000 });
    // One bar at the rail: every call is taken and never answered.
    ctl.hang = true;
    const t0 = Date.now();
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("[data-al-kinds]", { timeout: 2500 }).catch(() => {});
    const took = Date.now() - t0;
    ok(await p.locator("[data-al-kinds]").count() === 1 && took < 3000 && await on(p, "texts") && await p.locator("[data-al-quiet-from]").inputValue() === "20",
      "with no signal the alerts group opens at once with what this phone last saw, not when the wait runs out", took);
    const note = await waitText(p, "[data-al-note]", /no signal/i, 9000);
    ok(/no signal/i.test(note) && /last saw/i.test(note), "and then says that is what it is", note);
    ctl.hang = false; ctl.down = true;
    await sw(p, "evStatus").click();
    const t = await waitText(p, '[data-al-said="kinds"]', /no signal/i, 6000);
    ok(/no signal/i.test(t) && /not saved/i.test(t) && await on(p, "evStatus") === true && db.prefs.evStatus === true, "a change with no signal is not saved and does not look saved", t);
    // Sign out: the saved settings go with the session.
    ctl.down = false;
    await p.locator("[data-signout]").click();
    await p.waitForSelector("[data-signin]");
    ok(await p.evaluate(() => localStorage.getItem("rig.crewprefs.v1")) === null, "signing out forgets the saved alert settings");
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Text me with no number on the account: it offers the number, and does not pretend.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db } = await stub(ctx, { hasPhone: false });
    const { p, errs } = await open(ctx);
    ok(await p.locator("[data-al] [data-addnum-open]").count() === 1 && /^Add my number$/.test((await text(p, "[data-addnum-open]")).trim()), "with no number on the account, Add my number sits with Text me");
    await sw(p, "texts").click();
    await p.waitForSelector("[data-addnum-phone]");
    ok(await on(p, "texts") === false && sets(calls).length === 0 && db.prefs.texts === false, "Text me does not switch on, and nothing is saved");
    ok(/need a number/i.test(await text(p, '[data-al-said="texts"]')), "it says texts need a number", await text(p, '[data-al-said="texts"]'));
    ok(await p.evaluate(() => document.activeElement && document.activeElement.hasAttribute("data-addnum-phone")), "and the number box is open and ready");
    ok(/off/i.test(await text(p, "[data-al-sum]")) && await p.locator("[data-al-kinds]").count() === 0, "the headline still says off");
    await p.locator("[data-addnum-phone]").fill("253 555 0147");
    await p.locator("[data-addnum-send]").click();
    await p.waitForSelector("[data-addnum-code]");
    ok(calls.user.length === 1 && calls.user[0].phone === "+12535550147", "the number goes to the sign-in server");
    ok(await on(p, "texts") === false && sets(calls).length === 0, "still off while the code is on its way");
    await p.locator("[data-addnum-code]").fill("654321");
    await p.locator("[data-addnum-verify]").click();
    await p.waitForSelector("[data-addnum-done]");
    ok(await waitOn(p, "texts", true), "with the number confirmed, Text me goes on: that is what was asked for");
    ok(sets(calls).length === 1 && sets(calls)[0].texts === true && db.prefs.texts === true, "saved once");
    const words = await screenText(p);
    ok(!PHONE.test(words) && !EMAIL.test(words), "the number is never printed on the screen", words.match(PHONE));
    ok(await wide(p) <= 390, "it fits the phone", await wide(p));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Texts already on from before, on an account with no number: said, never dressed up.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db } = await stub(ctx, { hasPhone: false, prefs: { texts: true } });
    const { p } = await open(ctx);
    ok(await on(p, "texts") === true && /no number/i.test(await text(p, '[data-al-sw="texts"]')), "texts left on with no number: the row says no text can reach you", await text(p, '[data-al-sw="texts"]'));
    ok(!/on: texts/i.test(await text(p, "[data-al-sum]")), "and the headline does not count it as on", await text(p, "[data-al-sum]"));
    await sw(p, "texts").click();
    ok(await waitOn(p, "texts", false) && db.prefs.texts === false && sets(calls).length === 1, "it can still be switched off");
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Alert this phone, on an iPhone that is not on the Home Screen: no question
  // is asked, and it says what to do first.
  {
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    const { calls } = await stub(ctx);
    const { p, errs } = await open(ctx, { phone: { perm: "granted" } });
    await sw(p, "push").click();
    await p.waitForSelector("[data-al-install]");
    const t = await text(p, "[data-al-install]");
    ok(await asked(p) === 0, "an iPhone in Safari is never asked the permission question");
    ok(/Add Rig Card to your Home Screen first\./.test(t) && /Apple only allows alerts there\./.test(t), "it says, in two short lines, to add it to the Home Screen first and why", t);
    const lines = await p.locator("[data-al-install] p").allInnerTexts();
    ok(lines.length === 2 && lines.every((l) => l.trim().length <= 44), "two lines, both short", lines);
    const steps = await p.locator("[data-al-install] ol li").allInnerTexts();
    ok(steps.length === 3 && /share/i.test(steps[0]) && /add to home screen/i.test(steps[1]) && /open/i.test(steps[2]) && /from there/i.test(steps[2]), "with the three steps: Share, Add to Home Screen, open it from there", steps);
    ok(await on(p, "push") === false && !calls.fn.some((b) => b.action === "push_subscribe") && sets(calls).length === 0, "nothing is switched on or saved");
    ok(await wide(p) <= 390, "it fits the phone", await wide(p));
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // The same iPhone, on an account with no number (it joined by a link). The
  // Home Screen copy starts signed out, and there is no code to sign in with:
  // the steps say how to get in there, with the link from the text.
  {
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    await stub(ctx, { hasPhone: false });
    const { p } = await open(ctx, { phone: { perm: "granted" } });
    await sw(p, "push").click();
    await p.waitForSelector("[data-al-install]");
    const steps = await p.locator("[data-al-install] ol li").allInnerTexts();
    ok(steps.length === 4 && /open/i.test(steps[2]) && /signed out/i.test(steps[2]) && /link from the text/i.test(steps[3]) && /paste/i.test(steps[3]) && /switch this on/i.test(steps[3]),
      "no number: it says the Home Screen copy starts signed out, and to paste the link from the text there", steps);
    ok(!steps.some((x) => /sign in with your number/i.test(x)), "and never says to sign in with a number it does not have", steps);
    await ctx.close();
  }
  {
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    await stub(ctx);
    const { p } = await open(ctx, { phone: { perm: "granted" } });
    await sw(p, "push").click();
    await p.waitForSelector("[data-al-install]");
    const steps = await p.locator("[data-al-install] ol li").allInnerTexts();
    ok(/sign in with your number/i.test(steps[2] || ""), "with a number on the account: open it there and sign in with your number", steps);
    await ctx.close();
  }

  // An iPad calls itself a Mac. It is told the same thing.
  {
    const ctx = await browser.newContext({ ...phone, hasTouch: true, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15" });
    const { calls } = await stub(ctx);
    const p0 = await ctx.newPage();
    await p0.close();
    const { p } = await open(ctx, { phone: { perm: "granted", touch: 5 } });
    await sw(p, "push").click();
    await p.waitForSelector("[data-al-install]");
    ok(await asked(p) === 0 && /Home Screen first/.test(await text(p, "[data-al-install]")) && !calls.fn.some((b) => b.action === "push_subscribe"), "an iPad in Safari is told to add it to the Home Screen too, and is not asked");
    await ctx.close();
  }

  // The same iPhone, opened from the Home Screen: it asks on the tap, and switches on.
  {
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    const { calls, db } = await stub(ctx);
    const { p, errs } = await open(ctx, { phone: { perm: "granted", standalone: true } });
    ok(await asked(p) === 0, "nothing is asked before the tap");
    await sw(p, "push").click();
    ok(await waitOn(p, "push", true), "from the Home Screen, Alert this phone switches on");
    ok(await asked(p) === 1, "the phone was asked once, on the tap", await asked(p));
    const subCall = calls.fn.find((b) => b.action === "push_subscribe");
    ok(subCall && subCall.endpoint === "https://push.example.com/send/abc123" && subCall.p256dh === "BPubKey" && subCall.auth === "authKey", "this phone's alert address goes to the server", subCall);
    ok(sets(calls).length === 1 && sets(calls)[0].push === true && db.prefs.push === true, "and the switch is saved");
    ok(/this phone/i.test(await text(p, "[data-al-sum]")), "the headline says this phone is on", await text(p, "[data-al-sum]"));
    ok(await p.locator("[data-al-install]").count() === 0 && await p.locator("[data-al-denied]").count() === 0, "with no how-to on the screen");
    await p.waitForSelector("[data-al-kinds]");

    // Opened again: still on.
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("[data-al-kinds]");
    ok(await waitOn(p, "push", true), "opened again, it is still on");

    // Off again: this phone stops, and with no phone left the account's switch goes off too.
    await sw(p, "push").click();
    ok(await waitOn(p, "push", false), "it switches off");
    ok(calls.fn.some((b) => b.action === "push_unsubscribe" && b.endpoint === "https://push.example.com/send/abc123") && db.subs === 0, "this phone's address is taken off the server");
    ok(db.prefs.push === false && sets(calls).some((b) => b.push === false), "and with no phone left, the switch is saved off");
    ok(await p.evaluate(() => sessionStorage.getItem("al.sub")) === "", "and the phone itself has stopped listening");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Permission refused: how to turn it back on, on an iPhone and elsewhere.
  {
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    const { calls, db } = await stub(ctx);
    const { p } = await open(ctx, { phone: { perm: "denied", standalone: true } });
    await sw(p, "push").click();
    await p.waitForSelector("[data-al-denied]");
    const t = await text(p, "[data-al-denied]");
    ok(/turned off/i.test(t) && /Settings/.test(t) && /Notifications/.test(t) && /Rig Card/.test(t), "refused on an iPhone: it says where in Settings to turn alerts back on", t);
    ok(await on(p, "push") === false && db.prefs.push === false && !calls.fn.some((b) => b.action === "push_subscribe") && sets(calls).length === 0, "and nothing is switched on or saved");
    ok(await wide(p) <= 390, "it fits the phone", await wide(p));
    await ctx.close();

    const ctx2 = await browser.newContext(phone);
    await stub(ctx2);
    const o2 = await open(ctx2, { phone: { perm: "denied" } });
    await sw(o2.p, "push").click();
    await o2.p.waitForSelector("[data-al-denied]");
    const t2 = await text(o2.p, "[data-al-denied]");
    ok(/blocked/i.test(t2) && /browser/i.test(t2) && /allow/i.test(t2) && !/Home Screen/.test(t2), "refused in a browser: it says to allow notifications for the site", t2);
    ok(await on(o2.p, "push") === false, "and stays off");
    await ctx2.close();
  }

  // An Android phone or a laptop: no Home Screen step, it just asks.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db } = await stub(ctx);
    const { p } = await open(ctx, { phone: { perm: "granted" } });
    await sw(p, "push").click();
    ok(await waitOn(p, "push", true) && await asked(p) === 1 && db.prefs.push === true && db.subs === 1, "off an iPhone it asks on the tap and switches on");
    ok(await p.locator("[data-al-install]").count() === 0, "with no Home Screen talk");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    await ctx.close();
  }

  // The switch could not be saved after the phone said yes: it does not read on.
  {
    const ctx = await browser.newContext(phone);
    const { ctl, db } = await stub(ctx);
    const { p } = await open(ctx, { phone: { perm: "granted" } });
    ctl.set = () => ({ status: 500, body: { error: "Something went wrong on our end. Try again." } });
    await sw(p, "push").click();
    const t = await waitText(p, '[data-al-said="push"]', /not saved/i);
    ok(/not saved/i.test(t) && await on(p, "push") === false && db.prefs.push === false, "a phone that said yes but a save that failed: off, and it says so", t);
    ctl.set = null;
    await settle();
    await sw(p, "push").click();
    ok(await waitOn(p, "push", true) && db.prefs.push === true && db.subs === 1, "a second tap finishes the job, with one phone on the server", db.subs);
    await ctx.close();
  }

  // A browser that cannot show alerts at all.
  {
    const ctx = await browser.newContext(phone);
    const { calls } = await stub(ctx);
    const { p } = await open(ctx, { phone: { none: true } });
    await sw(p, "push").click();
    const t = await waitText(p, '[data-al-said="push"]', /cannot show alerts/i);
    ok(/cannot show alerts/i.test(t) && await on(p, "push") === false && sets(calls).length === 0, "a browser with no alerts says so and saves nothing", t);
    await ctx.close();
  }

  // Alerts are on for another phone of theirs: this one reads off, and says so.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx, { prefs: { push: true }, subs: 1 });
    const { p } = await open(ctx, { wait: "[data-al-kinds]" });
    ok(await on(p, "push") === false && /another phone/i.test(await text(p, '[data-al-sw="push"]')), "on for another phone: this phone's switch is off and the row says where it is on", await text(p, '[data-al-sw="push"]'));
    ok(/another phone/i.test(await text(p, "[data-al-sum]")), "and so does the headline", await text(p, "[data-al-sum]"));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Send me a test: what happened, said per channel.
  {
    const ctx = await browser.newContext(phone);
    const { calls, ctl, db } = await stub(ctx);
    const { p, errs } = await open(ctx);
    const run = async (answer) => {
      ctl.test = answer;
      await settle();
      const n = calls.fn.filter((b) => b.action === "test_alert").length;
      await p.locator("[data-al-test]").click();
      for (let i = 0; i < 60 && (calls.fn.filter((b) => b.action === "test_alert").length === n || await p.locator("[data-al-test-line]").count() === 0); i++) await later(60);
      return p.locator("[data-al-test-line]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-al-test-line"), e.innerText.trim(), e.classList.contains("no")]));
    };
    let r = await run({ ok: true, push: "none", text: "none" });
    ok(r.length === 1 && r[0][0] === "none" && /^Nothing is switched on\.$/.test(r[0][1]), "with everything off the test says nothing is switched on", r);
    ok(calls.fn.filter((b) => b.action === "test_alert").length === 1, "one test was asked for");

    r = await run({ ok: true, push: "sent", text: "none" });
    ok(r.length === 1 && r[0][0] === "push" && /^Sent to (this|your other) phone\.$/.test(r[0][1]) && !r[0][2], "a phone alert that went says sent to the phone", r);
    r = await run({ ok: true, push: "none", text: "sent" });
    ok(r.length === 1 && r[0][0] === "text" && /^Texted you\.$/.test(r[0][1]) && !r[0][2], "a text that went says texted", r);
    r = await run({ ok: true, push: "sent", text: "sent" });
    ok(r.length === 2 && r[0][0] === "push" && r[1][0] === "text", "both channels get a line each", r);
    r = await run({ ok: true, push: "failed", text: "none" });
    ok(r.length === 1 && r[0][0] === "push" && /your phone refused it/i.test(r[0][1]) && r[0][2], "a phone that refused it says so", r);
    r = await run({ ok: true, push: "none", text: "failed" });
    ok(r.length === 1 && r[0][0] === "text" && /did not go/i.test(r[0][1]) && r[0][2], "a text that failed says so", r);
    r = await run({ ok: true, push: "failed", text: "sent" });
    ok(r.length === 2 && r[0][2] === true && r[1][2] === false, "one channel failing and one landing are told apart", r);

    r = await run({ ok: true, push: "none", text: "stopped" });
    ok(r.length === 1 && r[0][0] === "text" && /stopped/i.test(r[0][1]) && /replied STOP/.test(r[0][1]) && /text START/i.test(r[0][1]), "texts stopped: it says the number replied STOP, and to text START to undo it", r);
    await p.waitForSelector("[data-al-stopped]");
    ok(/STOP/.test(await text(p, "[data-al-stopped]")) && /START/.test(await text(p, "[data-al-stopped]")), "and the stopped state now shows by Text me", await text(p, "[data-al-stopped]"));

    r = await run({ status: 500, body: { error: "Something went wrong on our end. Try again." } });
    ok(r.length === 1 && r[0][0] === "fail" && /went wrong/i.test(r[0][1]) && r[0][2], "a test the server could not run says so", r);
    ctl.down = true;
    r = await run({ ok: true, push: "sent", text: "sent" });
    ok(r.length === 1 && r[0][0] === "fail" && /no signal/i.test(r[0][1]) && /not sent/i.test(r[0][1]), "a test with no signal says it was not sent", r);
    ctl.down = false;
    ok(db.prefs.texts === false && db.prefs.push === false && sets(calls).length === 0, "a test changes no setting");
    ok(await wide(p) <= 390, "it fits the phone", await wide(p));
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Something is on, yet nothing could be sent: it says which, not "nothing is on".
  {
    const ctx = await browser.newContext(phone);
    const { ctl } = await stub(ctx, { hasPhone: false, prefs: { texts: true } });
    const { p } = await open(ctx);
    ctl.test = { ok: true, push: "none", text: "none" };
    await p.locator("[data-al-test]").click();
    const t = await waitText(p, "[data-al-test-line]", /number/i);
    ok(/nothing was sent/i.test(t) && /no number/i.test(t) && !/nothing is switched on/i.test(t), "texts on with no number: the test says why nothing went", t);
    await ctx.close();
  }

  // The server already knows texts are stopped: shown on arrival, and it can be undone.
  {
    const ctx = await browser.newContext(phone);
    const { calls, db } = await stub(ctx, { prefs: { texts: true, textsStopped: true } });
    const { p } = await open(ctx, { wait: "[data-al-stopped]" });
    const t = await text(p, "[data-al-stopped]");
    ok(/texts are stopped/i.test(t) && /replied STOP/.test(t) && /text START/i.test(t), "texts stopped shows as its own state, with how to undo it", t);
    ok(!/on: texts/i.test(await text(p, "[data-al-sum]")), "the headline does not count stopped texts as on", await text(p, "[data-al-sum]"));
    ok(await p.locator("[data-al-unstop]").count() === 1, "with a button for after texting START");
    await p.locator("[data-al-unstop]").click();
    await p.waitForFunction(() => !document.querySelector("[data-al-stopped]"));
    ok(db.prefs.textsStopped === false && sets(calls).length === 1 && sets(calls)[0].textsStopped === false, "tapping it clears the stop on the server", sets(calls));
    ok(/texts/i.test(await text(p, "[data-al-sum]")) && await on(p, "texts"), "and texts read on again");
    ok(await wide(p) <= 390, "it fits the phone", await wide(p));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // The crew list marks who has alerts on, so the owner knows who Tell can reach.
  {
    const ctx = await browser.newContext(phone);
    const { calls } = await stub(ctx, { who: "owner", others: { "u-russ": true, "u-dad": false } });
    const { p, errs } = await open(ctx, { userId: "u-coach" });
    await p.waitForSelector("[data-member]");
    ok(await p.locator('[data-member="u-russ"] [data-member-alerts]').count() === 1 && /^alerts on$/i.test((await text(p, '[data-member="u-russ"] [data-member-alerts]')).trim()), "a member with alerts on carries a small alerts on mark");
    ok(await p.locator('[data-member="u-dad"] [data-member-alerts]').count() === 0 && await p.locator('[data-member="u-coach"] [data-member-alerts]').count() === 0, "and people with alerts off do not");
    ok(await p.locator('[data-view="crew"] .cw-go').count() === 1, "the owner's screen still has one gold button", await p.locator('[data-view="crew"] .cw-go').count());
    await p.locator('[data-member-open="u-russ"]').click();
    ok(await p.locator('[data-remove="u-russ"]').count() === 1 && await p.locator('[data-newlink="u-russ"]').count() === 1, "and the owner's buttons are all still there, under the row");
    ok(await wide(p) <= 390, "the owner's screen fits the phone", await wide(p));
    const words = await screenText(p);
    ok(!PHONE.test(words) && !EMAIL.test(words), "no phone number or email is on the screen");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();

    // A member sees the marks too.
    const ctx2 = await browser.newContext(phone);
    await stub(ctx2, { others: { "u-coach": true } });
    const o2 = await open(ctx2);
    ok(await o2.p.locator('[data-member="u-coach"] [data-member-alerts]').count() === 1 && await o2.p.locator('[data-member="u-dad"] [data-member-alerts]').count() === 0, "a member sees who has alerts on as well");
    await ctx2.close();
  }

  // A trip opened straight from a text or an alert, on a phone whose saved crew
  // is from before someone switched alerts on: the Tell row catches up, so the
  // sender is not left choosing from yesterday's list.
  {
    const soon = new Date(Date.now() + 3 * 864e5), iso = soon.getFullYear() + "-" + String(soon.getMonth() + 1).padStart(2, "0") + "-" + String(soon.getDate()).padStart(2, "0");
    const trip = { id: "t1", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid at Redondo", date: iso, from: 17, to: 21, status: "planned", note: null,
      by: { id: "u-coach", name: "Coach Grande" }, going: [{ id: "u-coach", name: "Coach Grande", answer: "going" }], counts: { comments: 0, list: 0, listDone: 0, catches: 0 }, updatedAt: new Date().toISOString() };
    const old = { me: { id: "u-russ", name: "Russell" }, crew: { id: "c1", name: "ZZTEST crew", role: "member" }, sms: true, at: Date.now() - 864e5, trips: [trip], members: [
      { id: "u-coach", name: "Coach Grande", role: "owner", alerts: false, signIn: "code" }, { id: "u-russ", name: "Russell", role: "member", alerts: false, signIn: "link" }, { id: "u-dad", name: "Dad", role: "member", alerts: false, signIn: "code" }] };
    const ctx = await browser.newContext(phone);
    const { calls } = await stub(ctx, { trips: [trip], others: { "u-coach": true, "u-dad": true } });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript((c) => { if (!sessionStorage.getItem("seeded:crew")) { localStorage.setItem("rig.crew.v1", JSON.stringify(c)); sessionStorage.setItem("seeded:crew", "1"); } }, old);
    await signIn(p, "u-russ");
    await p.goto(base + "#/crew/trip/t1", { waitUntil: "load" });
    await p.waitForSelector("[data-cw-notebox]");
    const row = '[data-cw-notes=""] [data-cw-tell="note"]';
    await p.waitForSelector(row, { timeout: 5000 }).catch(() => {});
    const names = await p.locator(row + " [data-cw-tell-id]").evaluateAll((els) => els.map((e) => [e.getAttribute("data-cw-tell-id"), e.innerText.trim(), e.getAttribute("aria-pressed")]));
    ok(JSON.stringify(names) === JSON.stringify([["u-coach", "Coach", "true"], ["u-dad", "Dad", "true"]]), "a trip opened cold shows the Tell row as the crew is now, not as this phone last saw it", names);
    const asks = calls.fn.filter((b) => b.action === "state").length;
    // Going into a part of the run card and back does not ask again inside the minute.
    await p.locator("[data-sec-row]").first().click();
    await p.waitForSelector('[data-view="crewtrip"][data-sec]');
    await p.goBack();
    await p.waitForSelector("[data-cw-run]");
    await later(400);
    ok(calls.fn.filter((b) => b.action === "state").length === asks && asks >= 1, "and the crew is not asked for again on every step inside the trip", [asks, calls.fn.filter((b) => b.action === "state").length]);
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Both looks: the group reads in daylight and after dark.
  {
    for (const mode of ["light", "dark"]) {
      const ctx = await browser.newContext(phone);
      await stub(ctx, { prefs: { texts: true } });
      const p = await ctx.newPage();
      await p.addInitScript((m) => localStorage.setItem("rig.skymode.v1", m), mode);
      await phoneSide(p, {});
      await signIn(p, "u-russ");
      await p.goto(base + "#/crew", { waitUntil: "load" });
      await p.waitForSelector("[data-al-kinds]");
      const seen = await p.evaluate(() => {
        const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
        const row = document.querySelector('[data-al-sw="texts"]'), label = row.querySelector("b");
        let bg = "rgba(0, 0, 0, 0)", el = row;
        while (el && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bg = getComputedStyle(el).backgroundColor; el = el.parentElement; }
        return { text: lum(getComputedStyle(label).color), bg: lum(bg), scheme: document.documentElement.style.colorScheme };
      });
      ok(seen.scheme === mode && Math.abs(seen.text - seen.bg) > 0.4, "in " + mode + " the switch rows read clearly against their ground", seen);
      await ctx.close();
    }
  }

  // --------------------------------------------------------------------
  // The service worker: what a push shows, and where a tap on it goes.
  // Headless Chromium will not grant notifications, so the worker's own
  // showNotification is swapped for a recorder. The push itself is a real one,
  // delivered to the worker's real listener.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx);
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil: "load" });
    await p.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100)); });
    const worker = ctx.serviceWorkers().find((w) => /\/rigs\/sw\.js$/.test(w.url()));
    await worker.evaluate(() => { self.__shown = []; self.registration.showNotification = (title, opts) => { self.__shown.push({ title, opts }); return Promise.resolve(); }; });
    const cdp = await ctx.newCDPSession(p);
    const regs = new Promise((done) => { cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => { const r = e.registrations.find((x) => x.scopeURL.endsWith("/rigs/")); if (r) done(r); }); setTimeout(() => done(null), 4000); });
    await cdp.send("ServiceWorker.enable");
    const reg = await regs;
    const push = async (data) => {
      await worker.evaluate(() => { self.__shown = []; });
      await cdp.send("ServiceWorker.deliverPushMessage", { origin, registrationId: reg.registrationId, data: typeof data === "string" ? data : JSON.stringify(data) });
      for (let i = 0; i < 40; i++) { const s = await worker.evaluate(() => self.__shown); if (s.length) return s[0]; await later(50); }
      return null;
    };
    // The link the server really sends is on coachpilot.org, whatever address the app was opened from.
    let s = await push({ title: "Coach floated a trip", body: "Squid at Redondo, Sat Nov 28", url: "https://coachpilot.org/rigs/#/crew/trip/t1", tag: "crew-41" });
    ok(s && s.title === "Coach floated a trip" && s.opts.body === "Squid at Redondo, Sat Nov 28", "a push shows the alert with the title and body the server sent", s);
    ok(s && s.opts.tag === "crew-41" && /icon-v4-192\.png$/.test(s.opts.icon), "with its tag and the Rig Card icon", s && s.opts);
    ok(s && s.opts.data.url === origin + "/rigs/#/crew/trip/t1", "and remembers the trip, on the address this copy of the app lives at", s && s.opts.data.url);
    s = await push({ title: "Rig Card test", body: "It works.", url: "https://www.coachpilot.org/rigs/#/crew" });
    ok(s && s.title === "Rig Card test" && s.opts.data.url === origin + "/rigs/#/crew", "the test alert opens the crew screen, from the www address too", s && s.opts.data.url);
    s = await push({ title: "x", body: "y", url: "https://example.com/rigs/#/crew/trip/t9" });
    ok(s && s.opts.data.url === origin + "/rigs/", "a link to anyone else's site is never kept, whatever its path", s && s.opts.data.url);
    s = await push({ title: "x", body: "y", url: "https://coachpilot.org/fields/#/x" });
    ok(s && s.opts.data.url === origin + "/rigs/", "nor one to another part of coachpilot.org", s && s.opts.data.url);
    s = await push("plain words, not JSON");
    ok(s && s.title === "Rig Card" && s.opts.body === "plain words, not JSON" && s.opts.data.url === origin + "/rigs/#/trips", "a push that is not JSON still shows something sensible", s);

    // A tap: the notification closes and the open app goes to that trip.
    const tap = (url) => worker.evaluate((u) => { let closed = 0; return alertTapped({ close() { closed++; }, data: u === null ? undefined : { url: u } }).then((went) => ({ went, closed })); }, url);
    let went = await tap(origin + "/rigs/#/crew/trip/t1");
    await p.waitForFunction(() => location.hash === "#/crew/trip/t1", null, { timeout: 3000 }).catch(() => {});
    ok(went.went === "sent" && went.closed === 1 && await p.evaluate(() => location.hash) === "#/crew/trip/t1", "a tap closes the alert and sends the open app to that trip", went);
    went = await tap(origin + "/rigs/#/crew/trip/t2");
    await p.waitForFunction(() => location.hash === "#/crew/trip/t2", null, { timeout: 3000 }).catch(() => {});
    ok(await p.evaluate(() => location.hash) === "#/crew/trip/t2", "a second alert about another trip moves it again");

    // No app open, or only some other page under /rigs/: a window is opened on the trip.
    await worker.evaluate(() => { self.__opened = []; self.clients.openWindow = (u) => { self.__opened.push(u); return Promise.resolve(null); }; });
    await p.goto(origin + "/rigs/look/", { waitUntil: "load" });
    went = await tap(origin + "/rigs/#/crew/trip/t3");
    const opened = await worker.evaluate(() => self.__opened);
    ok(went.went === "opened" && opened.length === 1 && opened[0] === origin + "/rigs/#/crew/trip/t3", "with only another page under /rigs/ open, a tap opens the app on the trip instead of poking that page", { went, opened });
    went = await tap(null);
    ok(went.went === "opened" && (await worker.evaluate(() => self.__opened))[1] === origin + "/rigs/", "an alert with no link opens the app");

    // The two listeners are the thin kind: all they do is call what was just tested.
    const src = readFileSync(resolve(ROOT, "rigs/sw.js"), "utf8");
    ok(/addEventListener\("push",[^]*?showPush\(event\.data\)/.test(src) && /addEventListener\("notificationclick",[^]*?alertTapped\(event\.notification\)/.test(src), "the push and notificationclick listeners hand straight to those two functions");
    ok(/const CACHE = "rigs-v(\d+)"/.test(src) && Number(src.match(/const CACHE = "rigs-v(\d+)"/)[1]) >= 25, "and the cache name was bumped with the change", (src.match(/const CACHE = "[^"]+"/) || [])[0]);
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
