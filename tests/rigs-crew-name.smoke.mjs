// Naming the crew, in the real page at phone width, with every network call
// stubbed. Coach (11/27): the crew's title "Daniel's crew" read oddly, and
// "How about we provide examples and let Russ choose on his invite." So the
// person who joins names the crew: a crew starts with its name open, the join
// screen never shows the stand-in name, and right after Join comes one small
// step to pick a name (or make one up, or later). The first name saved
// closes naming; after that only the owner renames it.
// Run: node tests/rigs-crew-name.smoke.mjs
//
// Nothing here reaches Supabase: the crew is a stub named ZZTEST crew, with
// Sam Owner running it and Russell joining.
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";
import { NOW, fake } from "./helpers/rigs-look-kit.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8823;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(typeof extra === "string" ? extra : JSON.stringify(extra)).slice(0, 400)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 300000);
watchdog.unref?.();

const TOKEN = "Ab3_dEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const STAND_IN = "ZZTEST crew"; // the stored name while nobody has named the crew: never on screen
const NAMES = ["Plateau Pro Staff", "Bonney Lake Skunk Works", "Two Fish Pros", "Sponsored by Nobody", "Professional (Allegedly)", "Twelve Trips Two Fish"];
const CORS = { "access-control-allow-origin": "*" };
const json = (r, status, body) => r.fulfill({ status, contentType: "application/json", headers: CORS, body: JSON.stringify(body) });
const later = (ms) => new Promise((r) => setTimeout(r, ms));
const SAM = { id: "u-sam", name: "Sam Owner" }, RUSS = { id: "u-russ", name: "Russell" };
const LINK = "https://coachpilot.org/rigs/#/join/" + TOKEN;

