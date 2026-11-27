// The look, on the crew: signing in (the number and the code), a join link
// (signed out, and on a phone signed in as someone else), the crew screen
// (the owner alone, the owner with others, a member, the link to text just
// after adding someone), a crew trip's own page, one with its catches, and
// planning a new one.
// Run: node tests/rigs-look-crew.smoke.mjs
//
// What this guards: every one of those screens opens on its own painted
// picture (the water of the crew's next trip, of the trip itself, or of the
// trip being planned) with its title in the sky and its first card crossing
// the waterline; people have faces; the go call is a seal with a picture of
// the water beside it, not a tall empty card; the list has real ticks; a
// catch is a card with a picture; and every word on every one of these
// screens, and the word that greets someone who has just joined, can be read
// under all eight skies. Nothing here reaches a real server: the crew is a
// stub named ZZTEST crew.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, SKIES, fake, unreadable, decodePng, contrast } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8811;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 700)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 600000);
watchdog.unref?.();

const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const TOKEN = "Ab3_dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const SAM = { id: "u-sam", name: "Sam Owner" }, RUSS = { id: "u-russ", name: "Russell" }, DAD = { id: "u-dad", name: "Dad" };
// A one pixel photo is enough: the catch card shows whatever the photo is.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

// alone: the owner is the only one. who: "owner" or "member".
async function crew(ctx, o) {
  const members = o.alone ? [{ ...SAM, role: "owner", alerts: false, signIn: "code" }]
    : [{ ...SAM, role: "owner", alerts: true, signIn: "code" }, { ...RUSS, role: "member", alerts: false, signIn: "link" }, { ...DAD, role: "member", alerts: false, signIn: "code" }];
  const trips = o.alone ? [] : [
    { id: "t-sat", planId: "chum-green-river", spotId: "green-river", species: "chum", title: "Chum on the Green", date: "2026-11-28", from: 7.5, to: 11, status: "planned", note: "Meet at the bridge",
      by: SAM, going: [{ ...SAM, answer: "going" }, { ...RUSS, answer: "going" }, { ...DAD, answer: "maybe" }], counts: { comments: 2, list: 3, listDone: 1, catches: 0 }, updatedAt: "2026-11-23T18:00:01Z" },
    { id: "t-mon", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "Squid at Redondo", date: "2026-11-23", from: 17, to: 20.5, status: "planned", note: null,
      by: SAM, going: [{ ...SAM, answer: "going" }, { ...RUSS, answer: "going" }], counts: { comments: 0, list: 1, listDone: 1, catches: 2 }, updatedAt: "2026-11-23T18:00:01Z" }];
  const me = o.who === "member" ? RUSS : SAM;
  const full = {
    "t-sat": { comments: [{ id: "c1", section: null, body: "Meet at the bridge at 7.", by: SAM, at: "2026-11-22T17:05:00Z", mine: me === SAM },
      { id: "c2", section: null, body: "In. Do we need waders?", by: RUSS, at: "2026-11-22T19:12:00Z", mine: me === RUSS }],
      list: [{ id: "i1", label: "Net", done: true, assignedTo: RUSS }, { id: "i2", label: "Cured eggs", done: false, assignedTo: SAM }, { id: "i3", label: "Cooler", done: false, assignedTo: null }], catches: [] },
    "t-mon": { comments: [], list: [{ id: "j1", label: "Squid jigs", done: true, assignedTo: RUSS }],
      catches: [{ id: "f1", species: "Squid", lengthIn: 9, weightLb: null, lure: "Green jig", notes: "On the drop.", photoUrl: "https://geigvuysptjvvqanumld.supabase.co/storage/v1/object/public/catch-photos/u-russ/f1.jpg", by: RUSS, at: "2026-11-23T17:40:00Z", mine: me === RUSS },
        { id: "f2", species: "Squid", lengthIn: null, weightLb: 0.4, lure: "Pink jig", notes: "", photoUrl: null, by: SAM, at: "2026-11-23T18:10:00Z", mine: me === SAM }] } };
  await ctx.route(/geigvuysptjvvqanumld\.supabase\.co/, (r) => json(r, 404, { error: "not stubbed" }));
  await ctx.route(/catch-photos/, (r) => r.fulfill({ status: 200, contentType: "image/jpeg", headers: CORS, body: JPEG }));
  await ctx.route(/\/auth\/v1\/verify/, (r) => json(r, 200, { access_token: "tok-1", refresh_token: "ref-1", expires_in: 3600, user: { id: "u-russ" } }));
  await ctx.route(/functions\/v1\/castai-crew/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}"), a = b.action;
    if (a === "hello") return json(r, 200, { ok: true, sms: true, vapidKey: "BKey" });
    if (a === "join") return json(r, 200, Object.assign({ ok: true, name: "Russell", crew: "ZZTEST crew", by: "Sam Owner" }, b.peek ? {} : { token_hash: "h" }));
    if (a === "state") return json(r, 200, { me, crew: { id: "c1", name: "ZZTEST crew", role: o.who === "member" ? "member" : "owner" }, members, trips, sms: true });
    if (a === "prefs_get") return json(r, 200, { prefs: { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: true, pushSubs: 0 });
    if (a === "trip") { const t = trips.find((x) => x.id === b.tripId); return t ? json(r, 200, Object.assign({ trip: t }, full[t.id])) : json(r, 404, { error: "gone" }); }
    if (a === "invite") return json(r, 200, { ok: true, created: true, name: b.name, userId: "u-new", link: "https://coachpilot.org/rigs/#/join/" + TOKEN, signIn: "link" });
    return json(r, 200, { ok: true });
  });
}

