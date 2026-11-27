// The crew function, walked end to end against the DEPLOYED function as the two
// ZZTEST accounts: every action in the contract, who is refused what, a join
// link that mints a real session for an account the invite made and never for
// any other, a trip that starts with its gear list, catches that are rows in
// CastAI's own catch log, and alerts (prefs, phones, who hears about what, the
// sender's pick, quiet hours, the two minute rule).
//
// It touches only the crew named "ZZTEST crew" and stops before any write if
// that is not the crew it finds. It deletes what it makes, and it sweeps at the
// start too, so a run that died halfway does not pile up under the next one.
// No phone number, email, link hash or stack trace may appear in any answer.
//
// NOTHING REAL IS EVER SENT. The two ZZTEST accounts have no phone number, so
// a text for them can only end "skipped". The one phone alert address used is
// under example.invalid, a name that can never resolve, so a phone alert can
// only end "failed". No sign-in code is ever asked for. The delivery it asks
// for is its own crew's only, never the cron job's run across every crew.
//
// Skips (exit 0) when ~/.cortex/rigcard-test.json is missing or the network is
// down. Plain node, global fetch, nothing to install. Takes about two minutes.
// Run: node tests/castai-crew.live.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin } from "node:path";
import { addDays, dayLabel, hashToken, todayIn, tripLink } from "../supabase/functions/castai-crew/crew-core.mjs";

const BASE = "https://geigvuysptjvvqanumld.supabase.co";
const FN = BASE + "/functions/v1/castai-crew";
const KEY = "sb_publishable_m6EWBWxKPeOaVpPQOVDjyg_sTRWlnbe"; // publishable, the same one the page carries
const CREW = "ZZTEST crew";
// Names the walk gives the test crew, and takes back. A run that died halfway
// is known by them, and the crew's name is put back before anything else.
const NAME_PICK = "ZZTEST Two Fish Pros", NAME_OWNER = "ZZTEST Plateau Pro Staff", NAME_RACE = "ZZTEST Twelve Trips Two Fish";
const TEMP_NAMES = ["ZZTEST crew two", NAME_PICK, NAME_OWNER, NAME_RACE, NAME_RACE + " too"];
const PHONE = "(202) 555-0142"; // 555-01xx is set aside for fiction: nobody has this number
const PHONE_AGAIN = "+1 202 555 0142";
const PHOTOS = BASE + "/storage/v1/object/public/catch-photos/";
const NOWHERE = "https://example.invalid/push/"; // .invalid never resolves: no push service is ever reached

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 260)); }
  return !!c;
};
const finish = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
const skip = (why) => { console.log("skip  " + why); process.exit(0); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FILE = pathJoin(homedir(), ".cortex", "rigcard-test.json");
if (!existsSync(FILE)) skip("no ~/.cortex/rigcard-test.json, so the live crew walk is not run");
const creds = JSON.parse(readFileSync(FILE, "utf8"));

// ---- talking to it ---------------------------------------------------------

const seen = []; // every answer the function gives, checked for leaks at the end
async function call(token, body, note) {
  const headers = { "Content-Type": "application/json", apikey: KEY };
  if (token) headers.Authorization = "Bearer " + token;
  const sent = typeof body === "string" ? body : JSON.stringify(body);
  try {
    const r = await fetch(FN, { method: "POST", headers, body: sent, signal: AbortSignal.timeout(30000) });
    const text = await r.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = {}; }
    const out = { status: r.status, body: parsed || {}, text, action: (body && body.action) || "(raw)", mint: note === "mint" };
    seen.push(out);
    return out;
  } catch (e) {
    return { status: 0, body: {}, text: "network: " + e.message, action: (body && body.action) || "(raw)" };
  }
}
const is = (r, status, m) => ok(r.status === status, m, `${r.status} ${r.text}`);
const refused = (r, status, m) => ok(r.status === status && typeof r.body.error === "string" && r.body.error.length > 5, m, `${r.status} ${r.text}`);
const keys = (o, list) => !!o && JSON.stringify(Object.keys(o).sort()) === JSON.stringify([...list].sort());
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const uuidLike = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const isoTime = (v) => typeof v === "string" && v.endsWith("Z") && !Number.isNaN(Date.parse(v));
const LINK = /^https:\/\/coachpilot\.org\/rigs\/#\/join\/([A-Za-z0-9_-]{43})$/;
const tokenOf = (link) => (String(link).match(LINK) || [])[1] || "";
const NOBODY = () => crypto.randomUUID();

const TRIP_KEYS = ["id", "planId", "spotId", "species", "title", "date", "from", "to", "status", "note", "by", "going", "counts", "updatedAt"];
const NOTE_KEYS = ["id", "section", "body", "by", "at", "mine"];
const ITEM_KEYS = ["id", "label", "assignedTo", "done", "mine"];
const CATCH_KEYS = ["id", "species", "lengthIn", "weightLb", "lure", "notes", "photoUrl", "by", "at", "mine"];
const MEMBER_KEYS = ["id", "name", "role", "alerts", "signIn"];
const INVITE_KEYS = ["ok", "created", "name", "userId", "link", "signIn"];
const PREFS_KEYS = ["prefs", "hasPhone", "pushSubs", "pushFails"];
const ALERT_KEYS = ["id", "kind", "title", "body", "url", "tripId", "by", "status", "channel", "why", "at", "sendAfter", "sentAt"];
const ALL_OFF = { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false };

// Sign in without a text: these two accounts have passwords, nobody else does.
async function signIn(who) {
  const r = await fetch(BASE + "/auth/v1/token?grant_type=password", {
    method: "POST", headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ email: who.email, password: who.password }), signal: AbortSignal.timeout(30000),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, token: j.access_token || "", id: (j.user && j.user.id) || "" };
}

// ---- is it there at all ----------------------------------------------------

const hello = await call(null, { action: "hello" });
if (hello.status === 0) skip("no network, so the live crew walk is not run (" + hello.text + ")");
is(hello, 200, "hello needs no sign-in");
ok(hello.body.ok === true && hello.body.sms === true && keys(hello.body, ["ok", "sms", "vapidKey"]), "it says texted codes work, hands over the alert key, and nothing else", hello.text);
ok(typeof hello.body.vapidKey === "string" && /^[A-Za-z0-9_-]{80,100}$/.test(hello.body.vapidKey), "the alert key is a public key a phone can subscribe with", String(hello.body.vapidKey).length);

let owner, member;
try {
  owner = await signIn(creds.owner);
  member = await signIn(creds.member);
} catch (e) { skip("no network for sign-in (" + e.message + ")"); }
if (!ok(owner.status === 200 && owner.token && member.status === 200 && member.token, "both ZZTEST accounts sign in", `${owner.status} ${member.status}`)) finish();
const O = owner.token, M = member.token;

// A run that died while the crew was being named: the owner puts the name
// back, which closes naming too. Only a name this walk gives is ever undone.
{
  const was = await call(O, { action: "state" });
  if (was.status === 200 && was.body.crew && was.body.crew.role === "owner" && TEMP_NAMES.includes(was.body.crew.name)) {
    await call(O, { action: "crew_rename", name: CREW });
    console.log("note  put the crew's name back from an earlier run");
  }
}

// Never touch a crew that is not the test crew. This runs before any write.
const first = await call(O, { action: "state" });
const firstM = await call(M, { action: "state" });
const safe = first.status === 200 && firstM.status === 200 && first.body.crew && firstM.body.crew &&
  first.body.crew.name === CREW && firstM.body.crew.name === CREW && first.body.crew.id === firstM.body.crew.id &&
  first.body.crew.role === "owner" && firstM.body.crew.role === "member";
if (!ok(safe, "both accounts are on the crew named ZZTEST crew, and only that crew is touched", first.text.slice(0, 120))) finish();

// ---- accounts this test makes, and how they are taken away again -----------

const subOf = (jwt) => {
  try { return JSON.parse(Buffer.from(String(jwt).split(".")[1], "base64url").toString()).sub || ""; } catch { return ""; }
};

// A join link traded for a real session, with nothing sent to anyone.
async function sessionFrom(link) {
  const minted = await call(null, { action: "join", token: link }, "mint");
  if (minted.status !== 200 || typeof minted.body.token_hash !== "string") return { minted, status: 0, token: "", id: "" };
  const v = await fetch(BASE + "/auth/v1/verify", {
    method: "POST", headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ type: "magiclink", token_hash: minted.body.token_hash }), signal: AbortSignal.timeout(30000),
  });
  const j = await v.json().catch(() => ({}));
  return { minted, status: v.status, token: j.access_token || "", refresh: j.refresh_token || "", id: (j.user && j.user.id) || "" };
}

// Delete an account this test made, the way CastAI's own Delete Account does:
// with that account's own sign-in. It refuses the two ZZTEST accounts, and any
// sign-in that is not the account it was asked to delete.
async function dropAccount(accessToken, userId) {
  if (!userId || userId === owner.id || userId === member.id || subOf(accessToken) !== userId) return 0;
  const r = await fetch(BASE + "/functions/v1/delete-account", {
    method: "DELETE", headers: { apikey: KEY, Authorization: "Bearer " + accessToken }, signal: AbortSignal.timeout(30000),
  }).catch(() => null);
  return r ? r.status : 0;
}

// ---- CastAI's own catch log, written the way the page and the app write it --

const restHeaders = (who, extra) => ({ "Content-Type": "application/json", apikey: KEY, Authorization: "Bearer " + who.token, ...(extra || {}) });
// One catch in the angler's own log. Every test catch has a ZZTEST spot name, so it can be found again.
async function logCatch(who, row) {
  const r = await fetch(BASE + "/rest/v1/catch_logs", {
    method: "POST", headers: restHeaders(who, { Prefer: "resolution=merge-duplicates" }),
    body: JSON.stringify({ user_id: who.id, state_code: "WA", ...row }), signal: AbortSignal.timeout(30000),
  });
  return r.status;
}
async function unlogCatch(who, id) {
  const r = await fetch(BASE + "/rest/v1/catch_logs?id=eq." + id, { method: "DELETE", headers: restHeaders(who), signal: AbortSignal.timeout(30000) });
  return r.status;
}
// Every ZZTEST catch left in this account's own log. Row level security means an account only ever reaches its own.
async function unlogAll(who) {
  const r = await fetch(BASE + "/rest/v1/catch_logs?user_id=eq." + who.id + "&spot_name=like.ZZTEST*", {
    method: "DELETE", headers: restHeaders(who, { Prefer: "return=representation" }), signal: AbortSignal.timeout(30000),
  });
  const rows = await r.json().catch(() => null);
  return Array.isArray(rows) ? rows.length : -1;
}
async function loggedCount(who) {
  const r = await fetch(BASE + "/rest/v1/catch_logs?select=id&user_id=eq." + who.id + "&spot_name=like.ZZTEST*", { headers: restHeaders(who), signal: AbortSignal.timeout(30000) });
  const rows = await r.json().catch(() => null);
  return Array.isArray(rows) ? rows.length : -1;
}

// ---- alerts: reading what was queued for someone ---------------------------

const everyAlert = []; // every outbox row either account was ever shown, to prove none was really sent
const alertsOf = async (tok) => {
  const r = await call(tok, { action: "outbox" });
  const rows = (r.body && r.body.rows) || [];
  everyAlert.push(...rows);
  return rows;
};
// Sending happens once the answer has gone, so wait until nothing that is due
// is still queued. A row held by quiet hours is at least an hour out and is
// left alone. Ten minutes of slack covers a clock that is a little off.
async function settled(tok) {
  for (let i = 0; i < 60; i++) {
    const rows = await alertsOf(tok);
    if (!rows.some((r) => r.status === "queued" && Date.parse(r.sendAfter) <= Date.now() + 600e3)) return rows;
    await sleep(250);
  }
  return alertsOf(tok);
}
const setPrefs = (tok, f) => call(tok, { action: "prefs_set", ...f });
const RESET = { texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6 };

