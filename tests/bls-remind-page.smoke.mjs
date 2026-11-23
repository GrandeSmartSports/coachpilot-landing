// The reminder page (go.blslittleleague.org/bls/remind/) switches itself on the dates, with no deploy on the night:
// before Nov 27 08:00 UTC it is the registration day sign-up; from then "Spring 2027 registration is open" with a big
// Register now button and a smaller "Get future BLS league reminders" box; the sale line moves to Early Bird on Nov 30
// and disappears on Jan 1. ?asof=<ISO time> forces the date. Headless, offline (outside requests blocked), never submits.
// Run: node tests/bls-remind-page.smoke.mjs
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../bls/remind/index.html", import.meta.url));
const PORT = 8796;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); } };
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 60000);
watchdog.unref?.();

const server = createServer((req, res) => { res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); res.end(html); });
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
let browser;
try {
  browser = await chromium.launch({ headless: true }).catch(() => chromium.launch({ headless: true, channel: "chrome" }));
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let gatewayCalls = 0;
  await ctx.route("**/*", (r) => {
    const u = r.request().url();
    if (u.startsWith(`http://127.0.0.1:${PORT}/`)) return r.continue();
    if (u.includes("bls-gateway")) gatewayCalls++;
    return r.abort();
  });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", (e) => errors.push(e.message));
  const load = async (q) => { await page.goto(`http://127.0.0.1:${PORT}/bls/remind/${q}`, { waitUntil: "domcontentloaded" }); return page.evaluate(() => {
    const vis = (sel) => { const e = document.querySelector(sel); return !!e && !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length); };
    const box = (sel) => { const e = document.querySelector(sel); const b = e && e.getBoundingClientRect(); return b ? { w: Math.round(b.width), h: Math.round(b.height) } : null; };
    return {
      cls: document.documentElement.className, title: document.title,
      h1: [...document.querySelectorAll("h1")].filter((e) => e.offsetParent).map((e) => e.textContent.trim()),
      label: document.querySelector('label[for="email"]').innerText.trim(), button: document.querySelector("#f button").innerText.trim(),
      go: vis(".go") ? document.querySelector(".go").getAttribute("href") : null, goBox: box(".go"), btnBox: box("#f button"),
      bf: vis(".sale .bf"), early: vis(".sale .early"), sale: vis(".sale"), windows: vis(".windows"), formShown: vis("#f"),
      msg: document.getElementById("msg").hidden ? "" : document.getElementById("msg").textContent, url: location.pathname + location.search,
      overflow: document.documentElement.scrollWidth > window.innerWidth,
    };
  }); };

  let s = await load("?asof=2026-11-27T07:59:59Z");
  ok(s.cls === "" && s.h1.join() === "Registration day reminder" && s.windows && !s.go && !s.sale, "one second before: registration day page as today", s);
  ok(s.label.toLowerCase() === "your email" && s.button === "Remind me" && s.title.startsWith("Registration day reminder"), "before: Your email + Remind me", s);

  s = await load("?asof=2026-11-27T08:00:00Z");
  ok(/\bis-open\b/.test(s.cls) && s.h1.join() === "Spring 2027 registration is open" && !s.windows, "Nov 27 08:00Z: Spring 2027 registration is open", s);
  ok(s.go === "https://www.blslittleleague.org/Default.aspx?tabid=716844", "Register now button to 716844", s.go);
  ok(s.goBox && s.btnBox && s.goBox.h >= 56 && s.goBox.h > s.btnBox.h && s.goBox.w > s.btnBox.w * 2, "Register now is the big button; the reminder box is smaller", [s.goBox, s.btnBox]);
  ok(s.label === "Get future BLS league reminders" && s.button === "Sign up" && s.formShown, "smaller Get future BLS league reminders box", s);
  ok(s.bf && !s.early, "Black Friday line through Nov 29", s);
  ok(s.title.startsWith("Spring 2027 registration is open"), "tab title follows", s.title);
  ok(!s.overflow, "no sideways scroll at 390 px");

  s = await load("?asof=2026-11-29T23:59:00-08:00");
  ok(s.bf && !s.early, "Sun Nov 29 11:59 PM Pacific: still Black Friday", s);
  s = await load("?asof=2026-11-30T08:00:00Z");
  ok(!s.bf && s.early && s.sale, "Nov 30 08:00Z: Early Bird $25 off per family through Dec 31", s);
  s = await load("?asof=2027-01-01T08:00:00Z");
  ok(!s.sale && !s.bf && !s.early && s.go, "Jan 1 08:00Z: no sale line, Register now stays", s);

  s = await load("?asof=2026-11-27T09:00:00Z&ok=1");
  ok(s.msg === "You're on the list for future BLS league reminders." && !s.formShown && s.go, "open: thank-you says future BLS league reminders", s);
  ok(s.url === "/bls/remind/?asof=2026-11-27T09%3A00%3A00Z", "ok flag cleared from the address, asof kept", s.url);
  s = await load("?asof=2026-11-26T09:00:00Z&ok=1");
  ok(s.msg === "You're on the list. Watch for an email from us the morning of Friday, November 27.", "before: thank-you unchanged", s.msg);
  s = await load("?asof=2026-11-27T09:00:00Z&gone=1");
  ok(s.msg === "Your email has been removed.", "open: removed message has no reminder wording", s.msg);

  s = await load("?asof=not-a-date");
  const want = Date.now() >= Date.parse("2026-11-27T08:00:00Z");
  ok(/\bis-open\b/.test(s.cls) === want, "a bad asof falls back to the real clock", s.cls);

  ok(gatewayCalls === 0, "nothing was posted to the gateway");
  ok(errors.length === 0, "no page errors", errors);
} catch (e) {
  ok(false, "smoke run", String(e && e.stack || e));
} finally {
  await browser?.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
