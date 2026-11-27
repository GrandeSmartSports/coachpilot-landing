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

// o: who ("owner"|"member"|null), named (the crew's name, or open when absent), alone,
// rename: "down" | "raced" (someone else named it first), joinOld (a server that does not say nameOpen)
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
      const said = { ok: true, name: "Russell", crew: crew.name, by: "Sam Owner" };
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
    if (a === "prefs_get") return json(r, 200, { prefs: { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }, hasPhone: true, pushSubs: 0 });
    return json(r, 200, { ok: true });
  });
  return { calls, crew };
}
const renames = (calls) => calls.fn.filter((b) => b.action === "crew_rename");
const screenText = (p) => p.evaluate(() => document.getElementById("app").innerText);
const text = (p, sel) => p.locator(sel).first().innerText();
const title = (p) => text(p, '[data-view] > .hero h1');
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
    ok((await text(p, "[data-join-who]")).trim() === "Sam Owner added you to their fishing crew, Russell.", "the join screen says who added you to their fishing crew, by your name", await text(p, "[data-join-who]"));
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
  // A server from before naming (no nameOpen in its answer) reads as named.
  {
    const { ctx, p } = await phone({ joinOld: true, named: "Two Fish Pros" });
    await openJoin(p);
    ok((await text(p, "[data-join-who]")).trim() === "Sam Owner added you to Two Fish Pros, Russell." && (await title(p)).trim() === "Two Fish Pros", "a crew with a name: the join screen says it, title and sentence", await text(p, "[data-join-who]"));
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
    ok(/Pick one, or make your own\. It goes on the jerseys\./.test(await text(p, "[data-namepick-card]")), "with one line: pick one, or make your own, it goes on the jerseys");
    const picks = await p.locator("[data-namepick]").evaluateAll((els) => els.map((e) => e.textContent));
    ok(JSON.stringify(picks) === JSON.stringify(NAMES), "six names to tap: confident pros with two fish, from the Plateau and Bonney Lake", picks);
    ok(await p.locator("[data-namepick-own]").count() === 1 && await p.locator("[data-namepick-card] .cw-jersey svg path").count() >= 5, "a box for their own, and a jersey to wear it");
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
    // He can still name it from the crew screen.
    await p.evaluate(() => { location.hash = "#/crew"; });
    await p.waitForSelector("[data-namepick-card]");
    ok((await title(p)).trim() === "The crew" && await crossing(p, "[data-namepick-card]") && await p.locator("[data-namepick-later]").count() === 0,
      "after Later, the crew screen opens on Name the crew, across the waterline, titled The crew", await title(p));
    ok(!(await screenText(p)).includes(STAND_IN), "and no stand-in name on the crew screen");
    // A crew trip's own page while the name is open.
    await p.evaluate(() => { location.hash = "#/crew/trip/t-sat"; });
    await p.waitForSelector("[data-cw-plan]");
    ok(!(await screenText(p)).includes(STAND_IN), "nor on a crew trip's page");
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