// Take away anything a run left behind: alerts switched back off first, so
// nothing below tells anybody anything, then every trip, anyone but the two,
// the test phone, what is left in either outbox, and any test catch.
async function sweep() {
  const none = { trips: -1, people: -1, alerts: -1, catches: -1 };
  const s = await call(O, { action: "state" });
  if (s.status !== 200 || !s.body.crew || s.body.crew.name !== CREW) return none;
  await setPrefs(O, RESET); await setPrefs(M, RESET);
  // Naming left open by a run that died is closed again.
  if (s.body.crew.nameOpen !== false) await call(O, { action: "crew_name_open", open: false });
  let trips = 0, people = 0;
  for (const t of s.body.trips || []) { if ((await call(O, { action: "trip_delete", tripId: t.id, tell: [] })).status === 200) trips++; }
  for (const m of s.body.members || []) {
    if (m.id === owner.id || m.id === member.id) continue;
    // Someone a dead run left signed in: sign in as them with a new link and delete the account.
    const again = await call(O, { action: "link", userId: m.id });
    if (again.status === 200) {
      const sess = await sessionFrom(again.body.link);
      if (sess.token && sess.id === m.id) await dropAccount(sess.token, m.id);
    }
    const gone = await call(O, { action: "member_remove", userId: m.id });
    if (gone.status === 200 || gone.status === 404) people++;
  }
  for (const who of [owner, member]) await call(who.token, { action: "push_unsubscribe", endpoint: NOWHERE + who.id });
  let alerts = 0;
  for (const tok of [O, M]) { const c = await call(tok, { action: "outbox_clear" }); alerts += c.status === 200 ? c.body.cleared : 0; }
  const catches = (await unlogAll(owner)) + (await unlogAll(member));
  return { trips, people, alerts, catches };
}
const before = await sweep();
if (before.trips || before.people || before.alerts || before.catches) console.log("note  swept what an earlier run left: " + JSON.stringify(before));

const linkTokens = []; // every join token handed out, to prove its stored hash never shows

