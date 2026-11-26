// The crew function's decisions, tested without a network: how a phone number
// typed by a human becomes one account, who may invite, who may change a trip,
// what a trip, a note and a catch must look like, and how a join link is made.
// The last block asks the deployed function a few questions with no sign-in.
// Run: node tests/castai-crew.test.mjs
import * as core from "../supabase/functions/castai-crew/crew-core.mjs";

const {
  canInvite, inviteOutcome, normalizePhone,
  SECTIONS, ANSWERS, cleanText, optionalText, isUuid, todayIn, addDays,
  canEditTrip, statusChangeAllowed, tripInput, tripPatch, catchInput,
  cleanSection, cleanAnswer, joinToken, newToken, hashToken, joinLink,
  placeholderEmail, ghostAccount,
} = core;

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 200)); }
};
const threw = (fn) => { try { fn(); return false; } catch (e) { return true; } };
const said = (fn) => { try { fn(); return ""; } catch (e) { return String(e && e.message || ""); } };
const fn = (f) => typeof f === "function";
// A refusal a person can read: a sentence, no em dash, no code words.
// The long dash is built from its number so this file holds none of its own.
const LONG_DASH = String.fromCharCode(0x2014);
const plain = (m) => m.length > 5 && m.length < 120 && !m.includes(LONG_DASH) && !/undefined|null|NaN|\[object|Error:/.test(m);

for (const name of ["canInvite", "inviteOutcome", "normalizePhone", "cleanText", "optionalText", "isUuid", "todayIn",
  "addDays", "canEditTrip", "statusChangeAllowed", "tripInput", "tripPatch", "catchInput", "cleanSection",
  "cleanAnswer", "joinToken", "newToken", "hashToken", "joinLink", "placeholderEmail", "ghostAccount"]) {
  ok(fn(core[name]), `crew-core has ${name}`);
}
if (fail) { console.log(`\n${pass} passed, ${fail} failed`); process.exit(1); }

// ---- phone numbers ---------------------------------------------------------
// Coach will type a number the way he has it in his phone. Every one of these
// has to reach the same account.
ok(normalizePhone("253 555 0147") === "+12535550147", "spaces and no country code");
ok(normalizePhone("(253) 555-0147") === "+12535550147", "brackets and a dash");
ok(normalizePhone("+1 253 555 0147") === "+12535550147", "already international");
ok(normalizePhone("1-253-555-0147") === "+12535550147", "a leading 1");
ok(normalizePhone(" 2535550147 ") === "+12535550147", "stray spaces");
ok(threw(() => normalizePhone("555-0147")), "too short is refused");
ok(threw(() => normalizePhone("+44 7700 900123")), "not a US number is refused");
ok(threw(() => normalizePhone("")), "empty is refused");
ok(threw(() => normalizePhone(null)), "nothing at all is refused");
ok(/phone number/i.test(said(() => normalizePhone("555"))) && plain(said(() => normalizePhone("555"))),
  "the refusal is in plain words", said(() => normalizePhone("555")));
ok(!/555/.test(said(() => normalizePhone("555-0147"))), "the refusal does not repeat the number back");

ok(canInvite({ role: "owner" }), "the owner invites");
ok(!canInvite({ role: "member" }), "a member does not");
ok(!canInvite(null), "nobody invites when there is no membership");

// An invited phone that already has a CastAI account is attached, never doubled.
ok(inviteOutcome({ user: { id: "u1" }, member: { user_id: "u1" } }) === "already", "already on the crew");
ok(inviteOutcome({ user: { id: "u1" }, member: null }) === "attach", "an existing account is attached");
ok(inviteOutcome({ user: null, member: null }) === "create", "a new number gets an account");

// ---- small cleaners --------------------------------------------------------
ok(JSON.stringify(SECTIONS) === JSON.stringify(["plan", "what", "gear", "bait", "how", "wx", "river", "spot", "expect", "rules"]),
  "the ten run card sections, in card order", JSON.stringify(SECTIONS));
ok(JSON.stringify(ANSWERS) === JSON.stringify(["going", "maybe", "out"]), "going, maybe, out");

ok(cleanText("  ring nets  ", 120) === "ring nets", "cleanText trims");
ok(cleanText("x".repeat(120), 120).length === 120, "exactly the limit passes");
ok(threw(() => cleanText("x".repeat(121), 120)), "one over the limit is refused");
ok(threw(() => cleanText("", 120)), "empty is refused");
ok(threw(() => cleanText("   \n ", 120)), "only spaces is refused");
ok(threw(() => cleanText(null, 120)), "nothing is refused");
ok(threw(() => cleanText(undefined, 120)), "missing is refused");
ok(threw(() => cleanText({ a: 1 }, 120)), "an object is refused, not turned into words");
ok(threw(() => cleanText(["a"], 120)), "a list is refused");
ok(plain(said(() => cleanText("", 10))) && plain(said(() => cleanText("x".repeat(11), 10))), "both refusals are plain words",
  said(() => cleanText("", 10)) + " | " + said(() => cleanText("x".repeat(11), 10)));

const ZERO = String.fromCharCode(0), HALF = String.fromCharCode(0xd800);
ok(cleanText("ring" + ZERO + " nets", 120) === "ring nets", "a zero byte is dropped, since the database cannot hold one");
ok(threw(() => cleanText(ZERO + ZERO, 120)), "only zero bytes is empty");
ok(cleanText("net" + HALF, 120).isWellFormed() && cleanText("net" + HALF, 120).length === 4, "half a character is mended, not passed on to crash a write");
ok(optionalText(undefined, 80) === null && optionalText(null, 80) === null && optionalText("   ", 80) === null, "an optional blank is nothing");
ok(optionalText(" pink hoochie ", 80) === "pink hoochie", "an optional value is trimmed");
ok(threw(() => optionalText("x".repeat(81), 80)), "an optional value still has a limit");
ok(threw(() => optionalText(42, 80)), "an optional value must be words");

ok(isUuid("20fc4eee-f679-4394-8a0b-ecc015d8a2ec"), "a uuid is a uuid");
ok(isUuid("20FC4EEE-F679-4394-8A0B-ECC015D8A2EC"), "upper case too");
ok(!isUuid("20fc4eee-f679-4394-8a0b-ecc015d8a2e"), "one short is not");
ok(!isUuid("' or 1=1 --") && !isUuid("") && !isUuid(null) && !isUuid(12) && !isUuid({}), "junk is not a uuid");

ok(cleanSection(undefined) === null && cleanSection(null) === null && cleanSection("") === null, "no section is a note on the whole trip");
ok(SECTIONS.every((s) => cleanSection(s) === s), "every run card section is taken");
ok(threw(() => cleanSection("chat")) && threw(() => cleanSection("PLAN")) && threw(() => cleanSection(3)), "a made-up section is refused");
ok(ANSWERS.every((a) => cleanAnswer(a) === a), "each answer is taken");
ok(threw(() => cleanAnswer("yes")) && threw(() => cleanAnswer(undefined)) && threw(() => cleanAnswer(true)), "anything else is refused");

// ---- today is the day in Seattle, not in London ----------------------------
ok(todayIn(new Date("2026-11-27T07:30:00Z")) === "2026-11-26", "late evening Pacific is still that day", todayIn(new Date("2026-11-27T07:30:00Z")));
ok(todayIn(new Date("2026-11-27T08:00:00Z")) === "2026-11-27", "midnight Pacific rolls the day");
ok(todayIn(new Date("2026-07-01T06:59:00Z")) === "2026-06-30", "summer time is an hour different");
ok(todayIn(new Date("2026-07-01T07:00:00Z")) === "2026-07-01", "summer midnight");
ok(/^\d{4}-\d{2}-\d{2}$/.test(todayIn()), "with no argument it is now");
ok(addDays("2026-11-26", 366) === "2027-11-27", "a year and a day ahead", addDays("2026-11-26", 366));
ok(addDays("2026-11-26", -30) === "2026-10-27", "thirty days back");
ok(addDays("2028-02-28", 1) === "2028-02-29" && addDays("2027-02-28", 1) === "2027-03-01", "leap years");
ok(addDays("2026-12-31", 1) === "2027-01-01", "new year");

// ---- who may change a trip -------------------------------------------------
const owner = { user_id: "u-owner", role: "owner" };
const maker = { user_id: "u-maker", role: "member" };
const other = { user_id: "u-other", role: "member" };
const TODAY = "2026-11-26";
const trip = (status, date) => ({ created_by: "u-maker", status, trip_date: date || "2026-12-05" });

ok(canEditTrip(owner, trip("idea")), "the owner edits any trip");
ok(canEditTrip(maker, trip("idea")), "the person who made it edits it");
ok(!canEditTrip(other, trip("idea")), "another member does not");
ok(!canEditTrip(null, trip("idea")), "no membership, no edit");
ok(!canEditTrip(other, { created_by: null, status: "idea" }), "a trip whose maker left belongs to the owner only");
ok(!canEditTrip({ user_id: undefined, role: "member" }, { created_by: undefined }), "two blanks do not match each other");
ok(canEditTrip(owner, { created_by: null, status: "idea" }), "the owner still edits it");

ok(statusChangeAllowed(other, trip("idea"), "planned", TODAY), "anyone raises an idea to planned");
ok(statusChangeAllowed(maker, trip("idea"), "planned", TODAY) && statusChangeAllowed(owner, trip("idea"), "planned", TODAY), "so do the maker and the owner");
ok(!statusChangeAllowed(null, trip("idea"), "planned", TODAY), "someone off the crew does not");
ok(!statusChangeAllowed(other, trip("planned"), "idea", TODAY), "another member cannot put it back to an idea");
ok(statusChangeAllowed(maker, trip("planned"), "idea", TODAY), "the maker puts it back");
ok(statusChangeAllowed(owner, trip("planned"), "idea", TODAY), "the owner puts it back");
ok(!statusChangeAllowed(other, trip("done"), "planned", TODAY), "another member cannot reopen a done trip");
ok(statusChangeAllowed(maker, trip("done"), "planned", TODAY) && statusChangeAllowed(owner, trip("done"), "planned", TODAY), "the maker or the owner reopens it");
ok(statusChangeAllowed(maker, trip("planned", "2026-12-05"), "done", TODAY), "the maker marks it done any time");
ok(statusChangeAllowed(owner, trip("idea", "2026-12-05"), "done", TODAY), "the owner marks it done any time, even an idea");
ok(!statusChangeAllowed(other, trip("planned", "2026-12-05"), "done", TODAY), "another member cannot mark a future trip done");
ok(!statusChangeAllowed(other, trip("planned", "2026-11-27"), "done", TODAY), "not the day before either");
ok(statusChangeAllowed(other, trip("planned", "2026-11-26"), "done", TODAY), "anyone marks it done on the day");
ok(statusChangeAllowed(other, trip("planned", "2026-11-20"), "done", TODAY), "anyone marks it done after the day");
ok(statusChangeAllowed(other, trip("idea", "2026-11-20"), "done", TODAY), "an idea whose day has passed too");
ok(!statusChangeAllowed(owner, trip("done"), "idea", TODAY) && !statusChangeAllowed(maker, trip("done"), "idea", TODAY),
  "done goes back to planned first, never straight to an idea");
ok(!statusChangeAllowed(owner, trip("idea"), "cancelled", TODAY) && !statusChangeAllowed(owner, trip("idea"), undefined, TODAY), "a made-up status is refused");
ok(statusChangeAllowed(other, trip("planned"), "planned", TODAY) && statusChangeAllowed(other, trip("done"), "done", TODAY), "asking for what it already is changes nothing and is fine");

// ---- a new trip ------------------------------------------------------------
const good = { planId: "squid-redondo", spotId: "redondo", species: "squid", title: "  Squid at Redondo ", date: "2026-11-28" };
const t1 = tripInput(good, TODAY);
ok(t1.planId === "squid-redondo" && t1.spotId === "redondo" && t1.species === "squid" && t1.date === "2026-11-28", "the plan, spot, fish and date come through");
ok(t1.title === "Squid at Redondo", "the title is trimmed");
ok(t1.status === "idea" && t1.from === null && t1.to === null && t1.note === null, "an idea with no window and no note unless told otherwise", JSON.stringify(t1));
const t2 = tripInput({ ...good, from: 17, to: 21.5, status: "planned", note: " leave at 4 " }, TODAY);
ok(t2.from === 17 && t2.to === 21.5 && t2.status === "planned" && t2.note === "leave at 4", "window, status and note are kept", JSON.stringify(t2));
ok(tripInput({ ...good, from: 0, to: 24 }, TODAY).to === 24, "midnight to midnight is allowed");
ok(tripInput({ ...good, from: "6", to: "9.5" }, TODAY).to === 9.5, "hours typed as text still count");
ok(tripInput({ ...good, from: 6 }, TODAY).to === null, "a start with no end is fine");
ok(tripInput({ ...good, planId: "trout-w-l27", spotId: "w-l27" }, TODAY).spotId === "w-l27", "a stocked lake id is taken");
ok(tripInput({ ...good, date: "2027-11-27" }, TODAY).date === "2027-11-27", "366 days ahead is the edge and passes");
ok(threw(() => tripInput({ ...good, date: "2027-11-28" }, TODAY)), "367 days ahead is refused");
ok(tripInput({ ...good, date: "2026-10-27" }, TODAY).date === "2026-10-27", "30 days back is the edge and passes");
ok(threw(() => tripInput({ ...good, date: "2026-10-26" }, TODAY)), "31 days back is refused");
for (const bad of ["2026-02-30", "2026-13-01", "2026-00-10", "tomorrow", "11/28/2026", "2026-11-28T00:00:00Z", "", null, undefined, 20261128, "2026-1-5"]) {
  ok(threw(() => tripInput({ ...good, date: bad }, TODAY)), `the date ${JSON.stringify(bad)} is refused`);
}
for (const [f, t, why] of [[-1, 5, "before midnight"], [5, 24.5, "past midnight"], [9, 9, "no length"], [10, 9, "backwards"],
  ["soon", 9, "words"], [NaN, 9, "not a number"], [Infinity, 9, "forever"], [{}, 9, "an object"], [true, 9, "a yes"], [[5], 9, "a list"]]) {
  ok(threw(() => tripInput({ ...good, from: f, to: t }, TODAY)), `a window that is ${why} is refused`);
}
ok(threw(() => tripInput({ ...good, title: "" }, TODAY)) && threw(() => tripInput({ ...good, title: "   " }, TODAY)), "a title is needed");
ok(tripInput({ ...good, title: "x".repeat(120) }, TODAY).title.length === 120 && threw(() => tripInput({ ...good, title: "x".repeat(121) }, TODAY)), "a title stops at 120");
ok(tripInput({ ...good, note: "x".repeat(280) }, TODAY).note.length === 280 && threw(() => tripInput({ ...good, note: "x".repeat(281) }, TODAY)), "a note stops at 280");
ok(tripInput({ ...good, note: "   " }, TODAY).note === null, "a blank note is no note");
for (const bad of ["Squid Redondo", "SQUID", "squid_redondo", "squid/redondo", "", "x".repeat(81), null, 7, "squid redondo", "../etc"]) {
  ok(threw(() => tripInput({ ...good, planId: bad }, TODAY)), `the plan id ${JSON.stringify(String(bad).slice(0, 20))} is refused`);
}
ok(threw(() => tripInput({ ...good, spotId: "Redondo Pier" }, TODAY)) && threw(() => tripInput({ ...good, spotId: undefined }, TODAY)), "a spot id follows the same rule");
ok(tripInput({ ...good, planId: "x".repeat(80) }, TODAY).planId.length === 80, "80 is the edge for an id");
ok(threw(() => tripInput({ ...good, species: "" }, TODAY)) && threw(() => tripInput({ ...good, species: "x".repeat(41) }, TODAY)), "the fish is needed and short");
ok(threw(() => tripInput({ ...good, status: "done" }, TODAY)), "a trip cannot start out done");
ok(threw(() => tripInput({ ...good, status: "maybe" }, TODAY)), "a made-up status is refused");
ok(threw(() => tripInput(null, TODAY)) && threw(() => tripInput("trip", TODAY)) && threw(() => tripInput([], TODAY)), "no body at all is refused, not a crash");
for (const bad of [{ ...good, date: "nope" }, { ...good, title: "" }, { ...good, planId: "A B" }, { ...good, from: 9, to: 8 }, { ...good, note: "x".repeat(300) }, { ...good, status: "done" }, { ...good, species: null }]) {
  const m = said(() => tripInput(bad, TODAY));
  ok(plain(m), "the refusal reads as a sentence: " + m, m);
}

// ---- changing a trip -------------------------------------------------------
const row = { created_by: "u-maker", status: "idea", trip_date: "2026-11-28", from_hour: 17, to_hour: 21, title: "Squid at Redondo", note: null };
ok(JSON.stringify(tripPatch({ tripId: "x", status: "planned" }, row, TODAY)) === JSON.stringify({ status: "planned" }), "only what was sent comes back", JSON.stringify(tripPatch({ status: "planned" }, row, TODAY)));
const p2 = tripPatch({ title: " Squid, late ", note: " bring the lantern ", date: "2026-11-29", from: 18, to: 22 }, row, TODAY);
ok(p2.title === "Squid, late" && p2.note === "bring the lantern" && p2.date === "2026-11-29" && p2.from === 18 && p2.to === 22, "every field can change", JSON.stringify(p2));
ok(tripPatch({ note: "" }, row, TODAY).note === null && tripPatch({ note: null }, row, TODAY).note === null, "a note can be cleared");
ok(tripPatch({ from: null, to: null }, row, TODAY).from === null, "the window can be cleared");
ok(threw(() => tripPatch({ to: 16 }, row, TODAY)), "a new end is checked against the start already there");
ok(threw(() => tripPatch({ from: 21 }, row, TODAY)), "a new start is checked against the end already there");
ok(tripPatch({ to: 23 }, row, TODAY).to === 23, "a later end is fine");
ok(threw(() => tripPatch({ date: "2028-01-01" }, row, TODAY)) && threw(() => tripPatch({ date: "2026-02-31" }, row, TODAY)), "a new date follows the same rules");
const old = { ...row, trip_date: "2026-09-01", status: "planned" };
ok(tripPatch({ status: "done", date: "2026-09-01" }, old, TODAY).status === "done", "an old trip can still be marked done, its own date is not re-judged");
ok(threw(() => tripPatch({ status: "cancelled" }, row, TODAY)), "a made-up status is refused");
ok(tripPatch({ status: "done" }, row, TODAY).status === "done", "done is a real status when changing a trip");
ok(threw(() => tripPatch({ title: "" }, row, TODAY)) && threw(() => tripPatch({ title: null }, row, TODAY)), "a title cannot be emptied");
ok(threw(() => tripPatch({ tripId: "x" }, row, TODAY)) && threw(() => tripPatch({}, row, TODAY)) && threw(() => tripPatch(null, row, TODAY)), "nothing to change is refused");
ok(!("planId" in tripPatch({ planId: "crab-westport", note: "hi" }, row, TODAY)), "the plan itself cannot be swapped");
ok(plain(said(() => tripPatch({}, row, TODAY))) && plain(said(() => tripPatch({ to: 3 }, row, TODAY))), "those refusals are plain words too");

// ---- a catch ---------------------------------------------------------------
const c1 = catchInput({ species: " coho ", lengthIn: 24.5, weightLb: 6, lure: " pink hoochie ", notes: " first of the year " });
ok(c1.species === "coho" && c1.lengthIn === 24.5 && c1.weightLb === 6 && c1.lure === "pink hoochie" && c1.notes === "first of the year", "a full catch", JSON.stringify(c1));
const c2 = catchInput({ species: "squid" });
ok(c2.lengthIn === null && c2.weightLb === null && c2.lure === null && c2.notes === null, "only the fish is needed", JSON.stringify(c2));
ok(catchInput({ species: "coho", lengthIn: "24", weightLb: "" }).lengthIn === 24 && catchInput({ species: "coho", weightLb: "" }).weightLb === null, "a typed number counts, a blank is nothing");
ok(threw(() => catchInput({})) && threw(() => catchInput({ species: "x".repeat(41) })), "the fish is needed, up to 40");
ok(threw(() => catchInput({ species: "coho", lengthIn: -2 })) && threw(() => catchInput({ species: "coho", lengthIn: 0 })), "a length is more than nothing");
ok(threw(() => catchInput({ species: "coho", lengthIn: 5000 })) && threw(() => catchInput({ species: "coho", weightLb: 50000 })), "no fish is that big");
ok(threw(() => catchInput({ species: "coho", weightLb: "heavy" })) && threw(() => catchInput({ species: "coho", weightLb: {} })), "a weight is a number");
ok(threw(() => catchInput({ species: "coho", lure: "x".repeat(81) })) && threw(() => catchInput({ species: "coho", notes: "x".repeat(501) })), "lure stops at 80, notes at 500");
ok(threw(() => catchInput(null)), "no body is refused, not a crash");

// ---- join links ------------------------------------------------------------
const tok = newToken();
ok(/^[A-Za-z0-9_-]{43}$/.test(tok), "a token is 32 random bytes, base64url", tok.length);
ok(newToken() !== tok, "no two tokens are the same");
ok((await hashToken("abc")) === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "the stored form is sha256 hex");
ok(/^[0-9a-f]{64}$/.test(await hashToken(tok)) && (await hashToken(tok)) !== tok, "the token itself is never what is stored");
ok(joinLink(tok) === "https://coachpilot.org/rigs/#/join/" + tok, "the link opens the join screen");
ok(joinToken(tok) === tok, "a bare token is read");
ok(joinToken("  " + tok + "\n") === tok, "with stray spaces from a paste");
ok(joinToken(joinLink(tok)) === tok, "a whole link is read");
ok(joinToken("Here is your link: " + joinLink(tok) + " see you Saturday") === tok, "a link inside a pasted text is read");
ok(joinToken("coachpilot.org/rigs/#/join/" + tok + "?x=1") === tok, "a link with a tail is read");
ok(joinToken("") === "" && joinToken(null) === "" && joinToken(12) === "" && joinToken({}) === "", "nothing in, nothing out");
ok(joinToken("short") === "" && joinToken("x".repeat(500)) === "" && joinToken("has spaces in it and is long enough to count") === "", "junk is not a token");
ok(joinToken("https://evil.example/#/join/") === "", "a link with no token is not a token");

const mail = placeholderEmail();
ok(/^crew-[0-9a-f]{12}@members\.coachpilot\.org$/.test(mail), "an invited account gets a stand-in address", mail);
ok(placeholderEmail() !== mail, "a different one each time");

// ---- un-inviting someone who never joined leaves no ghost ------------------
const invited = { app_metadata: { crew_invited: true }, last_sign_in_at: null };
ok(ghostAccount({ user: invited, otherCrews: 0, ownsCrew: false }), "made by an invite, never signed in, on no other crew: it goes");
ok(!ghostAccount({ user: { ...invited, last_sign_in_at: "2026-11-26T10:00:00Z" }, otherCrews: 0, ownsCrew: false }), "someone who has signed in is kept");
ok(!ghostAccount({ user: invited, otherCrews: 1, ownsCrew: false }), "someone on another crew is kept");
ok(!ghostAccount({ user: invited, otherCrews: 0, ownsCrew: true }), "someone who owns a crew is kept");
ok(!ghostAccount({ user: { app_metadata: {}, last_sign_in_at: null }, otherCrews: 0, ownsCrew: false }), "an account the invite did not make is kept");
ok(!ghostAccount({ user: { user_metadata: { crew_invited: true }, app_metadata: {}, last_sign_in_at: null }, otherCrews: 0, ownsCrew: false }),
  "a mark the person could have set on themselves does not count");
ok(!ghostAccount({ user: { app_metadata: { crew_invited: "true" }, last_sign_in_at: null }, otherCrews: 0, ownsCrew: false }), "the mark must be exactly true");
ok(!ghostAccount({ user: null, otherCrews: 0, ownsCrew: false }) && !ghostAccount({}), "no account, nothing to delete");
ok(!ghostAccount({ user: invited }), "not knowing about other crews means keep it");

// ---- live: the deployed function, with no sign-in --------------------------
// It must turn away anyone without a good token, answer the two open
// questions, and never answer a bad request with a 500.
const URL = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-crew";
const post = async (body, headers) => {
  try {
    const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: typeof body === "string" ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch (e) { return { status: 0, body: { error: e.message } }; }
};
const noToken = await post({ action: "state" });
if (noToken.status === 0) console.log("skip  live checks: no network");
else {
  ok(noToken.status === 401, "no token is turned away", JSON.stringify(noToken));
  ok(!/service|key|secret/i.test(JSON.stringify(noToken.body)), "the refusal gives nothing away", JSON.stringify(noToken.body));
  const badToken = await post({ action: "state" }, { Authorization: "Bearer not.a.real.token" });
  ok(badToken.status === 401, "a bad token is turned away", JSON.stringify(badToken));
  const junk = await post("{ not json", { Authorization: "Bearer not.a.real.token" });
  ok(junk.status === 401, "junk with a bad token is still a 401, never a 500", JSON.stringify(junk));
  const getOnly = await fetch(URL).then((r) => r.status).catch(() => 0);
  ok(getOnly === 405 || getOnly === 401, "GET is not how you talk to it", getOnly);
  const hello = await post({ action: "hello" });
  ok(hello.status === 200 && hello.body.ok === true && typeof hello.body.sms === "boolean", "hello needs no sign-in and says whether texting works", JSON.stringify(hello));
  const deadLink = await post({ action: "join", token: newToken(), peek: true });
  ok(deadLink.status === 410 && /not good any more/.test(deadLink.body.error || ""), "a made-up join link is a dead link", JSON.stringify(deadLink));
  const noLink = await post({ action: "join" });
  ok(noLink.status === 400, "join with no link at all is bad input", JSON.stringify(noLink));
  for (const a of ["invite", "trip_create", "member_remove", "nonsense"]) {
    const r = await post({ action: a });
    ok(r.status === 401, `${a} with no sign-in is turned away`, JSON.stringify(r));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
