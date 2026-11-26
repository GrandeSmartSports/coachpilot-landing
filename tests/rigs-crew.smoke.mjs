// Signing in, joining and the crew, in the real page at phone width, with
// every network call stubbed. Run: node tests/rigs-crew.smoke.mjs
//
// Nothing here reaches Supabase: a catch-all route answers anything a test
// did not expect and the test fails if that list is not empty.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8801;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 300)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 280000);
watchdog.unref?.();

const SITE = "https://coachpilot.org/rigs/";
const TOKEN = "Ab3_dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const LINK = SITE + "#/join/" + TOKEN;
const PHONE = /\(?\b\d{3}\)?[-. ]?\d{3}[-. ]?\d{4}\b/;
const EMAIL = /[\w.+-]+@[\w-]+\.[a-z]{2,}/i;
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";

const members = () => [
  { id: "u-coach", name: "Coach", role: "owner", alerts: true, signIn: "code" },
  { id: "u-russ", name: "Russell", role: "member", alerts: false, signIn: "link" },
  { id: "u-dad", name: "Dad", role: "member", alerts: false, signIn: "code" }];
const stateFor = (who, list) => ({ me: who === "member" ? { id: "u-russ", name: "Russell" } : { id: "u-coach", name: "Coach" },
  crew: { id: "c1", name: "ZZTEST crew", role: who === "member" ? "member" : "owner" }, members: list, trips: [], sms: true });
const SESSION = { token: "tok-123", refresh: "ref-123", at: Date.now() + 36e5, userId: "u-coach" };
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const later = (ms) => new Promise((r) => setTimeout(r, ms));

// opts: who ("owner"|"member"), sms, otp (status|"down"|"slow"), fn(body, calls) -> {status, body}|"hang"|"down"|undefined,
// token(n) -> {status, body, delay}, hasPhone, inviteAnswer
async function stub(ctx, opts = {}) {
  const calls = { otp: 0, verify: [], token: 0, logout: 0, user: [], fn: [], other: [], invite: 0 };
  const list = members();
  // First in, last asked: only what nothing below claims lands here.
  await ctx.route(/geigvuysptjvvqanumld\.supabase\.co/, (r) => { calls.other.push(r.request().method() + " " + r.request().url()); return json(r, 404, { error: "not stubbed" }); });
  await ctx.route(/open-meteo|tidesandcurrents|api\.water\.noaa\.gov|castai-rules|castai-waters/, (r) => r.abort());
  await ctx.route(/\/auth\/v1\/otp/, async (r) => {
    calls.otp++;
    if (opts.otp === "down") return r.abort();
    if (opts.otp === "slow") await later(1200);
    if (opts.otp === "unknown") return json(r, 422, { error_code: "otp_disabled", msg: "Signups not allowed for otp" });
    if (opts.otpDelay) await later(opts.otpDelay);
    return json(r, 200, {});
  });
  await ctx.route(/\/auth\/v1\/verify/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    calls.verify.push(b);
    if (b.type === "sms" && b.token !== "123456") return json(r, 403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
    if (b.type === "phone_change" && b.token !== "654321") return json(r, 403, { error_code: "otp_expired", msg: "Token has expired or is invalid" });
    return json(r, 200, { access_token: "tok-123", refresh_token: "ref-123", expires_in: 3600, user: { id: opts.who === "member" ? "u-russ" : "u-coach" } });
  });
  await ctx.route(/\/auth\/v1\/token/, async (r) => {
    const n = ++calls.token;
    const a = opts.token ? opts.token(n) : { status: 400, body: { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token: Refresh Token Not Found" } };
    if (a.delay) await later(a.delay);
    return json(r, a.status, a.body);
  });
  await ctx.route(/\/auth\/v1\/logout/, (r) => { calls.logout++; return r.fulfill({ status: 204, headers: CORS, body: "" }); });
  await ctx.route(/\/auth\/v1\/user/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}");
    calls.user.push(b);
    if (b.phone === "+12535550100") return json(r, 422, { error_code: "phone_exists", msg: "A user with this phone number has already been registered" });
    return json(r, 200, { id: "u-coach" });
  });
  await ctx.route(/functions\/v1\/castai-crew/, async (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    calls.fn.push(body);
    const custom = opts.fn ? await opts.fn(body, calls, r.request()) : undefined;
    if (custom === "hang") return;
    if (custom === "down") return r.abort();
    if (custom) return custom.raw !== undefined ? r.fulfill({ status: custom.status, contentType: "text/html", headers: CORS, body: custom.raw }) : json(r, custom.status, custom.body);
    if (body.action === "hello") return json(r, 200, { ok: true, sms: opts.sms !== false, vapidKey: "BKey" });
    if (body.action === "join") {
      if (body.token !== TOKEN) return json(r, 410, { error: "That link is not good any more. Ask for a new one." });
      return json(r, 200, Object.assign({ ok: true, name: "Russell", crew: "ZZTEST crew", by: "Coach" }, body.peek ? {} : { token_hash: "hash-1" }));
    }
    if (body.action === "state") return json(r, 200, stateFor(opts.who, list));
    if (body.action === "prefs_get") return json(r, 200, { prefs: { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: opts.hasPhone !== false, pushSubs: 0 });
    if (body.action === "invite") {
      calls.invite++;
      const code = opts.inviteAnswer === "code";
      list.push({ id: "u-new", name: body.name, role: "member", alerts: false, signIn: code ? "code" : "link" });
      return json(r, 200, { ok: true, created: true, name: body.name, userId: "u-new", link: code ? null : LINK, signIn: code ? "code" : "link" });
    }
    if (body.action === "link") return json(r, 200, { ok: true, name: "Russell", link: LINK });
    if (body.action === "member_remove") { const i = list.findIndex((m) => m.id === body.userId); if (i >= 0) list.splice(i, 1); return json(r, 200, { ok: true }); }
    return json(r, 200, { ok: true });
  });
  return calls;
}
const phone = { viewport: { width: 390, height: 844 } };
const signIn = (page, over = {}) => page.addInitScript((s) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem("rig.session.v1", JSON.stringify(s)); sessionStorage.setItem("seeded", "1"); } },
  Object.assign({}, SESSION, over));