async function walk() {
  // ---- state: who am I, my crew, the members by name -----------------------
  const so = await call(O, { action: "state" }), sm = await call(M, { action: "state" });
  is(so, 200, "state for the owner"); is(sm, 200, "state for the member");
  ok(keys(so.body, ["me", "crew", "members", "trips", "sms"]) && keys(sm.body, ["me", "crew", "members", "trips", "sms"]), "state has exactly me, crew, members, trips and sms");
  ok(so.body.me.id === owner.id && so.body.me.name === "ZZTEST Owner" && keys(so.body.me, ["id", "name"]), "the owner is told who they are, by name", JSON.stringify(so.body.me));
  ok(sm.body.me.id === member.id && sm.body.me.name === "ZZTEST Member", "so is the member", JSON.stringify(sm.body.me));
  ok(keys(so.body.crew, ["id", "name", "role", "nameOpen"]) && so.body.crew.role === "owner" && sm.body.crew.role === "member", "each sees their own role on the crew");
  ok(so.body.crew.nameOpen === false && sm.body.crew.nameOpen === false, "and that the crew's name is not open: it has one", JSON.stringify(so.body.crew));
  ok(so.body.members.length === 2 && so.body.members.every((m) => keys(m, MEMBER_KEYS)), "two members, each an id, a name, a role, whether they take alerts and how they sign in", JSON.stringify(so.body.members));
  ok(so.body.members[0].id === owner.id && so.body.members[0].role === "owner" && so.body.members[1].id === member.id && so.body.members[1].name === "ZZTEST Member",
    "the owner is listed first, then the member, by name");
  ok(so.body.members.every((m) => m.signIn === "code"), "both are real accounts: they sign in with a number and a code, never a link", JSON.stringify(so.body.members.map((m) => m.signIn)));
  ok(so.body.members.every((m) => m.alerts === false), "neither has switched alerts on");
  ok(same(so.body.members, sm.body.members), "both see the same members in the same order");
  ok(Array.isArray(so.body.trips) && so.body.trips.length === 0 && sm.body.trips.length === 0 && so.body.sms === true, "no trips yet, and texted codes are on");

  // ---- what a member may not do, and what the owner cannot do either -------
  refused(await call(M, { action: "invite", name: "ZZTEST Nope" }), 403, "a member cannot add someone");
  refused(await call(M, { action: "link", userId: owner.id }), 403, "a member cannot make a link for someone else");
  refused(await call(M, { action: "member_remove", userId: owner.id }), 403, "a member cannot remove someone");
  refused(await call(M, { action: "member_remove", userId: member.id }), 403, "not even themselves");
  refused(await call(O, { action: "member_remove", userId: owner.id }), 403, "the owner cannot remove himself");
  refused(await call(O, { action: "member_remove", userId: NOBODY() }), 404, "removing someone who is not on the crew is a 404");
  refused(await call(O, { action: "link", userId: NOBODY() }), 404, "a link for someone who is not on the crew is a 404");
  refused(await call(O, { action: "link", userId: "nope" }), 400, "a mangled person id is bad input");
  refused(await call(O, { action: "link" }), 400, "no person id is bad input");
  refused(await call(O, { action: "invite" }), 400, "an invite needs a name");
  refused(await call(O, { action: "invite", name: "x".repeat(61) }), 400, "and not a 61 letter one");
  const badPhone = await call(O, { action: "invite", name: "ZZTEST Nope", phone: "555-0147" });
  refused(badPhone, 400, "half a phone number is bad input");
  ok(!/555|0147/.test(badPhone.text), "the refusal does not say the number back", badPhone.text);
  ok((await call(O, { action: "state" })).body.members.length === 2, "none of those refusals added anyone");

  // ---- links are only for accounts the invite itself made ------------------
  const noLink = await call(O, { action: "link", userId: member.id });
  ok(noLink.status === 403 && noLink.body.error === "They sign in with their number and a code." && keys(noLink.body, ["error"]),
    "the owner cannot make a link for an account that belonged to someone first: 403 in the contract's own words", noLink.text);
  const noSelf = await call(M, { action: "link", userId: member.id });
  ok(noSelf.status === 403 && noSelf.body.error === "You sign in with your number and a code.", "nor can that person make one for themselves", noSelf.text);
  const noOwner = await call(O, { action: "link", userId: owner.id });
  ok(noOwner.status === 403 && noOwner.body.error === "You sign in with your number and a code.", "the owner's own account is a real one too: no link", noOwner.text);

  // ---- an invite with no phone: a new person and a link --------------------
  const temp = await call(O, { action: "invite", name: "  ZZTEST Temp " });
  is(temp, 200, "the owner adds someone by name alone");
  ok(keys(temp.body, INVITE_KEYS), "the answer is ok, created, name, userId, link and signIn, nothing more", temp.text);
  ok(temp.body.created === true && temp.body.name === "ZZTEST Temp" && uuidLike(temp.body.userId), "a new person, name trimmed", temp.text);
  ok(LINK.test(temp.body.link) && temp.body.signIn === "link", "an account the invite made signs in with its link, which opens coachpilot.org/rigs at the join screen", temp.text);
  linkTokens.push(tokenOf(temp.body.link));
  const withTemp = await call(M, { action: "state" });
  const tempRow = withTemp.body.members.find((m) => m.id === temp.body.userId);
  ok(withTemp.body.members.length === 3 && tempRow && tempRow.name === "ZZTEST Temp" && tempRow.role === "member", "the member sees the new person on the crew, by name", JSON.stringify(withTemp.body.members));
  ok(tempRow && tempRow.signIn === "link" && tempRow.alerts === false && keys(tempRow, MEMBER_KEYS), "marked as someone who signs in with a link", JSON.stringify(tempRow));
  ok(withTemp.body.members.filter((m) => m.signIn === "code").map((m) => m.id).sort().join() === [owner.id, member.id].sort().join(), "and the two real accounts still sign in with a code");

  // ---- join: peek first, mint only when asked ------------------------------
  const peek = await call(null, { action: "join", token: temp.body.link, peek: true });
  is(peek, 200, "peeking at a link needs no sign-in");
  ok(peek.body.ok === true && peek.body.name === "ZZTEST Temp" && peek.body.crew === CREW, "it says who the link is for and which crew", peek.text);
  ok(peek.body.by === "ZZTEST Owner", "and who made it, by name", peek.text);
  ok(!("token_hash" in peek.body) && keys(peek.body, ["ok", "name", "crew", "by", "nameOpen"]), "a peek mints nothing", peek.text);
  ok(peek.body.nameOpen === false, "and it says the crew already has its name", peek.text);
  const peekBare = await call(null, { action: "join", token: tokenOf(temp.body.link), peek: true });
  ok(peekBare.status === 200 && peekBare.body.name === "ZZTEST Temp", "the bare token works as well as the whole link", peekBare.text);
  const peekPasted = await call(null, { action: "join", token: "Here is your link " + temp.body.link + " see you Saturday", peek: true });
  ok(peekPasted.status === 200 && peekPasted.body.name === "ZZTEST Temp", "so does the whole text message pasted in", peekPasted.text);
  const mintTemp = await call(null, { action: "join", token: temp.body.link }, "mint");
  is(mintTemp, 200, "joining mints a sign-in for a brand new person");
  ok(typeof mintTemp.body.token_hash === "string" && mintTemp.body.token_hash.length >= 20 && mintTemp.body.name === "ZZTEST Temp" && mintTemp.body.crew === CREW,
    "with the name, the crew and a one-time token_hash");
  refused(await call(null, { action: "join" }), 400, "join with no link is bad input");
  refused(await call(null, { action: "join", token: 12345 }), 400, "join with a number for a link is bad input");
  const dead = await call(null, { action: "join", token: "A".repeat(43), peek: true });
  ok(dead.status === 410 && dead.body.error === "That link is not good any more. Ask for a new one.", "an unknown link is a 410 in the contract's own words", dead.text);
  refused(await call(null, { action: "join", token: "not a link at all" }), 410, "so is junk");

  // ---- an invite with a phone: attached the second time, never doubled -----
  const p1 = await call(O, { action: "invite", name: "ZZTEST Phone", phone: PHONE });
  is(p1, 200, "the owner adds someone with a phone number nobody has");
  ok(p1.body.created === true && uuidLike(p1.body.userId) && LINK.test(p1.body.link) && p1.body.signIn === "link" && keys(p1.body, INVITE_KEYS),
    "a new account the invite made: a link, and signIn link", p1.text);
  linkTokens.push(tokenOf(p1.body.link));
  const p1mint = await call(null, { action: "join", token: p1.body.link }, "mint");
  ok(p1mint.status === 200 && typeof p1mint.body.token_hash === "string" && p1mint.body.name === "ZZTEST Phone" && p1mint.body.crew === CREW,
    "a phone account's link mints a sign-in too", p1mint.text.slice(0, 120));
  const p2 = await call(O, { action: "invite", name: "ZZTEST Phone Again", phone: PHONE_AGAIN });
  is(p2, 200, "the same number typed another way");
  ok(p2.body.created === false && p2.body.userId === p1.body.userId, "is the same person, attached, not a second account", p2.text);
  ok(p2.body.name === "ZZTEST Phone", "who keeps the name they already have", p2.text);
  ok(LINK.test(p2.body.link) && p2.body.link !== p1.body.link && p2.body.signIn === "link" && keys(p2.body, INVITE_KEYS), "and gets one more link", p2.text);
  linkTokens.push(tokenOf(p2.body.link));
  const p1still = await call(null, { action: "join", token: p1.body.link, peek: true });
  ok(p1still.status === 200 && p1still.body.name === "ZZTEST Phone", "adding someone twice does not kill the link already sent", p1still.text);
  const p2peek = await call(null, { action: "join", token: p2.body.link, peek: true });
  ok(p2peek.status === 200 && p2peek.body.name === "ZZTEST Phone", "and the new one works as well", p2peek.text);
  const four = await call(O, { action: "state" });
  ok(four.body.members.length === 4 && four.body.members.filter((m) => m.id === p1.body.userId).length === 1, "four on the crew, the phone person once", JSON.stringify(four.body.members.map((m) => m.name)));
  const p1new = await call(O, { action: "link", userId: p1.body.userId });
  ok(p1new.status === 200 && p1new.body.name === "ZZTEST Phone" && LINK.test(p1new.body.link), "the owner makes them a New link", p1new.text);
  linkTokens.push(tokenOf(p1new.body.link));
  refused(await call(null, { action: "join", token: p1.body.link, peek: true }), 410, "which revokes the first link: 410");
  refused(await call(null, { action: "join", token: p2.body.link }), 410, "and the second, which now mints nothing");
  ok((await call(null, { action: "join", token: p1new.body.link, peek: true })).status === 200, "only the newest is live");
  is(await call(O, { action: "member_remove", userId: p1.body.userId }), 200, "the owner removes them");
  refused(await call(null, { action: "join", token: p1new.body.link, peek: true }), 410, "their link dies with them");
  ok((await call(O, { action: "state" })).body.members.length === 3, "three on the crew again");
  const p3 = await call(O, { action: "invite", name: "ZZTEST Phone", phone: PHONE });
  ok(p3.status === 200 && p3.body.created === true && uuidLike(p3.body.userId) && p3.body.userId !== p1.body.userId,
    "un-inviting someone who never joined left no account behind: the number gets a new one", p3.text);
  linkTokens.push(tokenOf(p3.body.link));
  is(await call(O, { action: "member_remove", userId: p3.body.userId }), 200, "and that one is removed too");

  // ---- a link turns into a real session, for the person the invite made ----
  const a = await call(O, { action: "link", userId: temp.body.userId });
  is(a, 200, "the owner makes a new link for the person he added");
  ok(keys(a.body, ["ok", "name", "link"]) && a.body.name === "ZZTEST Temp" && LINK.test(a.body.link) && a.body.link !== temp.body.link, "ok, the name and the link", a.text);
  linkTokens.push(tokenOf(a.body.link));
  const old = await call(null, { action: "join", token: temp.body.link, peek: true });
  ok(old.status === 410 && old.body.error === "That link is not good any more. Ask for a new one.", "which revokes the one before it: 410", old.text);
  refused(await call(null, { action: "join", token: temp.body.link }), 410, "the revoked link mints nothing");
  const sess = await sessionFrom(a.body.link);
  ok(sess.minted.status === 200 && keys(sess.minted.body, ["ok", "name", "crew", "by", "nameOpen", "token_hash"]) && sess.minted.body.by === "ZZTEST Owner", "joining mints a token_hash", sess.minted.text.slice(0, 80));
  ok(sess.status === 200 && sess.token && sess.refresh && sess.id === temp.body.userId, "which the sign-in service turns into a real session for that person", sess.status);
  const T = sess.token;
  try {
    const joined = await call(T, { action: "state" });
    ok(joined.status === 200 && joined.body.me.id === temp.body.userId && joined.body.me.name === "ZZTEST Temp" && joined.body.crew && joined.body.crew.name === CREW && joined.body.crew.role === "member",
      "and that session's state shows the right person on the right crew", joined.text.slice(0, 160));
    const reuse = await call(null, { action: "join", token: a.body.link, peek: true });
    ok(reuse.status === 200 && reuse.body.name === "ZZTEST Temp", "the link still works afterwards: a phone that loses its sign-in can use the same text again", reuse.text);
    const b = await call(T, { action: "link", userId: temp.body.userId });
    ok(b.status === 200 && LINK.test(b.body.link) && b.body.link !== a.body.link, "someone the invite made can make their own link", b.text);
    linkTokens.push(tokenOf(b.body.link));
    refused(await call(null, { action: "join", token: a.body.link, peek: true }), 410, "which revokes the owner's one");
    const bPeek = await call(null, { action: "join", token: b.body.link, peek: true });
    ok(bPeek.status === 200 && bPeek.body.name === "ZZTEST Temp" && bPeek.body.crew === CREW && bPeek.body.by === null, "the new link is theirs, on the test crew, made by nobody else", bPeek.text);
    refused(await call(T, { action: "link", userId: member.id }), 403, "but they cannot make one for anybody else");
    refused(await call(T, { action: "invite", name: "ZZTEST Nope" }), 403, "or add someone");
    refused(await call(T, { action: "member_remove", userId: member.id }), 403, "or remove someone");
  } finally {
    // They have signed in, so removing them would rightly keep the account.
    // It is this test's own: delete it the way its owner would, with its own sign-in.
    const dropped = await dropAccount(T, temp.body.userId);
    ok(dropped === 200, "the account this test made deletes itself with its own sign-in", dropped);
  }
  ok((await call(O, { action: "state" })).body.members.length === 2, "the crew is the two of them again");
  refused(await call(T, { action: "state" }), 401, "the deleted account's session is no good any more");
  refused(await call(null, { action: "join", token: a.body.link }), 410, "and every link it had is dead");

  // ---- trips ---------------------------------------------------------------
  const today = todayIn(), soon = addDays(today, 3), later = addDays(today, 4);
  const c1 = crypto.randomUUID();
  const send1 = { action: "trip_create", planId: "squid-redondo", spotId: "redondo", species: "squid", title: "ZZTEST squid at Redondo",
    date: later, from: 17, to: 21, note: "ZZTEST leave at 4", clientId: c1 };
  const made = await call(M, send1);
  is(made, 200, "a member floats a trip");
  const T1 = made.body.trip;
  ok(keys(T1, TRIP_KEYS), "a trip has exactly the contract's fields", JSON.stringify(Object.keys(T1 || {})));
  ok(T1.status === "idea" && T1.planId === "squid-redondo" && T1.spotId === "redondo" && T1.species === "squid" && T1.title === "ZZTEST squid at Redondo" &&
    T1.date === later && T1.from === 17 && T1.to === 21 && T1.note === "ZZTEST leave at 4", "it comes back as sent, and an idea unless told otherwise", JSON.stringify(T1));
  ok(T1.by && T1.by.id === member.id && T1.by.name === "ZZTEST Member" && keys(T1.by, ["id", "name"]), "made by the member, by name");
  ok(T1.going.length === 1 && T1.going[0].id === member.id && T1.going[0].name === "ZZTEST Member" && T1.going[0].answer === "going", "the maker is marked going", JSON.stringify(T1.going));
  ok(same(T1.counts, { comments: 0, list: 0, listDone: 0, catches: 0 }) && isoTime(T1.updatedAt), "nothing on it yet, and updatedAt is a time");
  const resent = await call(M, send1);
  ok(resent.status === 200 && resent.body.trip.id === T1.id, "the same trip sent twice lands once", resent.text.slice(0, 120));
  ok((await call(O, { action: "state" })).body.trips.length === 1, "one trip on the crew, not two");
  const t2 = await call(O, { action: "trip_create", planId: "crab-westport", spotId: "westport", species: "crab", title: "ZZTEST crab off Westport", date: today, status: "planned" });
  const T2 = t2.body.trip;
  ok(t2.status === 200 && T2.status === "planned" && T2.from === null && T2.to === null && T2.note === null && T2.by.id === owner.id, "the owner plans one for today, no window, no note", t2.text.slice(0, 200));

  // a trip that starts with the run card's own gear list
  const send3 = { action: "trip_create", planId: "coho-green-river", spotId: "green-river", species: "coho", title: "ZZTEST coho on the Green", date: soon,
    clientId: crypto.randomUUID(), seedList: ["ZZTEST rod and reel", "  ZZTEST twitching jigs ", "ZZTEST net"] };
  const t3 = await call(O, send3);
  const T3 = t3.body.trip;
  ok(t3.status === 200 && T3.status === "idea", "and floats another, with the plan's gear lines", t3.text.slice(0, 120));
  ok(same(T3.counts, { comments: 0, list: 3, listDone: 0, catches: 0 }), "the list starts with the three gear lines", JSON.stringify(T3 && T3.counts));
  const seeded = await call(M, { action: "trip", tripId: T3.id });
  ok(seeded.body.list.map((i) => i.label).join("|") === "ZZTEST rod and reel|ZZTEST twitching jigs|ZZTEST net", "in order, trimmed", JSON.stringify(seeded.body.list.map((i) => i.label)));
  ok(seeded.body.list.every((i) => keys(i, ITEM_KEYS) && i.done === false && i.assignedTo === null && i.mine === false), "each one unticked, with nobody yet, and not the member's own to rename");
  const t3again = await call(O, send3);
  ok(t3again.status === 200 && t3again.body.trip.id === T3.id && t3again.body.trip.counts.list === 3, "the same trip sent twice has its list once, not six lines", t3again.text.slice(0, 160));
  const seedOwn = await call(O, { action: "list_update", itemId: seeded.body.list[0].id, assignedTo: member.id });
  ok(seedOwn.status === 200 && seedOwn.body.item.assignedTo.id === member.id && seedOwn.body.item.mine === true, "a starting line is handed out like any other", seedOwn.text);
  for (const [bad, why] of [[Array.from({ length: 41 }, (_, i) => "ZZTEST " + i), "41 lines"], ["ZZTEST rod", "words instead of a list"], [["ZZTEST rod", ""], "an empty line"],
    [["x".repeat(121)], "a 121 letter line"], [["ZZTEST rod", 7], "a number for a line"]]) {
    refused(await call(M, { ...send1, clientId: crypto.randomUUID(), seedList: bad }), 400, "a new trip is refused for a starting list with " + why);
  }

  for (const [bad, why] of [[{ date: "2026-02-30" }, "a date that is not real"], [{ date: addDays(today, 400) }, "a date over a year out"], [{ date: addDays(today, -31) }, "a date 31 days back"],
    [{ planId: "Squid Redondo" }, "a plan id with a space"], [{ spotId: "" }, "no spot"], [{ title: "" }, "no title"], [{ title: "x".repeat(121) }, "a 121 letter title"],
    [{ note: "x".repeat(281) }, "a 281 letter note"], [{ status: "done" }, "starting out done"], [{ from: 21, to: 17 }, "a window that runs backwards"],
    [{ from: -1 }, "an hour before midnight"], [{ to: 25 }, "an hour past midnight"], [{ species: "" }, "no fish"], [{ clientId: "nope" }, "a mangled client id"],
    [{ tell: "everyone" }, "a word for who to tell"], [{ tell: ["nope"] }, "a mangled id in who to tell"]]) {
    refused(await call(M, { ...send1, clientId: crypto.randomUUID(), ...bad }), 400, "a new trip is refused for " + why);
  }
  const three = await call(M, { action: "state" });
  ok(three.body.trips.length === 3 && three.body.trips.map((t) => t.id).join() === [T2.id, T3.id, T1.id].join(), "none of those made a trip, and the three come oldest first", three.body.trips.map((t) => t.date).join());

  // who may change what
  const up = (tok, tripId, f) => call(tok, { action: "trip_update", tripId, ...f });
  const raised = await up(M, T3.id, { status: "planned" });
  ok(raised.status === 200 && raised.body.trip.status === "planned" && keys(raised.body.trip, TRIP_KEYS), "anyone raises an idea to planned", raised.text.slice(0, 120));
  refused(await up(M, T3.id, { status: "idea" }), 403, "but only the maker or the owner puts it back");
  refused(await up(M, T3.id, { status: "done" }), 403, "a member cannot mark someone else's future trip done");
  refused(await up(M, T3.id, { title: "ZZTEST renamed" }), 403, "or rename it");
  refused(await up(M, T3.id, { date: later }), 403, "or move it");
  ok((await up(M, T3.id, { status: "planned", title: "ZZTEST coho on the Green" })).status === 200, "sending back what is already there changes nothing and is fine");
  ok((await up(O, T3.id, { status: "idea" })).body.trip.status === "idea", "the owner puts it back to an idea");
  const doneToday = await up(M, T2.id, { status: "done" });
  ok(doneToday.status === 200 && doneToday.body.trip.status === "done", "anyone marks a trip done once its day has come", doneToday.text.slice(0, 120));
  refused(await up(M, T2.id, { status: "planned" }), 403, "but only the maker or the owner reopens it");
  refused(await up(O, T2.id, { status: "idea" }), 400, "done never goes straight back to an idea");
  ok((await up(O, T2.id, { status: "planned" })).body.trip.status === "planned", "the owner reopens it");
  const edited = await up(M, T1.id, { title: " ZZTEST squid, late ", note: "", date: soon, from: 18, to: 22 });
  ok(edited.status === 200 && edited.body.trip.title === "ZZTEST squid, late" && edited.body.trip.note === null && edited.body.trip.date === soon &&
    edited.body.trip.from === 18 && edited.body.trip.to === 22, "the maker changes the title, note, date and window", edited.text.slice(0, 200));
  ok(Date.parse(edited.body.trip.updatedAt) > Date.parse(T1.updatedAt), "and updatedAt moves forward");
  ok((await up(M, T1.id, { status: "done" })).body.trip.status === "done", "the maker marks their own trip done ahead of the day");
  ok((await up(M, T1.id, { status: "planned" })).body.trip.status === "planned", "and reopens it");
  ok((await up(M, T1.id, { status: "idea" })).body.trip.status === "idea", "and puts it back to an idea");
  refused(await up(M, T1.id, { status: "cancelled" }), 400, "a made-up status is bad input");
  refused(await up(M, T1.id, {}), 400, "nothing to change is bad input");
  refused(await up(M, T1.id, { tell: [] }), 400, "who to tell, with nothing to tell them, is bad input");
  refused(await up(M, T1.id, { to: 3 }), 400, "an end before the start already there is bad input");
  refused(await up(M, T1.id, { date: "2026-02-30" }), 400, "a date that is not real is bad input");
  refused(await up(M, T1.id, { from: "soon" }), 400, "a word for an hour is bad input");
  const ghost = NOBODY();
  refused(await call(M, { action: "trip", tripId: ghost }), 404, "a trip id from no crew: 404 to read");
  refused(await up(M, ghost, { status: "planned" }), 404, "404 to change");
  refused(await call(O, { action: "trip_delete", tripId: ghost }), 404, "404 to delete");
  refused(await call(M, { action: "going", tripId: ghost, answer: "going" }), 404, "404 to answer");
  refused(await call(M, { action: "comment_add", tripId: ghost, body: "ZZTEST" }), 404, "404 to leave a note on");
  refused(await call(M, { action: "list_add", tripId: ghost, label: "ZZTEST" }), 404, "404 to add to its list");
  refused(await call(M, { action: "catch_link", tripId: ghost, catchId: NOBODY() }), 404, "404 to put a catch on");
  refused(await call(M, { action: "trip", tripId: "nope" }), 400, "a mangled trip id is bad input, not a crash");
  refused(await call(M, { action: "trip" }), 400, "no trip id is bad input");
  refused(await call(M, { action: "trip", tripId: { $ne: null } }), 400, "an object for a trip id is bad input");

  // ---- going ---------------------------------------------------------------
  const g1 = await call(O, { action: "going", tripId: T1.id, answer: "maybe" });
  is(g1, 200, "the owner answers maybe");
  ok(keys(g1.body, ["ok", "going"]) && g1.body.going.length === 2 && g1.body.going.every((g) => keys(g, ["id", "name", "answer"])), "the answer lists everyone who has answered, by name", g1.text);
  ok(g1.body.going.find((g) => g.id === member.id).answer === "going" && g1.body.going.find((g) => g.id === owner.id).answer === "maybe" &&
    g1.body.going.find((g) => g.id === owner.id).name === "ZZTEST Owner", "the member going, the owner maybe");
  const g2 = await call(O, { action: "going", tripId: T1.id, answer: "out" });
  ok(g2.status === 200 && g2.body.going.length === 2 && g2.body.going.find((g) => g.id === owner.id).answer === "out", "a changed answer replaces the old one", g2.text);
  refused(await call(O, { action: "going", tripId: T1.id, answer: "yes" }), 400, "an answer that is not going, maybe or out is bad input");
  refused(await call(O, { action: "going", tripId: T1.id }), 400, "no answer is bad input");

  // ---- notes ---------------------------------------------------------------
  const k1 = crypto.randomUUID();
  const n1 = await call(M, { action: "comment_add", tripId: T1.id, section: "gear", body: "  ZZTEST bring the long net ", clientId: k1 });
  is(n1, 200, "a member pins a note to the gear section");
  const M1 = n1.body.comment;
  ok(keys(M1, NOTE_KEYS) && M1.section === "gear" && M1.body === "ZZTEST bring the long net" && M1.by.id === member.id && M1.by.name === "ZZTEST Member" && M1.mine === true && isoTime(M1.at),
    "it comes back trimmed, pinned, by name, and theirs", n1.text);
  const n1again = await call(M, { action: "comment_add", tripId: T1.id, section: "gear", body: "ZZTEST bring the long net", clientId: k1 });
  ok(n1again.status === 200 && n1again.body.comment.id === M1.id, "the same clientId returns the same note, not a second one", n1again.text);
  const n2 = await call(O, { action: "comment_add", tripId: T1.id, body: "ZZTEST I can drive" });
  const O1 = n2.body.comment;
  ok(n2.status === 200 && O1.section === null && O1.by.id === owner.id && O1.mine === true, "a note with no section is a note on the whole trip", n2.text);
  const n3 = await call(M, { action: "comment_add", tripId: T1.id, section: "plan", body: "ZZTEST meet at the pier" });
  const M2 = n3.body.comment;
  ok(n3.status === 200 && M2.section === "plan" && M2.id !== M1.id, "a second note from the member");
  refused(await call(M, { action: "comment_add", tripId: T1.id, section: "chat", body: "ZZTEST" }), 400, "a section the run card does not have is bad input");
  refused(await call(M, { action: "comment_add", tripId: T1.id, body: "   " }), 400, "an empty note is bad input");
  refused(await call(M, { action: "comment_add", tripId: T1.id, body: "x".repeat(1001) }), 400, "a 1001 letter note is bad input");
  refused(await call(M, { action: "comment_add", tripId: T1.id, body: "ZZTEST", clientId: "nope" }), 400, "a mangled client id is bad input");
  refused(await call(M, { action: "comment_add", tripId: T1.id, body: "ZZTEST never saved", tell: "everyone" }), 400, "a word for who to tell is bad input");
  const full3 = await call(O, { action: "trip", tripId: T1.id });
  ok(full3.body.comments.length === 3 && full3.body.trip.counts.comments === 3, "three notes on the trip: the resend did not add a fourth, and the refused one was never saved", JSON.stringify(full3.body.trip.counts));
  refused(await call(M, { action: "comment_delete", commentId: O1.id }), 403, "a member cannot delete someone else's note");
  is(await call(O, { action: "comment_delete", commentId: M1.id }), 200, "the owner can delete anyone's note");
  is(await call(M, { action: "comment_delete", commentId: M2.id }), 200, "a member deletes their own");
  is(await call(M, { action: "comment_delete", commentId: M2.id }), 200, "deleting it twice is still fine");
  refused(await call(M, { action: "comment_delete", commentId: NOBODY() }), 404, "a note that does not exist: 404");
  refused(await call(M, { action: "comment_delete", commentId: "nope" }), 400, "a mangled note id is bad input");

  // ---- the list ------------------------------------------------------------
  const l1 = crypto.randomUUID();
  const i1 = await call(O, { action: "list_add", tripId: T1.id, label: " ZZTEST ring nets ", assignedTo: member.id, clientId: l1 });
  is(i1, 200, "the owner adds a line and hands it to the member");
  const I1 = i1.body.item;
  ok(keys(I1, ITEM_KEYS) && I1.label === "ZZTEST ring nets" && I1.assignedTo.id === member.id && I1.assignedTo.name === "ZZTEST Member" && I1.done === false && I1.mine === true,
    "trimmed, assigned by name, not done, and the owner's to rename", i1.text);
  const i1again = await call(O, { action: "list_add", tripId: T1.id, label: "ZZTEST ring nets", assignedTo: member.id, clientId: l1 });
  ok(i1again.status === 200 && i1again.body.item.id === I1.id, "the same clientId returns the same line", i1again.text);
  const i2 = await call(M, { action: "list_add", tripId: T1.id, label: "ZZTEST bait" });
  const I2 = i2.body.item;
  ok(i2.status === 200 && I2.assignedTo === null && I2.mine === true, "the member adds a line nobody has yet", i2.text);
  const lu = (tok, itemId, f) => call(tok, { action: "list_update", itemId, ...f });
  const ticked = await lu(M, I1.id, { done: true });
  ok(ticked.status === 200 && ticked.body.item.done === true && ticked.body.item.mine === false && keys(ticked.body.item, ITEM_KEYS), "anyone ticks a line", ticked.text);
  const handed = await lu(M, I1.id, { assignedTo: owner.id });
  ok(handed.status === 200 && handed.body.item.assignedTo.id === owner.id && handed.body.item.assignedTo.name === "ZZTEST Owner" && handed.body.item.done === true, "anyone hands a line to someone", handed.text);
  const freed = await lu(M, I1.id, { assignedTo: null });
  ok(freed.status === 200 && freed.body.item.assignedTo === null, "or to nobody", freed.text);
  refused(await lu(M, I1.id, { label: "ZZTEST my nets now" }), 403, "a member who did not add a line cannot rename it");
  const sameLabel = await lu(M, I1.id, { label: "ZZTEST ring nets", done: false });
  ok(sameLabel.status === 200 && sameLabel.body.item.done === false && sameLabel.body.item.label === "ZZTEST ring nets", "sending the label unchanged with a tick is not a rename", sameLabel.text);
  const ownerRenames = await lu(O, I2.id, { label: "ZZTEST herring" });
  ok(ownerRenames.status === 200 && ownerRenames.body.item.label === "ZZTEST herring" && ownerRenames.body.item.mine === false, "the owner renames anyone's line", ownerRenames.text);
  ok((await lu(M, I2.id, { label: "ZZTEST herring, two packs" })).body.item.label === "ZZTEST herring, two packs", "the adder renames their own");
  refused(await lu(M, I1.id, { done: "yes" }), 400, "done is a yes or a no, not a word");
  refused(await lu(M, I1.id, { assignedTo: NOBODY() }), 400, "a line cannot go to someone who is not on the crew");
  refused(await lu(M, I1.id, {}), 400, "nothing to change is bad input");
  refused(await lu(M, I1.id, { label: "" }), 400, "an empty label is bad input");
  refused(await lu(M, I1.id, { done: true, tell: [7] }), 400, "a number for who to tell is bad input");
  refused(await lu(M, NOBODY(), { done: true }), 404, "a line that does not exist: 404");
  refused(await call(M, { action: "list_add", tripId: T1.id, label: "" }), 400, "a new line needs words");
  refused(await call(M, { action: "list_add", tripId: T1.id, label: "x".repeat(121) }), 400, "and not 121 of them");
  refused(await call(M, { action: "list_add", tripId: T1.id, label: "ZZTEST", assignedTo: NOBODY() }), 400, "a new line cannot go to a stranger");
  refused(await call(M, { action: "list_delete", itemId: I1.id }), 403, "a member cannot take off a line they did not add");
  is(await call(O, { action: "list_delete", itemId: I2.id }), 200, "the owner takes off anyone's line");
  refused(await call(O, { action: "list_delete", itemId: I2.id }), 404, "which is then gone");
  const beforeTick = (await call(M, { action: "trip", tripId: T1.id })).body.trip.updatedAt;
  ok((await lu(O, I1.id, { done: true })).body.item.done === true, "the owner ticks the line that is left");

  // ---- catches: rows in CastAI's own catch log, linked to the trip ---------
  refused(await call(M, { action: "catch_add", tripId: T2.id, species: "crab" }), 400, "the first way of logging a catch is gone");
  const F1 = crypto.randomUUID(), F2 = crypto.randomUUID();
  const caught = new Date(Date.now() - 3600e3).toISOString();
  const photo = PHOTOS + member.id + "/" + F1 + ".jpg"; // a made-up address in the member's own folder. Nothing is uploaded.
  const logged1 = await logCatch(member, { id: F1, species: " Dungeness crab ", catch_date: caught, weight: 1.5, length: 6.5, photo_url: photo,
    spot_name: "ZZTEST Westport", notes: "ZZTEST keeper", lure: "chicken" });
  const logged2 = await logCatch(member, { id: F2, species: "red rock crab", catch_date: caught, photo_url: "https://example.invalid/not-in-catch-photos.jpg", spot_name: "ZZTEST Westport" });
  if (!ok(logged1 >= 200 && logged1 < 300 && logged2 >= 200 && logged2 < 300, "the member logs two catches in their own CastAI catch log, with their own sign-in", `${logged1} ${logged2}`)) return;
  const ca = await call(M, { action: "catch_link", tripId: T2.id, catchId: F1 });
  is(ca, 200, "and puts the first on today's trip");
  const C1 = ca.body.catch;
  ok(keys(ca.body, ["ok", "catch"]) && keys(C1, CATCH_KEYS), "a catch has exactly the contract's fields, the photo among them", JSON.stringify(Object.keys(C1 || {})));
  ok(C1.id === F1 && C1.species === "Dungeness crab" && C1.lengthIn === 6.5 && C1.weightLb === 1.5 && C1.lure === "chicken" && C1.notes === "ZZTEST keeper",
    "it is the CastAI catch itself: same id, the fish, inches and pounds, the lure and the note", ca.text);
  ok(C1.photoUrl === photo, "with the photo from the angler's own folder", C1.photoUrl);
  ok(C1.by.id === member.id && C1.by.name === "ZZTEST Member" && C1.mine === true && C1.at === caught, "by name, theirs, at the time the fish was caught", ca.text);
  const caAgain = await call(M, { action: "catch_link", tripId: T2.id, catchId: F1 });
  ok(caAgain.status === 200 && caAgain.body.catch.id === F1, "linking the same catch again hands back the same one", caAgain.text);
  const cb = await call(M, { action: "catch_link", tripId: T2.id, catchId: F2 });
  const C2 = cb.body.catch;
  ok(cb.status === 200 && C2.id === F2 && C2.species === "red rock crab" && C2.lengthIn === null && C2.weightLb === null && C2.lure === null && C2.notes === null, "only the fish is needed", cb.text);
  ok(C2.photoUrl === null, "a photo address that is not in the angler's own catch-photos folder is not passed on", cb.text);
  const two = await call(O, { action: "trip", tripId: T2.id });
  ok(two.body.catches.length === 2 && two.body.trip.counts.catches === 2 && two.body.catches.every((c) => keys(c, CATCH_KEYS) && c.mine === false && c.by.id === member.id),
    "the owner sees both on the trip, by name, and not as his own: the resend did not add a third", JSON.stringify(two.body.trip.counts));
  ok(two.body.catches.find((c) => c.id === F1).photoUrl === photo, "the crew sees the photo too");
  refused(await call(O, { action: "catch_link", tripId: T2.id, catchId: F1 }), 404, "nobody links a catch that is someone else's: it reads as not there");
  refused(await call(O, { action: "catch_link", tripId: T1.id, catchId: F2 }), 404, "on any trip");
  refused(await call(M, { action: "catch_link", tripId: T2.id, catchId: NOBODY() }), 404, "a catch that is in no log: 404");
  refused(await call(M, { action: "catch_link", tripId: T1.id, catchId: F1 }), 400, "one catch is on one trip: it cannot go on a second");
  refused(await call(M, { action: "catch_link", tripId: T2.id, catchId: "nope" }), 400, "a mangled catch id is bad input");
  refused(await call(M, { action: "catch_link", tripId: T2.id }), 400, "no catch id is bad input");
  refused(await call(M, { action: "catch_link", tripId: T2.id, catchId: F1, tell: {} }), 400, "an object for who to tell is bad input");
  refused(await call(O, { action: "catch_delete", catchId: F1 }), 403, "not even the owner takes someone else's catch off a trip");
  is(await call(M, { action: "catch_delete", catchId: F2 }), 200, "its own angler does");
  refused(await call(M, { action: "catch_delete", catchId: F2 }), 404, "and then it is off the trip");
  refused(await call(M, { action: "catch_delete", catchId: "nope" }), 400, "a mangled catch id is bad input");
  ok((await loggedCount(member)) === 2, "taking a catch off a trip leaves it in the angler's own CastAI log", await loggedCount(member));
  const relinked = await call(M, { action: "catch_link", tripId: T2.id, catchId: F2 });
  ok(relinked.status === 200 && relinked.body.catch.id === F2, "so it can go back on");
  const gone2 = await unlogCatch(member, F2);
  const afterGone = await call(O, { action: "trip", tripId: T2.id });
  ok(gone2 >= 200 && gone2 < 300 && afterGone.body.catches.length === 1 && afterGone.body.catches[0].id === F1 && afterGone.body.trip.counts.catches === 1,
    "deleting a catch in CastAI's own log takes it off the trip as well", `${gone2} ${JSON.stringify(afterGone.body.trip.counts)}`);

  // ---- the whole trip, as each of them sees it -----------------------------
  const asM = await call(M, { action: "trip", tripId: T1.id }), asO = await call(O, { action: "trip", tripId: T1.id });
  is(asM, 200, "the member opens the whole trip"); is(asO, 200, "so does the owner");
  ok(keys(asM.body, ["trip", "comments", "list", "catches"]) && keys(asM.body.trip, TRIP_KEYS), "trip, comments, list and catches");
  ok(Date.parse(asM.body.trip.updatedAt) > Date.parse(beforeTick), "a tick moved the trip's updatedAt forward");
  ok(asM.body.trip.title === "ZZTEST squid, late" && asM.body.trip.status === "idea" && asM.body.trip.by.id === member.id, "the trip as it now stands");
  ok(asM.body.trip.going.length === 2 && asM.body.trip.going.find((g) => g.id === owner.id).answer === "out", "who is going");
  ok(asM.body.comments.length === 1 && asM.body.comments[0].id === O1.id && asM.body.comments[0].body === "ZZTEST I can drive" && keys(asM.body.comments[0], NOTE_KEYS),
    "the two deleted notes are hidden, the owner's is left", JSON.stringify(asM.body.comments));
  ok(asM.body.comments[0].mine === false && asO.body.comments[0].mine === true, "the note is the owner's own, and not the member's");
  ok(asM.body.list.length === 1 && asM.body.list[0].id === I1.id && asM.body.list[0].done === true && asM.body.list[0].assignedTo === null && keys(asM.body.list[0], ITEM_KEYS),
    "one line left on the list, ticked, with nobody", JSON.stringify(asM.body.list));
  ok(asM.body.list[0].mine === false && asO.body.list[0].mine === true, "the line is the owner's own, and not the member's");
  ok(asM.body.catches.length === 0, "no catches on this one");
  ok(same(asM.body.trip.counts, { comments: 1, list: 1, listDone: 1, catches: 0 }), "the counts match what is there", JSON.stringify(asM.body.trip.counts));
  const crabM = await call(M, { action: "trip", tripId: T2.id }), crabO = await call(O, { action: "trip", tripId: T2.id });
  ok(crabM.body.catches.length === 1 && crabM.body.catches[0].id === F1 && crabM.body.catches[0].mine === true && crabO.body.catches[0].mine === false && keys(crabM.body.catches[0], CATCH_KEYS),
    "today's trip shows the member's catch, theirs to them and not to the owner", JSON.stringify(crabM.body.catches));
  const end = await call(M, { action: "state" });
  const inState = (id) => end.body.trips.find((t) => t.id === id);
  ok(end.body.trips.length === 3 && end.body.trips.every((t) => keys(t, TRIP_KEYS)), "state lists the three trips in the contract's shape");
  ok(same(inState(T1.id).counts, { comments: 1, list: 1, listDone: 1, catches: 0 }), "state carries the same counts for the first", JSON.stringify(inState(T1.id).counts));
  ok(same(inState(T2.id).counts, { comments: 0, list: 0, listDone: 0, catches: 1 }), "and for today's", JSON.stringify(inState(T2.id).counts));
  ok(same(inState(T3.id).counts, { comments: 0, list: 3, listDone: 0, catches: 0 }), "and the seeded one", JSON.stringify(inState(T3.id).counts));
  ok(inState(T1.id).updatedAt === asM.body.trip.updatedAt, "state and the trip agree on when it last changed");
  ok(end.body.trips.map((t) => t.id).join() === [T2.id, T1.id, T3.id].join(), "still oldest first, and on the same day the one with a start time comes first",
    end.body.trips.map((t) => t.title).join(" | "));

  // ---- bad requests: the right status, never a 500 --------------------------
  refused(await call(M, "{ not json"), 400, "bad JSON from a signed-in phone is a 400");
  refused(await call(M, "[1,2,3]"), 400, "a list instead of an object is a 400");
  refused(await call(M, "null"), 400, "null is a 400");
  refused(await call(M, { action: "make_coffee" }), 400, "an action it does not have is a 400");
  refused(await call(M, { action: "constructor" }), 400, "an action named after something built in is still a 400");
  refused(await call(M, { action: "__proto__" }), 400, "so is this one");
  refused(await call(M, {}), 400, "no action is a 400");
  refused(await call(M, { action: 7 }), 400, "a number for an action is a 400");
  refused(await call(M, { action: "comment_add", tripId: T1.id, body: "x".repeat(25000) }), 400, "far too much to send is a 400");
  refused(await call(null, { action: "state" }), 401, "state with no token is a 401");
  refused(await call(null, { action: "trip_create", ...send1 }), 401, "a write with no token is a 401");
  refused(await call(null, { action: "prefs_set", texts: true }), 401, "switching alerts on with no token is a 401");
  refused(await call(null, { action: "test_alert" }), 401, "so is asking for a test alert");
  refused(await call(null, "{ not json"), 401, "junk with no token is a 401");
  refused(await call("not.a.real.token", { action: "state" }), 401, "a made-up token is a 401");
  refused(await call(KEY, { action: "state" }), 401, "the publishable key is not a person: 401");
  const get = await fetch(FN, { headers: { apikey: KEY } }).then((r) => r.status).catch(() => 0);
  ok(get === 405, "GET is not how you talk to it", get);
  const pre = await fetch(FN, { method: "OPTIONS", headers: { Origin: "https://coachpilot.org", "Access-Control-Request-Method": "POST" } }).catch(() => null);
  ok(pre && pre.status < 300 && pre.headers.get("access-control-allow-origin") === "*", "the page's preflight is answered", pre && pre.status);

  // ---- with alerts off, all of that told nobody anything -------------------
  const quietO = await alertsOf(O), quietM = await alertsOf(M);
  ok(quietO.length === 0 && quietM.length === 0, "three trips, notes, list lines and catches, and with alerts off not one alert was queued for anyone", `${quietO.length} ${quietM.length}`);

  // ---- deleting trips ------------------------------------------------------
  refused(await call(M, { action: "trip_delete", tripId: T2.id }), 403, "a member cannot delete someone else's trip");
  is(await call(M, { action: "trip_delete", tripId: T1.id }), 200, "the maker deletes their own");
  refused(await call(M, { action: "trip", tripId: T1.id }), 404, "and it is gone, with everything on it");
  refused(await call(O, { action: "comment_delete", commentId: O1.id }), 404, "its notes went with it");
  refused(await lu(O, I1.id, { done: false }), 404, "and its list");
  is(await call(O, { action: "trip_delete", tripId: T2.id }), 200, "the owner deletes today's");
  refused(await call(M, { action: "catch_delete", catchId: F1 }), 404, "the catch is off the deleted trip");
  ok((await loggedCount(member)) === 1, "but still in the angler's own CastAI log: deleting a trip deletes nobody's fish", await loggedCount(member));
  const gone1 = await unlogCatch(member, F1);
  ok(gone1 >= 200 && gone1 < 300 && (await loggedCount(member)) === 0, "the test deletes it there itself", gone1);
  is(await call(O, { action: "trip_delete", tripId: T3.id }), 200, "and the last trip");

  await alerts({ soon, later, up, lu });
}