// o: who ("owner"|"member"|null), named (the crew's name, or open when absent), alone,
// rename: "down" | "raced" (someone else named it first), joinOld (a server that does not say nameOpen),
// by (who added Russell, "Sam Owner" when absent), reopen: "down" (no signal for crew_name_open)
async function stub(ctx, o = {}) {
  const calls = { fn: [], other: [] };
  const crew = { name: o.named || STAND_IN, nameOpen: !o.named };
  const members = o.alone ? [{ ...SAM, role: "owner", alerts: false, signIn: "code" }]
    : [{ ...SAM, role: "owner", alerts: false, signIn: "code" }, { ...RUSS, role: "member", alerts: false, signIn: "link" }];
  const trip = { id: "t-sat", planId: "chum-green-river", spotId: "green-river", species: "chum", title: "Chum on the Green", date: "2026-11-28", from: 7.5, to: 11,
    status: "planned", note: null, by: SAM, going: [{ ...SAM, answer: "going" }], counts: { comments: 0, list: 0, listDone: 0, catches: 0 }, updatedAt: "2026-11-23T18:00:01Z" };
  await ctx.route(/geigvuysptjvvqanumld\.supabase\.co/, (r) => { calls.other.push(r.request().method() + " " + r.request().url()); return json(r, 404, { error: "not stubbed" }); });
  await ctx.route(/\/auth\/v1\/verify/, (r) => json(r, 200, { access_token: "tok-1", refresh_token: "ref-1", expires_in: 3600, user: { id: "u-russ" } }));
  await ctx.route(/functions\/v1\/castai-crew/, (r) => {
    const b = JSON.parse(r.request().postData() || "{}"), a = b.action;
    calls.fn.push(b);
    if (a === "hello") return json(r, 200, { ok: true, sms: true, vapidKey: "BKey" });
    if (a === "join") {
      const said = { ok: true, name: "Russell", crew: crew.name, by: o.by || "Sam Owner" };
      if (!o.joinOld) said.nameOpen = crew.nameOpen;
      return json(r, 200, Object.assign(said, b.peek ? {} : { token_hash: "h" }));
    }
    if (a === "state") return json(r, 200, { me: o.who === "owner" ? SAM : RUSS, crew: { id: "c1", name: crew.name, role: o.who === "owner" ? "owner" : "member", nameOpen: crew.nameOpen },
      members, trips: o.alone ? [] : [trip], sms: true });
    if (a === "trip") return json(r, 200, { trip, comments: [], list: [], catches: [] });
    if (a === "crew_rename") {
      if (o.rename === "down") return r.abort();
      if (o.rename === "raced") { crew.name = "Plateau Pro Staff"; crew.nameOpen = false; return json(r, 403, { error: "The crew has its name. Only the owner can change it." }); }
      if (o.who !== "owner" && !crew.nameOpen) return json(r, 403, { error: "The crew has its name. Only the owner can change it." });
      crew.name = String(b.name || "").trim(); crew.nameOpen = false;
      return json(r, 200, { ok: true, name: crew.name });
    }
    if (a === "crew_name_open") {
      if (o.reopen === "down") return r.abort();
      if (o.who !== "owner") return json(r, 403, { error: "Only the owner decides who names the crew." });
      crew.nameOpen = b.open === true;
      return json(r, 200, { ok: true, nameOpen: crew.nameOpen });
    }
    if (a === "invite") return json(r, 200, { ok: true, created: true, name: b.name, userId: "u-new", link: LINK, signIn: "link" });
    if (a === "prefs_get") return json(r, 200, { prefs: { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: true, pushSubs: 0 });
    return json(r, 200, { ok: true });
  });
  return { calls, crew };
}
const renames = (calls) => calls.fn.filter((b) => b.action === "crew_rename");
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);
const text = (p, sel) => p.locator(sel).first().innerText();
const title = (p) => text(p, '[data-view] > .hero h1');
// The lines an element's words fall on, as they are drawn: "Twelve Trips|Two Fish".
const lines = (p, sel) => p.evaluate((q) => {
  const el = document.querySelector(q), out = [];
  if (!el) return "";
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let n, top = null;
  while ((n = walk.nextNode())) {
    const re = /\S+/g; let m;
    while ((m = re.exec(n.data))) {
      const r = document.createRange(); r.setStart(n, m.index); r.setEnd(n, m.index + m[0].length);
      const t = Math.round(r.getClientRects()[0].top);
      if (top === null || Math.abs(t - top) > 3) { out.push([]); top = t; }
      out[out.length - 1].push(m[0]);
    }
  }
  return out.map((l) => l.join(" ")).join("|");
}, sel);
// The jersey's lettering: its size, whether a word had to break, and whether it fits the chest.
const lettering = (p) => p.evaluate(() => {
  const b = document.querySelector("[data-namepick-card] [data-jersey-name]"), j = b.closest(".cw-jersey").getBoundingClientRect();
  return { px: parseFloat(getComputedStyle(b).fontSize), broke: b.classList.contains("brk"), fits: b.scrollWidth <= b.clientWidth + 0.5 && b.scrollHeight <= b.clientHeight + 0.5, jersey: Math.round(j.width) };
});
const golds = (p) => p.locator("#app .gold").evaluateAll((els) => els.filter((e) => e.offsetParent).length);
const crossing = (p, sel) => p.evaluate((q) => {
  const c = document.querySelector(q), s = document.getElementById("scene");
  if (!c || !s) return false;
  const a = c.getBoundingClientRect(), b = s.getBoundingClientRect();
  return a.top < b.bottom - 24 && a.bottom > b.bottom;
}, sel);

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
async function phone(o, size = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: size, timezoneId: "America/Los_Angeles", serviceWorkers: "block" });
  // The crew stub first: the weather and the rules feeds fake() answers are matched before its catch-all.
  const s = await stub(ctx, o);
  await fake(ctx);
  const p = await ctx.newPage();
  await p.clock.setFixedTime(NOW);
  const errs = []; p.on("pageerror", (e) => errs.push(e.message));
  if (o.who) await p.addInitScript((v) => { if (!sessionStorage.getItem("s")) { localStorage.setItem("rig.session.v1", JSON.stringify(v)); sessionStorage.setItem("s", "1"); } },
    { token: "tok-1", refresh: "ref-1", at: NOW.getTime() + 36e5, userId: o.who === "owner" ? "u-sam" : "u-russ" });
  return { ctx, p, errs, ...s };
}
async function openJoin(p) {
  await p.goto(base + "#/join/" + TOKEN, { waitUntil: "load" });
  await p.waitForSelector("[data-join-go]");
}
async function joinToStep(p) {
  await openJoin(p);
  await p.locator("[data-join-go]").click();
  await p.waitForSelector("[data-namepick-card]");
  await later(450); // the page drops a second tap within 400 ms of the first
}

