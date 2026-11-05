// Live API tests for the bls-board edge function (BLS Website Build board).
// Run: node tests/bls-board.test.mjs
// Needs the service role key for project geigvuysptjvvqanumld: SUPABASE_SERVICE_ROLE_KEY env var, or a logged-in supabase CLI
// (the key is fetched with `supabase projects api-keys`, kept in memory, never printed).
// The admin PIN and cron key are read from bls_board_settings, so no secret lives in this file.
// Test data: a temporary page slug 'zztest' plus ZZTEST author, person and phase names. The function never
// emails for test data. Everything is deleted at the start and at the end of the run.
import { execSync } from "node:child_process";

const REF = "geigvuysptjvvqanumld";
const FN = `https://${REF}.supabase.co/functions/v1/bls-board`;
const REST = `https://${REF}.supabase.co/rest/v1`;
const H = 3600 * 1000;
const TOL = 90 * 1000;
const SLUG = "zztest";

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m, extra === undefined ? "" : JSON.stringify(extra).slice(0, 400)); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const near = (a, b, tol = TOL) => typeof a === "number" && Math.abs(a - b) <= tol;
// Polls fn until it returns something truthy (or the time is up) and returns that last value.
async function until(fn, ms = 40000, step = 1500) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v || Date.now() - t0 > ms) return v;
    await sleep(step);
  }
}

function serviceKey() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const out = execSync(`supabase projects api-keys --project-ref ${REF} -o json`, { stdio: ["ignore", "pipe", "ignore"] }).toString();
    return JSON.parse(out).find((k) => k.name === "service_role")?.api_key || "";
  } catch (_e) {
    return "";
  }
}
const SK = serviceKey();
if (!SK) { console.error("No service role key: set SUPABASE_SERVICE_ROLE_KEY or log in to the supabase CLI."); process.exit(2); }