// ---- alerts ----------------------------------------------------------------
// Everything from here runs with texts switched on for two accounts that have
// no phone number, so every alert can be read in the outbox and none can be sent.
async function alerts({ soon, later, up, lu }) {
  const NO_QUIET = { quietFrom: 0, quietTo: 0 }; // so the hour this runs at never holds a row by itself
  const clearBoth = async () => { await settled(O); await settled(M); await call(O, { action: "outbox_clear" }); await call(M, { action: "outbox_clear" }); };
  const mk = async (tok, title, extra) => (await call(tok, { action: "trip_create", planId: "squid-redondo", spotId: "redondo", species: "squid", title, date: soon, ...(extra || {}) })).body.trip;
  const going = (tok, tripId, answer) => call(tok, { action: "going", tripId, answer });
  const note = (tok, tripId, body, extra) => call(tok, { action: "comment_add", tripId, body, ...(extra || {}) });
  const skippedNoPhone = (r) => r && r.status === "skipped" && r.why === "no phone" && r.channel === null && isoTime(r.sentAt);

  // what a person has switched on
  const pg0 = await call(M, { action: "prefs_get" });
  is(pg0, 200, "a member reads their alert switches");
  ok(keys(pg0.body, PREFS_KEYS) && same(pg0.body.prefs, ALL_OFF), "both channels off, all four kinds ready, quiet from 9 at night to 6", pg0.text);
  ok(pg0.body.hasPhone === false && pg0.body.pushSubs === 0 && pg0.body.pushFails === 0, "no number on the account and no phone asking for alerts", pg0.text);
  const ta0 = await call(M, { action: "test_alert" });
  ok(ta0.status === 200 && same(ta0.body, { ok: true, push: "none", text: "none" }), "a test alert with nothing switched on goes nowhere: none and none", ta0.text);
  const tr0 = await settled(M);
  ok(tr0.length === 1 && keys(tr0[0], ALERT_KEYS) && tr0[0].kind === "test" && tr0[0].title === "Rig Card test" && tr0[0].body === "It works." && tr0[0].url === "https://coachpilot.org/rigs/#/crew",
    "it is kept in the outbox, in the contract's words", JSON.stringify(tr0));
  ok(tr0[0].status === "skipped" && tr0[0].why === "alerts off" && tr0[0].channel === null && tr0[0].tripId === null && tr0[0].by.id === member.id && isoTime(tr0[0].at) && isoTime(tr0[0].sendAfter),
    "skipped, because alerts are off", JSON.stringify(tr0[0]));
  for (const [bad, why] of [[{}, "nothing to change"], [{ texts: "yes" }, "a word for a switch"], [{ quietFrom: 24 }, "hour 24"], [{ quietTo: -1 }, "an hour below zero"], [{ quietFrom: 9.5 }, "half an hour"],
    [{ evNotes: null }, "nothing for a switch"]]) {
    refused(await setPrefs(M, bad), 400, "prefs are refused for " + why);
  }
  ok(same((await call(M, { action: "prefs_get" })).body.prefs, ALL_OFF), "none of those changed anything");
  const on1 = await setPrefs(M, { texts: true, ...NO_QUIET });
  ok(on1.status === 200 && keys(on1.body, PREFS_KEYS) && same(on1.body.prefs, { ...ALL_OFF, texts: true, quietFrom: 0, quietTo: 0 }) && on1.body.hasPhone === false,
    "the member switches texts on: the answer is the same shape, with only that changed", on1.text);
  const flags = (await call(O, { action: "state" })).body.members;
  ok(flags.find((m) => m.id === member.id).alerts === true && flags.find((m) => m.id === owner.id).alerts === false, "the crew now sees the member can be told, and the owner cannot");
  const ta1 = await call(M, { action: "test_alert" });
  ok(ta1.status === 200 && same(ta1.body, { ok: true, push: "none", text: "none" }), "a test with texts on and no number still goes nowhere", ta1.text);
  ok(skippedNoPhone((await settled(M))[0]), "and its row ends skipped for want of a number: no text was sent", JSON.stringify((await alertsOf(M))[0]));
  is(await setPrefs(O, { texts: true, ...NO_QUIET }), 200, "the owner switches texts on too");
  ok((await call(M, { action: "state" })).body.members.every((m) => m.alerts === true), "now both can be told");

  // ---- a new trip: everyone else on the crew -------------------------------
  await clearBoth();
  const A1 = await mk(O, "ZZTEST alerts one");
  let mRows = await settled(M), oRows = await settled(O);
  ok(mRows.length === 1 && keys(mRows[0], ALERT_KEYS) && mRows[0].kind === "trip_new", "the owner floats a trip, and the member has one alert", JSON.stringify(mRows));
  ok(mRows[0].title === "ZZTEST Owner floated a trip" && mRows[0].body === "ZZTEST alerts one, " + dayLabel(soon) && mRows[0].url === tripLink(A1.id),
    "who did what, the trip and its day, and the link that opens it", JSON.stringify(mRows[0]));
  ok(mRows[0].tripId === A1.id && mRows[0].by.id === owner.id && mRows[0].by.name === "ZZTEST Owner" && keys(mRows[0].by, ["id", "name"]), "about that trip, from the owner by name");
  ok(skippedNoPhone(mRows[0]), "texts on with no number: the row ends skipped, never sent", JSON.stringify(mRows[0]));
  ok(oRows.length === 0, "the person who did it is not told");
  const A2 = await mk(M, "ZZTEST alerts two", { status: "planned" });
  oRows = await settled(O);
  ok(oRows.length === 1 && oRows[0].kind === "trip_new" && oRows[0].title === "ZZTEST Member planned a trip" && oRows[0].by.id === member.id && skippedNoPhone(oRows[0]),
    "the member plans one, and the owner is told", JSON.stringify(oRows));
  ok((await settled(M)).length === 1, "the member is not told about their own");

  // ---- it is on, it moved, it was called off: going or maybe, plus the maker
  await clearBoth();
  await up(O, A1.id, { status: "planned" });
  ok((await settled(M)).length === 0, "someone who has not answered, on a trip they did not make, is not told it is on");
  await going(M, A1.id, "maybe");
  await up(O, A1.id, { date: later });
  mRows = await settled(M);
  ok(mRows.length === 1 && mRows[0].kind === "trip_status" && mRows[0].title === "ZZTEST Owner moved the day" && mRows[0].body === "ZZTEST alerts one, " + dayLabel(later) && mRows[0].tripId === A1.id,
    "a maybe is told when the day moves, with the new day", JSON.stringify(mRows));
  await going(M, A1.id, "out");
  await up(O, A1.id, { from: 6, to: 9 });
  ok((await settled(M)).length === 1, "someone who is out is not told the time changed");
  await going(M, A2.id, "out");
  await up(O, A2.id, { status: "idea" });
  mRows = await settled(M);
  ok(mRows.length === 2 && mRows[0].kind === "trip_status" && mRows[0].title === "ZZTEST Owner called it off" && mRows[0].tripId === A2.id,
    "the maker is told their trip was called off, even after saying they are out", JSON.stringify(mRows.map((r) => r.title)));
  await up(O, A2.id, { status: "planned" });
  mRows = await settled(M);
  ok(mRows.length === 3 && mRows[0].title === "ZZTEST Owner says it is on", "and that it is on again", JSON.stringify(mRows.map((r) => r.title)));
  await up(O, A2.id, { title: "ZZTEST alerts two, renamed" });
  ok((await settled(M)).length === 3, "a new title is not news");
  await up(O, A2.id, { from: 7, to: 10 });
  mRows = await settled(M);
  ok(mRows.length === 4 && mRows[0].title === "ZZTEST Owner changed the time" && mRows[0].body === "ZZTEST alerts two, renamed, " + dayLabel(soon), "a new window is", JSON.stringify(mRows[0]));
  ok(mRows.every(skippedNoPhone) && (await settled(O)).length === 0, "every one of those ended skipped, and the owner who did them all was told nothing");

  // ---- a note: going or maybe, plus the maker, and not twice in two minutes -
  await clearBoth();
  await note(O, A1.id, "ZZTEST alert note one");
  ok((await settled(M)).length === 0, "a note on a trip the member is out of, and did not make, tells them nothing");
  await going(M, A1.id, "going");
  await note(O, A1.id, "ZZTEST alert note two");
  mRows = await settled(M);
  ok(mRows.length === 1 && mRows[0].kind === "note" && mRows[0].title === "ZZTEST Owner left a note" && mRows[0].tripId === A1.id && skippedNoPhone(mRows[0]), "once they are going, it does", JSON.stringify(mRows));
  await note(O, A1.id, "ZZTEST alert note three");
  mRows = await settled(M);
  ok(mRows.length === 2 && mRows[0].kind === "note" && mRows[0].status === "skipped" && mRows[0].why === "note too soon" && mRows[0].sentAt === null,
    "a second note from the same person on the same trip inside two minutes is held back", JSON.stringify(mRows[0]));
  const nk = crypto.randomUUID();
  await note(M, A1.id, "ZZTEST alert note from the member", { clientId: nk });
  oRows = await settled(O);
  ok(oRows.length === 1 && oRows[0].kind === "note" && oRows[0].title === "ZZTEST Member left a note" && skippedNoPhone(oRows[0]), "the maker is told about a note on their trip", JSON.stringify(oRows));
  await note(M, A1.id, "ZZTEST alert note from the member", { clientId: nk });
  ok((await settled(O)).length === 1 && (await settled(M)).length === 2, "the same note sent twice tells nobody twice, and its author is never told");

  // ---- a list line handed to you: that person --------------------------------
  await clearBoth();
  const g1 = (await call(O, { action: "list_add", tripId: A1.id, label: "ZZTEST ring nets", assignedTo: member.id })).body.item;
  mRows = await settled(M);
  ok(mRows.length === 1 && mRows[0].kind === "gear" && mRows[0].title === "ZZTEST Owner put you down for ZZTEST ring nets" && mRows[0].tripId === A1.id && skippedNoPhone(mRows[0]),
    "the member is told a line was handed to them", JSON.stringify(mRows));
  await call(O, { action: "list_add", tripId: A1.id, label: "ZZTEST lantern", assignedTo: owner.id });
  const g3 = (await call(M, { action: "list_add", tripId: A1.id, label: "ZZTEST bait" })).body.item;
  await lu(M, g1.id, { done: true });
  ok((await settled(M)).length === 1 && (await settled(O)).length === 0, "a line you take yourself, a line for nobody, and a tick tell nobody");
  await lu(M, g3.id, { assignedTo: owner.id });
  oRows = await settled(O);
  ok(oRows.length === 1 && oRows[0].kind === "gear" && oRows[0].title === "ZZTEST Member put you down for ZZTEST bait", "handing a line over later tells its new person", JSON.stringify(oRows));
  await lu(O, g3.id, { label: "ZZTEST herring" });
  await lu(M, g3.id, { assignedTo: owner.id });
  await lu(O, g1.id, { assignedTo: null });
  ok((await settled(O)).length === 1 && (await settled(M)).length === 1, "renaming it, handing it to who already has it, and handing it to nobody tell nobody");

  // ---- a fish on a trip: going or maybe, plus the maker ----------------------
  await clearBoth();
  const FISH = crypto.randomUUID();
  const loggedFish = await logCatch(member, { id: FISH, species: "coho", catch_date: new Date().toISOString(), spot_name: "ZZTEST alerts" });
  ok(loggedFish >= 200 && loggedFish < 300, "the member logs a coho in their own catch log", loggedFish);
  is(await call(M, { action: "catch_link", tripId: A1.id, catchId: FISH }), 200, "and puts it on the owner's trip");
  oRows = await settled(O);
  ok(oRows.length === 1 && oRows[0].kind === "catch" && oRows[0].title === "ZZTEST Member landed a coho" && oRows[0].tripId === A1.id && skippedNoPhone(oRows[0]), "the maker is told a fish was landed", JSON.stringify(oRows));
  await call(M, { action: "catch_link", tripId: A1.id, catchId: FISH });
  ok((await settled(O)).length === 1 && (await settled(M)).length === 0, "the same catch linked twice tells nobody twice, and its angler is never told");

  // ---- a kind switched off, a channel switched off --------------------------
  await clearBoth();
  await setPrefs(M, { evNotes: false });
  await note(O, A2.id, "ZZTEST alert note four");
  ok((await settled(M)).length === 0, "with notes switched off, the maker is not told about a note on their own trip");
  await setPrefs(M, { evNotes: true, texts: false });
  ok((await call(O, { action: "state" })).body.members.find((m) => m.id === member.id).alerts === false, "with their channel off, the crew sees they cannot be told");
  await up(O, A2.id, { date: later });
  ok((await settled(M)).length === 0, "and nothing is queued for them at all");
  await setPrefs(M, { texts: true });

  // ---- the sender chooses ----------------------------------------------------
  await clearBoth();
  await up(O, A2.id, { from: 8, to: 11, tell: [] });
  const A3 = await mk(O, "ZZTEST alerts three", { tell: [] });
  await note(O, A2.id, "ZZTEST alert note five", { tell: [] });
  await call(O, { action: "list_add", tripId: A2.id, label: "ZZTEST net", assignedTo: member.id, tell: [] });
  ok((await settled(M)).length === 0, "tell nobody: a moved trip, a new trip, a note and a handed line make no outbox rows at all");
  await up(O, A1.id, { from: 7, to: 10, tell: [] });
  await going(M, A1.id, "out");
  await up(O, A1.id, { from: 8, to: 11, tell: [member.id] });
  mRows = await settled(M);
  ok(mRows.length === 1 && mRows[0].kind === "trip_status" && mRows[0].title === "ZZTEST Owner changed the time" && mRows[0].tripId === A1.id,
    "tell one person by name: exactly that person, even though they are out", JSON.stringify(mRows));
  await up(O, A1.id, { from: 9, to: 12, tell: [owner.id] });
  await up(O, A1.id, { from: 10, to: 13, tell: [NOBODY()] });
  ok((await settled(M)).length === 1 && (await settled(O)).length === 0, "naming yourself, or someone who is not on the crew, tells nobody");
  refused(await up(O, A1.id, { from: 11, to: 14, tell: "everyone" }), 400, "a word for who to tell is bad input");
  refused(await up(O, A1.id, { from: 11, to: 14, tell: ["nope"] }), 400, "so is a mangled id");
  ok((await call(O, { action: "trip", tripId: A1.id })).body.trip.from === 10, "and a refused change is not made");
  await going(M, A3.id, "going");
  is(await call(O, { action: "trip_delete", tripId: A3.id }), 200, "the owner deletes a trip the member was going on");
  mRows = await settled(M);
  ok(mRows.length === 2 && mRows[0].kind === "trip_status" && mRows[0].title === "ZZTEST Owner deleted the trip" && mRows[0].body === "ZZTEST alerts three, " + dayLabel(soon),
    "they are told it was deleted", JSON.stringify(mRows[0]));
  ok(mRows[0].tripId === null && mRows[0].url === "https://coachpilot.org/rigs/#/trips" && skippedNoPhone(mRows[0]), "pointing at the trips tab, since the trip is not there to open");

  // ---- quiet hours hold a row, and nothing sends it early ---------------------
  await clearBoth();
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hourCycle: "h23", hour: "2-digit" }).format(new Date())) % 24;
  const quiet = await setPrefs(M, { quietFrom: hour, quietTo: (hour + 2) % 24 });
  ok(quiet.status === 200 && quiet.body.prefs.quietFrom === hour && quiet.body.prefs.quietTo === (hour + 2) % 24, "the member makes this hour and the next quiet", quiet.text);
  const A4 = await mk(O, "ZZTEST alerts four");
  mRows = await settled(M);
  const held = mRows[0] || {};
  ok(mRows.length === 1 && held.kind === "trip_new" && held.status === "queued" && held.sentAt === null && held.why === null && held.channel === null, "an alert made in their quiet hours waits", JSON.stringify(mRows));
  const wait = Date.parse(held.sendAfter) - Date.now();
  ok(wait > 50 * 60e3 && wait < 130 * 60e3 && new Date(held.sendAfter).getUTCMinutes() === 0 && new Date(held.sendAfter).getUTCSeconds() === 0,
    "until the end of their quiet hours, on the hour", held.sendAfter);
  const d1 = await call(M, { action: "deliver" });
  ok(d1.status === 200 && same(d1.body, { ok: true, sent: 0, held: 1 }), "asked to deliver, the function sends nothing early and says one is held", d1.text);
  const d2 = await call(O, { action: "deliver" });
  ok(d2.status === 200 && same(d2.body, { ok: true, sent: 0, held: 1 }), "whoever on the crew asks", d2.text);
  const wrongKey = await fetch(FN, { method: "POST", headers: { "Content-Type": "application/json", apikey: KEY, "x-cron-key": "not-the-key" }, body: JSON.stringify({ action: "deliver" }) });
  ok(wrongKey.status === 403, "the cron job's own door stays shut to a wrong key", wrongKey.status);
  await setPrefs(M, NO_QUIET);
  const still = (await settled(M))[0] || {};
  ok(still.id === held.id && still.status === "queued" && still.sendAfter === held.sendAfter && still.sentAt === null, "the row is still waiting, untouched, with the time it was given", JSON.stringify(still));
  const cleared = await call(M, { action: "outbox_clear" });
  ok(cleared.status === 200 && same(cleared.body, { ok: true, cleared: 1 }), "the member clears what was waiting for them", cleared.text);
  ok(same((await call(M, { action: "deliver" })).body, { ok: true, sent: 0, held: 0 }) && (await alertsOf(M)).length === 0, "and now nothing is held");

  // ---- a phone that asks for alerts, at an address that leads nowhere ---------
  const pair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const p256dh = Buffer.from(await crypto.subtle.exportKey("raw", pair.publicKey)).toString("base64url");
  const auth = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url");
  const phone = { endpoint: NOWHERE + member.id, p256dh, auth, ua: "ZZTEST phone" };
  for (const [bad, why] of [[{ endpoint: "http://example.invalid/push/x" }, "plain http"], [{ endpoint: "https://localhost/push" }, "this machine"], [{ endpoint: "https://127.0.0.1/push" }, "a bare number address"],
    [{ endpoint: "not an address" }, "no address"], [{ p256dh: "short" }, "a short key"], [{ auth: "" }, "no second key"]]) {
    refused(await call(M, { action: "push_subscribe", ...phone, ...bad }), 400, "a phone is refused for " + why);
  }
  const sub1 = await call(M, { action: "push_subscribe", ...phone });
  ok(sub1.status === 200 && same(sub1.body, { ok: true }), "the member's phone asks for alerts", sub1.text);
  is(await call(M, { action: "push_subscribe", ...phone }), 200, "asking twice is fine");
  const withPhone = await setPrefs(M, { push: true });
  ok(withPhone.status === 200 && withPhone.body.pushSubs === 1 && withPhone.body.pushFails === 0 && withPhone.body.prefs.push === true, "one phone on the account, not two, and phone alerts switched on", withPhone.text);
  await clearBoth();
  const ta2 = await call(M, { action: "test_alert" });
  ok(ta2.status === 200 && same(ta2.body, { ok: true, push: "failed", text: "none" }), "a test alert to an address that leads nowhere fails, and with no number there is no text", ta2.text);
  mRows = await settled(M);
  ok(mRows.length === 1 && mRows[0].kind === "test" && mRows[0].status === "failed" && mRows[0].why === "push failed" && mRows[0].channel === null, "its row ends failed", JSON.stringify(mRows));
  const failed1 = await call(M, { action: "prefs_get" });
  ok(failed1.body.pushSubs === 1 && failed1.body.pushFails === 1, "the phone is kept, and its failure is counted", failed1.text);
  await up(O, A1.id, { from: 5, to: 8, tell: [member.id] });
  mRows = await settled(M);
  ok(mRows.length === 2 && mRows[0].kind === "trip_status" && mRows[0].status === "failed" && mRows[0].why === "push failed" && mRows[0].channel === null,
    "a real alert tries the phone first, falls back to a text, and with no number ends failed", JSON.stringify(mRows[0]));
  ok((await call(M, { action: "prefs_get" })).body.pushFails === 2, "and the count rises again");
  refused(await call(M, { action: "push_unsubscribe" }), 400, "taking a phone off needs its address");
  const unsub = await call(M, { action: "push_unsubscribe", endpoint: phone.endpoint });
  ok(unsub.status === 200 && same(unsub.body, { ok: true }), "the phone stops asking", unsub.text);
  is(await call(M, { action: "push_unsubscribe", endpoint: phone.endpoint }), 200, "twice is fine");
  const noPhone = await call(M, { action: "prefs_get" });
  ok(noPhone.body.pushSubs === 0 && noPhone.body.pushFails === 0, "no phone is left on the account", noPhone.text);

  // ---- put it all back -------------------------------------------------------
  ok((await call(O, { action: "trip_delete", tripId: A1.id, tell: [] })).status === 200 && (await call(O, { action: "trip_delete", tripId: A2.id, tell: [] })).status === 200 &&
    (await call(O, { action: "trip_delete", tripId: A4.id, tell: [] })).status === 200, "the alert trips are deleted, telling nobody");
  const fishGone = await unlogCatch(member, FISH);
  ok(fishGone >= 200 && fishGone < 300 && (await loggedCount(member)) === 0, "the coho is deleted from the member's catch log", fishGone);
  await clearBoth();
  const offO = await setPrefs(O, RESET), offM = await setPrefs(M, RESET);
  ok(same(offO.body.prefs, ALL_OFF) && same(offM.body.prefs, ALL_OFF) && offM.body.pushSubs === 0, "both accounts are back to everything off", offM.text);
}