try {
  browser = await chromium.launch();

  // ---- the join screen, while the crew has no name ------------------------------
  {
    const { ctx, p, errs } = await phone({});
    await openJoin(p);
    ok((await text(p, "[data-join-who]")).trim() === "Sam Owner added you to their fishing crew, Russell. You get to name it.",
      "the join screen says who added you to their fishing crew, by your name, and that you get to name it", await text(p, "[data-join-who]"));
    ok((await title(p)).trim() === "Join the crew", "its title in the sky is plain, not a stand-in name", await title(p));
    ok(!(await screenText(p)).includes(STAND_IN), "the stand-in name is nowhere on the screen", await screenText(p));
    // What Safari really shows above its bottom bar on an iPhone 14 and an iPhone SE.
    for (const [w, h, name] of [[390, 664, "an iPhone 14"], [375, 548, "an iPhone SE"]]) {
      await p.setViewportSize({ width: w, height: h });
      await p.evaluate(() => window.scrollTo(0, 0));
      await later(150);
      const box = await p.locator("[data-join-go]").boundingBox(), line = await p.locator("[data-join-msg]").boundingBox();
      ok(box && box.y >= 0 && box.y + box.height <= h && line && line.y + line.height <= h, "on " + name + " in Safari, Join and the line under it are in view without a scroll", { h, box, line });
    }
    ok(errs.length === 0, "no page errors on the join screen", errs.join(" | "));
    await ctx.close();
  }
  // A longer name for whoever added you wraps the sentence further: Join is still in view on an iPhone SE.
  {
    const { ctx, p } = await phone({ by: "Samantha Ownerson" }, { width: 375, height: 548 });
    await openJoin(p);
    await later(150);
    const box = await p.locator("[data-join-go]").boundingBox(), line = await p.locator("[data-join-msg]").boundingBox();
    ok(/^Samantha Ownerson added you to their fishing crew, Russell\. You get to name it\.$/.test((await text(p, "[data-join-who]")).trim()) &&
      box && box.y >= 0 && box.y + box.height <= 548 && line && line.y + line.height <= 548, "with a longer name, on an iPhone SE, Join and its line are still in view", { box, line });
    await ctx.close();
  }
  // A server from before naming (no nameOpen in its answer) reads as named.
  {
    const { ctx, p } = await phone({ joinOld: true, named: "Two Fish Pros" });
    await openJoin(p);
    ok((await text(p, "[data-join-who]")).trim() === "Sam Owner added you to Two Fish Pros, Russell." && (await title(p)).trim() === "Two Fish Pros" && await p.locator("[data-join-names]").count() === 0,
      "a crew with a name: the join screen says it, title and sentence, and nothing about naming it", await text(p, "[data-join-who]"));
    await p.locator("[data-join-go]").click();
    await p.waitForSelector('[data-view="trips"]');
    ok(await p.locator("[data-namepick-card]").count() === 0 && (await text(p, "[data-welcome]")).trim() === "You are in, Russell. Here is the crew's week.", "and joining it goes straight to the week, as before", await text(p, "[data-welcome]"));
    await ctx.close();
  }

  // ---- right after Join: name the crew ---------------------------------------
  {
    const { ctx, p, errs, calls } = await phone({});
    await joinToStep(p);
    ok(/#\/crew\/name$/.test(p.url()) && (await title(p)).trim() === "Name the crew", "after Join, before Hot Trips: Name the crew", p.url());
    ok(await p.locator("[data-namepick-card] .eyebrow").count() === 0, "the title says it once: no second heading on the card");
    ok(/Pick one, or make your own\. It goes on the jerseys\./.test(await text(p, "[data-namepick-card]")), "with one line: pick one, or make your own, it goes on the jerseys");
    const picks = await p.locator("[data-namepick]").evaluateAll((els) => els.map((e) => e.textContent));
    ok(JSON.stringify(picks) === JSON.stringify(NAMES), "six names to tap: confident pros with two fish, from the Plateau and Bonney Lake", picks);
    ok(await p.locator("[data-namepick-own]").count() === 1 && await p.locator("[data-namepick-card] .cw-jersey svg path").count() >= 5, "a box for their own, and a jersey to wear it");
    ok((await lettering(p)).jersey >= 112, "the jersey is big enough to read, not an icon", await lettering(p));
    // The names break between words, never inside the joke.
    const drawn = {};
    for (const n of ["Twelve Trips Two Fish", "Bonney Lake Skunk Works", "Sponsored by Nobody", "Professional (Allegedly)"]) drawn[n] = await lines(p, `[data-namepick="${n}"]`);
    ok(drawn["Twelve Trips Two Fish"] === "Twelve Trips|Two Fish" && drawn["Bonney Lake Skunk Works"] === "Bonney Lake|Skunk Works" && drawn["Sponsored by Nobody"] === "Sponsored|by Nobody",
      "the names read in even halves: Twelve Trips / Two Fish, Bonney Lake / Skunk Works, Sponsored / by Nobody", drawn);
    // Raised paper to tap; the box for their own stays a pressed well.
    const look = await p.evaluate(() => {
      const c = getComputedStyle(document.querySelector('[data-namepick="Two Fish Pros"]')), i = getComputedStyle(document.querySelector("[data-namepick-own]"));
      return { chipBg: c.backgroundImage, chipShadow: c.boxShadow, boxBg: i.backgroundColor + " " + i.backgroundImage };
    });
    ok(/gradient/.test(look.chipBg) && (look.chipShadow.match(/rgb|color\(/g) || []).length >= 3 && look.chipBg !== look.boxBg, "the names are raised paper chips, not the grey of the box", look);
    ok(await p.locator("[data-namepick-save].gold").count() === 1 && await golds(p) === 1 && /^Save$/i.test((await text(p, "[data-namepick-save]")).trim()), "one gold Save, and nothing else gold");
    ok(await p.locator("[data-namepick-later]").count() === 1 && await p.locator("[data-namepick-later].gold").count() === 0 && /^Later$/i.test((await text(p, "[data-namepick-later]")).trim()), "and a plain Later");
    ok(await crossing(p, "[data-namepick-card]"), "the card crosses the waterline of its picture");
    ok(!(await screenText(p)).includes(STAND_IN), "the stand-in name is nowhere on the step");
    ok(await p.evaluate(() => document.documentElement.scrollWidth) <= 390, "it fits the phone");

    // Tapping a name: pressed, in the box, on the jersey.
    await p.locator('[data-namepick="Two Fish Pros"]').click();
    ok(await p.locator('[data-namepick="Two Fish Pros"]').getAttribute("aria-pressed") === "true" && await p.locator("[data-namepick-own]").inputValue() === "Two Fish Pros" &&
      (await text(p, "[data-jersey-name]")).trim().toUpperCase() === "TWO FISH PROS", "a tapped name is picked, goes in the box and onto the jersey");
    ok(await p.locator('[data-namepick][aria-pressed="true"]').count() === 1, "one picked at a time");
    await later(450);
    await p.locator('[data-namepick="Sponsored by Nobody"]').click();
    ok(await p.locator('[data-namepick="Sponsored by Nobody"]').getAttribute("aria-pressed") === "true" && await p.locator('[data-namepick="Two Fish Pros"]').getAttribute("aria-pressed") === "false" &&
      await p.locator("[data-namepick-own]").inputValue() === "Sponsored by Nobody", "tapping another moves the pick");
    await later(450);
    await p.locator('[data-namepick="Sponsored by Nobody"]').click();
    ok(await p.locator('[data-namepick][aria-pressed="true"]').count() === 0 && await p.locator("[data-namepick-own]").inputValue() === "", "tapping it again lets it go");
    // Their own name.
    await p.locator("[data-namepick-own]").fill("Lake Tapps Lunkers");
    ok((await text(p, "[data-jersey-name]")).trim().toUpperCase() === "LAKE TAPPS LUNKERS" && await p.locator('[data-namepick][aria-pressed="true"]').count() === 0, "a name of their own goes on the jersey as it is typed");
    await p.locator("[data-namepick-own]").fill("");
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await later(200);
    ok(/pick one, or write your own/i.test(await text(p, "[data-namepick-msg]")) && renames(calls).length === 0, "Save with nothing picked says so, and sends nothing");
    await p.locator("[data-namepick-own]").fill("  Lake   Tapps Lunkers ");
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForSelector('[data-view="trips"]');
    await p.waitForSelector("[data-welcome]");
    ok(renames(calls).length === 1 && renames(calls)[0].name === "Lake Tapps Lunkers", "Save sends their own name once, spaces tidied", renames(calls));
    ok(/#\/trips$/.test(p.url()) && (await text(p, "[data-welcome]")).trim() === "You are in, Russell. Welcome to Lake Tapps Lunkers.", "and lands on Hot Trips: You are in, the name, welcome to the crew", await text(p, "[data-welcome]"));
    ok(await p.locator("[data-welcome] .av[data-i]").count() === 1, "led by their face");
    // Back to the step does not ask again: the crew has its name.
    await p.evaluate(() => { location.hash = "#/crew/name"; });
    await p.waitForFunction(() => /#\/trips$/.test(location.hash));
    ok(await p.locator("[data-namepick-card]").count() === 0, "once named, the step is gone: it goes on to the week");
    await p.evaluate(() => { location.hash = "#/crew"; });
    await p.waitForSelector("[data-crew-card]");
    ok((await title(p)).trim() === "Lake Tapps Lunkers" && await p.locator("[data-namepick-card]").count() === 0 && await p.locator("[data-namepick-save]").count() === 0,
      "the crew screen has the name, and the member who named it sees no Save any more", await title(p));
    ok(await p.locator("[data-crew-edit]").count() === 0, "nor a Rename: after the first pick only the owner renames");
    ok(errs.length === 0, "no page errors on the naming step", errs.join(" | "));
    ok(calls.other.length === 0, "nothing unexpected was asked of Supabase", calls.other);
    await ctx.close();
  }
  // Every name, lettered on the jersey: as big as the chest holds, no word broken.
  {
    const { ctx, p } = await phone({});
    await joinToStep(p);
    const got = {};
    for (const n of NAMES) {
      await p.locator(`[data-namepick="${n}"]`).click();
      await later(450);
      got[n] = await lettering(p);
    }
    ok(Object.values(got).every((g) => g.px >= 9 && !g.broke && g.fits), "every name is lettered at 9 px or more, whole words, inside the chest", got);
    ok(got["Two Fish Pros"].px >= 16 && got["Plateau Pro Staff"].px >= 12, "and a short name is lettered big", got);
    const twelve = await lines(p, "[data-namepick-card] [data-jersey-name]");
    ok(twelve.split("|").every((l) => l.split(" ").length <= 2) && twelve !== "Twelve|Trips Two|Fish", "the last name tapped reads in even lines on the jersey, never Twelve / Trips Two / Fish", twelve);
    // A word longer than any chest: it breaks, rather than run off the jersey.
    await p.locator("[data-namepick-own]").fill("Supercalifragilisticexpialidociousfishermen");
    const huge = await lettering(p);
    ok(huge.broke && huge.px === 9 && huge.fits, "a word too long for any size breaks at the smallest size, inside the chest", huge);
    await ctx.close();
  }
  // On an iPhone SE in Safari the first screen ends at the names: tapping one brings Save into view.
  {
    const { ctx, p } = await phone({}, { width: 375, height: 548 });
    await joinToStep(p);
    await p.locator('[data-namepick="Bonney Lake Skunk Works"]').click();
    await later(200);
    const at = await p.evaluate(() => {
      const r = (q) => { const b = document.querySelector(q).getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
      return { save: r("[data-namepick-save]"), jersey: r("[data-namepick-card] .cw-jersey"), dock: r(".dock"), picked: r('[data-namepick="Bonney Lake Skunk Works"]'), h: innerHeight };
    });
    ok(at.save.top >= at.dock.bottom && at.save.bottom <= at.h, "after a name is tapped, Save is in view without a scroll", at);
    ok(at.picked.top >= at.dock.bottom && at.picked.bottom <= at.h && at.jersey.bottom > at.dock.bottom + 40, "with the picked name and the jersey wearing it still on the screen", at);
    await later(450);
    // Their own name, being typed: nothing jumps.
    const y = await p.evaluate(() => scrollY);
    await p.locator("[data-namepick-own]").pressSequentially("Lake", { delay: 20 });
    ok(await p.evaluate(() => scrollY) === y, "typing their own name does not move the screen", y);
    await ctx.close();
  }
  // A tapped example, saved.
  {
    const { ctx, p, calls } = await phone({});
    await joinToStep(p);
    await p.locator('[data-namepick="Bonney Lake Skunk Works"]').click();
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForSelector("[data-welcome]");
    ok(renames(calls).length === 1 && renames(calls)[0].name === "Bonney Lake Skunk Works" && (await text(p, "[data-welcome]")).trim() === "You are in, Russell. Welcome to Bonney Lake Skunk Works.",
      "a tapped example, saved: crew_rename with it, and the welcome says it", renames(calls));
    await ctx.close();
  }
  // Later.
  {
    const { ctx, p, calls } = await phone({});
    await joinToStep(p);
    await p.locator("[data-namepick-later]").click();
    await p.waitForSelector('[data-view="trips"]');
    await p.waitForSelector("[data-welcome]");
    ok(renames(calls).length === 0 && (await text(p, "[data-welcome]")).trim() === "You are in, Russell. Here is the crew's week.", "Later lands on Hot Trips as joining did before, and names nothing", await text(p, "[data-welcome]"));
    ok(!(await screenText(p)).includes(STAND_IN), "Hot Trips shows no stand-in name");
    // After Later the crew screen does not lead with the whole picker: one line, and the crew's week.
    await p.evaluate(() => { location.hash = "#/crew"; });
    await p.waitForSelector("[data-crew-name-later]");
    ok((await title(p)).trim() === "The crew" && await p.locator("[data-namepick-card]").count() === 0 && await crossing(p, "[data-crew-card]"),
      "after Later, the crew screen opens on the crew's own card, titled The crew, with no picker", await title(p));
    ok((await text(p, "[data-crew-name-later]")).trim() === "No name yet. Name it" && await p.locator("[data-crew-name-later] [data-namepick-open]").count() === 1,
      "and one line: No name yet. Name it", await text(p, "[data-crew-name-later]"));
    ok(await p.locator("[data-crew-card] [data-crew-next=\"trip\"]").count() === 1 && await p.locator("[data-namepick-save]").count() === 0, "the crew's next trip is in the first card, and there is no Save to tap");
    ok(!(await screenText(p)).includes(STAND_IN), "and no stand-in name on the crew screen");
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("[data-crew-name-later]");
    ok(await p.locator("[data-namepick-card]").count() === 0, "Later is remembered on this phone: after a reload it is still one line");
    // A crew trip's own page while the name is open.
    await p.evaluate(() => { location.hash = "#/crew/trip/t-sat"; });
    await p.waitForSelector("[data-cw-plan]");
    ok(!(await screenText(p)).includes(STAND_IN), "nor on a crew trip's page");
    await p.evaluate(() => { location.hash = "#/crew"; });
    await p.waitForSelector("[data-crew-name-later]");
    // He can still name it from there.
    await p.locator("[data-namepick-open]").click();
    await p.waitForSelector("[data-namepick-card]");
    ok(await crossing(p, "[data-namepick-card]") && await p.locator("[data-namepick-later]").count() === 0 && await p.evaluate(() => scrollY) === 0,
      "Name it opens Name the crew at the top, across the waterline", await p.evaluate(() => scrollY));
    await p.locator('[data-namepick="Plateau Pro Staff"]').click();
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForFunction(() => /Plateau Pro Staff/.test(document.querySelector("[data-view] > .hero h1")?.innerText || ""));
    ok(renames(calls).length === 1 && renames(calls)[0].name === "Plateau Pro Staff" && await p.locator("[data-crew-name-later]").count() === 0, "and Save names the crew", renames(calls));
    await ctx.close();
  }
  // The Hot Trips chip on the step is the same as Later: the welcome, and remembered.
  {
    const { ctx, p, calls } = await phone({});
    await joinToStep(p);
    await p.locator('[data-view="crewname"] [data-up]').click();
    await p.waitForSelector('[data-view="trips"]');
    await p.waitForSelector("[data-welcome]");
    ok(renames(calls).length === 0 && (await text(p, "[data-welcome]")).trim() === "You are in, Russell. Here is the crew's week.", "the Hot Trips chip leaves the step as Later does: the welcome, and nothing named", await text(p, "[data-welcome]"));
    await p.evaluate(() => { location.hash = "#/crew"; });
    await p.waitForSelector("[data-crew-name-later]");
    ok(await p.locator("[data-namepick-card]").count() === 0, "and the crew screen gives the one line, as after Later");
    await ctx.close();
  }
  // The dock off the step: remembered as Later, and no welcome off the week.
  {
    const { ctx, p } = await phone({});
    await joinToStep(p);
    await p.locator('.dock [data-tab="water"]').click();
    await p.waitForFunction(() => /^#\/water$/.test(location.hash) && !!document.querySelector('[data-view="home"]'));
    await later(300);
    ok(await p.locator("[data-welcome]").count() === 0, "the dock to Water leaves the step with no welcome over the water");
    await p.evaluate(() => { location.hash = "#/crew"; });
    await p.waitForSelector("[data-crew-name-later]");
    ok(true, "and the crew screen gives the one line");
    await ctx.close();
  }
  // Someone else named it first while this one was choosing.
  {
    const { ctx, p } = await phone({ rename: "raced" });
    await joinToStep(p);
    await p.locator('[data-namepick="Two Fish Pros"]').click();
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForSelector("[data-welcome]");
    ok(/#\/trips$/.test(p.url()) && (await text(p, "[data-welcome]")).trim() === "You are in, Russell. Welcome to Plateau Pro Staff.",
      "named by someone else first: on to the week, welcomed to the name that stands", await text(p, "[data-welcome]"));
    await ctx.close();
  }

  // ---- the crew screen while the name is open ----------------------------------
  // A member: Name the crew first, then the crew's own card.
  {
    const { ctx, p, calls, errs } = await phone({ who: "member" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-namepick-card]");
    ok((await title(p)).trim() === "The crew" && !(await screenText(p)).includes(STAND_IN), "a member on the crew screen: titled The crew, no stand-in name", await title(p));
    const order = await p.evaluate(() => { const h = document.querySelector("[data-view] > .hero"); let n = h.nextElementSibling; while (n && !n.offsetHeight) n = n.nextElementSibling; return [n && n.hasAttribute("data-namepick-card"), !!document.querySelector("[data-namepick-card] ~ [data-crew-card]")]; });
    ok(order[0] && order[1], "Name the crew is the first card, across the waterline, and the crew's own card comes under it", order);
    ok(await crossing(p, "[data-namepick-card]"), "the naming card crosses the waterline");
    ok(await golds(p) === 1 && await p.locator("[data-crew-next=\"plan\"]").count() === 0, "Save is the one gold thing on the screen");
    await p.locator('[data-namepick="Twelve Trips Two Fish"]').click();
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForFunction(() => /Twelve Trips Two Fish/.test(document.querySelector("[data-view] > .hero h1")?.innerText || "") && /saved/i.test(document.querySelector("[data-crew-name-msg]")?.innerText || ""));
    ok(renames(calls).length === 1 && renames(calls)[0].name === "Twelve Trips Two Fish", "Save there names the crew", renames(calls));
    ok(await p.locator("[data-namepick-card]").count() === 0 && await p.locator("[data-namepick-save]").count() === 0 && /saved/i.test(await text(p, "[data-crew-name-msg]")),
      "the title has the name, Name the crew is gone with its Save, and it says saved", await text(p, "[data-crew-card]"));
    await p.reload({ waitUntil: "load" });
    await p.waitForSelector("[data-crew-card]");
    await later(300);
    ok((await title(p)).trim() === "Twelve Trips Two Fish" && await p.locator("[data-namepick-save]").count() === 0, "and after a reload: the name, and no Save for the member");
    ok(errs.length === 0, "no page errors on the member's crew screen", errs.join(" | "));
    await ctx.close();
  }
  // A member with no signal: the name waits, and shows at once.
  {
    const { ctx, p } = await phone({ who: "member", rename: "down" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-namepick-card]");
    await p.locator('[data-namepick="Plateau Pro Staff"]').click();
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForFunction(() => /no signal/i.test(document.querySelector("[data-crew-name-msg]")?.innerText || ""));
    ok((await title(p)).trim() === "Plateau Pro Staff" && await p.locator("[data-namepick-card]").count() === 0 && /waiting to send/i.test(await text(p, "[data-name-wait]")),
      "with no signal the name shows at once, marked waiting to send", await title(p));
    await ctx.close();
  }
  // On the crew screen, someone else named it first: the name that stands, and why.
  {
    const { ctx, p, calls } = await phone({ who: "member", rename: "raced" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-namepick-card]");
    await p.locator('[data-namepick="Two Fish Pros"]').dblclick();
    ok(await p.locator('[data-namepick="Two Fish Pros"]').getAttribute("aria-pressed") === "true", "a double tap on a name picks it once, and does not let it go again");
    await later(450);
    await p.locator("[data-namepick-save]").click();
    await p.waitForFunction(() => /Plateau Pro Staff/.test(document.querySelector("[data-view] > .hero h1")?.innerText || ""));
    ok(renames(calls).length === 1 && await p.locator("[data-namepick-card]").count() === 0 && /has its name/i.test(await text(p, "[data-crew-name-msg]")),
      "named by someone else first: the title has the name that stands, and a line says why", await text(p, "[data-crew-card]"));
    await ctx.close();
  }
  // A crew that has its name: nothing to pick.
  {
    const { ctx, p } = await phone({ who: "member", named: "Two Fish Pros" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-card]");
    await later(300);
    ok((await title(p)).trim() === "Two Fish Pros" && await p.locator("[data-namepick-card]").count() === 0 && await p.locator("[data-namepick-save]").count() === 0,
      "a named crew: its name in the sky, and nothing for a member to pick", await title(p));
    await p.evaluate(() => { location.hash = "#/crew/name"; });
    await p.waitForFunction(() => /#\/trips$/.test(location.hash));
    ok(true, "the naming step for a named crew goes straight on to the week");
    await ctx.close();
  }

  // The owner, alone, while the name is open: one line on who names it.
  {
    const { ctx, p } = await phone({ who: "owner", alone: true });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-name-open]");
    ok((await title(p)).trim() === "The crew" && (await text(p, "[data-crew-name-open]")).trim() === "The next person to join names the crew.", "the owner alone: The crew, and that the next person to join names it", await text(p, "[data-crew-name-open]"));
    ok(await p.locator("[data-namepick-card]").count() === 0 && await p.locator("[data-crew-edit]").count() === 1, "the owner is not asked to pick, and keeps his Rename");
    ok(!(await screenText(p)).includes(STAND_IN), "no stand-in name on the owner's screen");
    await ctx.close();
  }
  // The owner with the crew, while the name is open; then his Rename closes it.
  {
    const { ctx, p, calls } = await phone({ who: "owner" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-name-open]");
    ok((await text(p, "[data-crew-name-open]")).trim() === "No name yet. Anyone on the crew can pick it.", "with someone on it: anyone on the crew can pick it", await text(p, "[data-crew-name-open]"));
    // On an iPhone SE the title row (back, 2 people, You run it, Rename) stays one row.
    await p.setViewportSize({ width: 375, height: 548 });
    await later(150);
    const rowTops = await p.evaluate(() => [...document.querySelectorAll("[data-view] > .hero .chips > *")].map((c) => Math.round(c.getBoundingClientRect().top + c.offsetHeight / 2)));
    ok(rowTops.length === 4 && Math.max(...rowTops) - Math.min(...rowTops) <= 4, "at 375 the owner's title chips are one row, Rename included", rowTops);
    await p.setViewportSize({ width: 390, height: 844 });
    await later(150);
    await p.locator("[data-crew-edit]").click();
    await p.waitForSelector("[data-crew-name]");
    ok(await p.locator("[data-crew-name]").inputValue() === "", "his Rename box opens empty, never with the stand-in name");
    await p.locator("[data-crew-name]").fill("Sponsored by Nobody");
    await later(450);
    await p.locator("[data-crew-save]").click();
    await p.waitForFunction(() => /Sponsored by Nobody/.test(document.querySelector("[data-crewname]")?.innerText || "") && /saved/i.test(document.querySelector("[data-crew-name-msg]")?.innerText || ""));
    ok(renames(calls).length === 1 && renames(calls)[0].name === "Sponsored by Nobody" && await p.locator("[data-crew-name-open]").count() === 0, "the owner names it himself: crew_rename, and the line is gone", renames(calls));
    await ctx.close();
  }
  // The owner of a named crew: no line, and Rename opens with the name.
  {
    const { ctx, p } = await phone({ who: "owner", named: "Two Fish Pros" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-edit]");
    await later(300);
    ok((await title(p)).trim() === "Two Fish Pros" && await p.locator("[data-crew-name-open]").count() === 0, "a named crew: the owner sees its name and no line about naming");
    await p.locator("[data-crew-edit]").click();
    await p.waitForSelector("[data-crew-name]");
    ok(await p.locator("[data-crew-name]").inputValue() === "Two Fish Pros", "and his Rename opens with it");
    await ctx.close();
  }
  // A test join used the name up: the owner hands it back from his Rename, in one tap.
  {
    const { ctx, p, calls } = await phone({ who: "owner", named: "Two Fish Pros" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-edit]");
    await later(300);
    await p.locator("[data-crew-edit]").click();
    await p.waitForSelector("[data-crew-name-reopen]");
    ok(/^Let the next person name it$/.test((await text(p, "[data-crew-name-reopen]")).trim()) && await p.locator("[data-crew-name-reopen].gold").count() === 0,
      "the owner's Rename offers, plainly: Let the next person name it");
    await p.locator("[data-crew-name-reopen]").dblclick();
    await p.waitForFunction(() => /^The crew$/.test((document.querySelector("[data-view] > .hero h1")?.innerText || "").trim()) && /done/i.test(document.querySelector("[data-crew-name-msg]")?.innerText || ""));
    const opens = calls.fn.filter((b) => b.action === "crew_name_open");
    ok(opens.length === 1 && opens[0].open === true, "a double tap sends crew_name_open once, with open true", opens);
    ok((await text(p, "[data-crew-name-msg]")).trim() === "Done. Whoever picks a name next names the crew." && await p.locator("[data-crew-name]").count() === 0,
      "the box closes and it says what happens now", await text(p, "[data-crew-name-msg]"));
    ok((await text(p, "[data-crew-name-open]")).trim() === "No name yet. Anyone on the crew can pick it." && !(await screenText(p)).includes("Two Fish Pros"),
      "the title is The crew, the line says anyone can pick it, and the name that was is shown nowhere", await screenText(p));
    await p.locator("[data-crew-edit]").click();
    await p.waitForSelector("[data-crew-name]");
    ok(await p.locator("[data-crew-name]").inputValue() === "" && await p.locator("[data-crew-name-reopen]").count() === 0, "while it is open, Rename opens empty and does not offer it again");
    await ctx.close();
  }
  // With no signal it is not sent, and says so.
  {
    const { ctx, p } = await phone({ who: "owner", named: "Two Fish Pros", reopen: "down" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-crew-edit]");
    await later(300);
    await p.locator("[data-crew-edit]").click();
    await p.locator("[data-crew-name-reopen]").click();
    await p.waitForFunction(() => /no signal/i.test(document.querySelector("[data-crew-name-msg]")?.innerText || ""));
    ok((await title(p)).trim() === "Two Fish Pros" && await p.locator("[data-crew-name-reopen]").count() === 1 && (await text(p, "[data-crew-name-msg]")).trim() === "No signal. That was not sent.",
      "with no signal: not sent, the name stays, and the button is there to try again", await text(p, "[data-crew-name-msg]"));
    await ctx.close();
  }
  // The text the owner sends while the name is open says the one joining gets to name it.
  for (const named of [null, "Two Fish Pros"]) {
    const { ctx, p } = await phone({ who: "owner", alone: true, named: named || undefined });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-invite-name]");
    await p.locator("[data-invite-name]").fill("Russell");
    await p.locator("[data-invite-send]").click();
    await p.waitForSelector("[data-share-text]");
    const words = decodeURIComponent(String(await p.locator("[data-share-text]").getAttribute("href")).replace(/^sms:[?&]body=/, ""));
    ok(words === "Sam added you to the fishing crew on Rig Card." + (named ? "" : " You get to name it.") + " Tap to join: " + LINK,
      named ? "with a named crew, the text is as it was" : "while the name is open, the text says: You get to name it", words);
    await ctx.close();
  }
  // The same person opening their link again while the name is open.
  {
    const { ctx, p } = await phone({ who: "member" });
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-namepick-card]");
    await p.evaluate((t) => { location.hash = "#/join/" + t; }, TOKEN);
    await p.waitForSelector("[data-join-same]");
    ok((await text(p, "[data-join-same]")).trim() === "You are already on the crew, Russell.", "already in: on the crew, with no stand-in name", await text(p, "[data-join-same]"));
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
