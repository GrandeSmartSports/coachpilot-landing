// The crew function, walked end to end against the DEPLOYED function as the two
// ZZTEST accounts: every action in the contract, who is refused what, a join
// link that mints a real session, and a revoked link that answers 410.
//
// It touches only the crew named "ZZTEST crew" and stops before any write if
// that is not the crew it finds. It deletes what it makes, and it sweeps at the
// start too, so a run that died halfway does not pile up under the next one.
// No phone number, email, link hash or stack trace may appear in any answer.
//
// Skips (exit 0) when ~/.cortex/rigcard-test.json is missing or the network is
// down. Plain node, global fetch, nothing to install.
// Run: node tests/castai-crew.live.test.mjs
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join as pathJoin } from "node:path";
import { addDays, hashToken, todayIn } from "../supabase/functions/castai-crew/crew-core.mjs";

const BASE = "https://geigvuysptjvvqanumld.supabase.co";
const FN = BASE + "/functions/v1/castai-crew";
const KEY = "sb_publishable_m6EWBWxKPeOaVpPQOVDjyg_sTRWlnbe"; // publishable, the same one the page carries
const CREW = "ZZTEST crew";
const PHONE = "(202) 555-0142"; // 555-01xx is set aside for fiction: nobody has this number
const PHONE_AGAIN = "+1 202 555 0142";

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 260)); }
  return !!c;
};
const finish = () => { console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0); };
const skip = (why) => { console.log("skip  " + why); process.exit(0); };

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
const uuidLike = (v) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const isoTime = (v) => typeof v === "string" && v.endsWith("Z") && !Number.isNaN(Date.parse(v));
const LINK = /^https:\/\/coachpilot\.org\/rigs\/#\/join\/([A-Za-z0-9_-]{43})$/;
const tokenOf = (link) => (String(link).match(LINK) || [])[1] || "";
const NOBODY = () => crypto.randomUUID();

const TRIP_KEYS = ["id", "planId", "spotId", "species", "title", "date", "from", "to", "status", "note", "by", "going", "counts", "updatedAt"];
const NOTE_KEYS = ["id", "section", "body", "by", "at", "mine"];
const ITEM_KEYS = ["id", "label", "assignedTo", "done", "mine"];
const CATCH_KEYS = ["id", "species", "lengthIn", "weightLb", "lure", "notes", "by", "at", "mine"];

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
ok(hello.body.ok === true && typeof hello.body.sms === "boolean" && keys(hello.body, ["ok", "sms"]), "it says whether texting works, and nothing else", hello.text);

let owner, member;
try {
  owner = await signIn(creds.owner);
  member = await signIn(creds.member);
} catch (e) { skip("no network for sign-in (" + e.message + ")"); }
if (!ok(owner.status === 200 && owner.token && member.status === 200 && member.token, "both ZZTEST accounts sign in", `${owner.status} ${member.status}`)) finish();
const O = owner.token, M = member.token;

// Never touch a crew that is not the test crew. This runs before any write.
const first = await call(O, { action: "state" });
const firstM = await call(M, { action: "state" });
const safe = first.status === 200 && firstM.status === 200 && first.body.crew && firstM.body.crew &&
  first.body.crew.name === CREW && firstM.body.crew.name === CREW && first.body.crew.id === firstM.body.crew.id &&
  first.body.crew.role === "owner" && firstM.body.crew.role === "member";
if (!ok(safe, "both accounts are on the crew named ZZTEST crew, and only that crew is touched", first.text.slice(0, 120))) finish();

// Take away anything a run left behind: every trip, and anyone but the two.
async function sweep() {
  const s = await call(O, { action: "state" });
  if (s.status !== 200 || !s.body.crew || s.body.crew.name !== CREW) return { trips: -1, people: -1 };
  let trips = 0, people = 0;
  for (const t of s.body.trips || []) { if ((await call(O, { action: "trip_delete", tripId: t.id })).status === 200) trips++; }
  for (const m of s.body.members || []) {
    if (m.id === owner.id || m.id === member.id) continue;
    if ((await call(O, { action: "member_remove", userId: m.id })).status === 200) people++;
  }
  return { trips, people };
}
const before = await sweep();
if (before.trips || before.people) console.log(`note  swept ${before.trips} trips and ${before.people} people left by an earlier run`);