try {
  await walk();
} catch (e) {
  ok(false, "the walk stopped early: " + (e && e.message));
} finally {
  // Whatever happened above, leave the test crew as it was found.
  const left = await sweep();
  ok(left.trips === 0 && left.people === 0 && left.alerts === 0 && left.catches === 0, "the walk cleaned up after itself, the last sweep found nothing", JSON.stringify(left));
  const last = await call(O, { action: "state" });
  ok(last.status === 200 && last.body.crew.name === CREW && last.body.members.length === 2 &&
    last.body.members[0].id === owner.id && last.body.members[1].id === member.id, "the test crew has exactly its two members", last.text.slice(0, 200));
  ok(last.status === 200 && last.body.trips.length === 0, "and no trips");
  ok(last.status === 200 && last.body.members.every((m) => m.alerts === false && m.signIn === "code"), "with alerts off for both");
  const endO = await call(O, { action: "prefs_get" }), endM = await call(M, { action: "prefs_get" });
  ok(same(endO.body.prefs, ALL_OFF) && same(endM.body.prefs, ALL_OFF) && endO.body.pushSubs === 0 && endM.body.pushSubs === 0, "every switch back where it started, and no phone on either account");
  ok((await alertsOf(O)).length === 0 && (await alertsOf(M)).length === 0, "nothing left in either outbox");
  ok((await loggedCount(owner)) === 0 && (await loggedCount(member)) === 0, "and no test catch left in either catch log");
}

