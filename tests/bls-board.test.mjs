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

async function rest(path, { method = "GET", body } = {}) {
  const r = await fetch(REST + path, {
    method,
    headers: { apikey: SK, Authorization: `Bearer ${SK}`, "content-type": "application/json", Prefer: "return=representation" },
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

async function cleanup() {
  await resetPinFails();
  await rest(`/bls_board_items?slug=eq.${SLUG}`, { method: "DELETE" });
  await rest(`/bls_board_items?author_name=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_events?slug=eq.${SLUG}`, { method: "DELETE" });
  await rest(`/bls_board_events?actor=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_pages?slug=eq.${SLUG}`, { method: "DELETE" });
  await rest(`/bls_board_people?name=ilike.zztest*`, { method: "DELETE" });
  await rest(`/bls_board_phases?name=ilike.zztest*`, { method: "DELETE" });
}
async function leftovers() {
  const q = [
    `/bls_board_items?select=id&or=(slug.eq.${SLUG},author_name.ilike.zztest*)`,
    `/bls_board_events?select=id&or=(slug.eq.${SLUG},actor.ilike.zztest*)`,
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
    ok(r.j.people.every((p) => Object.keys(p).sort().join(",") === "name,role"), "people entries carry only name and role");
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
    const actions = ["admin_page", "admin_resolve", "admin_reply", "admin_hide", "admin_phase", "admin_people", "admin_person"];
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
    const zp = pub2.j.pages.find((x) => x.slug === SLUG);
    ok(zp.counts.comment >= 1 && !JSON.stringify(zp.counts).includes("private"), "counts ignore private items");
  }

  // ---------- reply, hide, resolve validation ----------
  {
    const c = await post({ kind: "comment", body: "ZZTEST hide me", name: "ZZTEST Hide" });
    const rep = await api("admin_reply", { body: { parent_id: c.j.item.id, body: "Thanks" }, pin: PIN });
    ok(rep.s === 200 && rep.j.item.author_name === "Daniel (Website)" && rep.j.item.is_admin === true && rep.j.item.parent_id === c.j.item.id, "admin_reply labeled Daniel (Website)");
    let pub = await publicState(true);
    ok(pub.j.items.some((i) => i.id === rep.j.item.id), "admin reply visible publicly");
    const h = await api("admin_hide", { body: { id: c.j.item.id }, pin: PIN });
    ok(h.s === 200 && h.j.item.hidden === true, "admin_hide hides an item");
    pub = await publicState(true);
    ok(!pub.j.items.some((i) => i.id === c.j.item.id) && !pub.j.items.some((i) => i.id === rep.j.item.id), "hidden item and its replies leave public state");
    ok(!pub.j.events.some((e) => e.detail.includes("ZZTEST Hide")), "hidden item's event leaves the feed");
    ok((await api("admin_hide", { body: { id: "00000000-0000-0000-0000-000000000000" }, pin: PIN })).s === 404, "hide unknown id is 404");
    ok((await resolve(c.j.item.id, "bogus")).s === 400, "resolve with a bad status is 400");
    ok((await resolve("00000000-0000-0000-0000-000000000000", "resolved")).s === 404, "resolve unknown id is 404");
    const rs = await resolve(rep.j.item.id, "resolved", "done");
    ok(rs.s === 200 && rs.j.item.status === "resolved" && rs.j.item.resolution_note === "done" && rs.j.item.resolved_at, "resolve stores status, note and time");
    const c2 = await post({ kind: "comment", body: "ZZTEST visible", name: "ZZTEST Hide" });
    ok((await api("admin_reply", { body: { parent_id: c2.j.item.id, body: "  " }, pin: PIN })).s === 400, "empty admin reply is 400");
    ok((await api("admin_reply", { body: { parent_id: c.j.item.id, body: "late" }, pin: PIN })).s === 404, "reply to a hidden item is 404");
    const un = await api("admin_hide", { body: { id: c.j.item.id, hidden: false }, pin: PIN });
    ok(un.s === 200 && un.j.item.hidden === false && (await publicState(true)).j.items.some((i) => i.id === c.j.item.id), "admin_hide with hidden false brings an item back");
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
    ok(st.j.events.some((e) => e.slug === SLUG && e.kind === "countdown_started" && /Board review/.test(e.detail)), "countdown_started event written");

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
    st = await publicState(true);
    ok(st.j.events.some((e) => e.slug === SLUG && e.kind === "time_added"), "time_added event written");

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
    ok(st.j.events.some((e) => e.slug === SLUG && e.kind === "scheduled" && e.detail.includes("ZZTEST Phase") && e.detail.includes("scheduled for deployment")), "scheduled event names the phase");
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
    ok(st.j.events.some((e) => e.slug === SLUG && e.kind === "scheduled" && e.detail.includes("next update")), "no phase means scheduled for the next update");
    ok(!st.j.events.some((e) => /goes live in/i.test(e.detail)), "events are past tense with no live time");
  }

  // ---------- counts ----------
  {
    const p = await zz();
    ok(p.counts.suggestion >= 3 && p.counts.concern >= 3 && p.counts.help >= 1 && p.counts.approve === 2, "counts by kind", p.counts);
    const pub = await publicState(true);
    ok(pub.j.events.length <= 20 && pub.j.items.length <= 500, "feed capped at 20 events, items at 500");
  }
} catch (e) {
  fail++;
  console.log("FAIL unexpected error:", e && e.message);
} finally {
  try {
    await cleanup();
    const n = await leftovers();
    ok(n === 0, "all test rows cleaned up", n);
  } catch (e) {
    fail++;
    console.log("FAIL cleanup error:", e && e.message);
  }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
