// Signing in, and the crew, in the real page with the auth and crew calls
// stubbed. Run: node tests/rigs-crew.smoke.mjs
import { chromium } from "@playwright/test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "./helpers/rigs-server.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8801;
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 240)); }
};
const watchdog = setTimeout(() => { console.log("FAIL watchdog\n\n0 passed, 1 failed"); process.exit(1); }, 90000);
watchdog.unref?.();

const OWNER = { me: { id: "u-coach", name: "Coach" }, crew: { id: "c1", name: "Coach's crew", role: "owner" },
  members: [{ id: "u-coach", name: "Coach", role: "owner" }, { id: "u-russ", name: "Russell", role: "member" }] };
const MEMBER = { me: { id: "u-russ", name: "Russell" }, crew: { id: "c1", name: "Coach's crew", role: "member" },
  members: OWNER.members };

async function stub(ctx, opts = {}) {
  const calls = { otp: 0, verify: 0, invite: 0 };
  await ctx.route(/open-meteo|tidesandcurrents|api\.water\.noaa\.gov|castai-rules|castai-waters/, (r) => r.abort());
  await ctx.route(/\/auth\/v1\/otp/, (r) => {
    calls.otp++;
    if (opts.authDown) return r.abort();
    if (opts.unknownPhone) return r.fulfill({ status: 422, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ error_code: "otp_disabled", msg: "Signups not allowed for otp" }) });
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "{}" });
  });
  await ctx.route(/\/auth\/v1\/verify/, (r) => {
    calls.verify++;
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ access_token: "tok-123", refresh_token: "ref-123", expires_in: 3600, user: { id: "u-coach" } }) });
  });
  await ctx.route(/functions\/v1\/castai-crew/, async (r) => {
    const body = JSON.parse(r.request().postData() || "{}");
    if (opts.expired) return r.fulfill({ status: 401, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: "sign in first" }) });
    if (body.action === "invite") { calls.invite++; return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ ok: true, created: true, name: body.name }) }); }
    return r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(opts.asMember ? MEMBER : OWNER) });
  });
  return calls;
}

const server = await startServer(ROOT, PORT);
let browser;
const base = `http://127.0.0.1:${PORT}/rigs/`;
try {
  browser = await chromium.launch();

  // Signed out, nothing changes. This is the whole point.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await stub(ctx);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-week]");
    ok(await p.locator("[data-week]").count() === 1, "signed out, the week is still the first thing");
    ok(await p.locator("[data-crew-gate]").count() === 0, "signed out, nothing demands a sign-in");
    ok(await p.locator('[data-crew-open]').count() === 1, "there is one way in to the crew", await p.locator("[data-crew-open]").count());
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // Phone, code, in.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const calls = await stub(ctx);
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-phone]");
    await p.locator("[data-phone]").fill("(253) 555-0147");
    await p.locator("[data-sendcode]").click();
    await p.waitForSelector("[data-code]");
    ok(calls.otp === 1, "one code asked for", calls.otp);
    // A second tap inside the cooldown must say so and send nothing.
    await p.locator("[data-backphone]").click();
    await p.waitForSelector("[data-sendcode]");
    await p.locator("[data-sendcode]").click();
    await p.waitForTimeout(300);
    ok(calls.otp === 1, "a second tap sends nothing", calls.otp);
    ok(/just sent/i.test(await p.locator("[data-crew-msg]").innerText()), "and says a code was just sent",
      await p.locator("[data-crew-msg]").innerText());
    // Clear the cooldown the way a minute passing would, and carry on.
    await p.evaluate(() => localStorage.removeItem("rig.codesent.v1"));
    await p.locator("[data-sendcode]").click();
    await p.waitForSelector("[data-code]");
    ok(calls.otp === 2, "after the wait, a code is sent", calls.otp);
    await p.locator("[data-code]").fill("123456");
    await p.locator("[data-verify]").click();
    await p.waitForSelector("[data-crewname]");
    ok(/Coach.s crew/i.test(await p.locator("[data-crewname]").innerText()), "the crew name shows",
      JSON.stringify(await p.locator("[data-crewname]").innerText()));
    const names = await p.locator("[data-member]").allInnerTexts();
    ok(names.join(" ").includes("Russell"), "the other members show", names.join(","));
    ok(!/\d{3}[-. ]?\d{4}/.test(await p.locator('[data-view="crew"]').innerText()), "no phone number is on the screen");
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }

  // The owner adds someone; a member cannot.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const calls = await stub(ctx);
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem("rig.session.v1", JSON.stringify({ token: "tok-123", refresh: "ref-123", at: Date.now() + 36e5, userId: "u-coach" })));
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-invite-name]");
    await p.locator("[data-invite-name]").fill("Dad");
    await p.locator("[data-invite-phone]").fill("253 555 0148");
    await p.locator("[data-invite-send]").click();
    await p.waitForTimeout(400);
    ok(calls.invite === 1, "the owner can add someone", calls.invite);
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await stub(ctx2, { asMember: true });
    const p2 = await ctx2.newPage();
    await p2.addInitScript(() => localStorage.setItem("rig.session.v1", JSON.stringify({ token: "tok-123", refresh: "ref-123", at: Date.now() + 36e5, userId: "u-russ" })));
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.waitForSelector("[data-crewname]");
    ok(await p2.locator("[data-invite-name]").count() === 0, "a member gets no Add someone form");
    await ctx2.close();
  }

  // An unknown number, and no signal at all.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await stub(ctx, { unknownPhone: true });
    const p = await ctx.newPage();
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.locator("[data-phone]").fill("2535550199");
    await p.locator("[data-sendcode]").click();
    await p.waitForFunction(() => /ask coach/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""));
    ok(true, "a number that is not on the crew is told to ask Coach");
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await stub(ctx2, { authDown: true });
    const p2 = await ctx2.newPage();
    await p2.goto(base + "#/crew", { waitUntil: "load" });
    await p2.locator("[data-phone]").fill("2535550147");
    await p2.locator("[data-sendcode]").click();
    await p2.waitForFunction(() => /could not be sent/i.test(document.querySelector("[data-crew-msg]")?.innerText || ""));
    ok(await p2.locator("[data-phone]").inputValue() === "2535550147", "with no signal it says so and keeps the number");
    await ctx2.close();
  }

  // A session that has gone stale drops back to signed out, week intact.
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await stub(ctx, { expired: true });
    const p = await ctx.newPage();
    const errs = []; p.on("pageerror", (e) => errs.push(e.message));
    await p.addInitScript(() => localStorage.setItem("rig.session.v1", JSON.stringify({ token: "old", refresh: "old", at: Date.now() + 36e5, userId: "u-coach" })));
    await p.goto(base + "#/crew", { waitUntil: "load" });
    await p.waitForSelector("[data-phone]");
    ok(true, "an expired session lands back at sign in");
    ok(await p.evaluate(() => localStorage.getItem("rig.session.v1")) === null, "and the stale session is thrown away");
    await p.goto(base, { waitUntil: "load" });
    await p.waitForSelector("[data-week]");
    ok(await p.locator("[data-week]").count() === 1, "the week still works after that");
    ok(errs.length === 0, "no page errors", errs.join(" | "));
    await ctx.close();
  }
} catch (e) {
  fail++; console.log("FAIL threw", e.message.split("\n")[0]);
} finally {
  if (browser) await browser.close();
  server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