// Each group shares one phone: who is signed in, and the crew it sees.
const GROUPS = [
  { who: null, screens: [
    { name: "sign in, the number", hash: "#/crew", view: "crew", scene: "sound", first: "[data-signin]" },
    { name: "a join link", hash: "#/join/" + TOKEN, view: "join", scene: "pier", first: "[data-join]", wait: "[data-join-go]" }] },
  { who: null, code: true, screens: [
    { name: "sign in, the code", hash: "#/crew", view: "crew", scene: "sound", first: "[data-signin]", wait: "[data-code]" }] },
  { who: "owner", alone: true, screens: [
    { name: "the crew, the owner alone", hash: "#/crew", view: "crew", scene: "sound", first: "[data-crew-card]", wait: "[data-crew-card] [data-invite-name]" },
    // The link stays in the first card until Done, so once added it is there each time.
    { name: "the link to text, just after adding someone", hash: "#/crew", view: "crew", scene: "sound", first: "[data-crew-card]", wait: "[data-invite-name], [data-share]",
      act: async (p) => { if (await p.locator("[data-share]").count()) return; await p.fill("[data-invite-name]", "Russell"); await p.click("[data-invite-send]"); await p.waitForSelector("[data-crew-card] [data-share]"); } }] },
  { who: "owner", screens: [
    { name: "the crew, the owner with two others", hash: "#/crew", view: "crew", scene: "pier", first: "[data-crew-card]", wait: "[data-crew-add] [data-invite-name]" },
    { name: "a join link on a phone signed in as someone else", hash: "#/join/" + TOKEN, view: "join", scene: "pier", first: "[data-join]", wait: "[data-join-switch]" },
    { name: "planning a crew trip", hash: "#/crew/new", view: "crewnew", scene: "pier", first: "[data-cw-new-form]", wait: "[data-cw-what]",
      act: async (p) => { await p.selectOption("[data-cw-what]", "squid-redondo"); await p.waitForSelector("[data-cw-cond-slot] .seal"); } }] },
  { who: "member", screens: [
    { name: "the crew, a member", hash: "#/crew", view: "crew", scene: "pier", first: "[data-crew-card]", wait: "[data-al-sw]" },
    { name: "a crew trip's own page", hash: "#/crew/trip/t-sat", view: "crewtrip", scene: "river", first: "[data-cw-plan]", wait: "[data-cw-plan] [data-cw-cond]" },
    { name: "a crew trip with its catches", hash: "#/crew/trip/t-mon", view: "crewtrip", scene: "pier", first: "[data-cw-plan]", wait: "[data-cw-catch]" }] }];

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();
  for (const g of GROUPS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(ctx);
    await crew(ctx, g);
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    const errors = []; page.on("pageerror", (e) => errors.push(e.message));
    if (g.who) await page.addInitScript((v) => { if (!sessionStorage.getItem("s")) { localStorage.setItem("rig.session.v1", JSON.stringify(v)); sessionStorage.setItem("s", "1"); } },
      { token: "tok-1", refresh: "ref-1", at: NOW.getTime() + 36e5, userId: g.who === "member" ? "u-russ" : "u-sam" });
    if (g.code) await page.addInitScript(() => localStorage.setItem("rig.crewstep.v1", JSON.stringify({ step: "code", phone: "253 555 0147", at: Date.now() })));
    await page.goto(base + "#/trips", { waitUntil: "load" });
    await page.waitForSelector("[data-day] [data-hot]");
    const sky = async (id, hash) => {
      await page.evaluate(([i, h]) => {
        const p = RIG.sky.palettes[i];
        RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name });
        location.hash = "#/water"; location.hash = h;
      }, [id, hash]);
      await page.waitForFunction((i) => document.documentElement.getAttribute("data-sky") === i, id);
    };
    const open = async (id, s) => {
      await sky(id, s.hash);
      await page.waitForSelector('[data-view="' + s.view + '"] .hero h1');
      await page.waitForSelector(s.wait || s.first);
      if (s.act) await s.act(page);
      await page.waitForTimeout(120);
    };
    for (const s of g.screens) {
      for (const id of ["overcast", "night", "golden"]) {
        await open(id, s);
        const p = await page.evaluate(() => {
          const sc = document.getElementById("scene"), svg = sc && sc.querySelector("svg");
          return { kind: sc && sc.getAttribute("data-scene"), svgs: sc ? sc.querySelectorAll("svg").length : 0, kids: svg ? svg.querySelectorAll("*").length : 0, h: Math.round(sc ? sc.getBoundingClientRect().height : 0) };
        });
        ok(p.kind === s.scene && p.svgs >= 4 && p.kids > 30 && p.h > 200, id + ": " + s.name + " opens on its own painted picture, the " + s.scene, p);
        const c = await page.evaluate((q) => {
          const sc = document.getElementById("scene").getBoundingClientRect(), el = document.querySelector(q), b = el && el.getBoundingClientRect();
          const hero = document.querySelector("[data-view] > .hero");
          let first = hero && hero.nextElementSibling; while (first && !first.offsetHeight) first = first.nextElementSibling;
          return b ? { top: Math.round(b.top), bottom: Math.round(b.bottom), scene: Math.round(sc.bottom), isFirst: first === el, ok: b.top < sc.bottom - 24 && b.bottom > sc.bottom && b.top > sc.top } : null;
        }, s.first);
        ok(c && c.ok && c.isFirst, id + ": its first card is the first thing under the title, and crosses the waterline", c);
        const t = await page.evaluate(() => {
          const h = document.querySelector(".hero h1").getBoundingClientRect(), d = document.querySelector(".dock").getBoundingClientRect(), sc = document.getElementById("scene").getBoundingClientRect();
          return { top: Math.round(h.top), bottom: Math.round(h.bottom), dock: Math.round(d.bottom), horizon: Math.round(sc.width * 176 / 390) };
        });
        ok(t.top >= t.dock - 2 && t.bottom < t.horizon + 4, id + ": its title stands in the sky", t);
        ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, id + ": " + s.name + " fits the phone");
      }
      // Every word, under every sky.
      const bad = [];
      for (const id of SKIES) {
        await open(id, s);
        const u = await unreadable(page);
        if (u.n < 5) bad.push(id + ": only " + u.n + " words measured");
        for (const b of u.bad) bad.push(id + ": " + b);
      }
      ok(bad.length === 0, s.name + ": every word can be read under all eight skies", bad.slice(0, 12));
    }

    // What these screens draw, beyond the picture.
    if (g.who === "owner" && !g.alone) {
      await sky("overcast", "#/crew");
      await page.waitForSelector("[data-crew-add]");
      const faces = await page.evaluate(() => [...document.querySelectorAll("[data-member]")].map((li) => ({ face: !!li.querySelector(".av[data-i]"), letter: getComputedStyle(li.querySelector(".av"), "::before").content })));
      ok(faces.length === 3 && faces.every((f) => f.face && /^"[A-Z]"$/.test(f.letter)), "every person on the crew has a round face with their first letter", faces);
      ok(await page.locator('[data-member="u-sam"] .pill.own').count() === 1 && await page.locator('[data-member="u-sam"] .pill.you').count() === 1 && await page.locator('[data-member="u-russ"] .pill').count() === 0,
        "the owner is marked, and so is you");
    }
    if (g.who === "member") {
      await sky("overcast", "#/crew/trip/t-sat");
      await page.waitForSelector("[data-cw-plan] [data-cw-cond]");
      const plan = await page.evaluate(() => { const c = document.querySelector("[data-cw-plan]"), b = c.getBoundingClientRect(), pic = c.querySelector(".cw-callpic");
        return { h: Math.round(b.height), seal: (c.querySelector(".seal") || {}).textContent, pic: !!pic && pic.querySelectorAll("path,circle,rect").length, leave: /Leave by/.test(c.innerText) }; });
      ok(plan.seal === "Hot" && plan.pic >= 2 && plan.leave, "the plan card leads with the go call's seal, a picture of the river beside it, and when to leave", plan);
      const half = await page.evaluate(() => { const c = document.querySelector("[data-cw-plan]"), b = c.getBoundingClientRect(); let ink = 0;
        for (const e of c.querySelectorAll("*")) { const r = e.getBoundingClientRect(); if (e.children.length === 0 && r.height) ink = Math.max(ink, r.bottom); } return Math.round((ink - b.top) / b.height * 100); });
      ok(half >= 85, "and it is full, not a tall card with a line in it (its last word or mark is " + half + "% of the way down)", half);
      const ticks = await page.evaluate(() => [...document.querySelectorAll("[data-cw-tick]")].map((t) => ({ on: t.getAttribute("aria-checked"), svg: !!t.querySelector("svg path"), bg: getComputedStyle(t.querySelector("i")).backgroundColor })));
      ok(ticks.length === 3 && ticks.every((t) => t.svg) && ticks[0].bg !== ticks[1].bg, "the list has real ticks, and a packed one is painted", ticks);
      ok(await page.locator("[data-cw-who] .av[data-i]").count() === 2 && await page.locator('[data-cw-who="i3"].none').count() === 1, "who has each thing: their face, or + nobody");
      ok(await page.locator("[data-cw-note] .av[data-i]").count() === 2 && await page.locator("[data-cw-note].mine").count() === 1, "notes read as a conversation: a face each, your own set apart");
      await sky("overcast", "#/crew/trip/t-mon");
      await page.waitForSelector('[data-cw-catch="f2"]');
      ok(await page.locator('[data-cw-catch="f1"].panel [data-cw-photo] img').count() === 1 && await page.locator('[data-cw-catch="f2"].panel .cw-thumb.nopic .tile svg').count() === 1,
        "each catch is a card with its photo, or with the water's own picture when it has none");
    }
    ok(errors.length === 0, "no page errors (" + (g.who || "signed out") + ")", errors.join(" | "));
    await ctx.close();
  }

  // The word after joining can be read under every sky.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
    await fake(ctx);
    await crew(ctx, { who: "member" });
    const page = await ctx.newPage();
    await page.clock.setFixedTime(NOW);
    await page.goto(base + "#/trips", { waitUntil: "load" });
    await page.waitForSelector("[data-day] [data-hot]");
    const bad = [];
    for (const id of SKIES) {
      await page.evaluate((i) => { const p = RIG.sky.palettes[i]; RIG.sky.resolve = () => ({ id: i, forced: false, p, skyName: p.name }); location.hash = "#/join/" + "Ab3_dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd"; }, id);
      await page.waitForSelector("[data-join-go]");
      await page.click("[data-join-go]");
      await page.waitForSelector("[data-welcome]");
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => { const b = document.querySelector("[data-welcome] b"), rg = document.createRange(); rg.selectNodeContents(b);
        const cx = document.createElement("canvas").getContext("2d"); cx.fillStyle = getComputedStyle(b).color; cx.fillRect(0, 0, 1, 1);
        return { rects: [...rg.getClientRects()].map((q) => [q.left, q.top, q.width, q.height]), ink: [...cx.getImageData(0, 0, 1, 1).data].slice(0, 3) }; });
      const st = await page.addStyleTag({ content: "[data-welcome] b{color:transparent!important}" });
      const img = decodePng(await page.screenshot());
      await st.evaluate((n) => n.remove());
      for (const [x, y, w, h] of r.rects) {
        let R = 0, G = 0, B = 0, n = 0;
        for (let yy = Math.floor(y); yy < y + h; yy++) for (let xx = Math.floor(x); xx < x + w; xx++) { const i = (yy * img.w + xx) * img.bpp; R += img.px[i]; G += img.px[i + 1]; B += img.px[i + 2]; n++; }
        const got = contrast(r.ink, [R / n, G / n, B / n]);
        if (got < 4.5) bad.push(id + ": " + got.toFixed(2));
      }
      await page.click("[data-welcome]");
      await page.evaluate(() => { localStorage.removeItem("rig.session.v1"); localStorage.removeItem("rig.crew.v1"); });
    }
    ok(bad.length === 0, "the word that greets someone who has just joined can be read under all eight skies", bad);
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