// ---- names: yours to set, and the crew's is the owner's -------------------------
{
  const mine = await call(M, { action: "me_rename", name: "  ZZTEST \n\t Russ  " });
  is(mine, 200, "a member renames themselves");
  ok(mine.body.name === "ZZTEST Russ", "the name comes back trimmed, on one line", mine.text);
  const seenBy = await call(O, { action: "state" });
  ok(seenBy.body.members.some((m) => m.name === "ZZTEST Russ"), "the owner sees the new name");
  refused(await call(M, { action: "me_rename", name: "   " }), 400, "an empty name is refused");
  refused(await call(M, { action: "me_rename", name: "x".repeat(61) }), 400, "a name over 60 characters is refused");
  refused(await call(M, { action: "crew_rename", name: "Mine now" }), 403, "a member cannot rename the crew");
  const crewNew = await call(O, { action: "crew_rename", name: "ZZTEST crew two" });
  is(crewNew, 200, "the owner renames the crew");
  ok((await call(M, { action: "state" })).body.crew.name === "ZZTEST crew two", "the member sees the crew's new name");
  is(await call(O, { action: "crew_rename", name: "ZZTEST crew" }), 200, "the crew's name is put back");
  is(await call(M, { action: "me_rename", name: "ZZTEST Member" }), 200, "the member's name is put back");
  const after = await call(O, { action: "state" });
  ok(after.body.crew.name === "ZZTEST crew" && after.body.members.some((m) => m.name === "ZZTEST Member"), "both names are back as they were");
}