const linkTokens = []; // every join token handed out, to prove its stored hash never shows

async function walk() {
  // ---- state: who am I, my crew, the members by name -----------------------
  const so = await call(O, { action: "state" }), sm = await call(M, { action: "state" });
  is(so, 200, "state for the owner"); is(sm, 200, "state for the member");
  ok(keys(so.body, ["me", "crew", "members", "trips", "sms"]) && keys(sm.body, ["me", "crew", "members", "trips", "sms"]), "state has exactly me, crew, members, trips and sms");
  ok(so.body.me.id === owner.id && so.body.me.name === "ZZTEST Owner" && keys(so.body.me, ["id", "name"]), "the owner is told who they are, by name", JSON.stringify(so.body.me));
  ok(sm.body.me.id === member.id && sm.body.me.name === "ZZTEST Member", "so is the member", JSON.stringify(sm.body.me));
  ok(keys(so.body.crew, ["id", "name", "role"]) && so.body.crew.role === "owner" && sm.body.crew.role === "member", "each sees their own role on the crew");
  ok(so.body.members.length === 2 && so.body.members.every((m) => keys(m, ["id", "name", "role"])), "two members, each an id, a name and a role and nothing more", JSON.stringify(so.body.members));
  ok(so.body.members[0].id === owner.id && so.body.members[0].role === "owner" && so.body.members[1].id === member.id && so.body.members[1].name === "ZZTEST Member",
    "the owner is listed first, then the member, by name");
  ok(JSON.stringify(so.body.members) === JSON.stringify(sm.body.members), "both see the same members in the same order");
  ok(Array.isArray(so.body.trips) && so.body.trips.length === 0 && sm.body.trips.length === 0 && typeof so.body.sms === "boolean", "no trips yet, and sms is a yes or no");

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

  // ---- an invite with no phone: a new person and a link --------------------
  const temp = await call(O, { action: "invite", name: "  ZZTEST Temp " });
  is(temp, 200, "the owner adds someone by name alone");
  ok(keys(temp.body, ["ok", "created", "name", "userId", "link"]), "the answer is ok, created, name, userId and link, nothing more", temp.text);
  ok(temp.body.created === true && temp.body.name === "ZZTEST Temp" && uuidLike(temp.body.userId), "a new person, name trimmed", temp.text);
  ok(LINK.test(temp.body.link), "the link opens coachpilot.org/rigs at the join screen", temp.body.link);
  linkTokens.push(tokenOf(temp.body.link));
  const withTemp = await call(M, { action: "state" });
  ok(withTemp.body.members.length === 3 && withTemp.body.members.some((m) => m.id === temp.body.userId && m.name === "ZZTEST Temp" && m.role === "member"),
    "the member sees the new person on the crew, by name", JSON.stringify(withTemp.body.members));

  // ---- join: peek first, mint only when asked ------------------------------
  const peek = await call(null, { action: "join", token: temp.body.link, peek: true });
  is(peek, 200, "peeking at a link needs no sign-in");
  ok(peek.body.ok === true && peek.body.name === "ZZTEST Temp" && peek.body.crew === CREW, "it says who the link is for and which crew", peek.text);
  ok(peek.body.by === "ZZTEST Owner", "and who made it, by name", peek.text);
  ok(!("token_hash" in peek.body) && keys(peek.body, ["ok", "name", "crew", "by"]), "a peek mints nothing", peek.text);
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
  is(p1, 200, "the owner adds someone with a phone number");
  ok(p1.body.created === true && uuidLike(p1.body.userId) && LINK.test(p1.body.link), "a new person and a link", p1.text);
  linkTokens.push(tokenOf(p1.body.link));
  const p1mint = await call(null, { action: "join", token: p1.body.link }, "mint");
  ok(p1mint.status === 200 && typeof p1mint.body.token_hash === "string" && p1mint.body.name === "ZZTEST Phone" && p1mint.body.crew === CREW,
    "a phone account's link mints a sign-in too", p1mint.text.slice(0, 120));
  const p2 = await call(O, { action: "invite", name: "ZZTEST Phone Again", phone: PHONE_AGAIN });
  is(p2, 200, "the same number typed another way");
  ok(p2.body.created === false && p2.body.userId === p1.body.userId, "is the same person, attached, not a second account", p2.text);
  ok(p2.body.name === "ZZTEST Phone", "who keeps the name they already have", p2.text);
  ok(LINK.test(p2.body.link) && p2.body.link !== p1.body.link, "and gets one more link", p2.text);
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

  // ---- a link turns into a real session ------------------------------------
  const a = await call(O, { action: "link", userId: member.id });
  is(a, 200, "the owner makes a new link for the member");
  ok(keys(a.body, ["ok", "name", "link"]) && a.body.name === "ZZTEST Member" && LINK.test(a.body.link), "ok, the name and the link", a.text);
  const b = await call(M, { action: "link", userId: member.id });
  ok(b.status === 200 && LINK.test(b.body.link) && b.body.link !== a.body.link, "the member can make their own link", b.text);
  linkTokens.push(tokenOf(a.body.link), tokenOf(b.body.link));
  const old = await call(null, { action: "join", token: a.body.link, peek: true });
  ok(old.status === 410 && old.body.error === "That link is not good any more. Ask for a new one.", "which revokes the one before it: 410", old.text);
  refused(await call(null, { action: "join", token: a.body.link }), 410, "the revoked link mints nothing");
  const bPeek = await call(null, { action: "join", token: b.body.link, peek: true });
  ok(bPeek.status === 200 && bPeek.body.name === "ZZTEST Member" && bPeek.body.crew === CREW && bPeek.body.by === null, "the new link is for the member, on the test crew", bPeek.text);
  const minted = await call(null, { action: "join", token: b.body.link }, "mint");
  ok(minted.status === 200 && typeof minted.body.token_hash === "string" && keys(minted.body, ["ok", "name", "crew", "by", "token_hash"]), "joining mints a token_hash", minted.text.slice(0, 80));
  const v = await fetch(BASE + "/auth/v1/verify", {
    method: "POST", headers: { "Content-Type": "application/json", apikey: KEY },
    body: JSON.stringify({ type: "magiclink", token_hash: minted.body.token_hash }), signal: AbortSignal.timeout(30000),
  });
  const session = await v.json().catch(() => ({}));
  ok(v.status === 200 && typeof session.access_token === "string" && session.refresh_token && session.user && session.user.id === member.id,
    "which the sign-in service turns into a real session for that person", v.status);
  const joined = await call(session.access_token, { action: "state" });
  ok(joined.status === 200 && joined.body.me.id === member.id && joined.body.crew && joined.body.crew.name === CREW && joined.body.crew.role === "member",
    "and that session's state shows the right crew", joined.text.slice(0, 160));
  const reuse = await call(null, { action: "join", token: b.body.link, peek: true });
  ok(reuse.status === 200 && reuse.body.name === "ZZTEST Member", "the link still works afterwards: a phone that loses its sign-in can use the same text again", reuse.text);

  // ---- removing the person who never joined --------------------------------
  is(await call(O, { action: "member_remove", userId: temp.body.userId }), 200, "the owner removes the person who never joined");
  refused(await call(null, { action: "join", token: temp.body.link }), 410, "their link is dead");
  ok((await call(O, { action: "state" })).body.members.length === 2, "the crew is the two of them again");

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
  ok(JSON.stringify(T1.counts) === JSON.stringify({ comments: 0, list: 0, listDone: 0, catches: 0 }) && isoTime(T1.updatedAt), "nothing on it yet, and updatedAt is a time");
  const resent = await call(M, send1);
  ok(resent.status === 200 && resent.body.trip.id === T1.id, "the same trip sent twice lands once", resent.text.slice(0, 120));
  ok((await call(O, { action: "state" })).body.trips.length === 1, "one trip on the crew, not two");
  const t2 = await call(O, { action: "trip_create", planId: "crab-westport", spotId: "westport", species: "crab", title: "ZZTEST crab off Westport", date: today, status: "planned" });
  const T2 = t2.body.trip;
  ok(t2.status === 200 && T2.status === "planned" && T2.from === null && T2.to === null && T2.note === null && T2.by.id === owner.id, "the owner plans one for today, no window, no note", t2.text.slice(0, 200));
  const t3 = await call(O, { action: "trip_create", planId: "coho-green-river", spotId: "green-river", species: "coho", title: "ZZTEST coho on the Green", date: soon });
  const T3 = t3.body.trip;
  ok(t3.status === 200 && T3.status === "idea", "and floats another", t3.text.slice(0, 120));
  for (const [bad, why] of [[{ date: "2026-02-30" }, "a date that is not real"], [{ date: addDays(today, 400) }, "a date over a year out"], [{ date: addDays(today, -31) }, "a date 31 days back"],
    [{ planId: "Squid Redondo" }, "a plan id with a space"], [{ spotId: "" }, "no spot"], [{ title: "" }, "no title"], [{ title: "x".repeat(121) }, "a 121 letter title"],
    [{ note: "x".repeat(281) }, "a 281 letter note"], [{ status: "done" }, "starting out done"], [{ from: 21, to: 17 }, "a window that runs backwards"],
    [{ from: -1 }, "an hour before midnight"], [{ to: 25 }, "an hour past midnight"], [{ species: "" }, "no fish"], [{ clientId: "nope" }, "a mangled client id"]]) {
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
  refused(await call(M, { action: "catch_add", tripId: ghost, species: "coho" }), 404, "404 to log a catch on");
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
  const full3 = await call(O, { action: "trip", tripId: T1.id });
  ok(full3.body.comments.length === 3 && full3.body.trip.counts.comments === 3, "three notes on the trip, the resend did not add a fourth", JSON.stringify(full3.body.trip.counts));
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
  const same = await lu(M, I1.id, { label: "ZZTEST ring nets", done: false });
  ok(same.status === 200 && same.body.item.done === false && same.body.item.label === "ZZTEST ring nets", "sending the label unchanged with a tick is not a rename", same.text);
  const ownerRenames = await lu(O, I2.id, { label: "ZZTEST herring" });
  ok(ownerRenames.status === 200 && ownerRenames.body.item.label === "ZZTEST herring" && ownerRenames.body.item.mine === false, "the owner renames anyone's line", ownerRenames.text);
  ok((await lu(M, I2.id, { label: "ZZTEST herring, two packs" })).body.item.label === "ZZTEST herring, two packs", "the adder renames their own");
  refused(await lu(M, I1.id, { done: "yes" }), 400, "done is a yes or a no, not a word");
  refused(await lu(M, I1.id, { assignedTo: NOBODY() }), 400, "a line cannot go to someone who is not on the crew");
  refused(await lu(M, I1.id, {}), 400, "nothing to change is bad input");
  refused(await lu(M, I1.id, { label: "" }), 400, "an empty label is bad input");
  refused(await lu(M, NOBODY(), { done: true }), 404, "a line that does not exist: 404");
  refused(await call(M, { action: "list_add", tripId: T1.id, label: "" }), 400, "a new line needs words");
  refused(await call(M, { action: "list_add", tripId: T1.id, label: "x".repeat(121) }), 400, "and not 121 of them");
  refused(await call(M, { action: "list_add", tripId: T1.id, label: "ZZTEST", assignedTo: NOBODY() }), 400, "a new line cannot go to a stranger");
  refused(await call(M, { action: "list_delete", itemId: I1.id }), 403, "a member cannot take off a line they did not add");
  is(await call(O, { action: "list_delete", itemId: I2.id }), 200, "the owner takes off anyone's line");
  refused(await call(O, { action: "list_delete", itemId: I2.id }), 404, "which is then gone");
  const beforeTick = (await call(M, { action: "trip", tripId: T1.id })).body.trip.updatedAt;
  ok((await lu(O, I1.id, { done: true })).body.item.done === true, "the owner ticks the line that is left");

  // ---- catches -------------------------------------------------------------
  const f1 = crypto.randomUUID();
  const sendCatch = { action: "catch_add", tripId: T2.id, species: " crab ", lengthIn: 6.5, weightLb: 1.5, lure: "chicken", notes: "ZZTEST keeper", clientId: f1 };
  const ca = await call(M, sendCatch);
  is(ca, 200, "a member logs a catch on today's trip");
  const C1 = ca.body.catch;
  ok(keys(C1, CATCH_KEYS) && C1.species === "crab" && C1.lengthIn === 6.5 && C1.weightLb === 1.5 && C1.lure === "chicken" && C1.notes === "ZZTEST keeper" &&
    C1.by.id === member.id && C1.mine === true && isoTime(C1.at), "it comes back as sent, by name, and theirs", ca.text);
  const caAgain = await call(M, sendCatch);
  ok(caAgain.status === 200 && caAgain.body.catch.id === C1.id, "the same clientId returns the same catch", caAgain.text);
  const cb = await call(O, { action: "catch_add", tripId: T2.id, species: "crab" });
  const C2 = cb.body.catch;
  ok(cb.status === 200 && C2.lengthIn === null && C2.weightLb === null && C2.lure === null && C2.notes === null && C2.by.id === owner.id, "only the fish is needed", cb.text);
  refused(await call(M, { action: "catch_add", tripId: T2.id }), 400, "a catch with no fish is bad input");
  refused(await call(M, { action: "catch_add", tripId: T2.id, species: "crab", lengthIn: -1 }), 400, "a length below nothing is bad input");
  refused(await call(M, { action: "catch_add", tripId: T2.id, species: "crab", weightLb: "heavy" }), 400, "a word for a weight is bad input");
  refused(await call(O, { action: "catch_delete", catchId: C1.id }), 403, "not even the owner deletes someone else's catch");
  is(await call(M, { action: "catch_delete", catchId: C1.id }), 200, "its own angler does");
  refused(await call(M, { action: "catch_delete", catchId: C1.id }), 404, "and then it is gone");
  refused(await call(M, { action: "catch_delete", catchId: "nope" }), 400, "a mangled catch id is bad input");

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
  ok(JSON.stringify(asM.body.trip.counts) === JSON.stringify({ comments: 1, list: 1, listDone: 1, catches: 0 }), "the counts match what is there", JSON.stringify(asM.body.trip.counts));
  const crabM = await call(M, { action: "trip", tripId: T2.id }), crabO = await call(O, { action: "trip", tripId: T2.id });
  ok(crabM.body.catches.length === 1 && crabM.body.catches[0].id === C2.id && crabM.body.catches[0].mine === false && crabO.body.catches[0].mine === true && keys(crabM.body.catches[0], CATCH_KEYS),
    "today's trip shows the owner's catch, theirs to them and not to the member", JSON.stringify(crabM.body.catches));
  const end = await call(M, { action: "state" });
  const inState = (id) => end.body.trips.find((t) => t.id === id);
  ok(end.body.trips.length === 3 && end.body.trips.every((t) => keys(t, TRIP_KEYS)), "state lists the three trips in the contract's shape");
  ok(JSON.stringify(inState(T1.id).counts) === JSON.stringify({ comments: 1, list: 1, listDone: 1, catches: 0 }), "state carries the same counts for the first", JSON.stringify(inState(T1.id).counts));
  ok(JSON.stringify(inState(T2.id).counts) === JSON.stringify({ comments: 0, list: 0, listDone: 0, catches: 1 }), "and for today's", JSON.stringify(inState(T2.id).counts));
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
  refused(await call(null, "{ not json"), 401, "junk with no token is a 401");
  refused(await call("not.a.real.token", { action: "state" }), 401, "a made-up token is a 401");
  refused(await call(KEY, { action: "state" }), 401, "the publishable key is not a person: 401");
  const get = await fetch(FN, { headers: { apikey: KEY } }).then((r) => r.status).catch(() => 0);
  ok(get === 405, "GET is not how you talk to it", get);
  const pre = await fetch(FN, { method: "OPTIONS", headers: { Origin: "https://coachpilot.org", "Access-Control-Request-Method": "POST" } }).catch(() => null);
  ok(pre && pre.status < 300 && pre.headers.get("access-control-allow-origin") === "*", "the page's preflight is answered", pre && pre.status);

  // ---- deleting trips ------------------------------------------------------
  refused(await call(M, { action: "trip_delete", tripId: T2.id }), 403, "a member cannot delete someone else's trip");
  is(await call(M, { action: "trip_delete", tripId: T1.id }), 200, "the maker deletes their own");
  refused(await call(M, { action: "trip", tripId: T1.id }), 404, "and it is gone, with everything on it");
  refused(await call(O, { action: "comment_delete", commentId: O1.id }), 404, "its notes went with it");
  refused(await lu(O, I1.id, { done: false }), 404, "and its list");
  is(await call(O, { action: "trip_delete", tripId: T2.id }), 200, "the owner deletes today's");
  is(await call(O, { action: "trip_delete", tripId: T3.id }), 200, "and the last one");
}

try {
  await walk();
} catch (e) {
  ok(false, "the walk stopped early: " + (e && e.message));
} finally {
  // Whatever happened above, leave the test crew as it was found.
  const left = await sweep();
  ok(left.trips === 0 && left.people === 0, "the walk cleaned up after itself, the last sweep found nothing", JSON.stringify(left));
  const last = await call(O, { action: "state" });
  ok(last.status === 200 && last.body.crew.name === CREW && last.body.members.length === 2 &&
    last.body.members[0].id === owner.id && last.body.members[1].id === member.id, "the test crew has exactly its two members", last.text.slice(0, 200));
  ok(last.status === 200 && last.body.trips.length === 0, "and no trips");
}

// ---- nothing private in any answer -----------------------------------------
const hashes = await Promise.all(linkTokens.filter(Boolean).map((t) => hashToken(t)));
const phoneDigits = /202\D{0,3}555\D{0,3}0142/;
const leaks = [];
for (const r of seen) {
  const where = `${r.action} ${r.status}: `;
  if (r.status >= 500) leaks.push(where + "a 500");
  if (r.text.includes("@")) leaks.push(where + "an @ sign");
  if (/"(phone|email|e-mail|mail|password|token_hash)"\s*:/i.test(r.text) && !r.mint) leaks.push(where + "a private key name");
  if (r.mint && /"(phone|email|password)"\s*:/i.test(r.text)) leaks.push(where + "a private key name beside the token_hash");
  if (phoneDigits.test(r.text)) leaks.push(where + "the phone number");
  if (r.text.includes("members.coachpilot.org") || r.text.includes(creds.owner.email) || r.text.includes(creds.member.email)) leaks.push(where + "an address");
  if (hashes.some((h) => r.text.includes(h))) leaks.push(where + "a stored link hash");
  if (!r.mint && /[0-9a-f]{40,}/i.test(r.text)) leaks.push(where + "something that looks like a hash");
  if (/file:\/\/|\.ts:\d+|\n\s+at |stack|supabase|postgres|service_role|select |insert /i.test(r.text)) leaks.push(where + "the inside of the server");
}
ok(seen.length > 170, `every answer was kept for checking (${seen.length} of them)`);
ok(leaks.length === 0, "no answer carried a phone number, an email, a link hash, a stack trace or a 500", leaks.slice(0, 6).join(" | "));
ok(linkTokens.filter(Boolean).length === 7 && hashes.length === 7, "seven join links were handed out and the stored form of each was looked for in every answer", linkTokens.length);

finish();