const save = (page, key, value) => page.addInitScript(([k, v]) => { if (!sessionStorage.getItem("seeded:" + k)) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem("seeded:" + k, "1"); } }, [key, value]);
const text = (p, sel) => p.locator(sel).first().innerText();
const sky = (p) => p.locator("[data-skylabel]").first().innerText();
const wide = (p) => p.evaluate(() => document.documentElement.scrollWidth);
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();

  // --------------------------------------------------------------------
  // Signed out, nothing changes. This is the whole point.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-week]");
    ok(await p.locator("[data-week]").count() === 1, "signed out, the week is still the first thing");
    ok(await p.locator("[data-crew-gate]").count() === 0, "signed out, nothing demands a sign-in");
    ok(await p.locator("[data-crew-open]").count() === 1, "there is one way in to the crew", await p.locator("[data-crew-open]").count());
    const below = await p.evaluate(() => {
      const row = document.querySelector("[data-crew-open]"), week = document.querySelector("[data-week]");
      return !!(week.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok(below, "and it is a single row at the foot of the week");
    await later(300);
    ok(calls.fn.length === 0 && calls.other.length === 0, "signed out, the app asks the crew servers for nothing", calls.fn.concat(calls.other));
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Signed out, with a real week on screen: the four tabs and a run card
  // say nothing about signing in, apart from that one row.
  {
    const pad = (n) => String(n).padStart(2, "0");
    const DAYS = ["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"];
    const wx = () => {
      const time = [], t = [], pr = [], w = [], g = [];
      for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); t.push(45); pr.push(0); w.push(4); g.push(8); }
      return { hourly: { time, temperature_2m: t, precipitation: pr, wind_speed_10m: w, wind_gusts_10m: g },
        daily: { time: DAYS, sunrise: DAYS.map((d) => `${d}T07:31`), sunset: DAYS.map((d) => `${d}T16:24`) } };
    };
    const marine = () => { const time = [], wave = []; for (const d of DAYS) for (let h = 0; h < 24; h++) { time.push(`${d}T${pad(h)}:00`); wave.push(4); } return { hourly: { time, wave_height: wave } }; };
    const tides = { predictions: DAYS.flatMap((d) => [{ t: `${d} 04:30`, v: "11.0", type: "H" }, { t: `${d} 11:00`, v: "2.0", type: "L" }, { t: `${d} 17:15`, v: "12.0", type: "H" }, { t: `${d} 21:00`, v: "-0.5", type: "L" }]) };
    const ctx = await browser.newContext({ ...phone, timezoneId: "America/Los_Angeles" });
    const calls = await stub(ctx);
    await ctx.route(/castai-rules/, (r) => json(r, 200, { checked: new Date().toISOString(), rules: [] }));
    await ctx.route(/api\.water\.noaa\.gov/, (r) => json(r, 200, { observed: { data: [{ validTime: "2026-11-23T19:00:00Z", primary: 0.41 }] }, forecast: { data: DAYS.map((d) => ({ validTime: `${d}T20:00:00Z`, primary: 0.4 })) } }));
    await ctx.route(/api\.open-meteo\.com|marine-api\.open-meteo\.com|api\.tidesandcurrents\.noaa\.gov/, (route) => {
      const u = route.request().url(), n = (new URL(u).searchParams.get("latitude") || "").split(",").length;
      return json(route, 200, /marine-api/.test(u) ? Array.from({ length: n }, marine) : /open-meteo/.test(u) ? Array.from({ length: n }, wx) : tides);
    });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date("2026-11-23T12:00:00-08:00"));
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector('[data-view="trips"] [data-day]');
    const ASK = /\bsign(ed|ing)?[ -]?(in|out|up)\b|\blog ?in\b|\bcrew\b|\bjoin\b|\bcode\b/i;
    const rest = () => p.evaluate(() => {
      const app = document.getElementById("app").cloneNode(true);
      app.querySelectorAll("[data-crew-open]").forEach((n) => n.remove());
      document.body.appendChild(app);
      const t = app.innerText; app.remove();
      return t;
    });
    ok(await p.locator("[data-crew-open]").count() === 1 && !ASK.test(await rest()), "Trips tab: the one row, and nothing else about signing in", (await rest()).match(ASK));
    for (const [tab, view] of [["water", "home"], ["fish", "fish"], ["learn", "learn"]]) {
      await p.locator(`.top [data-tab="${tab}"]`).click();
      await p.waitForFunction((t) => document.querySelector('.top [data-tab="' + t + '"]').getAttribute("aria-selected") === "true", tab);
      const t = await rest();
      ok(await p.locator("[data-crew-open]").count() === 0 && !ASK.test(t), tab + " tab: nothing about signing in (" + view + ")", t.match(ASK));
    }
    await p.locator('.top [data-tab="trips"]').click();
    await p.waitForSelector('[data-day="2026-11-24"] [data-hot="squid-redondo"]');
    await p.locator('[data-day="2026-11-24"] [data-hot="squid-redondo"]').click();
    await p.waitForSelector('[data-view="hot"][data-run="squid-redondo"]');
    const card = await rest();
    ok(await p.locator("[data-crew-open]").count() === 0 && !ASK.test(card), "a run card: nothing about signing in", card.match(ASK));
    ok(calls.fn.length === 0 && calls.other.length === 0, "and none of that asked the crew servers for anything", calls.fn.concat(calls.other));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // The sign-in screen: phone and code first, a pasted link under it.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx, { otpDelay: 300 });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-phone]");
    const order = await p.evaluate(() => {
      const a = document.querySelector("[data-phone]"), b = document.querySelector("[data-join-paste]");
      return !!b && !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    ok(order, "phone number first, the pasted link under it");
    ok(/Have a link from Coach\? Paste it here/.test(await screenText(p)), "the paste box says what it is for", await screenText(p));
    ok(await p.locator("[data-join-send]").count() === 1 && /^Join$/.test((await text(p, "[data-join-send]")).trim()), "with a Join button");
    ok(await p.locator('[data-view="crew"] .cw-go').count() === 1, "one gold button on the screen", await p.locator('[data-view="crew"] .cw-go').count());
    ok(await wide(p) <= 390, "nothing runs off the side at phone width", await wide(p));
    ok((await sky(p)).trim().length > 0, "the Sky button has its label on the sign-in screen", await sky(p));

    // A wrong number says so, and asks nobody.
    await p.locator("[data-phone]").fill("555 0147");
    await p.locator("[data-sendcode]").click();
    await p.waitForFunction(() => /does not look like a US phone number/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""));
    ok(calls.otp === 0, "a wrong number says so and sends nothing", calls.otp);
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label after a wrong number", await sky(p));
    ok(await p.locator("[data-phone]").inputValue() === "555 0147", "and what was typed is still in the box");

    // A double tap asks for one code.
    await p.locator("[data-phone]").fill("(253) 555-0147");
    await p.locator("[data-sendcode]").dblclick();
    await p.waitForSelector("[data-code]");
    ok(calls.otp === 1, "a double tap asks for one code", calls.otp);
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label on the code step", await sky(p));

    // A reload lands back on the code box, with the number remembered.
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("[data-code]");
    ok(true, "a reload lands back on the code box");
    ok((await sky(p)).trim().length > 0, "the Sky button has its label after the reload", await sky(p));

    // Back, same number, inside the wait: the code box again, nothing sent.
    await p.locator("[data-backphone]").click();
    await p.waitForSelector("[data-sendcode]");
    ok(await p.locator("[data-phone]").inputValue() === "(253) 555-0147", "going back keeps the number");
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label after going back", await sky(p));
    await p.locator("[data-sendcode]").click();
    await p.waitForSelector("[data-code]");
    ok(calls.otp === 1, "a second ask inside the wait sends nothing", calls.otp);
    ok(/already texted/i.test(await text(p, "[data-crew-msg]")), "and goes to the code box saying a code was already texted", await text(p, "[data-crew-msg]"));

    // A wrong code says so and stays put.
    await p.locator("[data-code]").fill("000000");
    await p.locator("[data-verify]").click();
    await p.waitForFunction(() => /did not work/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""));
    ok(await p.locator("[data-code]").count() === 1, "a wrong code says so and keeps the code box");
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label after a wrong code", await sky(p));

    // The right one lets them in.
    await p.locator("[data-code]").fill("123456");
    await p.locator("[data-verify]").dblclick();
    await p.waitForSelector("[data-crewname]");
    ok(calls.verify.filter((v) => v.token === "123456").length === 1, "a double tap on Let me in checks the code once", calls.verify);
    ok(calls.verify[calls.verify.length - 1].phone === "+12535550147", "the code is checked against the number that asked", calls.verify);
    ok(/ZZTEST crew/i.test(await text(p, "[data-crewname]")), "the crew name shows", await text(p, "[data-crewname]"));
    const names = await p.locator("[data-member]").allInnerTexts();
    ok(/Coach/.test(names.join(" ")) && /Russell/.test(names.join(" ")) && /Dad/.test(names.join(" ")), "the members show by name", names.join(","));
    const all = await screenText(p);
    ok(!PHONE.test(all) && !EMAIL.test(all), "no phone number or email is on the crew screen", all.match(PHONE) || all.match(EMAIL));
    ok(await p.evaluate(() => localStorage.getItem("rig.crewstep.v1")) === null, "the saved step is cleared once in");
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label once signed in", await sky(p));
    ok(await wide(p) <= 390, "the crew screen fits the phone", await wide(p));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // A number that is not on the crew, no signal, and codes switched off.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx, { otp: "unknown" });
    const p = await ctx.newPage();
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.locator("[data-phone]").fill("2535550199");
    await p.locator("[data-sendcode]").click();
    await p.waitForFunction(() => (document.querySelector("[data-crew-msg]")?.innerText || "").trim().length > 0 && !/sending/i.test(document.querySelector("[data-crew-msg]").innerText));
    ok((await text(p, "[data-crew-msg]")).trim() === "That number is not on the crew yet. Ask Coach to add you.", "a number not on the crew is told so, in those words", await text(p, "[data-crew-msg]"));
    ok(await p.locator("[data-phone]").count() === 1 && await p.locator("[data-code]").count() === 0, "and stays on the phone step");
    await ctx.close();

    const ctx2 = await browser.newContext(phone);
    await stub(ctx2, { otp: "down" });
    const p2 = await ctx2.newPage();
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.locator("[data-phone]").fill("2535550147");
    await p2.locator("[data-sendcode]").click();
    await p2.waitForFunction(() => /could not be sent/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""));
    ok(await p2.locator("[data-phone]").inputValue() === "2535550147", "with no signal it says so and keeps the number");
    await ctx2.close();

    const ctx3 = await browser.newContext(phone);
    const calls3 = await stub(ctx3, { sms: false });
    const p3 = await ctx3.newPage();
    await p3.goto(base + "#/crew", { waitUntil: "load" });
    await p3.waitForSelector("[data-nosms]");
    ok(await p3.locator("[data-phone]").count() === 0 && await p3.locator("[data-sendcode]").count() === 0, "with texting off there is no phone form at all");
    ok(/ask Coach for (a|your) link/i.test(await text(p3, "[data-nosms]")), "and it says to ask Coach for a link", await text(p3, "[data-nosms]"));
    ok(await p3.locator("[data-join-paste]").count() === 1 && await p3.locator('[data-view="crew"] .cw-go').count() === 1, "the pasted link is then the one main thing");
    ok(calls3.fn.length === 1 && calls3.fn[0].action === "hello", "that took one question, and no sign-in", calls3.fn);
    await ctx3.close();
  }

  // --------------------------------------------------------------------
  // A tapped link: peek first, one gold Join, nothing minted until the tap.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx, { who: "member" });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(base + "#/join/" + TOKEN, { waitUntil: "load" });
    await p.waitForSelector("[data-join-go]");
    ok((await text(p, "[data-join-who]")).trim() === "Coach added you to ZZTEST crew, Russell.", "it says who added you, to which crew, and your name", await text(p, "[data-join-who]"));
    ok(await p.locator('[data-view="join"] .cw-go').count() === 1 && /^Join$/i.test((await text(p, "[data-join-go]")).trim()), "one gold Join button");
    await later(300);
    ok(calls.fn.filter((b) => b.action === "join").length === 1 && calls.fn.find((b) => b.action === "join").peek === true, "only a peek was asked", calls.fn);
    ok(calls.verify.length === 0 && await p.evaluate(() => localStorage.getItem("rig.session.v1")) === null, "nothing is minted until the tap");
    ok(!PHONE.test(await screenText(p)) && !EMAIL.test(await screenText(p)), "no phone number or email on the join screen");
    ok((await sky(p)).trim().length > 0, "the Sky button has its label on the join screen", await sky(p));
    ok(await wide(p) <= 390, "the join screen fits the phone", await wide(p));

    await p.locator("[data-join-go]").dblclick();
    await p.waitForSelector('[data-view="trips"]');
    const joins = calls.fn.filter((b) => b.action === "join" && !b.peek);
    ok(joins.length === 1 && joins[0].token === TOKEN, "the tap joins, once", calls.fn);
    ok(calls.verify.length === 1 && calls.verify[0].type === "magiclink" && calls.verify[0].token_hash === "hash-1", "and trades the sign-in at the sign-in server", calls.verify);
    ok(/#\/trips/.test(p.url()) && await p.locator('.top [data-tab="trips"]').getAttribute("aria-selected") === "true", "after joining: the Trips tab", p.url());
    ok(await p.evaluate(() => !!JSON.parse(localStorage.getItem("rig.session.v1") || "null")?.token), "signed in");
    ok(/The crew/.test(await text(p, "[data-crew-open]")), "the row at the foot of the week now says The crew", await text(p, "[data-crew-open]"));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // A dead link says so and how to get a new one. No signal says that instead.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx);
    const p = await ctx.newPage();
    await p.goto(base + "#/join/" + "x".repeat(43), { waitUntil: "load" });
    await p.waitForSelector("[data-join-dead]");
    const t = await text(p, '[data-view="join"]');
    ok(/not good any more/i.test(t), "a dead link says so", t);
    ok(/ask Coach/i.test(t) && /new (one|link)/i.test(t), "and how to get a new one", t);
    ok(await p.locator("[data-join-go]").count() === 0 && calls.verify.length === 0, "with no Join button");
    // Leaving the join screen always leaves it.
    await p.locator('.top [data-tab="water"]').click();
    await p.waitForSelector('[data-view="home"]');
    ok(await p.locator('[data-view="join"]').count() === 0, "tapping away leaves the join screen");
    await ctx.close();

    const ctx2 = await browser.newContext(phone);
    await stub(ctx2, { fn: (b) => b.action === "join" ? "down" : undefined });
    const p2 = await ctx2.newPage();
    await p2.goto(base + "#/join/" + TOKEN, { waitUntil: "load" });
    await p2.waitForSelector("[data-join-retry]");
    ok(/no signal/i.test(await text(p2, '[data-view="join"]')) && await p2.locator("[data-join-dead]").count() === 0, "no signal on a link says no signal, not that the link is dead");
    await ctx2.close();
  }

  // A pasted link: the whole text message goes in the box.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx, { who: "member" });
    const p = await ctx.newPage();
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-join-paste]");
    await p.locator("[data-join-paste]").fill("not a link");
    await p.locator("[data-join-send]").click();
    await p.waitForFunction(() => /does not look like a crew link/i.test(document.querySelector("[data-join-msg]")?.innerText || ""));
    ok(calls.fn.filter((b) => b.action === "join").length === 0, "a paste that is not a link says so and asks nobody");
    await p.locator("[data-join-paste]").fill("Coach added you to the fishing crew on Rig Card. Tap to join: " + LINK);
    await p.locator("[data-join-send]").click();
    await p.waitForSelector('[data-view="trips"]');
    ok(calls.fn.some((b) => b.action === "join" && b.token === TOKEN && !b.peek) && calls.verify.length === 1, "the whole pasted text joins", calls.fn);
    ok(await p.evaluate(() => !!localStorage.getItem("rig.session.v1")), "and signs in, on the Trips tab");
    await ctx.close();

    const ctx2 = await browser.newContext(phone);
    await stub(ctx2);
    const p2 = await ctx2.newPage();
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.waitForSelector("[data-join-paste]");
    await p2.locator("[data-join-paste]").fill("x".repeat(43));
    await p2.locator("[data-join-send]").click();
    await p2.waitForFunction(() => /not good any more/i.test(document.querySelector("[data-join-msg]")?.innerText || ""));
    ok(await p2.locator("[data-join-paste]").inputValue() === "x".repeat(43), "a dead pasted link says so and keeps what was pasted");
    await ctx2.close();
  }

  // --------------------------------------------------------------------
  // The owner: add someone, text them the link, copy it, a new link, remove.
  {
    const ctx = await browser.newContext({ ...phone, userAgent: IPHONE });
    await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
    const calls = await stub(ctx);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    let dialogs = 0; p.on("dialog", (d) => { dialogs++; d.dismiss(); });
    await signIn(p);
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-invite-name]");
    ok(/ZZTEST crew/i.test(await text(p, "[data-crewname]")), "the owner sees the crew name");
    ok(/optional/i.test(await text(p, '[data-view="crew"]')), "the phone number is marked optional");

    // No name: says so, sends nothing.
    await p.locator("[data-invite-send]").click();
    await p.waitForFunction(() => /name/i.test(document.querySelector("[data-invite-msg]")?.innerText || ""));
    ok(calls.invite === 0, "adding with no name says so and sends nothing");

    await p.locator("[data-invite-name]").fill("Grandpa");
    await p.locator("[data-invite-phone]").fill("253 555 0148");
    await p.locator("[data-invite-send]").dblclick();
    await p.waitForSelector("[data-share]");
    ok(calls.invite === 1, "a double tap adds one person", calls.invite);
    const inv = calls.fn.find((b) => b.action === "invite");
    ok(inv.name === "Grandpa" && inv.phone === "253 555 0148", "the name and number go to the function", inv);
    ok(/^Text Grandpa the link$/i.test((await text(p, "[data-share-text]")).trim()), "after adding: Text Grandpa the link", await text(p, "[data-share-text]"));
    const href = await p.locator("[data-share-text]").getAttribute("href");
    const words = "Coach added you to the fishing crew on Rig Card. Tap to join: " + LINK;
    ok(href === "sms:&body=" + encodeURIComponent(words), "it opens Messages on an iPhone with the words and the link written", href);
    ok(/^Copy the link$/.test((await text(p, "[data-share-copy]")).trim()), "and Copy the link");
    await p.locator("[data-share-copy]").click();
    await p.waitForFunction(() => /copied/i.test(document.querySelector("[data-share-copy]")?.innerText || ""));
    ok(await p.evaluate(() => navigator.clipboard.readText()) === LINK, "the link is on the clipboard");
    const shown = await screenText(p);
    ok(!PHONE.test(shown) && !EMAIL.test(shown), "the number just typed is nowhere on the screen", shown.match(PHONE));
    ok(await p.locator('[data-view="crew"] .cw-go').count() === 1, "still one gold button", await p.locator('[data-view="crew"] .cw-go').count());
    ok((await p.locator("[data-member]").allInnerTexts()).join(" ").includes("Grandpa"), "the new person is on the list");
    await p.locator("[data-share-done]").click();
    await p.waitForSelector("[data-invite-name]");
    ok(await p.locator("[data-invite-name]").inputValue() === "" && await p.locator("[data-invite-phone]").inputValue() === "", "the form is empty for the next person");

    // New link only for accounts the invite made.
    ok(await p.locator('[data-newlink="u-russ"]').count() === 1, "a member who signs in by link gets New link");
    ok(await p.locator('[data-newlink="u-dad"]').count() === 0, "a member who signs in with a code does not");
    ok(await p.locator('[data-newlink="u-coach"]').count() === 0 && await p.locator('[data-remove="u-coach"]').count() === 0, "the owner's own row has neither New link nor Remove");
    await p.locator('[data-newlink="u-russ"]').click();
    await p.waitForSelector("[data-share]");
    ok(calls.fn.some((b) => b.action === "link" && b.userId === "u-russ"), "New link asks for one");
    ok(/^Text Russell the link$/i.test((await text(p, "[data-share-text]")).trim()), "and offers to text it to them", await text(p, "[data-share-text]"));
    await p.locator("[data-share-done]").click();

    // Remove asks once, inside the page.
    await p.locator('[data-remove="u-dad"]').click();
    await p.waitForSelector('[data-remove-yes="u-dad"]');
    ok(dialogs === 0 && !calls.fn.some((b) => b.action === "member_remove"), "Remove asks first, inside the page, with no browser box");
    ok(/Remove Dad/.test(await text(p, '[data-member="u-dad"]')), "it names who", await text(p, '[data-member="u-dad"]'));
    await p.locator("[data-remove-no]").click();
    await p.waitForSelector('[data-remove="u-dad"]');
    ok(!calls.fn.some((b) => b.action === "member_remove"), "Keep changes nothing");
    await p.locator('[data-remove="u-dad"]').click();
    await p.locator('[data-remove-yes="u-dad"]').click();
    await p.waitForFunction(() => !document.querySelector('[data-member="u-dad"]'));
    ok(calls.fn.filter((b) => b.action === "member_remove" && b.userId === "u-dad").length === 1 && dialogs === 0, "Yes removes them, once");
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label through all of that", await sky(p));
    ok(await wide(p) <= 390, "the owner's screen fits the phone", await wide(p));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Someone who already has an account with that number signs in with a code.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx, { inviteAnswer: "code" });
    const p = await ctx.newPage();
    await signIn(p);
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-invite-name]");
    await p.locator("[data-invite-name]").fill("Nephew");
    await p.locator("[data-invite-phone]").fill("2535550149");
    await p.locator("[data-invite-send]").click();
    await p.waitForSelector("[data-share]");
    const t = await text(p, "[data-share]");
    ok(/Nephew already has an account with that number\. They sign in with their number and a code\./.test(t), "an account that was already there: says they sign in with a code", t);
    ok(/^Text Nephew the sign-in page$/i.test((await text(p, "[data-share-text]")).trim()), "and offers to text the sign-in page", await text(p, "[data-share-text]"));
    const href = await p.locator("[data-share-text]").getAttribute("href");
    ok(href.startsWith("sms:?body=") && decodeURIComponent(href.slice(10)).includes(SITE + "#/crew") && !/#\/join\//.test(decodeURIComponent(href)), "the text carries the sign-in page, not a join link, and opens Messages the other way off an iPhone", href);
    ok(await p.locator("[data-share-copy]").count() === 0, "there is no link to copy");
    ok(!PHONE.test(await screenText(p)), "and no phone number on the screen");
    ok(calls.invite === 1, "one invite");
    await ctx.close();
  }

  // A member: names, Sign out, and none of the owner's buttons.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx, { who: "member" });
    const p = await ctx.newPage();
    await signIn(p, { userId: "u-russ" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crewname]");
    ok(await p.locator("[data-member]").count() === 3, "a member sees everyone by name");
    ok(await p.locator("[data-invite-name]").count() === 0 && await p.locator("[data-newlink]").count() === 0 && await p.locator("[data-remove]").count() === 0, "a member gets no Add someone, New link or Remove");
    ok(await p.locator("[data-addnum]").count() === 0, "an account with a number is not asked for one");
    await p.locator("[data-signout]").click();
    await p.waitForSelector("[data-phone]");
    ok(await p.evaluate(() => localStorage.getItem("rig.session.v1")) === null && await p.evaluate(() => localStorage.getItem("rig.crew.v1")) === null, "Sign out signs out and forgets the saved crew");
    ok((await sky(p)).trim().length > 0, "the Sky button keeps its label after signing out", await sky(p));
    for (let i = 0; i < 30 && calls.logout === 0; i++) await later(100);
    ok(calls.logout === 1, "and tells the sign-in server", calls.logout);
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    await ctx.close();
  }

  // Signed in, but taken off the crew: said plainly, never an empty crew.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx, { who: "member", fn: (b) => b.action === "state" ? { status: 200, body: { me: { id: "u-russ", name: "You" }, crew: null, members: [], trips: [], sms: true } } : undefined });
    const p = await ctx.newPage();
    await signIn(p, { userId: "u-russ" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-nocrew]");
    ok(/not on a crew yet\. Ask Coach to add you\./.test(await text(p, "[data-nocrew]")), "someone on no crew is told so, and to ask Coach", await text(p, "[data-nocrew]"));
    ok(await p.locator("[data-crewname]").count() === 0 && await p.locator("[data-member]").count() === 0 && await p.locator("[data-signout]").count() === 1, "with no empty crew drawn, and a way to sign out");
    await ctx.close();
  }

  // An account with no number: Add my number, with its code step.
  {
    const ctx = await browser.newContext(phone);
    const calls = await stub(ctx, { who: "member", hasPhone: false });
    const p = await ctx.newPage();
    await signIn(p, { userId: "u-russ" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-addnum-open]");
    ok(/^Add my number$/.test((await text(p, "[data-addnum-open]")).trim()), "an account with no number is offered Add my number");
    await p.locator("[data-addnum-open]").click();
    await p.waitForSelector("[data-addnum-phone]");
    await p.locator("[data-addnum-phone]").fill("12");
    await p.locator("[data-addnum-send]").click();
    await p.waitForFunction(() => /does not look like a US phone number/i.test(document.querySelector("[data-addnum-msg]")?.innerText || ""));
    ok(calls.user.length === 0, "a wrong number says so and sends nothing");
    await p.locator("[data-addnum-phone]").fill("253 555 0100");
    await p.locator("[data-addnum-send]").click();
    await p.waitForFunction(() => /already on another account/i.test(document.querySelector("[data-addnum-msg]")?.innerText || ""));
    ok(true, "a number someone else has says so");
    await p.locator("[data-addnum-phone]").fill("253 555 0147");
    await p.locator("[data-addnum-send]").click();
    await p.waitForSelector("[data-addnum-code]");
    ok(calls.user[calls.user.length - 1].phone === "+12535550147", "the number goes to the sign-in server", calls.user);
    await p.locator("[data-addnum-code]").fill("111111");
    await p.locator("[data-addnum-verify]").click();
    await p.waitForFunction(() => /did not work/i.test(document.querySelector("[data-addnum-msg]")?.innerText || ""));
    await p.locator("[data-addnum-code]").fill("654321");
    await p.locator("[data-addnum-verify]").click();
    await p.waitForSelector("[data-addnum-done]");
    const v = calls.verify[calls.verify.length - 1];
    ok(v.type === "phone_change" && v.phone === "+12535550147" && v.token === "654321", "the code confirms the number", v);
    ok(!PHONE.test(await screenText(p)), "and the number itself is not printed on the screen", (await screenText(p)).match(PHONE));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // A failure never looks like success.
  {
    // Adding someone with no signal: said plainly, what was typed is kept.
    const ctx = await browser.newContext(phone);
    await stub(ctx, { fn: (b) => b.action === "invite" ? "down" : undefined });
    const p = await ctx.newPage();
    await signIn(p);
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-invite-name]");
    await p.locator("[data-invite-name]").fill("Dad");
    await p.locator("[data-invite-phone]").fill("253 555 0148");
    await p.locator("[data-invite-send]").click();
    await p.waitForFunction(() => /nobody was added/i.test(document.querySelector("[data-invite-msg]")?.innerText || ""));
    ok(/no signal/i.test(await text(p, "[data-invite-msg]")), "adding someone with no signal says no signal, nobody was added", await text(p, "[data-invite-msg]"));
    ok(await p.locator("[data-invite-name]").inputValue() === "Dad" && await p.locator("[data-invite-phone]").inputValue() === "253 555 0148", "and keeps what was typed");
    ok(await p.locator("[data-share]").count() === 0, "with no Text them the link");
    await ctx.close();

    // The function falls over: the same.
    const ctx2 = await browser.newContext(phone);
    await stub(ctx2, { fn: (b) => b.action === "invite" ? { status: 502, raw: "<html>bad gateway</html>" } : b.action === "member_remove" ? { status: 500, body: { error: "Something went wrong on our end. Try again." } } : undefined });
    const p2 = await ctx2.newPage();
    await signIn(p2);
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.waitForSelector("[data-invite-name]");
    await p2.locator("[data-invite-name]").fill("Dad");
    await p2.locator("[data-invite-send]").click();
    await p2.waitForFunction(() => /nobody was added/i.test(document.querySelector("[data-invite-msg]")?.innerText || ""));
    ok(await p2.locator("[data-invite-name]").inputValue() === "Dad" && await p2.locator("[data-share]").count() === 0, "a server fault while adding says nobody was added and keeps the name");
    await p2.locator('[data-remove="u-dad"]').click();
    await p2.locator('[data-remove-yes="u-dad"]').click();
    await p2.waitForFunction(() => /went wrong/i.test(document.querySelector('[data-member-msg="u-dad"]')?.innerText || ""));
    ok(await p2.locator('[data-member="u-dad"]').count() === 1, "a remove that fails says so and the person is still on the list");
    await ctx2.close();
  }

  // --------------------------------------------------------------------
  // What signs a person out, and what never does.
  {
    // The function says 401 and the sign-in server says the session is gone: signed out.
    const ctx = await browser.newContext(phone);
    await stub(ctx, { fn: (b) => b.action === "hello" ? undefined : { status: 401, body: { error: "Sign in first." } } });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await signIn(p, { token: "old", refresh: "old" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-phone]");
    ok(true, "a session the sign-in server says is gone lands back at sign in");
    ok(await p.evaluate(() => localStorage.getItem("rig.session.v1")) === null, "and the dead session is thrown away");
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-week]");
    ok(await p.locator("[data-week]").count() === 1, "the week still works after that");
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }
  {
    // A 500 from the crew function: still signed in, the saved crew, plain words.
    const ctx = await browser.newContext(phone);
    await stub(ctx, { fn: (b) => b.action === "state" ? { status: 500, body: { error: "Something went wrong on our end. Try again." } } : undefined });
    const p = await ctx.newPage();
    await signIn(p);
    await save(p, "rig.crew.v1", stateFor("owner", members()));
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-note]");
    ok(/ZZTEST crew/i.test(await text(p, "[data-crewname]")) && await p.locator("[data-member]").count() === 3, "a 500 from the crew function leaves the saved crew showing");
    ok(/could not refresh/i.test(await text(p, "[data-crew-note]")) && /last crew list this phone saw/i.test(await text(p, "[data-crew-note]")), "with a plain message", await text(p, "[data-crew-note]"));
    ok(await p.evaluate(() => !!localStorage.getItem("rig.session.v1")) && await p.locator("[data-phone]").count() === 0, "and the person is still signed in");
    await ctx.close();

    // The same fault with nothing saved: words, never an empty crew called Your crew.
    const ctx2 = await browser.newContext(phone);
    await stub(ctx2, { fn: (b) => b.action === "state" ? { status: 500, body: { error: "Something went wrong on our end. Try again." } } : undefined });
    const p2 = await ctx2.newPage();
    await signIn(p2);
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.waitForFunction(() => /went wrong/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""));
    ok(await p2.locator("[data-crewname]").count() === 0 && await p2.locator("[data-member]").count() === 0, "a fault with nothing saved shows the words, not an empty crew");
    ok(await p2.locator("[data-signout]").count() === 1 && await p2.locator("[data-crew-retry]").count() === 1, "with Try again and Sign out");
    await ctx2.close();
  }
  {
    // A line that never answers: the saved crew at once, and no endless Loading.
    const ctx = await browser.newContext(phone);
    await stub(ctx, { fn: (b) => b.action === "state" || b.action === "prefs_get" ? "hang" : undefined });
    const p = await ctx.newPage();
    await p.addInitScript(() => { window.RIG = window.RIG || {}; window.RIG.fetchTimeout = 5000; });
    await signIn(p);
    await save(p, "rig.crew.v1", stateFor("owner", members()));
    const t0 = Date.now();
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crewname]", { timeout: 3500 }).catch(() => {});
    const took = Date.now() - t0;
    ok(await p.locator("[data-crewname]").count() === 1 && took < 4000, "with a saved crew a dead line still shows the crew at once, well inside the time limit", took);
    await p.waitForSelector("[data-crew-note]", { timeout: 9000 }).catch(() => {});
    ok(/no signal/i.test(await text(p, "[data-crew-note]").catch(() => "")), "and then says it could not be refreshed", await text(p, "[data-crew-note]").catch(() => "none"));
    await ctx.close();

    const ctx2 = await browser.newContext(phone);
    await stub(ctx2, { fn: (b) => b.action === "state" || b.action === "prefs_get" ? "hang" : undefined });
    const p2 = await ctx2.newPage();
    await p2.addInitScript(() => { window.RIG = window.RIG || {}; window.RIG.fetchTimeout = 1500; });
    await signIn(p2);
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.waitForFunction(() => /no signal/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""), null, { timeout: 6000 }).catch(() => {});
    ok(/no signal/i.test(await text(p2, "[data-crew-msg]")) && !/loading/i.test(await text(p2, "[data-crew-msg]")), "with nothing saved the wait ends in words, not in Loading", await text(p2, "[data-crew-msg]"));
    ok(await p2.evaluate(() => !!localStorage.getItem("rig.session.v1")), "and nobody is signed out by a dead line");
    await ctx2.close();
  }
  {
    // Two tabs, a session past its time. One refresh between them where the
    // phone can take turns; where it cannot, the slower tab hears "already
    // used" and must not sign the faster one out.
    for (const locks of [true, false]) {
      const ctx = await browser.newContext(phone);
      const calls = await stub(ctx, { token: (n) => n === 1
        ? { status: 200, delay: 1500, body: { access_token: "tok-new", refresh_token: "ref-new", expires_in: 3600, user: { id: "u-coach" } } }
        : { status: 400, delay: 2100, body: { code: 400, error_code: "refresh_token_already_used", msg: "Invalid Refresh Token: Already Used" } } });
      const a = await ctx.newPage(), b = await ctx.newPage();
      for (const pg of [a, b]) {
        if (!locks) await pg.addInitScript(() => { Object.defineProperty(Navigator.prototype, "locks", { get: () => undefined, configurable: true }); });
        await pg.addInitScript((s) => { if (!localStorage.getItem("rig.session.v1") && !sessionStorage.getItem("seeded")) localStorage.setItem("rig.session.v1", JSON.stringify(s)); sessionStorage.setItem("seeded", "1"); },
          Object.assign({}, SESSION, { at: Date.now() - 5000 }));
      }
      await Promise.all([a.goto(base + "#/crew", { waitUntil: "load" }), b.goto(base + "#/crew", { waitUntil: "load" })]);
      await Promise.all([a.waitForSelector("[data-crewname]", { timeout: 9000 }).catch(() => {}), b.waitForSelector("[data-crewname]", { timeout: 9000 }).catch(() => {})]);
      const what = locks ? "two tabs: " : "two tabs, no locks: ";
      ok(await a.locator("[data-crewname]").count() === 1 && await b.locator("[data-crewname]").count() === 1, what + "both show the crew");
      ok(await a.locator("[data-phone]").count() === 0 && await b.locator("[data-phone]").count() === 0, what + "a second tab's refresh does not sign the first out");
      ok(await a.evaluate(() => JSON.parse(localStorage.getItem("rig.session.v1") || "{}").token) === "tok-new", what + "the good session is still on the phone");
      ok(locks ? calls.token === 1 : calls.token === 2, what + (locks ? "one refresh between them" : "both asked, and the loser shrugged it off"), calls.token);
      await ctx.close();
    }
  }

  // --------------------------------------------------------------------
  // The sign-in screen never follows a person to another page.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx, { otp: "slow" });
    const p = await ctx.newPage();
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.locator("[data-phone]").fill("2535550147");
    await p.locator("[data-sendcode]").click();
    await p.locator('.top [data-tab="water"]').click();
    await p.waitForSelector('[data-view="home"]');
    await later(1700);
    ok(await p.locator('[data-view="home"]').count() === 1 && await p.locator("[data-code]").count() === 0 && await p.locator('[data-view="crew"]').count() === 0,
      "a code that lands after the person left does not take over the page they are on");
    ok((await sky(p)).trim().length > 0, "the Sky button has its label there", await sky(p));
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-code]");
    ok(true, "coming back to the crew, the code box is waiting");
    await ctx.close();
  }

  // Back at the app after dark: the screen checks the sky again.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx);
    const p = await ctx.newPage();
    await p.goto(base + "#/water", { waitUntil: "load" });
    await p.evaluate(() => localStorage.setItem("rig.skymode.v1", "light"));
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    // The held mode is changed behind the page's back, the way the sun does
    // it: only a fresh look at the sky can notice.
    const day = await p.evaluate(() => document.documentElement.style.colorScheme);
    await p.evaluate(() => localStorage.setItem("rig.skymode.v1", "dark"));
    await p.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    const night = await p.evaluate(() => document.documentElement.style.colorScheme);
    ok(day === "light" && night === "dark", "coming back to the front re-checks the sky without waiting ten minutes", day + " -> " + night);
    await ctx.close();
  }

  // The crew's gold button style must not reach the tackle buy links.
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx);
    const p = await ctx.newPage();
    // Coho, Green River, Keeping eggs on: the card the buy links live on.
    await p.goto(base + "#/coho/green-river/salmon-bait", { waitUntil: "load" });
    await p.waitForSelector(".buy a .go");
    const m = await p.evaluate(() => {
      const arrow = document.querySelector(".buy a .go"), name = document.querySelector(".buy a .n"), row = document.querySelector(".buy a");
      const gold = getComputedStyle(document.documentElement).getPropertyValue("--gold").trim();
      const probe = document.createElement("i"); probe.style.background = gold; document.body.appendChild(probe);
      const goldRgb = getComputedStyle(probe).backgroundColor; probe.remove();
      return { arrow: arrow.getBoundingClientRect().width, name: name.getBoundingClientRect().width, row: row.getBoundingClientRect().height,
        isGold: getComputedStyle(arrow).backgroundColor === goldRgb };
    });
    ok(m.arrow < 40 && m.name > 150 && m.row < 120 && !m.isGold, "the buy links on the bait card are rows again, not gold blocks", m);
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // Alerts: what the service worker shows for a push, and where a tap goes.
  // (Headless Chromium will not grant notifications, so the two halves are
  // asked directly in the worker rather than through a real push.)
  {
    const ctx = await browser.newContext(phone);
    await stub(ctx);
    const p = await ctx.newPage();
    await p.goto(base, { waitUntil: "load" });
    await p.evaluate(async () => { await navigator.serviceWorker.ready; for (let i = 0; i < 60 && !navigator.serviceWorker.controller; i++) await new Promise((r) => setTimeout(r, 100)); });
    const sw = ctx.serviceWorkers().find((w) => /\/rigs\/sw\.js$/.test(w.url()));
    const origin = `http://127.0.0.1:${PORT}`;
    const shown = await sw.evaluate((o) => {
      const mk = (j) => ({ json: () => { if (j === null) throw new Error("not json"); return j; }, text: () => "plain words" });
      return { trip: pushParts(mk({ title: "Coach floated a trip", body: "Squid at Redondo, Sat Nov 28", url: o + "/rigs/#/crew/trip/t1" })),
        elsewhere: pushParts(mk({ title: "x", body: "y", url: "https://example.com/phish" })), text: pushParts(mk(null)), empty: pushParts(null) };
    }, origin);
    ok(shown.trip.title === "Coach floated a trip" && shown.trip.opts.body === "Squid at Redondo, Sat Nov 28" && shown.trip.opts.data.url === origin + "/rigs/#/crew/trip/t1",
      "a push shows the title and words the function sent, and remembers the trip link", shown.trip);
    ok(shown.elsewhere.opts.data.url === origin + "/rigs/", "a link that is not Rig Card's own is never kept", shown.elsewhere.opts.data.url);
    ok(shown.text.title === "Rig Card" && shown.text.opts.body === "plain words" && shown.empty.title === "Rig Card" && shown.empty.opts.body.length > 0, "a push that is not JSON, or empty, still shows something sensible", shown);
    const went = await sw.evaluate((o) => openRig(o + "/rigs/#/crew/trip/t1"), origin);
    await p.waitForFunction(() => location.hash === "#/crew/trip/t1", null, { timeout: 3000 }).catch(() => {});
    ok(went === "sent" && await p.evaluate(() => location.hash) === "#/crew/trip/t1", "a tap on an alert sends the open app to that trip", went + " " + await p.evaluate(() => location.hash));
    await ctx.close();
  }

  // --------------------------------------------------------------------
  // The client in a real browser: a catch with a photo, with and without signal.
  {
    const ctx = await browser.newContext(phone);
    const up = { put: [], rows: [], del: [] };
    let down = false;
    const calls = await stub(ctx, { who: "member", fn: (b) => {
      if (down) return "down";
      if (b.action === "trip") return { status: 200, body: { trip: { id: "t1", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid at Redondo", date: "2026-11-28", from: 17, to: 21, status: "planned", note: null, by: { id: "u-coach", name: "Coach" }, going: [], counts: { comments: 0, list: 0, listDone: 0, catches: 0 }, updatedAt: "2026-11-26T18:00:00.000Z" }, comments: [], list: [], catches: [] } };
      if (b.action === "catch_link") return { status: 200, body: { ok: true, catch: { id: b.catchId, species: "Squid", lengthIn: 9, weightLb: 0.5, lure: "Pink jig", notes: "", photoUrl: "https://geigvuysptjvvqanumld.supabase.co/storage/v1/object/public/catch-photos/u-russ/" + b.catchId + ".jpg", by: { id: "u-russ", name: "Russell" }, at: "2026-11-28T03:00:00.000Z", mine: true } } };
      return undefined;
    } });
    await ctx.route(/\/storage\/v1\/object\/catch-photos\//, (r) => {
      if (down) return r.abort();
      const q = r.request();
      if (q.method() === "PUT") { const buf = q.postDataBuffer(); up.put.push({ url: q.url(), type: q.headers()["content-type"], upsert: q.headers()["x-upsert"], auth: q.headers()["authorization"], jpeg: !!buf && buf[0] === 0xff && buf[1] === 0xd8, size: buf ? buf.length : 0 }); return json(r, 200, { Key: "catch-photos/x" }); }
      up.del.push(q.url());
      return json(r, 200, {});
    });
    await ctx.route(/\/rest\/v1\/catch_logs/, (r) => {
      if (down) return r.abort();
      const q = r.request();
      if (q.method() === "POST") { up.rows.push({ body: JSON.parse(q.postData()), prefer: q.headers()["prefer"], auth: q.headers()["authorization"] }); return r.fulfill({ status: 201, headers: CORS, body: "" }); }
      up.del.push(q.url());
      return r.fulfill({ status: 204, headers: CORS, body: "" });
    });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await signIn(p, { userId: "u-russ" });
    await p.goto(base, { waitUntil: "load" });
    const photo = () => new Promise((done) => { const c = document.createElement("canvas"); c.width = 3200; c.height = 2400; const g = c.getContext("2d"); g.fillStyle = "#246"; g.fillRect(0, 0, 3200, 2400); g.fillStyle = "#fc3"; g.fillRect(400, 300, 900, 600); c.toBlob((b) => done(b), "image/png"); });
    const dims = await p.evaluate(async (mk) => {
      const big = await (new Function("return (" + mk + ")()"))();
      const small = await window.RIG.crew.shrinkPhoto(big);
      const bmp = await createImageBitmap(small);
      return { w: bmp.width, h: bmp.height, type: small.type, from: big.size, to: small.size };
    }, photo.toString());
    ok(dims.w === 1600 && dims.h === 1200 && dims.type === "image/jpeg", "a phone photo is shrunk to 1600 px on the long side, as a JPEG", dims);

    await p.evaluate(() => window.RIG.crew.trip("t1", { fresh: true }));
    const made = await p.evaluate(async (mk) => {
      const big = await (new Function("return (" + mk + ")()"))();
      return window.RIG.crew.catch("t1", { species: "Squid", lengthIn: 9, weightLb: 0.5, lure: "Pink jig", spotName: "Redondo pier", photo: big }, { tell: [] });
    }, photo.toString());
    ok(made.ok && !made.queued && /catch-photos\/u-russ\//.test(made.catch.photoUrl || ""), "a catch with a photo is saved", made);
    ok(up.put.length === 1 && up.put[0].jpeg && up.put[0].type === "image/jpeg" && up.put[0].upsert === "true" && up.put[0].auth === "Bearer tok-123" &&
      up.put[0].url.endsWith("/storage/v1/object/catch-photos/u-russ/" + made.catch.id + ".jpg"), "the photo goes to the person's own folder, as a JPEG, with their token", up.put[0]);
    ok(up.put[0].size < 400000, "and it is small enough for one bar", up.put[0].size);
    const row = up.rows[0];
    ok(up.rows.length === 1 && row.prefer === "resolution=merge-duplicates" && row.body.id === made.catch.id && row.body.user_id === "u-russ" && row.body.weight === 0.5 && row.body.length === 9 &&
      row.body.photo_url === "https://geigvuysptjvvqanumld.supabase.co/storage/v1/object/public/catch-photos/u-russ/" + made.catch.id + ".jpg" && row.body.state_code === "WA" && row.body.spot_name === "Redondo pier",
      "the catch_logs row carries the photo's public address", row && row.body);
    const linkCall = calls.fn.find((b) => b.action === "catch_link");
    ok(linkCall && linkCall.catchId === made.catch.id && linkCall.tripId === "t1" && Array.isArray(linkCall.tell) && linkCall.tell.length === 0, "then it is linked to the trip, telling who the sender chose", linkCall);

    // No signal at the pier: the catch and its photo wait in IndexedDB.
    down = true;
    const waiting = await p.evaluate(async (mk) => {
      const big = await (new Function("return (" + mk + ")()"))();
      const r = await window.RIG.crew.catch("t1", { species: "Squid", spotName: "Redondo pier", photo: big });
      const v = await window.RIG.crew.trip("t1");
      const row = v.catches.find((c) => c.id === r.clientId);
      let shows = false;
      if (row && row.photoUrl) { try { const bmp = await createImageBitmap(await (await fetch(row.photoUrl)).blob()); shows = bmp.width === 1600; } catch (e) { shows = false; } }
      return { r, waitingRow: !!(row && row.waiting), shows, pending: (await window.RIG.crew.pending()).count };
    }, photo.toString());
    ok(waiting.r.ok && waiting.r.queued && waiting.waitingRow && waiting.pending === 1, "with no signal a catch waits, and shows on the trip as waiting", waiting);
    ok(waiting.shows, "with its photo visible");
    const inDb = await p.evaluate(() => new Promise((done) => { const q = indexedDB.open("rig-crew"); q.onsuccess = () => { const tx = q.result.transaction("catches", "readonly").objectStore("catches").getAll(); tx.onsuccess = () => done(tx.result.map((x) => ({ id: x.id, photo: !!(x.photo && x.photo.size) }))); }; q.onerror = () => done("error"); }));
    ok(Array.isArray(inDb) && inDb.length === 1 && inDb[0].photo, "it is kept in IndexedDB rig-crew, photo and all", inDb);

    // Close the app and open it again, still no signal: it is still there.
    await p.reload({ waitUntil: "load" });
    const again = await p.evaluate(async () => ({ pending: (await window.RIG.crew.pending()).count, row: (await window.RIG.crew.trip("t1")).catches.filter((c) => c.waiting).length }));
    ok(again.pending === 1 && again.row === 1, "it survives the app being closed and opened", again);
    ok(up.put.length === 1 && up.rows.length === 1, "and nothing more went up while there was no signal");

    // Signal back: it goes up once.
    down = false;
    const flushed = await p.evaluate(() => window.RIG.crew.flush());
    ok(flushed.sent === 1 && flushed.left === 0 && up.put.length === 2 && up.rows.length === 2 && calls.fn.filter((b) => b.action === "catch_link").length === 2, "when the signal returns it goes up", flushed);
    const once = await p.evaluate(() => window.RIG.crew.flush());
    ok(once.sent === 0 && up.put.length === 2 && up.rows.length === 2, "once");
    ok(await p.evaluate(async () => (await window.RIG.crew.pending()).count) === 0, "and nothing is left waiting");
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    ok(errs.length === 0, "no page errors", errs.join(" | "));
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