// ---- the crew's name: whoever joins picks it, once ----------------------------
// Coach (11/27): "let Russ choose on his invite". The owner opens naming, the
// member names it, the member cannot name it again, and the owner still can.
// Whatever happens, the name goes back to ZZTEST crew and naming is closed.
try {
  const st = await call(O, { action: "state" });
  ok(st.body.crew && st.body.crew.name === CREW && st.body.crew.nameOpen === false, "naming starts closed on the test crew", st.text.slice(0, 160));
  refused(await call(M, { action: "crew_name_open", open: true }), 403, "a member cannot open the crew's name");
  refused(await call(M, { action: "crew_rename", name: NAME_PICK }), 403, "nor name the crew while it is closed");
  for (const bad of [undefined, "yes", 1, null]) refused(await call(O, { action: "crew_name_open", open: bad }), 400, "open as " + JSON.stringify(bad) + " is bad input");
  ok((await call(M, { action: "state" })).body.crew.nameOpen === false, "none of that opened it");

  const opened = await call(O, { action: "crew_name_open", open: true });
  ok(opened.status === 200 && keys(opened.body, ["ok", "nameOpen"]) && opened.body.nameOpen === true, "the owner opens naming", opened.text);
  const seenOpen = await call(M, { action: "state" });
  ok(seenOpen.body.crew.nameOpen === true && seenOpen.body.crew.name === CREW && keys(seenOpen.body.crew, ["id", "name", "role", "nameOpen"]),
    "the member sees it open, and the name is not changed by opening it", JSON.stringify(seenOpen.body.crew));

  // A link opened while naming is open says so, so the join screen shows no stand-in name.
  const namer = await call(O, { action: "invite", name: "ZZTEST Namer" });
  ok(namer.status === 200 && LINK.test(namer.body.link), "someone new is added while naming is open", namer.text);
  linkTokens.push(tokenOf(namer.body.link));
  const namerPeek = await call(null, { action: "join", token: namer.body.link, peek: true });
  ok(namerPeek.status === 200 && namerPeek.body.nameOpen === true && namerPeek.body.crew === CREW && keys(namerPeek.body, ["ok", "name", "crew", "by", "nameOpen"]),
    "their link says the crew's name is open", namerPeek.text);
  // Signed in, then taken off the crew while naming is still open: they are on
  // no crew now, so they cannot name it, and the name is not touched.
  const ns = await sessionFrom(namer.body.link);
  ok(ns.status === 200 && ns.token && ns.id === namer.body.userId, "they sign in with their link", ns.status);
  try {
    ok((await call(O, { action: "member_remove", userId: namer.body.userId })).status === 200, "and they are taken off again");
    if (ns.token) {
      const gone = await call(ns.token, { action: "crew_rename", name: NAME_PICK });
      ok(gone.status === 403 && gone.body.error === "You are not on a crew yet.", "someone taken off the crew cannot name it, even while naming is open", gone.text);
      refused(await call(ns.token, { action: "crew_name_open", open: false }), 403, "nor close it");
      const still = await call(O, { action: "state" });
      ok(still.body.crew.name === CREW && still.body.crew.nameOpen === true, "the name is unchanged and naming is still open", JSON.stringify(still.body.crew));
    }
  } finally {
    // They signed in, so the account stays after removal: delete it the way its owner would.
    if (ns.token) ok(await dropAccount(ns.token, ns.id) === 200, "the account this test made deletes itself with its own sign-in");
  }

  refused(await call(M, { action: "crew_rename", name: "   " }), 400, "an empty name is refused");
  refused(await call(M, { action: "crew_rename", name: "x".repeat(61) }), 400, "a name over 60 characters is refused");
  ok((await call(M, { action: "state" })).body.crew.nameOpen === true, "and a refused name leaves naming open");

  // Sent with a line break and a run of spaces inside it: a name is one line.
  const named = await call(M, { action: "crew_rename", name: "  " + NAME_PICK.replace(" Fish ", "\n\nFish   ") + " " });
  ok(named.status === 200 && keys(named.body, ["ok", "name"]) && named.body.name === NAME_PICK, "the member names the crew, trimmed, its spaces and line breaks made one space", named.text);
  const afterPick = await call(O, { action: "state" });
  ok(afterPick.body.crew.name === NAME_PICK && afterPick.body.crew.nameOpen === false, "everyone sees the name, and naming is closed", JSON.stringify(afterPick.body.crew));
  const again = await call(M, { action: "crew_rename", name: NAME_RACE });
  ok(again.status === 403 && again.body.error === "The crew has its name. Only the owner can change it.", "the member cannot rename it again, and is told why", again.text);
  ok((await call(M, { action: "state" })).body.crew.name === NAME_PICK, "the first pick stands");

  const byOwner = await call(O, { action: "crew_rename", name: NAME_OWNER });
  ok(byOwner.status === 200 && byOwner.body.name === NAME_OWNER, "the owner still renames it", byOwner.text);
  ok((await call(M, { action: "state" })).body.crew.name === NAME_OWNER, "and the member sees that");

  // Two picks at the same instant: one name lands, the other is turned away.
  ok((await call(O, { action: "crew_name_open", open: true })).status === 200, "naming is opened again");
  const [r1, r2] = await Promise.all([call(M, { action: "crew_rename", name: NAME_RACE }), call(M, { action: "crew_rename", name: NAME_RACE + " too" })]);
  const wins = [r1, r2].filter((r) => r.status === 200), lost = [r1, r2].filter((r) => r.status === 403);
  ok(wins.length === 1 && lost.length === 1, "two names sent at once: exactly one lands", r1.status + " " + r2.status);
  const raced = await call(O, { action: "state" });
  ok(wins.length === 1 && raced.body.crew.name === wins[0].body.name && raced.body.crew.nameOpen === false, "and it is the one the crew sees, with naming closed", JSON.stringify(raced.body.crew));

  // The owner renaming closes naming as well.
  ok((await call(O, { action: "crew_name_open", open: true })).status === 200, "naming is opened once more");
  ok((await call(O, { action: "crew_rename", name: NAME_OWNER })).status === 200 && (await call(M, { action: "state" })).body.crew.nameOpen === false,
    "the owner's own rename closes naming");
  ok((await call(O, { action: "crew_name_open", open: true })).status === 200 && (await call(O, { action: "crew_name_open", open: false })).body.nameOpen === false,
    "and the owner can close it without renaming");
} catch (e) {
  ok(false, "the naming walk stopped early: " + (e && e.message));
} finally {
  const back = await call(O, { action: "crew_rename", name: CREW });
  const shut = await call(O, { action: "crew_name_open", open: false });
  const end = await call(M, { action: "state" });
  ok(back.status === 200 && shut.status === 200 && end.body.crew && end.body.crew.name === CREW && end.body.crew.nameOpen === false,
    "the test crew is ZZTEST crew again, with naming closed", end.text.slice(0, 160));
  const left = (await call(O, { action: "state" })).body.members || [];
  ok(left.length === 2, "and exactly its two members", left.length);
}