async function rest(path, { method = "GET", body, prefer = "return=representation" } = {}) {
  const r = await fetch(REST + path, {
    method,
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, "content-type": "application/json", Prefer: prefer },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch (_e) { j = text; }
  if (r.status >= 400) throw new Error(`REST ${method} ${path} -> ${r.status} ${text.slice(0, 200)}`);
  return j;
}

async function api(action, { body, pin, cron, method, query = "" } = {}) {
  const headers = { "content-type": "application/json" };
  if (pin) headers["x-admin-pin"] = pin;
  if (cron) headers["x-cron-key"] = cron;
  const r = await fetch(`${FN}?action=${action}${query}`, {
    method: method || (body === undefined ? "GET" : "POST"), headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j = {}; try { j = JSON.parse(text); } catch (_e) { j = { raw: text }; }
  return { s: r.status, j, text };
}

const settingsRows = await rest("/bls_board_settings?select=key,value&key=in.(admin_pin,cron_key)");
const PIN = settingsRows.find((r) => r.key === "admin_pin")?.value;
const CRON = settingsRows.find((r) => r.key === "cron_key")?.value;
if (!PIN || !CRON) { console.error("admin_pin or cron_key missing from bls_board_settings."); process.exit(2); }

// Wrong-PIN lockout counter (settings row pin_fail). The run makes 3 wrong-PIN calls on purpose and one simulated
// lockout, then clears the counter so Daniel is never locked out by a test run.
const resetPinFails = () => rest(`/bls_board_settings?key=eq.pin_fail`, { method: "PATCH", body: { value: "" } });
// Comments stay Daniel-only (comments_public false) until Coach opens them. The run flips the setting on purpose and
// this puts it back, even when a check in between failed. Upsert, so a missing row is created rather than skipped.
const commentsDanielOnly = () => rest("/bls_board_settings", { method: "POST", body: { key: "comments_public", value: "false" }, prefer: "resolution=merge-duplicates,return=representation" });

async function cleanup() {
  await resetPinFails();
  await rest(`/bls_board_items?slug=eq.${SLUG}`, { method: "DELETE" });
  await rest(`/bls_board_items?author_name=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_events?slug=eq.${SLUG}`, { method: "DELETE" });
  await rest(`/bls_board_events?actor=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_events?kind=eq.page_update&detail=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_pages?slug=eq.${SLUG}`, { method: "DELETE" });
  await rest(`/bls_board_people?name=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_phases?name=ilike.zztest*`, { method: "DELETE" });
}
async function leftovers() {
  const q = [
    `/bls_board_items?select=id&or=(slug.eq.${SLUG},author_name.ilike.zztest*)`,
    `/bls_board_events?select=id&or=(slug.eq.${SLUG},actor.ilike.zztest*,detail.ilike.zztest*)`,
    `/bls_board_pages?select=slug&slug=eq.${SLUG}`,
    `/bls_board_people?select=id&name=ilike.zztest*`,
    `/bls_board_phases?select=id&name=ilike.zztest*`,
  ];
  let n = 0;
  for (const p of q) n += (await rest(p)).length;
  return n;
}

// Clock helpers: simulate time passing by moving the stored deadline / frozen remainder directly.
// Board review (state review) is the 48 hour countdown; On hold keeps the frozen remainder.
const setDeadline = (msFromNow) => rest(`/bls_board_pages?slug=eq.${SLUG}`, { method: "PATCH", body: { state: "review", hold_remaining_ms: null, ready_deadline: new Date(Date.now() + msFromNow).toISOString() } });
const setHold = (ms) => rest(`/bls_board_pages?slug=eq.${SLUG}`, { method: "PATCH", body: { state: "hold", ready_deadline: null, hold_remaining_ms: ms } });
// true when the database refuses the write (a check constraint)
const refused = async (body) => { try { await rest(`/bls_board_pages?slug=eq.${SLUG}`, { method: "PATCH", body }); return false; } catch (_e) { return true; } };
async function adminState() { return (await api("state", { pin: PIN, query: "&test=1" })).j; }
// Daniel's "All activity" list (every event kind). Public state carries only page_update and live events.
async function activity() { return (await adminState()).activity || []; }
const PUBLIC_KINDS = ["page_update", "live"];
async function publicState(test = true) { return (await api("state", { query: test ? "&test=1" : "" })); }
async function zz() { return (await adminState()).pages.find((p) => p.slug === SLUG); }
const post = (body, pin) => api("post", { body: { slug: SLUG, ...body }, pin });
const adminPage = (body) => api("admin_page", { body: { slug: SLUG, ...body }, pin: PIN });
const resolve = (id, status, note) => api("admin_resolve", { body: { id, status, note }, pin: PIN });

try {
  await cleanup();
  await rest("/bls_board_pages", { method: "POST", body: { slug: SLUG, title: "ZZTEST page", state: "building", sort: 999 } });

  // ---------- public state ----------
  {
    const r = await publicState(false);
    ok(r.s === 200 && r.j.ok === true, "state returns 200 without auth");
    ok(r.j.viewer && r.j.viewer.admin === false, "viewer.admin is false without PIN");
    ok(Array.isArray(r.j.people) && r.j.people.length >= 15 && r.j.people[0].name === "Ramey Harguess" && r.j.people[0].role === "President", "people roster in sort order, Ramey Harguess first");
    ok(r.j.people.every((p) => Object.keys(p).sort().join(",") === "has_email,name,role" && typeof p.has_email === "boolean"), "people entries carry name, role and a has_email flag (never the address)");
    const slugs = r.j.pages.map((p) => p.slug);
    ok(["home", "registration", "faq", "board", "runbook", "schedules"].every((s) => slugs.includes(s)) && slugs.length >= 17, "17 seeded pages present");
    ok(!slugs.includes(SLUG), "test page is not in public state without test=1");
    ok(["Phase 1", "Phase 2"].every((n) => r.j.phases.some((p) => p.name === n)), "Phase 1 and Phase 2 seeded");
    ok(typeof r.j.now === "string" && Array.isArray(r.j.items) && Array.isArray(r.j.events), "state has now, items, events");
    ok(!r.text.includes(CRON) && !/admin_pin|cron_key/.test(r.text), "state never leaks settings");
    const p = r.j.pages.find((x) => x.slug === "faq");
    ok(p && "remaining_ms" in p && p.counts && ["approve", "comment", "suggestion", "concern", "help", "open", "open_concern", "open_suggestion"].every((k) => typeof p.counts[k] === "number") && Array.isArray(p.approvers), "page shape has remaining_ms, counts (with open concern and suggestion split) and approvers");
    const a = await api("state", { pin: PIN });
    ok(a.s === 200 && a.j.viewer.admin === true && a.j.viewer.name === "Daniel (Website)", "state with PIN marks viewer as admin");
    const w = await api("state", { pin: "0000" });
    ok(w.s === 401 && !w.text.includes('"items"'), "state with a wrong PIN is 401 (no quiet guessing)");
    const t = await publicState(true);
    ok(t.j.pages.some((x) => x.slug === SLUG), "test page visible with test=1");
    ok(r.j.pages.every((x) => ["building", "waiting", "review", "hold", "scheduled", "live"].includes(x.state)), "no page is in the old Ready to deploy state", r.j.pages.map((x) => x.state));
    ok(r.j.pages.every((x) => x.state !== "review" || typeof x.remaining_ms === "number"), "every Board review page has a running clock");
    // reviewers and asks (addendum 11/4)
    const roster = new Set(r.j.people.map((x) => x.name));
    ok(r.j.pages.every((x) => Array.isArray(x.reviewers) && Array.isArray(x.asks)), "every page carries reviewers and asks lists");
    ok(r.j.pages.every((x) => x.reviewers.every((n) => roster.has(n))), "every reviewer is a roster name", r.j.pages.map((x) => x.reviewers));
    ok(r.j.pages.every((x) => x.asks.every((a) => typeof a.text === "string" && a.text.length >= 3 && Array.isArray(a.people) && a.people.every((n) => roster.has(n)))), "every ask has text and roster names", r.j.pages.map((x) => x.asks));
    // calm asks (Coach 11/4, migrations 20261104170000 and 20261104190000): only two optional, gently worded asks; no board
    // decisions (spring dates, 2027 sponsor prices), nothing that cannot happen before the site launches, no "2027"
    const liveAsks = r.j.pages.flatMap((x) => x.asks.map((a) => ({ slug: x.slug, text: a.text, people: a.people })));
    ok(liveAsks.length >= 1 && liveAsks.length <= 3, "only a few gentle asks on the board", liveAsks);
    ok(liveAsks.some((a) => a.slug === "runbook" && /uniform sizing/i.test(a.text) && a.people.length === 1 && a.people[0] === "Dena Berkey"), "the uniform sizing ask (Dena) is on the Run Book", liveAsks);
    ok(!liveAsks.some((a) => a.slug === "board"), "no ask on the Board page (board decisions are the board's own)", liveAsks);
    ok(!liveAsks.some((a) => /opening day|evaluation|draft|gear pickup|sign-up|standings|cleared-volunteer|seats filled|sponsor price|2027/i.test(a.text)), "no ask is a board decision, a spring date, sponsor prices or next season", liveAsks.map((a) => a.text));
    ok(liveAsks.every((a) => /\?$/.test(a.text)), "every ask reads as a gentle question", liveAsks.map((a) => a.text));
    ok(["volunteer", "schedules", "sponsorship"].every((s) => (r.j.pages.find((x) => x.slug === s) || { asks: [1] }).asks.length === 0), "volunteer, schedules and sponsorship carry no asks");
    // public What's new is only page updates and pages going live
    ok(r.j.events.every((e) => PUBLIC_KINDS.includes(e.kind)), "public events are only page_update and live", [...new Set(r.j.events.map((e) => e.kind))]);
    ok(!("activity" in r.j), "public state has no activity list");
    ok(Array.isArray(a.j.activity), "admin state has the activity list");
    ok(a.j.events.every((e) => PUBLIC_KINDS.includes(e.kind)), "admin events list is the same public feed");
  }

  // ---------- database clock checks ----------
  {
    ok(await refused({ state: "ready" }), "the database refuses the old ready state");
    ok(await refused({ state: "review", ready_deadline: null }), "the database refuses Board review with no clock");
    ok(await refused({ state: "building", ready_deadline: new Date(Date.now() + H).toISOString() }), "the database refuses a running clock outside Board review");
    ok(await refused({ state: "review", ready_deadline: new Date(Date.now() + H).toISOString(), hold_remaining_ms: 5 }), "the database refuses a frozen clock outside On hold");
    const pg = await rest(`/bls_board_pages?select=state,ready_deadline&slug=eq.${SLUG}`);
    ok(pg[0].state === "building" && pg[0].ready_deadline === null, "refused writes left the test page in Building", pg);
  }

  // ---------- auth ----------
  {
    const actions = ["admin_page", "admin_resolve", "admin_reply", "admin_hide", "admin_phase", "admin_people", "admin_person", "admin_update"];
    for (const a of actions) {
      const r = await api(a, { body: { slug: SLUG } });
      ok(r.s === 401, `${a} is 401 without PIN`);
    }
    // only one wrong-PIN admin call: every wrong PIN counts toward the lockout
    ok((await api("admin_page", { body: { slug: SLUG }, pin: "0000" })).s === 401, "admin_page is 401 with a wrong PIN");
    ok((await api("admin_people")).s === 401, "admin_people GET is 401 without PIN");
    ok((await api("tick", { body: {} })).s === 401, "tick is 401 without a cron key");
    ok((await api("tick", { body: {}, cron: "nope" })).s === 401, "tick is 401 with a wrong cron key");
    const t = await api("tick", { body: { no_digest: true }, cron: CRON });
    ok(t.s === 200 && t.j.ok && Array.isArray(t.j.expired) && t.j.digest === "skipped_by_request", "tick works with the cron key", t.j);
    ok((await post({ kind: "comment", body: "x", name: "ZZTEST Wrong Pin" }, "0000")).s === 401, "post with a wrong PIN header is 401");
    ok((await api("nope")).s === 400, "unknown action is 400");
    // global lockout: simulate 30 wrong tries in the current 15 minute window
    await rest(`/bls_board_settings?key=eq.pin_fail`, { method: "PATCH", body: { value: `${Date.now()}:30` } });
    const lk = await api("state", { pin: PIN });
    ok(lk.s === 429 && /locked/i.test(lk.j.error || ""), "after 30 wrong PINs even the right PIN gets 429", lk.j);
    ok((await api("admin_page", { body: { slug: SLUG }, pin: PIN })).s === 429, "admin actions are 429 during a lockout");
    const open = await api("state");
    ok(open.s === 200 && open.j.viewer.admin === false, "the board still loads for everyone (no PIN) during a lockout");
    await rest(`/bls_board_settings?key=eq.pin_fail`, { method: "PATCH", body: { value: `${Date.now() - 16 * 60 * 1000}:30` } });
    const after = await api("state", { pin: PIN });
    ok(after.s === 200 && after.j.viewer.admin === true, "the lockout ends when its 15 minute window is over");
    await resetPinFails();
    const big = await api("post", { body: { slug: SLUG, kind: "comment", body: "x".repeat(25000), name: "ZZTEST Big" } });
    ok(big.s === 413, "a request over 20000 bytes is 413", big.s);
  }

  // ---------- validation ----------
  {
    const r = (b) => post(b);
    ok((await r({ kind: "bogus", body: "hi", name: "ZZTEST Val" })).s === 400, "unknown kind is 400");
    ok((await r({ kind: "comment", body: "hi" })).s === 400, "missing name is 400");
    ok((await r({ kind: "comment", body: "hi", name: "Z" })).s === 400, "1 character name is 400");
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST " + "x".repeat(80) })).s === 400, "81+ character name is 400");
    ok((await r({ kind: "comment", body: "hi", name: "Daniel (Website)" })).s === 400, "non-admin cannot post as Daniel (Website)");
    ok((await r({ kind: "comment", body: "   ", name: "ZZTEST Val" })).s === 400, "empty comment body is 400");
    ok((await r({ kind: "comment", body: "x".repeat(4001), name: "ZZTEST Val" })).s === 400, "4001 character body is 400");
    const max = await r({ kind: "comment", body: "y".repeat(4000), name: "ZZTEST Val" });
    ok(max.s === 200 && max.j.item.body.length === 4000, "4000 character body is accepted");
    const links6 = Array.from({ length: 6 }, (_, i) => `https://example.com/${i}`).join(" ");
    ok((await r({ kind: "comment", body: links6, name: "ZZTEST Val" })).s === 400, "more than 5 links is 400");
    const links5 = Array.from({ length: 5 }, (_, i) => `https://example.com/${i}`).join(" ");
    ok((await r({ kind: "comment", body: links5, name: "ZZTEST Val" })).s === 200, "5 links is accepted");
    ok((await api("post", { body: { slug: "no-such-page", kind: "comment", body: "hi", name: "ZZTEST Val" } })).s === 404, "unknown slug is 404");
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST Val", variant: "bogus" })).s === 400, "bad variant is 400");
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST Val", variant: "today", pin_x: 120, pin_y: 5 })).s === 400, "pin outside 0 to 100 is 400");
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST Val", pin_x: 10, pin_y: 5 })).s === 400, "pin without a variant is 400");
    ok((await api("post", { body: { slug: null, kind: "approve", name: "ZZTEST Val" } })).s === 400, "approve with no page is 400");
    ok((await api("approve", { body: { name: "ZZTEST Val" } })).s === 400, "approve action with no slug is 400");
    const pin = await r({ kind: "comment", body: "This spot", name: "ZZTEST Pinner", variant: "proposed", pin_x: 42.5, pin_y: 10.25 });
    ok(pin.s === 200 && pin.j.item.pin_x === 42.5 && pin.j.item.pin_y === 10.25 && pin.j.item.variant === "proposed", "spot pin stored with x, y and variant");
    const top = pin.j.item;
    const rep = await r({ kind: "comment", body: "reply", name: "ZZTEST Replier", parent_id: top.id });
    ok(rep.s === 200 && rep.j.item.parent_id === top.id, "reply to a top-level item works");
    ok((await r({ kind: "comment", body: "nested", name: "ZZTEST Replier", parent_id: rep.j.item.id })).s === 400, "reply to a reply is 400");
    ok((await api("post", { body: { slug: null, kind: "comment", body: "x", name: "ZZTEST Replier", parent_id: top.id } })).s === 400, "reply on a different page is 400");
    ok((await r({ kind: "comment", body: "x", name: "ZZTEST Replier", parent_id: "00000000-0000-0000-0000-000000000000" })).s === 404, "reply to a missing item is 404");
    const help = await r({ kind: "help", body: "", req_item: "ZZTEST required item", name: "ZZTEST Helper" });
    ok(help.s === 200 && help.j.item.req_item === "ZZTEST required item" && help.j.emailed === false, "help offer with only a required item is accepted, no email for test data");
    const mine = await post({ kind: "comment", body: "Admin note", name: "ignored" }, PIN);
    ok(mine.s === 200 && mine.j.item.author_name === "Daniel (Website)" && mine.j.item.is_admin === true, "admin post is labeled Daniel (Website)");

    // nobody can pose as Daniel
    for (const n of ["Daniel (Website).", "Daniel (Web​site)", "Ｄaniel （Website）", "daniel (board)", "Ann (website)"]) {
      ok((await r({ kind: "comment", body: "hi", name: n })).s === 400, `reserved look-alike name is 400: ${JSON.stringify(n)}`);
    }
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST Role", role: "Website" })).s === 400, "role Website is reserved");
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST www.spam.example" })).s === 400, "a link in a name is 400");
    ok((await r({ kind: "comment", body: "hi", name: "ZZTEST Role", role: "see https://spam.example" })).s === 400, "a link in a role is 400");
    const lr = Array.from({ length: 3 }, (_, i) => `https://example.com/${i}`).join(" ");
    ok((await r({ kind: "help", body: lr, req_item: lr, name: "ZZTEST Links" })).s === 400, "links in body and required item count together");
    ok((await r({ kind: "comment", body: "hi", name: "\u{1F600}" })).s === 400, "a one-emoji name is 400 (lengths count characters)");
    const em = await r({ kind: "comment", body: "hi", name: "ZZTEST \u{1F600}", role: "\u{1F600}".repeat(130) });
    ok(em.s === 200 && [...em.j.item.author_role].length === 120, "role is cut to 120 characters without splitting an emoji", em.j);
    const zw = await r({ kind: "comment", body: "hi", name: "ZZTEST Zero​Width" });
    ok(zw.s === 200 && zw.j.item.author_name === "ZZTEST ZeroWidth", "invisible characters are stripped from names");

    // test names stay on the test page or the board discussion
    ok((await api("post", { body: { slug: "faq", kind: "concern", body: "x", name: "ZZTEST Real" } })).s === 400, "a ZZTEST post on a real page is 400");
    ok((await api("approve", { body: { slug: "faq", name: "ZZTEST Real" } })).s === 400, "a ZZTEST approval on a real page is 400");

    // spot width
    const pw = await r({ kind: "comment", body: "phone spot", name: "ZZTEST Pinner", variant: "today", pin_x: 10, pin_y: 20, pin_w: 390 });
    ok(pw.s === 200 && pw.j.item.pin_w === 390, "spot pin stores the screen width");
    const pw2 = await r({ kind: "comment", body: "odd width", name: "ZZTEST Pinner", variant: "today", pin_x: 10, pin_y: 20, pin_w: 5 });
    ok(pw2.s === 200 && pw2.j.item.pin_w === null, "an impossible screen width is ignored");

    // replies take their kind from the thread
    const rk = await r({ kind: "concern", body: "reply as concern", name: "ZZTEST Replier", parent_id: top.id, variant: "today", pin_x: 5, pin_y: 5, req_item: "x" });
    ok(rk.s === 200 && rk.j.item.kind === "comment" && rk.j.item.pin_x === null && rk.j.item.variant === null && rk.j.item.req_item === null, "a reply is always a plain comment with no spot", rk.j.item);
    ok((await r({ kind: "private", body: "secret", name: "ZZTEST Replier", parent_id: top.id })).s === 400, "a private reply under a public comment is 400");
  }

  // ---------- roster ----------
  let personId = null;
  {
    const list = await api("admin_people", { pin: PIN });
    ok(list.s === 200 && list.j.people.length >= 15 && list.j.people.every((p) => p.id && "active" in p && "sort" in p), "admin_people lists the roster with ids");
    const c = await api("admin_person", { body: { name: "ZZTEST Person", role: "ZZTEST Role" }, pin: PIN });
    ok(c.s === 200 && c.j.person.id && c.j.person.active === true, "admin_person adds a person", c.j);
    personId = c.j.person.id;
    ok((await api("admin_person", { body: { name: "zztest person", role: "x" }, pin: PIN })).s === 409, "duplicate name is 409");
    ok((await api("admin_person", { body: { name: "Z", role: "x" }, pin: PIN })).s === 400, "1 character person name is 400");
    let st = await adminState();
    ok(st.people.some((p) => p.name === "ZZTEST Person" && p.role === "ZZTEST Role"), "new person shows in the state roster");
    ok(!(await publicState(false)).j.people.some((p) => p.name === "ZZTEST Person"), "test person hidden from public roster without test=1");
    const auto = await post({ kind: "comment", body: "role from roster", name: "ZZTEST Person" });
    ok(auto.s === 200 && auto.j.item.author_role === "ZZTEST Role", "role fills in from the roster when the picker sends none");
    const rn = await api("admin_person", { body: { id: personId, name: "ZZTEST Person Two", sort: 500 }, pin: PIN });
    ok(rn.s === 200 && rn.j.person.name === "ZZTEST Person Two" && rn.j.person.sort === 500 && rn.j.person.role === "ZZTEST Role", "rename and reorder keep the role");
    await api("admin_person", { body: { id: personId, active: false }, pin: PIN });
    st = await adminState();
    ok(!st.people.some((p) => p.name === "ZZTEST Person Two"), "inactive person is not in the picker roster");
    const del = await api("admin_person", { body: { id: personId, delete: true }, pin: PIN });
    ok(del.s === 200 && del.j.deleted === true && !del.j.people.some((p) => p.id === personId), "admin_person delete removes the person");
  }

  // ---------- reviewers, asks and page updates (addendum 11/4) ----------
  {
    const A = await api("admin_person", { body: { name: "ZZTEST Reviewer", role: "ZZTEST Role" }, pin: PIN });
    const B = await api("admin_person", { body: { name: "ZZTEST Helper Two", role: "ZZTEST Role" }, pin: PIN });
    const off = await api("admin_person", { body: { name: "ZZTEST Inactive", role: "ZZTEST Role", active: false }, pin: PIN });
    ok(A.s === 200 && B.s === 200 && off.s === 200, "test roster people added");

    // reviewers
    let r = await adminPage({ reviewers: ["zztest reviewer", "ZZTEST Helper Two", "ZZTEST  REVIEWER"] });
    ok(r.s === 200 && JSON.stringify(r.j.page.reviewers) === JSON.stringify(["ZZTEST Reviewer", "ZZTEST Helper Two"]), "reviewers are stored as roster names, duplicates dropped", r.j);
    ok(r.j.page.state === "building", "saving reviewers leaves the page state alone", r.j.page && r.j.page.state);
    ok((await adminPage({ reviewers: ["ZZTEST Nobody"] })).s === 400, "a reviewer not on the roster is 400");
    ok((await adminPage({ reviewers: ["ZZTEST Inactive"] })).s === 400, "an inactive person cannot be a reviewer");
    ok((await adminPage({ reviewers: "ZZTEST Reviewer" })).s === 400, "reviewers must be a list");
    ok((await adminPage({ reviewers: [42] })).s === 400, "reviewers must be names");
    ok((await adminPage({ reviewers: Array.from({ length: 31 }, () => "ZZTEST Reviewer") })).s === 400, "more than 30 reviewers is 400");
    let p = (await publicState(true)).j.pages.find((x) => x.slug === SLUG);
    ok(p && p.reviewers.includes("ZZTEST Reviewer"), "reviewers show in public state");

    // asks
    const asks = [{ text: "ZZTEST Spring dates", people: ["ZZTEST Reviewer", "zztest helper two"] }, { text: "ZZTEST Anyone can answer" }];
    r = await adminPage({ asks });
    ok(r.s === 200 && r.j.page.asks.length === 2 && JSON.stringify(r.j.page.asks[0].people) === JSON.stringify(["ZZTEST Reviewer", "ZZTEST Helper Two"]) && Array.isArray(r.j.page.asks[1].people) && r.j.page.asks[1].people.length === 0, "asks saved with roster names (people optional)", r.j);
    ok((await adminPage({ asks: [{ text: "hi", people: [] }] })).s === 400, "an ask under 3 characters is 400");
    ok((await adminPage({ asks: [{ text: "x".repeat(201), people: [] }] })).s === 400, "an ask over 200 characters is 400");
    ok((await adminPage({ asks: [{ text: "ZZTEST ask", people: ["ZZTEST Nobody"] }] })).s === 400, "an ask naming someone not on the roster is 400");
    ok((await adminPage({ asks: [{ text: "ZZTEST same" }, { text: "zztest SAME" }] })).s === 400, "two asks with the same text is 400");
    ok((await adminPage({ asks: Array.from({ length: 11 }, (_, i) => ({ text: "ZZTEST ask " + i })) })).s === 400, "more than 10 asks is 400");
    ok((await adminPage({ asks: { text: "ZZTEST" } })).s === 400, "asks must be a list");
    ok((await adminPage({ asks: ["ZZTEST"] })).s === 400, "each ask must be an object");
    ok((await adminPage({ asks: Array.from({ length: 10 }, (_, i) => ({ text: "ZZTEST ask " + i })) })).s === 200, "10 asks is accepted");
    r = await adminPage({ asks });
    p = (await publicState(true)).j.pages.find((x) => x.slug === SLUG);
    ok(p && p.asks.length === 2 && p.asks[0].text === "ZZTEST Spring dates", "asks show in public state");
    ok((await api("admin_page", { body: { slug: SLUG, reviewers: [] } })).s === 401, "reviewers need the admin PIN");

    // a rename in People carries over to reviewers and asks
    const rn = await api("admin_person", { body: { id: A.j.person.id, name: "ZZTEST Reviewer Renamed" }, pin: PIN });
    p = await zz();
    ok(rn.s === 200 && p.reviewers.includes("ZZTEST Reviewer Renamed") && !p.reviewers.includes("ZZTEST Reviewer") && p.asks[0].people.includes("ZZTEST Reviewer Renamed"), "renaming a person updates page reviewers and asks", p.reviewers);
    r = await adminPage({ reviewers: [], asks: [] });
    ok(r.s === 200 && r.j.page.reviewers.length === 0 && r.j.page.asks.length === 0, "reviewers and asks can be cleared");

    // page updates
    ok((await api("admin_update", { body: { slug: SLUG, text: "ZZTEST update" } })).s === 401, "admin_update needs the admin PIN");
    ok((await api("admin_update", { body: { slug: SLUG, text: "hi" }, pin: PIN })).s === 400, "an update under 3 characters is 400");
    ok((await api("admin_update", { body: { slug: SLUG, text: "x".repeat(281) }, pin: PIN })).s === 400, "an update over 280 characters is 400");
    ok((await api("admin_update", { body: { slug: "no-such-page", text: "ZZTEST nowhere" }, pin: PIN })).s === 404, "an update on an unknown page is 404");
    const u1 = await api("admin_update", { body: { slug: SLUG, text: "  ZZTEST page:   new hero photo  " }, pin: PIN });
    ok(u1.s === 200 && u1.j.event.kind === "page_update" && u1.j.event.slug === SLUG && u1.j.event.detail === "ZZTEST page: new hero photo" && u1.j.event.actor === "Daniel (Website)", "admin_update posts a page_update event", u1.j);
    const u2 = await api("admin_update", { body: { slug: null, text: "ZZTEST board-wide update" }, pin: PIN });
    ok(u2.s === 200 && u2.j.event.slug === null, "admin_update with no page posts a board-wide update", u2.j);
    let pub = await publicState(true);
    ok(pub.j.events.some((e) => e.id === u1.j.event.id && e.kind === "page_update") && pub.j.events.some((e) => e.id === u2.j.event.id), "page updates are in the public feed (test=1)");
    const e1 = pub.j.events.find((e) => e.id === u1.j.event.id), e2 = pub.j.events.find((e) => e.id === u2.j.event.id);
    ok(e1 && e1.text === "ZZTEST page: new hero photo" && e1.detail === "ZZTEST page: ZZTEST page: new hero photo.", "a page update's detail names the page, text keeps Daniel's words", e1);
    ok(e2 && e2.text === "ZZTEST board-wide update" && e2.detail === "ZZTEST board-wide update.", "a board-wide update's detail is the sentence alone", e2);
    ok(pub.j.events.filter((e) => e.kind === "page_update" && e.slug).every((e) => /^[^:]+: /.test(e.detail) && /[.!?]$/.test(e.detail)), "every page update names its page in plain words");
    pub = await publicState(false);
    ok(!pub.j.events.some((e) => e.id === u1.j.event.id || e.id === u2.j.event.id), "ZZTEST updates stay out of the real public feed");
    const internal = (await activity()).find((e) => !PUBLIC_KINDS.includes(e.kind));
    if (internal) ok((await api("admin_update", { body: { id: internal.id, delete: true }, pin: PIN })).s === 404, "admin_update delete only removes page updates");
    ok((await api("admin_update", { body: { id: 0, delete: true }, pin: PIN })).s === 404, "deleting an unknown update is 404");
    const d1 = await api("admin_update", { body: { id: u2.j.event.id, delete: true }, pin: PIN });
    ok(d1.s === 200 && d1.j.deleted === true && !(await publicState(true)).j.events.some((e) => e.id === u2.j.event.id), "admin_update delete removes an update");

    for (const x of [A, B, off]) await api("admin_person", { body: { id: x.j.person.id, delete: true }, pin: PIN });
  }

  // ---------- approvals ----------
  {
    let a = await api("approve", { body: { slug: SLUG, name: "ZZTEST Ann" } });
    ok(a.s === 200 && a.j.approved === true, "approve toggles on");
    let p = await zz();
    ok(p.counts.approve === 1 && p.approvers.includes("ZZTEST Ann"), "approval counted with the approver name");
    a = await api("approve", { body: { slug: SLUG, name: "  zztest   ANN " } });
    ok(a.s === 200 && a.j.approved === false, "same name in other case toggles it off");
    p = await zz();
    ok(p.counts.approve === 0 && p.approvers.length === 0, "approval removed");
    a = await api("approve", { body: { slug: SLUG, name: "ZZTEST Ann", note: "Looks good" } });
    const viaPost = await post({ kind: "approve", name: "ZZTEST ANN" });
    ok(viaPost.s === 200 && viaPost.j.approved === true, "post kind approve keeps the approval on");
    p = await zz();
    ok(p.counts.approve === 1, "still one approval per person per page");
    const st = await adminState();
    ok(st.items.some((i) => i.kind === "approve" && i.slug === SLUG && i.body === "Looks good"), "approval note kept");
  }

  // ---------- privacy ----------
  {
    const M1 = "ZZTEST-private-" + Date.now();
    const M2 = "ZZTEST-general-private-" + Date.now();
    const p1 = await post({ kind: "private", body: M1, name: "ZZTEST Pat" });
    const p2 = await api("post", { body: { slug: null, kind: "private", body: M2, name: "ZZTEST Pat" } });
    ok(p1.s === 200 && p2.s === 200 && p1.j.emailed === false, "private messages accepted, no email for test data");
    const pub = await publicState(true);
    ok(!pub.j.items.some((i) => i.kind === "private"), "no private items in public state");
    ok(!pub.text.includes(M1) && !pub.text.includes(M2), "private text never appears in public state");
    const adm = await adminState();
    ok(adm.items.some((i) => i.body === M1) && adm.items.some((i) => i.body === M2), "admin state includes private items");
    ok((await post({ kind: "comment", body: "peek", name: "ZZTEST Pat", parent_id: p1.j.item.id })).s === 404, "public reply to a private item is 404");
    const ar = await api("admin_reply", { body: { parent_id: p1.j.item.id, body: "ZZTEST reply " + M1 }, pin: PIN });
    ok(ar.s === 200 && ar.j.item.kind === "private", "admin reply to a private message stays private");
    const ap = await post({ kind: "comment", body: "ZZTEST post reply " + M1, parent_id: p1.j.item.id }, PIN);
    ok(ap.s === 200 && ap.j.item.kind === "private", "a reply posted under a private message is private whatever kind was sent");
    const pub2 = await publicState(true);
    ok(!pub2.text.includes(M1), "private reply not in public state");
    // Daniel's counts (members get no comment counts while comments are Daniel-only)
    const zp = (await adminState()).pages.find((x) => x.slug === SLUG);
    ok(zp.counts.comment >= 1 && !JSON.stringify(zp.counts).includes("private"), "counts ignore private items");
  }

  // ---------- reply, hide, resolve validation ----------
  {
    const c = await post({ kind: "comment", body: "ZZTEST hide me", name: "ZZTEST Hide" });
    const rep = await api("admin_reply", { body: { parent_id: c.j.item.id, body: "Thanks" }, pin: PIN });
    ok(rep.s === 200 && rep.j.item.author_name === "Daniel (Website)" && rep.j.item.is_admin === true && rep.j.item.parent_id === c.j.item.id, "admin_reply labeled Daniel (Website)");
    // visibility is checked in Daniel's state here: comments are Daniel-only by default, and the block below covers
    // what members see once comments are open
    ok((await adminState()).items.some((i) => i.id === rep.j.item.id), "admin reply is in Daniel's state");
    const h = await api("admin_hide", { body: { id: c.j.item.id }, pin: PIN });
    ok(h.s === 200 && h.j.item.hidden === true, "admin_hide hides an item");
    let pub = await publicState(true);
    const adm = await adminState();
    ok(!adm.items.some((i) => i.id === c.j.item.id) && !adm.items.some((i) => i.id === rep.j.item.id), "hidden item and its replies leave the state (Daniel's too)");
    ok(!pub.j.events.some((e) => e.detail.includes("ZZTEST Hide")), "hidden item's event is not in the public feed");
    ok(!(await activity()).some((e) => e.detail.includes("ZZTEST Hide")), "hidden item's event leaves Daniel's activity list too");
    ok((await api("admin_hide", { body: { id: "00000000-0000-0000-0000-000000000000" }, pin: PIN })).s === 404, "hide unknown id is 404");
    ok((await resolve(c.j.item.id, "bogus")).s === 400, "resolve with a bad status is 400");
    ok((await resolve("00000000-0000-0000-0000-000000000000", "resolved")).s === 404, "resolve unknown id is 404");
    const rs = await resolve(rep.j.item.id, "resolved", "done");
    ok(rs.s === 200 && rs.j.item.status === "resolved" && rs.j.item.resolution_note === "done" && rs.j.item.resolved_at, "resolve stores status, note and time");
    const c2 = await post({ kind: "comment", body: "ZZTEST visible", name: "ZZTEST Hide" });
    ok((await api("admin_reply", { body: { parent_id: c2.j.item.id, body: "  " }, pin: PIN })).s === 400, "empty admin reply is 400");
    ok((await api("admin_reply", { body: { parent_id: c.j.item.id, body: "late" }, pin: PIN })).s === 404, "reply to a hidden item is 404");
    const un = await api("admin_hide", { body: { id: c.j.item.id, hidden: false }, pin: PIN });
    ok(un.s === 200 && un.j.item.hidden === false && (await adminState()).items.some((i) => i.id === c.j.item.id), "admin_hide with hidden false brings an item back");
  }

  // ---------- comments Daniel-only until opened; Daniel's own posts stay off the board unless marked (Coach 11/4) ----------
  // Comments are opened to everyone for a few seconds here (the only way to test open mode) and put back right after.
  {
    const setComments = (value) => api("admin_setting", { body: { key: "comments_public", value }, pin: PIN });
    // Settings are cached for up to 30 seconds per function instance, so right after a flip one instance can still
    // answer in the old mode. Every public read here waits for an answer in the mode under test (the flag and the
    // item filter always agree within one answer).
    const untilPublic = (want) => until(async () => { const r = await publicState(true); return r.j.comments_public === want ? r : null; });
    const hiddenState = () => untilPublic(false);
    const openState = () => untilPublic(true);
    const evBefore = (await rest("/bls_board_events?select=id&order=id.desc&limit=1"))[0]?.id || 0;
    const made = [];
    try {
      // validation
      ok((await api("admin_setting", { body: { key: "comments_public", value: "true" } })).s === 401, "admin_setting needs the admin PIN");
      ok((await api("admin_setting", { body: { key: "admin_pin", value: "1234" }, pin: PIN })).s === 400, "admin_setting refuses any key but comments_public");
      ok((await api("admin_setting", { body: { key: "comments_public", value: "yes" }, pin: PIN })).s === 400, "admin_setting refuses a value that is not true or false");
      ok((await api("admin_setting", { body: { key: "comments_public", value: "" }, pin: PIN })).s === 400, "admin_setting refuses an empty value");
      ok((await api("admin_to_board", { body: { id: "x", to_board: true } })).s === 401, "admin_to_board needs the admin PIN");
      ok((await api("admin_to_board", { body: { id: "00000000-0000-0000-0000-000000000000", to_board: true }, pin: PIN })).s === 404, "admin_to_board on an unknown item is 404");
      ok((await api("admin_to_board", { body: { to_board: true }, pin: PIN })).s === 404, "admin_to_board with no id is 404");

      // Daniel-only (the current default): members' notes reach only Daniel, approvals still show
      let r = await setComments("false");
      ok(r.s === 200 && r.j.ok === true && r.j.key === "comments_public" && r.j.value === "false", "admin_setting sets comments_public false", r.j);
      let pub = await untilPublic(false);
      ok(pub && pub.j.comments_public === false, "public state says comments_public false");
      ok((await adminState()).comments_public === false, "admin state carries comments_public too");
      const c = await post({ kind: "comment", body: "ZZTEST hidden comment", name: "ZZTEST Quiet" });
      const sg = await post({ kind: "suggestion", body: "ZZTEST hidden suggestion", name: "ZZTEST Quiet" });
      const cn = await post({ kind: "concern", body: "ZZTEST hidden concern", name: "ZZTEST Quiet" });
      const hp = await post({ kind: "help", body: "ZZTEST hidden help", name: "ZZTEST Quiet" });
      ok([c, sg, cn, hp].every((x) => x.s === 200) && c.j.item.to_board === false, "members can still post while comments are Daniel-only (to_board false)", [c.s, sg.s, cn.s, hp.s]);
      made.push(c.j.item.id, sg.j.item.id, cn.j.item.id, hp.j.item.id);
      const ap = await api("approve", { body: { slug: SLUG, name: "ZZTEST Quiet" } });
      ok(ap.s === 200 && ap.j.approved === true && ap.j.item, "approve still works while comments are Daniel-only");
      made.push(ap.j.item.id);
      // a member's own post or approve answer goes through the same filter as state (no counts or notes leak back)
      ok([c, sg, cn, hp].every((x) => x.j.page && ["comment", "suggestion", "concern", "help", "open"].every((k) => x.j.page.counts[k] === 0)), "Daniel-only: a member's own post answer carries no feedback counts", [c, sg, cn, hp].map((x) => x.j.page && x.j.page.counts));
      ok(ap.j.page && ap.j.page.counts.comment === 0 && ap.j.page.counts.approve >= 1 && ap.j.page.approvers.includes("ZZTEST Quiet"), "Daniel-only: a member's own approve answer has approvals only", ap.j.page);
      pub = await hiddenState();
      const ids = new Set(pub.j.items.map((i) => i.id));
      ok(![c, sg, cn, hp].some((x) => ids.has(x.j.item.id)), "Daniel-only: the ZZTEST comment, suggestion, concern and help offer are not in public state");
      ok(pub.j.items.every((i) => i.kind === "approve"), "Daniel-only: public items are approvals only", [...new Set(pub.j.items.map((i) => i.kind))]);
      ok(ids.has(ap.j.item.id), "Daniel-only: the approval is in public state");
      ok(!pub.text.includes("ZZTEST hidden"), "Daniel-only: hidden text never reaches public state");
      ok(pub.j.items.filter((i) => i.kind === "approve").every((i) => i.body === "") && !pub.text.includes("Looks good"), "Daniel-only: approval notes stay off public state");
      let zp = pub.j.pages.find((x) => x.slug === SLUG);
      ok(zp.counts.comment === 0 && zp.counts.suggestion === 0 && zp.counts.concern === 0 && zp.counts.help === 0 && zp.counts.open === 0 && zp.approvers.includes("ZZTEST Quiet"), "Daniel-only: public counts show no feedback, approvers still listed", zp.counts);
      const adm = await adminState();
      const aids = new Set(adm.items.map((i) => i.id));
      ok([c, sg, cn, hp].every((x) => aids.has(x.j.item.id)), "Daniel-only: Daniel's state has the ZZTEST comment, suggestion, concern and help offer");
      ok(adm.items.every((i) => typeof i.to_board === "boolean"), "every item carries to_board");
      zp = adm.pages.find((x) => x.slug === SLUG);
      ok(zp.counts.comment >= 1 && zp.counts.suggestion >= 1 && zp.counts.concern >= 1 && zp.counts.help >= 1, "Daniel-only: Daniel's counts include the hidden items", zp.counts);

      // Daniel's own posts: off the board unless marked, whatever the setting
      const d0 = await post({ kind: "comment", body: "ZZTEST Daniel private note", name: "ignored" }, PIN);
      const d1 = await post({ kind: "comment", body: "ZZTEST Daniel board note", name: "ignored", to_board: true }, PIN);
      const dm = await post({ kind: "comment", body: "ZZTEST note typed as Daniel Grande", name: "Daniel Grande" });
      const fake = await post({ kind: "comment", body: "ZZTEST member sends to_board", name: "ZZTEST Quiet", to_board: true });
      ok(d0.s === 200 && d0.j.item.to_board === false && d1.s === 200 && d1.j.item.to_board === true, "admin post stores to_board (false unless sent as true)", [d0.j, d1.j]);
      ok(dm.s === 200 && dm.j.item.is_admin === false && dm.j.item.author_name === "Daniel Grande" && dm.j.item.to_board === false, "a post typed under the name Daniel Grande is a plain member post");
      ok(fake.s === 200 && fake.j.item.to_board === false, "to_board from a member is ignored");
      made.push(d0.j.item.id, d1.j.item.id, dm.j.item.id, fake.j.item.id);
      const dr0 = await api("admin_reply", { body: { parent_id: c.j.item.id, body: "ZZTEST Daniel quiet reply" }, pin: PIN });
      const dr1 = await api("admin_reply", { body: { parent_id: c.j.item.id, body: "ZZTEST Daniel board reply", to_board: true }, pin: PIN });
      ok(dr0.s === 200 && dr0.j.item.to_board === false && dr1.s === 200 && dr1.j.item.to_board === true, "admin_reply stores to_board", [dr0.j, dr1.j]);
      made.push(dr0.j.item.id, dr1.j.item.id);
      pub = await hiddenState();
      ok(![d0, d1, dm, dr0, dr1].some((x) => pub.j.items.some((i) => i.id === x.j.item.id)), "Daniel-only: none of Daniel's posts reach public state, marked or not");
      // Daniel on the name picker can approve like any member: the approval shows (approvers are public), his note does not
      const da = await api("approve", { body: { slug: SLUG, name: "Daniel Grande", note: "ZZTEST Daniel approval note" } });
      ok(da.s === 200 && da.j.approved === true && da.j.item, "a Daniel Grande member approval is accepted", da.j);
      made.push(da.j.item.id);
      pub = await hiddenState();
      zp = pub.j.pages.find((x) => x.slug === SLUG);
      ok(pub.j.items.some((i) => i.id === da.j.item.id && i.body === "") && zp.approvers.includes("Daniel Grande") && !pub.text.includes("ZZTEST Daniel approval note"), "Daniel-only: his approval is in public state with its note blanked", zp.approvers);

      // open comments to everyone
      r = await setComments("true");
      ok(r.s === 200 && r.j.value === "true", "admin_setting sets comments_public true", r.j);
      pub = await untilPublic(true);
      ok(pub && pub.j.comments_public === true, "public state says comments_public true");
      const pids = new Set(pub.j.items.map((i) => i.id));
      ok([c, sg, cn, hp, fake].every((x) => pids.has(x.j.item.id)), "open: members' posts are in public state");
      ok(!pids.has(d0.j.item.id) && pids.has(d1.j.item.id), "open: Daniel's unmarked post stays hidden, the marked one shows");
      ok(!pids.has(dm.j.item.id), "open: a post typed as Daniel Grande stays hidden (not marked for the board)");
      ok(!pids.has(dr0.j.item.id) && pids.has(dr1.j.item.id), "open: Daniel's unmarked reply stays hidden, the marked reply shows");
      ok(!pub.text.includes("ZZTEST Daniel private note") && !pub.text.includes("typed as Daniel Grande") && !pub.text.includes("Daniel quiet reply"), "open: Daniel's unmarked text never reaches public state");
      zp = pub.j.pages.find((x) => x.slug === SLUG);
      ok(zp.counts.comment >= 2 && zp.counts.concern >= 1 && zp.counts.open >= 1, "open: public counts include members' feedback", zp.counts);
      ok(pub.j.items.some((i) => i.kind === "approve" && i.body === "Looks good"), "open: a member's approval note shows");
      ok(pub.j.items.some((i) => i.id === da.j.item.id && i.body === "") && !pub.text.includes("ZZTEST Daniel approval note"), "open: Daniel Grande's approval shows, its note stays blank until marked");
      // a member's own post answer leaves Daniel's unmarked posts out of its counts (an instance still on the old cached
      // setting answers with no counts at all, never with Daniel's)
      const probe = await post({ kind: "comment", body: "ZZTEST open probe", name: "ZZTEST Quiet" });
      ok(probe.s === 200 && probe.j.page, "open: a member post answers with its page");
      made.push(probe.j.item.id);
      const adm2 = await adminState();
      const ac = adm2.pages.find((x) => x.slug === SLUG).counts.comment;
      const danielUnmarked = adm2.items.filter((i) => i.slug === SLUG && i.kind === "comment" && !i.parent_id && (i.is_admin || i.author_name === "Daniel Grande") && !i.to_board).length;
      const pc = probe.j.page.counts.comment;
      ok(danielUnmarked >= 2 && pc !== ac && (pc === 0 || pc === ac - danielUnmarked), "open: a member's own post answer counts leave out Daniel's unmarked posts", [pc, ac, danielUnmarked]);
      // Daniel's note with an answer is his text: members get the status word only
      const rn = await resolve(c.j.item.id, "resolved", "ZZTEST resolution note");
      pub = await openState();
      const cPub = pub.j.items.find((i) => i.id === c.j.item.id);
      ok(rn.s === 200 && rn.j.item.resolution_note === "ZZTEST resolution note" && cPub && cPub.status === "resolved" && cPub.resolution_note === null && !pub.text.includes("ZZTEST resolution note"), "open: a resolution note reaches Daniel but not the board", cPub);
      ok((await adminState()).items.some((i) => i.id === c.j.item.id && i.resolution_note === "ZZTEST resolution note"), "Daniel's state keeps the resolution note");

      // admin_to_board flips one post
      let t = await api("admin_to_board", { body: { id: d0.j.item.id, to_board: true }, pin: PIN });
      ok(t.s === 200 && t.j.ok === true && t.j.item && t.j.item.id === d0.j.item.id && t.j.item.to_board === true, "admin_to_board true returns the item marked", t.j);
      pub = await openState();
      ok(pub && pub.j.items.some((i) => i.id === d0.j.item.id), "a post marked for the board shows in public state", pub && pub.j.items.filter((i) => /ZZTEST Daniel/.test(i.body)).map((i) => [i.body, i.to_board]));
      t = await api("admin_to_board", { body: { id: d0.j.item.id, to_board: false }, pin: PIN });
      pub = await openState();
      ok(t.s === 200 && t.j.item.to_board === false && pub && !pub.j.items.some((i) => i.id === d0.j.item.id), "admin_to_board false takes it off the board again");
      t = await api("admin_to_board", { body: { id: dm.j.item.id, to_board: true }, pin: PIN });
      pub = await openState();
      ok(t.s === 200 && t.j.item.to_board === true && pub && pub.j.items.some((i) => i.id === dm.j.item.id), "a Daniel Grande member post can be marked for the board too");
      t = await api("admin_to_board", { body: { id: d1.j.item.id, to_board: "yes" }, pin: PIN });
      ok(t.s === 200 && t.j.item.to_board === false, "admin_to_board treats anything but true as false");
      t = await api("admin_to_board", { body: { id: da.j.item.id, to_board: true }, pin: PIN });
      pub = await openState();
      ok(t.s === 200 && pub.j.items.some((i) => i.id === da.j.item.id && i.body === "ZZTEST Daniel approval note"), "open: a marked Daniel Grande approval shows its note");
      const da2 = await api("approve", { body: { slug: SLUG, name: "Daniel Grande" } });
      ok(da2.s === 200 && da2.j.approved === false && da2.j.page && !da2.j.page.approvers.includes("Daniel Grande"), "a second Approve as Daniel Grande removes it (the first stayed put)", da2.j);

      // round trip back to Daniel-only, with the admin-only event
      r = await setComments("false");
      ok(r.s === 200 && r.j.value === "false", "admin_setting sets comments_public back to false");
      pub = await untilPublic(false);
      ok(pub && pub.j.comments_public === false && pub.j.items.every((i) => i.kind === "approve"), "back to Daniel-only: public items are approvals only");
      const act = await activity();
      ok(act.some((e) => e.kind === "state_changed" && /Comments opened to everyone/.test(e.detail)) && act.some((e) => e.kind === "state_changed" && /Daniel only/.test(e.detail)), "the setting changes are in Daniel's activity list");
      ok(!(await publicState(false)).j.events.some((e) => e.kind === "state_changed"), "the setting changes are not in the public feed");
    } finally {
      // comments stay Daniel-only until Coach opens them, whatever happened above
      await commentsDanielOnly();
      for (const id of made.slice().reverse()) await rest(`/bls_board_items?id=eq.${id}`, { method: "DELETE" });
      // the setting events this block wrote (slug null, Daniel's activity only)
      await rest(`/bls_board_events?kind=eq.state_changed&slug=is.null&id=gt.${evBefore}&or=(detail.eq."Comments opened to everyone on the board.",detail.eq."Comments set to Daniel only.")`, { method: "DELETE" });
    }
  }

  // ---------- admin_page validation ----------
  {
    ok((await adminPage({ state: "bogus" })).s === 400, "bad state is 400");
    ok((await adminPage({ due_date: "11/15/2026" })).s === 400, "bad due date is 400");
    ok((await adminPage({ live_url: "javascript:alert(1)" })).s === 400, "bad live url is 400");
    ok((await adminPage({ phase_id: "00000000-0000-0000-0000-000000000000" })).s === 400, "unknown phase is 400");
    ok((await adminPage({ timer: "bogus" })).s === 400, "unknown timer is 400");
    ok((await api("admin_page", { body: { slug: "no-such-page" }, pin: PIN })).s === 404, "unknown page is 404");
    const f = await adminPage({ state: "waiting", due_date: "2026-11-20", note: "ZZTEST note" });
    ok(f.s === 200 && f.j.page.state === "waiting" && f.j.page.due_date === "2026-11-20" && f.j.page.note === "ZZTEST note", "admin_page sets state, due date and note");
    const cl = await adminPage({ due_date: null, note: "" });
    ok(cl.s === 200 && cl.j.page.due_date === null && cl.j.page.note === null, "admin_page clears due date and note");
  }

  // ---------- Board review countdown rules ----------
  {
    // the page is in Waiting on info from the admin_page block above
    let r = await adminPage({ state: "review" });
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, 48 * H), "Board review starts a 48 hour countdown", r.j);
    let st = await publicState(true);
    ok((await activity()).some((e) => e.slug === SLUG && e.kind === "countdown_started" && /Board review/.test(e.detail)), "countdown_started event written (admin activity)");
    ok(!st.j.events.some((e) => e.kind === "countdown_started"), "countdown_started is not in the public feed");

    await api("approve", { body: { slug: SLUG, name: "ZZTEST Bob" } });
    let p = await zz();
    ok(p.state === "review" && near(p.remaining_ms, 48 * H), "approve leaves the clock alone");

    r = await post({ kind: "suggestion", body: "ZZTEST tweak", name: "ZZTEST Sam" });
    p = await zz();
    ok(r.s === 200 && r.j.emailed === false && p.state === "review" && p.remaining_ms <= 48 * H && near(p.remaining_ms, 48 * H), "suggestion never pushes past 48 hours left");

    await setDeadline(10 * H);
    r = await post({ kind: "suggestion", body: "ZZTEST tweak 2", name: "ZZTEST Sam" });
    p = await zz();
    ok(p.state === "review" && near(p.remaining_ms, 34 * H), "suggestion adds 24 hours back (10h to 34h)", p);
    ok((await activity()).some((e) => e.slug === SLUG && e.kind === "time_added"), "time_added event written (admin activity)");

    const c1 = await post({ kind: "concern", body: "ZZTEST problem 1", name: "ZZTEST Cal" });
    p = await zz();
    ok(c1.s === 200 && c1.j.emailed === false && p.state === "hold" && near(p.remaining_ms, 34 * H), "concern puts the page On hold with the clock frozen", p);
    const frozen = p.remaining_ms;
    await sleep(2000);
    p = await zz();
    ok(p.remaining_ms === frozen, "held clock does not move");
    const c2 = await post({ kind: "concern", body: "ZZTEST problem 2", name: "ZZTEST Dee" });
    p = await zz();
    ok(p.state === "hold" && p.remaining_ms === frozen && p.counts.open >= 2, "second concern keeps it On hold");

    r = await resolve(c1.j.item.id, "declined", "ZZTEST keep");
    p = await zz();
    ok(r.s === 200 && r.j.item.status === "declined" && p.state === "hold", "Keep as is on one concern stays On hold while another concern is open");

    await setHold(1 * H);
    r = await resolve(c2.j.item.id, "declined");
    p = await zz();
    ok(p.state === "review" && p.remaining_ms >= 24 * H - TOL && near(p.remaining_ms, 24 * H), "Keep as is resumes Board review with at least 24 hours left (1h to 24h)", p);

    await setHold(30 * H);
    const c3 = await post({ kind: "concern", body: "ZZTEST problem 3", name: "ZZTEST Eve" });
    await resolve(c3.j.item.id, "declined");
    p = await zz();
    ok(p.state === "review" && near(p.remaining_ms, 30 * H), "Keep as is keeps more than 24 hours when more was left (30h)", p);

    // a reply sent as a concern or suggestion is a plain comment: the clock does not move
    const thread = await post({ kind: "comment", body: "ZZTEST thread", name: "ZZTEST Gus" });
    const before = (await zz());
    const rc = await post({ kind: "concern", body: "ZZTEST reply concern", name: "ZZTEST Gus", parent_id: thread.j.item.id });
    const rs2 = await post({ kind: "suggestion", body: "ZZTEST reply suggestion", name: "ZZTEST Gus", parent_id: thread.j.item.id });
    p = await zz();
    ok(rc.j.item.kind === "comment" && rs2.j.item.kind === "comment" && p.state === "review" && near(p.remaining_ms, before.remaining_ms, 5000), "replies never put a page On hold or add time", p);
    ok(p.counts.comment === before.counts.comment, "replies are not counted as new comments", [before.counts, p.counts]);

    const s3 = await post({ kind: "suggestion", body: "ZZTEST change it", name: "ZZTEST Fay" });
    r = await resolve(s3.j.item.id, "accepted", "Will do");
    p = await zz();
    ok(r.s === 200 && r.j.item.status === "accepted" && p.state === "building" && p.remaining_ms === null, "Will change during Board review sends the page back to Building and clears the clock", p);

    // Will change on a Waiting on info page only marks the item
    await adminPage({ state: "waiting" });
    const s4 = await post({ kind: "suggestion", body: "ZZTEST waiting tweak", name: "ZZTEST Fay" });
    p = await zz();
    ok(p.state === "waiting" && p.remaining_ms === null, "a suggestion outside Board review starts no clock", p);
    await resolve(s4.j.item.id, "accepted");
    p = await zz();
    ok(p.state === "waiting", "Will change on a Waiting on info page leaves it in Waiting on info", p.state);

    // Keep as is on a page Daniel put On hold with the picker (no clock) leaves it On hold
    r = await adminPage({ state: "hold" });
    ok(r.s === 200 && r.j.page.state === "hold" && r.j.page.remaining_ms === null, "picker hold from Waiting on info has no clock");
    const c5 = await post({ kind: "concern", body: "ZZTEST picker hold", name: "ZZTEST Hal" });
    await resolve(c5.j.item.id, "declined");
    p = await zz();
    ok(p.state === "hold" && p.remaining_ms === null, "Keep as is does not start a countdown on a picker hold", p);
    ok((await adminPage({ timer: "resume" })).s === 409, "resume on a hold with no clock is 409");
    ok((await adminPage({ timer: "add24" })).s === 409, "add24 on a hold with no clock is 409");
    ok((await adminPage({ due_date: "2026-02-31" })).s === 400, "a date that does not exist is 400");
    r = await adminPage({ state: "review" });
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, 48 * H), "Board review from a hold with no clock starts a fresh 48 hours", r.j.page);

    // Daniel's timer controls
    r = await adminPage({ timer: "pause" });
    ok(r.s === 200 && r.j.page.state === "hold" && near(r.j.page.remaining_ms, 48 * H), "pause freezes the clock");
    const paused = r.j.page.remaining_ms;
    await sleep(1500);
    r = await adminPage({ timer: "resume" });
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, paused, 5000), "resume picks up where it stopped");
    r = await adminPage({ timer: "add24" });
    ok(r.s === 200 && near(r.j.page.remaining_ms, 72 * H), "add24 adds 24 hours");
    r = await adminPage({ timer: "pause" });
    r = await adminPage({ timer: "add24" });
    ok(r.s === 200 && r.j.page.state === "hold" && near(r.j.page.remaining_ms, 96 * H), "add24 also works while paused");
    r = await adminPage({ state: "review" });
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, 96 * H), "setting state Board review on a paused clock resumes it", r.j.page);
    r = await adminPage({ state: "review" });
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, 48 * H), "setting state Board review again restarts a fresh 48 hours", r.j.page);
    r = await adminPage({ timer: "clear" });
    ok(r.s === 200 && r.j.page.state === "building" && r.j.page.remaining_ms === null, "clear stops the clock and sends the page to Building");
    ok((await adminPage({ timer: "pause" })).s === 409, "pause with no countdown is 409");
    ok((await adminPage({ timer: "resume" })).s === 409, "resume with no paused countdown is 409");
    r = await adminPage({ timer: "start" });
    r = await adminPage({ timer: "schedule_now" });
    ok(r.s === 200 && r.j.page.state === "scheduled" && r.j.page.remaining_ms === null, "Schedule now moves straight to Scheduled for deployment");
    r = await adminPage({ state: "review" });
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, 48 * H), "setting state Board review starts the countdown");
    await adminPage({ timer: "clear" });
    await rest(`/bls_board_events?slug=eq.${SLUG}&kind=eq.countdown_started`, { method: "DELETE" });
    r = await adminPage({ state: "review", timer: "start" });
    const starts = await rest(`/bls_board_events?select=id&slug=eq.${SLUG}&kind=eq.countdown_started`);
    ok(r.s === 200 && r.j.page.state === "review" && near(r.j.page.remaining_ms, 48 * H) && starts.length === 1, "state review plus timer start writes one countdown event", starts.length);
    r = await adminPage({ state: "live", live_url: "https://www.blslittleleague.org/" });
    ok(r.s === 200 && r.j.page.state === "live" && r.j.page.remaining_ms === null && /^\d{4}-\d{2}-\d{2}$/.test(r.j.page.live_since) && r.j.page.live_url === "https://www.blslittleleague.org/", "Live sets live_since to today and keeps the live link");
    st = await publicState(true);
    ok(st.j.events.some((e) => e.slug === SLUG && e.kind === "live"), "a page going live is in the public feed");
    ok(!(await publicState(false)).j.events.some((e) => e.slug === SLUG), "the test page's live event stays out of the public feed without test=1");

    // Expiry into a phase
    const ph = await api("admin_phase", { body: { name: "ZZTEST Phase", target_date: "2026-11-15", note: "ZZTEST", sort: 99 }, pin: PIN });
    ok(ph.s === 200 && ph.j.phase.id && ph.j.phase.target_date === "2026-11-15", "admin_phase creates a phase");
    const phaseId = ph.j.phase.id;
    const up = await api("admin_phase", { body: { id: phaseId, target_date: "2026-11-16" }, pin: PIN });
    ok(up.s === 200 && up.j.phase.target_date === "2026-11-16" && up.j.phase.name === "ZZTEST Phase", "admin_phase updates a phase");
    ok((await api("admin_phase", { body: { name: "" }, pin: PIN })).s === 400, "phase without a name is 400");
    r = await adminPage({ phase_id: phaseId, timer: "start" });
    ok(r.s === 200 && r.j.page.phase_id === phaseId && r.j.page.state === "review", "page put in the phase with a running Board review");
    await setDeadline(-1000);
    st = await publicState(true);
    p = st.j.pages.find((x) => x.slug === SLUG);
    ok(p.state === "scheduled" && p.remaining_ms === null, "a finished Board review becomes Scheduled for deployment on the next state read", p);
    ok((await activity()).some((e) => e.slug === SLUG && e.kind === "scheduled" && e.detail.includes("ZZTEST Phase") && e.detail.includes("scheduled for deployment")), "scheduled event names the phase (admin activity)");
    ok(!st.j.events.some((e) => e.kind === "scheduled"), "scheduled events are not in the public feed");
    await adminPage({ timer: "start" });
    await setDeadline(-1000);
    const t = await api("tick", { body: { no_digest: true }, cron: CRON });
    ok(t.s === 200 && t.j.expired.includes(SLUG), "cron tick expires countdowns too", t.j);
    p = await zz();
    ok(p.state === "scheduled", "page Scheduled for deployment after tick");
    // a paused clock never runs out
    await adminPage({ timer: "start" });
    await setHold(500);
    await sleep(1500);
    p = await zz();
    ok(p.state === "hold" && p.remaining_ms === 500, "an On hold page is never scheduled by the clock", p);
    const d = await api("admin_phase", { body: { id: phaseId, delete: true }, pin: PIN });
    p = await zz();
    ok(d.s === 200 && d.j.deleted === true && p.phase_id === null, "deleting a phase leaves its pages with no phase");
    await adminPage({ timer: "start" });
    await setDeadline(-1000);
    st = await publicState(true);
    const act = await activity();
    ok(act.some((e) => e.slug === SLUG && e.kind === "scheduled" && e.detail.includes("next update")), "no phase means scheduled for the next update");
    ok(!act.some((e) => /goes live in/i.test(e.detail)), "events are past tense with no live time");
  }

  // ---------- counts ----------
  {
    const p = await zz();
    ok(p.counts.suggestion >= 3 && p.counts.concern >= 3 && p.counts.help >= 1 && p.counts.approve === 2, "counts by kind", p.counts);
    const pub = await publicState(true);
    ok(pub.j.events.length <= 20 && pub.j.items.length <= 500, "feed capped at 20 events, items at 500");
    ok((await activity()).length <= 40, "admin activity capped at 40");
  }
} catch (e) {
  fail++;
  console.log("FAIL unexpected error:", e && e.message);
} finally {
  try {
    await commentsDanielOnly();
    await cleanup();
    const n = await leftovers();
    ok(n === 0, "all test rows cleaned up", n);
    const cp = await rest("/bls_board_settings?select=value&key=eq.comments_public");
    ok(cp.length === 1 && cp[0].value === "false", "comments_public is back to false", cp);
  } catch (e) {
    fail++;
    console.log("FAIL cleanup error:", e && e.message);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