// ---- nothing real was sent --------------------------------------------------
ok(everyAlert.length > 40, `every outbox row either account was shown was kept for checking (${everyAlert.length} readings)`);
ok(everyAlert.every((r) => r.status !== "sent" && r.channel === null), "not one alert was ever sent: no text, no phone alert",
  JSON.stringify(everyAlert.filter((r) => r.status === "sent" || r.channel !== null).slice(0, 2)));
ok(everyAlert.every((r) => ["queued", "skipped", "failed"].includes(r.status)), "each one was waiting, skipped or failed");

// ---- nothing private in any answer -----------------------------------------
const hashes = await Promise.all(linkTokens.filter(Boolean).map((t) => hashToken(t)));
const phoneDigits = /202\D{0,3}555\D{0,3}0142/;
const leaks = [];
for (const r of seen) {
  const where = `${r.action} ${r.status}: `;
  // A catch photo's address is the one public address an answer may carry.
  const text = r.text.split(PHOTOS).join("");
  if (r.status >= 500) leaks.push(where + "a 500");
  if (text.includes("@")) leaks.push(where + "an @ sign");
  if (/"(phone|email|e-mail|mail|password|token_hash|endpoint|p256dh|auth)"\s*:/i.test(text) && !r.mint) leaks.push(where + "a private key name");
  if (r.mint && /"(phone|email|password)"\s*:/i.test(text)) leaks.push(where + "a private key name beside the token_hash");
  if (phoneDigits.test(text)) leaks.push(where + "the phone number");
  if (text.includes("members.coachpilot.org") || text.includes(creds.owner.email) || text.includes(creds.member.email)) leaks.push(where + "an address");
  if (text.includes("example.invalid")) leaks.push(where + "a phone's alert address");
  if (hashes.some((h) => text.includes(h))) leaks.push(where + "a stored link hash");
  if (!r.mint && /[0-9a-f]{40,}/i.test(text)) leaks.push(where + "something that looks like a hash");
  if (/file:\/\/|\.ts:\d+|\n\s+at |stack|supabase|postgres|twilio|service_role|select |insert /i.test(text)) leaks.push(where + "the inside of the server");
}
ok(seen.length > 380, `every answer was kept for checking (${seen.length} of them)`);
ok(leaks.length === 0, "no answer carried a phone number, an email, a link hash, a phone's alert address, a stack trace or a 500", leaks.slice(0, 6).join(" | "));
ok(linkTokens.filter(Boolean).length === 8 && hashes.length === 8, "eight join links were handed out and the stored form of each was looked for in every answer", linkTokens.length);

finish();
