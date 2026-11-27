// The crew function's decisions, tested without a network: how a phone number
// typed by a human becomes one account, who may invite, who signs in with a
// link and who with a code, who may change a trip, what a trip and a note must
// look like, how a join link is made, how a catch from CastAI's own log is
// shown, and everything about alerts: who hears about what, quiet hours, the
// words of a text and a phone alert, the daily cap and the two minute rule.
// The last block asks the deployed function a few questions with no sign-in.
// Run: node tests/castai-crew.test.mjs
import * as core from "../supabase/functions/castai-crew/crew-core.mjs";

const {
  canInvite, inviteOutcome, normalizePhone,
  SECTIONS, ANSWERS, cleanText, optionalText, isUuid, todayIn, addDays,
  canEditTrip, statusChangeAllowed, tripInput, tripPatch,
  cleanSection, cleanAnswer, joinToken, newToken, hashToken, joinLink,
  placeholderEmail, ghostAccount,
  inviteMade, signInWith, inviteAnswer, linkRefusal,
  seedLabels, seedId, photoUrl, catchView,
  KINDS, prefsView, prefsPatch, hears, cleanTell, audience, inQuiet, quietUntil, dayLabel, tripLink,
  statusNews, alertWords, textWords, pushWords, capReached, noteTooSoon, pushSubInput, wantsText, rowOutcome,
  DAILY_CAP, NOTE_GAP_MS, TRIPS_LINK, CREW_LINK,
  crewRenameRefusal, cleanOpen, NAME_TAKEN,
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
  "addDays", "canEditTrip", "statusChangeAllowed", "tripInput", "tripPatch", "cleanSection",
  "cleanAnswer", "joinToken", "newToken", "hashToken", "joinLink", "placeholderEmail", "ghostAccount",
  "inviteMade", "signInWith", "inviteAnswer", "linkRefusal", "seedLabels", "seedId", "photoUrl", "catchView",
  "prefsView", "prefsPatch", "hears", "cleanTell", "audience", "inQuiet", "quietUntil", "dayLabel", "tripLink",
  "statusNews", "alertWords", "textWords", "pushWords", "capReached", "noteTooSoon", "pushSubInput", "wantsText", "rowOutcome",
  "crewRenameRefusal", "cleanOpen"]) {
  ok(fn(core[name]), `crew-core has ${name}`);
}
ok(!("catchInput" in core), "the first shape of a catch is gone: a crew catch is a CastAI catch now");
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

// ---- the crew's name: the owner's, and whoever joins picks it first -------
// Coach (11/27): "How about we provide examples and let Russ choose on his
// invite." While the name is open anyone on the crew names it, once.
ok(crewRenameRefusal({ owner: true, nameOpen: false }) === null, "the owner renames the crew whenever he likes");
ok(crewRenameRefusal({ owner: true, nameOpen: true }) === null, "including while it is open");
ok(crewRenameRefusal({ owner: false, nameOpen: true }) === null, "a member names it while its name is open");
const shut = crewRenameRefusal({ owner: false, nameOpen: false });
ok(shut && shut.status === 403 && shut.words === NAME_TAKEN && plain(shut.words), "once it is named a member is turned away, in plain words", JSON.stringify(shut));
ok(/only the owner/i.test(NAME_TAKEN) && /has its name/i.test(NAME_TAKEN), "and told why: it has its name, and only the owner changes it", NAME_TAKEN);
ok(crewRenameRefusal({ owner: false })?.status === 403 && crewRenameRefusal({})?.status === 403, "not knowing whether it is open is a no");
ok(crewRenameRefusal({ owner: "yes", nameOpen: "yes" })?.status === 403, "only a real true counts, never something that looks like one");
ok(cleanOpen(true) === true && cleanOpen(false) === false, "open is true or false");
for (const bad of [undefined, null, "true", 1, 0, "", {}, []]) ok(threw(() => cleanOpen(bad)), "open as " + JSON.stringify(bad) + " is refused");
ok(plain(said(() => cleanOpen("yes"))), "in plain words", said(() => cleanOpen("yes")));

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

// ---- a catch is a row from CastAI's own catch log --------------------------
// The angler writes that row with their own sign-in, so nothing in it has been
// through the crew function's cleaners. What the crew sees is clipped here.
const PHOTOS = "https://geigvuysptjvvqanumld.supabase.co/storage/v1/object/public/catch-photos/";
const ANGLER = "20fc4eee-f679-4394-8a0b-ecc015d8a2ec", FISH = "7b1c7f0e-52a8-4a55-9d1c-0d6d5f0a9e11";
const MINE = PHOTOS + ANGLER + "/";
const logRow = { id: FISH, user_id: ANGLER, species: " coho ", length: 24.5, weight: 6, lure: " pink hoochie ", notes: " first of the year ",
  photo_url: MINE + FISH + ".jpg", catch_date: "2026-11-28T17:05:00+00:00", created_at: "2026-11-28T17:06:00+00:00" };
const v1 = catchView(logRow, MINE);
ok(JSON.stringify(Object.keys(v1).sort()) === JSON.stringify(["at", "id", "lengthIn", "lure", "notes", "photoUrl", "species", "weightLb"]),
  "a catch shows its id, fish, length, weight, lure, notes, photo and time", Object.keys(v1).join());
ok(v1.id === FISH && v1.species === "coho" && v1.lengthIn === 24.5 && v1.weightLb === 6 && v1.lure === "pink hoochie" && v1.notes === "first of the year",
  "CastAI's length is inches and its weight is pounds, as its own add-a-catch screen says", JSON.stringify(v1));
ok(v1.at === "2026-11-28T17:05:00.000Z", "the time is when the fish was caught", v1.at);
ok(v1.photoUrl === MINE + FISH + ".jpg", "a photo in the angler's own folder is shown", v1.photoUrl);
const v2 = catchView({ id: FISH, user_id: ANGLER, species: "squid", catch_date: null, created_at: "2026-11-28T17:06:00Z" }, MINE);
ok(v2.lengthIn === null && v2.weightLb === null && v2.lure === null && v2.notes === null && v2.photoUrl === null, "only the fish is needed", JSON.stringify(v2));
ok(v2.at === "2026-11-28T17:06:00.000Z", "with no catch time, the time the row was made stands in", v2.at);
const wild = catchView({ id: FISH, user_id: ANGLER, species: "x".repeat(400), length: -3, weight: "heavy", lure: "y".repeat(400), notes: "z".repeat(4000),
  photo_url: "https://evil.example/pixel.gif", catch_date: "not a date", created_at: "nor this" }, MINE);
ok(wild.species.length <= 40 && wild.lure.length <= 80 && wild.notes.length <= 500, "long words are clipped, since the angler wrote the row directly");
ok(wild.lengthIn === null && wild.weightLb === null, "a size that is not a real size is left out");
ok(wild.photoUrl === null, "a photo address that is not in catch-photos is left out");
ok(wild.at === null, "a time that is not a time is left out, not passed on");
ok(catchView({ id: FISH, user_id: ANGLER, species: "   " }, MINE).species === "Fish", "a blank fish still has a name");
ok(photoUrl(MINE + FISH + ".jpg", MINE) === MINE + FISH + ".jpg", "the angler's own photo passes");
for (const [bad, why] of [["javascript:alert(1)", "a script"], ["http://geigvuysptjvvqanumld.supabase.co/storage/v1/object/public/catch-photos/" + ANGLER + "/a.jpg", "plain http"],
  [PHOTOS + "someone-else/a.jpg", "someone else's folder"], [MINE + "../" + ANGLER + "/a.jpg", "a path that climbs"],
  [MINE + "a.jpg?x=<script>", "a tail with a tag in it"], [MINE, "a folder with no file"], [MINE + "a".repeat(400) + ".jpg", "far too long"],
  ["", "nothing"], [null, "null"], [42, "a number"], [{}, "an object"]]) {
  ok(photoUrl(bad, MINE) === null, `a photo address that is ${why} is left out`);
}

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

// ---- who signs in with a link, and who with a code -------------------------
// A join link signs a person in with no code. That is only right for an account
// that exists because the owner added a name.
ok(inviteMade({ app_metadata: { crew_invited: true } }), "an account the invite made carries the mark");
ok(!inviteMade({ app_metadata: {} }) && !inviteMade({}) && !inviteMade(null), "any other account does not");
ok(!inviteMade({ user_metadata: { crew_invited: true }, app_metadata: {} }), "a mark a person could set on themselves does not count for a link either");
ok(!inviteMade({ app_metadata: { crew_invited: "true" } }) && !inviteMade({ app_metadata: { crew_invited: 1 } }), "the mark must be exactly true for a link too");
ok(signInWith(true) === "link", "an account the invite made signs in with its link");
ok(signInWith(false) === "code" && signInWith(undefined) === "code" && signInWith(null) === "code", "every other account signs in with a code");
ok(signInWith("true") === "code" && signInWith(1) === "code" && signInWith({}) === "code", "not knowing means a code, never a link");

const LINKED = "https://coachpilot.org/rigs/#/join/" + "A".repeat(43);
const made1 = inviteAnswer({ created: true, name: "Russell", userId: "u1", invited: true, link: LINKED });
ok(JSON.stringify(made1) === JSON.stringify({ ok: true, created: true, name: "Russell", userId: "u1", link: LINKED, signIn: "link" }),
  "a new person gets a link", JSON.stringify(made1));
const real1 = inviteAnswer({ created: true, name: "Dad", userId: "u2", invited: false, link: LINKED });
ok(JSON.stringify(real1) === JSON.stringify({ ok: true, created: true, name: "Dad", userId: "u2", link: null, signIn: "code" }),
  "someone who already had an account is added, and no link ever goes out for them", JSON.stringify(real1));
ok(inviteAnswer({ created: false, name: "Dad", userId: "u2", invited: undefined, link: LINKED }).link === null, "not knowing means no link");
ok(inviteAnswer({ created: false, name: "Russell", userId: "u1", invited: true, link: LINKED }).created === false, "already on the crew says so");
ok(inviteAnswer({ created: true, name: "Russell", userId: "u1", invited: true, link: undefined }).link === null, "a link that was never made reads as none");

ok(linkRefusal({ owner: true, self: false, onCrew: true, invited: true }) === null, "the owner makes a link for someone the invite made");
ok(linkRefusal({ owner: false, self: true, onCrew: true, invited: true }) === null, "and that person makes their own");
const notYours = linkRefusal({ owner: false, self: false, onCrew: true, invited: true });
ok(notYours && notYours.status === 403 && plain(notYours.words), "a member cannot make a link for someone else", JSON.stringify(notYours));
const stranger = linkRefusal({ owner: true, self: false, onCrew: false, invited: true });
ok(stranger && stranger.status === 404 && plain(stranger.words), "a link for someone who is not on the crew is a 404", JSON.stringify(stranger));
const realAcct = linkRefusal({ owner: true, self: false, onCrew: true, invited: false });
ok(realAcct && realAcct.status === 403 && realAcct.words === "They sign in with their number and a code.", "no link for an account that belonged to someone first", JSON.stringify(realAcct));
const realSelf = linkRefusal({ owner: false, self: true, onCrew: true, invited: false });
ok(realSelf && realSelf.status === 403 && realSelf.words === "You sign in with your number and a code.", "not even for themselves", JSON.stringify(realSelf));
ok(linkRefusal({ owner: true, self: true, onCrew: true, invited: undefined }).status === 403, "not knowing means no link is made");
ok(linkRefusal({ owner: false, self: false, onCrew: false, invited: false }).status === 403, "a member asking about a stranger learns nothing about them");

// ---- the list a trip starts with -------------------------------------------
ok(JSON.stringify(seedLabels(undefined)) === "[]" && JSON.stringify(seedLabels(null)) === "[]" && JSON.stringify(seedLabels([])) === "[]", "no list is an empty list");
ok(JSON.stringify(seedLabels([" squid jigs ", "lantern", "bucket"])) === JSON.stringify(["squid jigs", "lantern", "bucket"]), "the gear lines, trimmed, in order");
ok(seedLabels(["net", "net"]).length === 2, "two of the same line are two lines");
ok(seedLabels(Array.from({ length: 40 }, (_, i) => "line " + i)).length === 40, "40 lines is the edge and passes");
ok(threw(() => seedLabels(Array.from({ length: 41 }, (_, i) => "line " + i))), "41 lines is refused");
ok(seedLabels(["x".repeat(120)])[0].length === 120 && threw(() => seedLabels(["x".repeat(121)])), "a line stops at 120");
ok(threw(() => seedLabels(["net", ""])) && threw(() => seedLabels(["net", "   "])), "an empty line is refused");
ok(threw(() => seedLabels("net")) && threw(() => seedLabels({ 0: "net" })) && threw(() => seedLabels(7)), "a list has to be a list");
ok(threw(() => seedLabels(["net", 7])) && threw(() => seedLabels([["net"]])) && threw(() => seedLabels([null])), "every line has to be words");
ok(plain(said(() => seedLabels("net"))) && plain(said(() => seedLabels(Array(41).fill("x")))) && plain(said(() => seedLabels([""]))), "those refusals are plain words",
  said(() => seedLabels("net")) + " | " + said(() => seedLabels(Array(41).fill("x"))) + " | " + said(() => seedLabels([""])));
const TRIP_A = "20fc4eee-f679-4394-8a0b-ecc015d8a2ec", TRIP_B = "7b1c7f0e-52a8-4a55-9d1c-0d6d5f0a9e11";
const s0 = await seedId(TRIP_A, 0);
ok(isUuid(s0), "a starting line has an id of its own", s0);
ok((await seedId(TRIP_A, 0)) === s0, "the same line of the same trip always gets the same id, so a trip sent twice is seeded once");
ok((await seedId(TRIP_A, 1)) !== s0 && (await seedId(TRIP_B, 0)) !== s0, "another line, or another trip, gets another");

// ---- alerts: what a person has switched on ---------------------------------
ok(JSON.stringify(KINDS) === JSON.stringify(["trip_new", "trip_status", "note", "gear", "catch", "test"]), "the six kinds of alert");
const fresh = prefsView(null);
ok(JSON.stringify(fresh) === JSON.stringify({ texts: false, push: false, evTrips: true, evStatus: true, evNotes: true, evGearCatches: true, quietFrom: 21, quietTo: 6, textsStopped: false }),
  "everyone starts with both channels off, all four kinds ready, quiet from 9 at night to 6", JSON.stringify(fresh));
const stored = prefsView({ user_id: "u1", texts: true, push: false, ev_trips: true, ev_status: false, ev_notes: true, ev_gear_catches: false, quiet_from: 22, quiet_to: 7,
  texts_stopped: true, first_text_at: "2026-11-26T10:00:00Z", updated_at: "2026-11-26T10:00:00Z" });
ok(JSON.stringify(stored) === JSON.stringify({ texts: true, push: false, evTrips: true, evStatus: false, evNotes: true, evGearCatches: false, quietFrom: 22, quietTo: 7, textsStopped: true }),
  "a stored row reads back in the page's own names, and nothing else comes with it", JSON.stringify(stored));

ok(JSON.stringify(prefsPatch({ action: "prefs_set", texts: true })) === JSON.stringify({ texts: true }), "only what was sent is changed");
const allSet = prefsPatch({ texts: true, push: true, evTrips: false, evStatus: false, evNotes: false, evGearCatches: false, quietFrom: 22, quietTo: 5, textsStopped: false });
ok(JSON.stringify(allSet) === JSON.stringify({ texts: true, push: true, ev_trips: false, ev_status: false, ev_notes: false, ev_gear_catches: false, texts_stopped: false, quiet_from: 22, quiet_to: 5 }),
  "every switch and both hours can be set", JSON.stringify(allSet));
ok(prefsPatch({ quietFrom: 0, quietTo: 23 }).quiet_to === 23 && prefsPatch({ quietFrom: "21" }).quiet_from === 21, "hours run 0 to 23, and an hour typed as text counts");
ok(prefsPatch({ quietFrom: 8, quietTo: 8 }).quiet_from === 8, "the same hour twice is allowed: it means no quiet hours");
for (const [bad, why] of [[{ quietFrom: 24 }, "hour 24"], [{ quietTo: -1 }, "an hour below zero"], [{ quietFrom: 21.5 }, "half an hour"], [{ quietFrom: "late" }, "a word for an hour"],
  [{ quietTo: null }, "no hour"], [{ texts: "yes" }, "a word for a switch"], [{ push: 1 }, "a number for a switch"], [{ evNotes: null }, "nothing for a switch"],
  [{}, "nothing at all"], [{ action: "prefs_set" }, "only the action"], [{ firstTextAt: "2020-01-01" }, "a field that is not theirs to set"], [null, "no body"]]) {
  const m = said(() => prefsPatch(bad));
  ok(m && plain(m), `prefs are refused for ${why}: ${m}`, m);
}
ok(!("first_text_at" in prefsPatch({ texts: true, firstTextAt: "x", first_text_at: "x", user_id: "u9" })) && !("user_id" in prefsPatch({ texts: true, user_id: "u9" })),
  "nobody sets when their first text went, or whose prefs these are");

const on = (over) => ({ ...prefsView(null), ...over });
ok(!hears(prefsView(null), "note") && !hears(null, "note") && !hears(undefined), "with both channels off nobody hears anything");
ok(hears(on({ texts: true }), "note") && hears(on({ push: true }), "note"), "either channel on is enough");
ok(hears(on({ texts: true })) && !hears(on({})), "with no kind named it only asks whether a channel is on");
ok(!hears(on({ texts: true, evNotes: false }), "note") && hears(on({ texts: true, evNotes: false }), "trip_new"), "a kind switched off is not heard, the others still are");
ok(!hears(on({ push: true, evTrips: false }), "trip_new") && !hears(on({ push: true, evStatus: false }), "trip_status"), "trips and status each have their own switch");
ok(!hears(on({ push: true, evGearCatches: false }), "gear") && !hears(on({ push: true, evGearCatches: false }), "catch"), "gear and catches share one");
ok(hears(on({ texts: true, evTrips: false, evStatus: false, evNotes: false, evGearCatches: false }), "test"), "a test is heard whatever kinds are off");
ok(!hears(on({ texts: true }), "weather") && !hears(on({ texts: "yes" }), "note"), "a made-up kind is not heard, and on means exactly on");

// ---- alerts: who hears about what ------------------------------------------
const A = "aaaaaaaa-0000-4000-8000-000000000001", B = "bbbbbbbb-0000-4000-8000-000000000002", C = "cccccccc-0000-4000-8000-000000000003",
  D = "dddddddd-0000-4000-8000-000000000004", X = "eeeeeeee-0000-4000-8000-000000000005";
const crew4 = [A, B, C, D];
const allOn = new Map(crew4.map((id) => [id, on({ texts: true })]));
const told = (o) => audience({ members: crew4, prefs: allOn, ...o }).slice().sort().join();
const set = (...ids) => ids.slice().sort().join();
const goingRows = [{ user_id: A, answer: "going" }, { user_id: B, answer: "maybe" }, { user_id: C, answer: "out" }];

ok(told({ kind: "trip_new", by: A }) === set(B, C, D), "a new trip: everyone else on the crew");
ok(told({ kind: "trip_status", by: A, going: goingRows, maker: D }) === set(B, D), "it is on, moved or off: everyone going or maybe, plus the maker, minus whoever did it");
ok(told({ kind: "trip_status", by: D, going: goingRows, maker: D }) === set(A, B), "when the maker does it, the maker is not told");
ok(told({ kind: "note", by: C, going: goingRows, maker: A }) === set(A, B), "a note: going or maybe, plus the maker");
ok(told({ kind: "note", by: C, going: goingRows, maker: null }) === set(A, B), "a trip whose maker left still tells the people going");
ok(told({ kind: "catch", by: B, going: goingRows, maker: D }) === set(A, D), "a catch: going or maybe, plus the maker");
ok(told({ kind: "gear", by: A, assignee: C, going: goingRows, maker: D }) === set(C), "a list line handed to you: that person only");
ok(told({ kind: "gear", by: A, assignee: A }) === "" && told({ kind: "gear", by: A, assignee: null }) === "", "handing a line to yourself, or to nobody, tells nobody");
ok(told({ kind: "gear", by: A, assignee: X }) === "", "a line cannot tell someone who is not on the crew");
ok(told({ kind: "note", by: A, going: [{ user_id: A, answer: "going" }], maker: A }) === "", "nobody else going means nobody is told");
ok(told({ kind: "weather", by: A, going: goingRows, maker: D }) === "", "a made-up kind tells nobody");

const mixed = new Map([[A, on({ texts: true })], [B, on({})], [C, on({ push: true, evNotes: false })], [D, on({ push: true })]]);
const toldMixed = (o) => audience({ members: crew4, prefs: mixed, ...o }).slice().sort().join();
ok(toldMixed({ kind: "trip_new", by: A }) === set(C, D), "only people with a channel on are told");
ok(toldMixed({ kind: "note", by: A, going: [{ user_id: B, answer: "going" }, { user_id: C, answer: "going" }, { user_id: D, answer: "maybe" }], maker: A }) === set(D),
  "and only those with that kind on");
ok(audience({ kind: "trip_new", by: A, members: crew4, prefs: new Map() }).length === 0, "someone who never opened Alerts is never told");
ok(audience({ kind: "trip_new", by: A, members: crew4, prefs: { [B]: on({ texts: true }) } }).join() === B, "the prefs can come as a plain object too");

// the sender chooses
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: [] }) === "", "tell nobody: nobody is told");
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: [C] }) === set(C), "tell one person: exactly that person, even one who is not going");
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: [B, C, D] }) === set(B, C, D), "tell three: those three");
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: [A, B] }) === set(B), "the sender is never told, even when they name themselves");
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: [X, B] }) === set(B), "someone who is not on the crew is never told");
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: [B, B, B] }) === set(B), "a name given three times is told once");
ok(toldMixed({ kind: "note", by: A, going: [], maker: A, tell: [B, C, D] }) === set(D), "naming someone does not get past their own switches");
ok(told({ kind: "trip_new", by: A, tell: [B] }) === set(B), "a new trip can be told to just one");
ok(told({ kind: "gear", by: A, assignee: C, tell: [] }) === "" && told({ kind: "gear", by: A, assignee: C, tell: [C] }) === set(C), "a list line: the sender chooses whether its person hears");
ok(told({ kind: "gear", by: A, assignee: C, tell: [B, D] }) === "", "but a list line is only ever told to the person it was handed to");
ok(told({ kind: "note", by: A, going: goingRows, maker: D, tell: null }) === set(B, D) && told({ kind: "note", by: A, going: goingRows, maker: D, tell: undefined }) === set(B, D),
  "no tell at all means the usual people");

ok(cleanTell(undefined) === null && cleanTell(null) === null, "no tell is the usual people");
ok(JSON.stringify(cleanTell([])) === "[]", "an empty tell is nobody");
ok(JSON.stringify(cleanTell([A.toUpperCase(), B, A])) === JSON.stringify([A, B]), "ids are lower-cased and given once");
for (const [bad, why] of [["everyone", "a word"], [[A, "nope"], "a mangled id in it"], [{ 0: A }, "an object"], [[A, null], "a blank in it"], [Array(51).fill(A), "more than 50 names"], [true, "a yes"]]) {
  const m = said(() => cleanTell(bad));
  ok(m && plain(m), `tell is refused for ${why}: ${m}`, m);
}

// ---- alerts: quiet hours, per person, in Seattle time ----------------------
ok(inQuiet(21, 21, 6) && inQuiet(23, 21, 6) && inQuiet(0, 21, 6) && inQuiet(5, 21, 6), "9 at night to 6: quiet from 9 through 5");
ok(!inQuiet(6, 21, 6) && !inQuiet(12, 21, 6) && !inQuiet(20, 21, 6), "and not from 6 through 8 at night");
ok(inQuiet(13, 13, 15) && inQuiet(14, 13, 15) && !inQuiet(15, 13, 15) && !inQuiet(12, 13, 15), "a daytime stretch works too");
ok(!inQuiet(3, 8, 8) && !inQuiet(8, 8, 8), "the same hour twice means no quiet hours");
const at = (isoZ) => new Date(isoZ);
const until = (isoZ, f, t) => quietUntil(at(isoZ), f, t).toISOString();
ok(until("2026-11-26T20:00:00.000Z", 21, 6) === "2026-11-26T20:00:00.000Z", "noon in Seattle: it goes now");
ok(until("2026-11-27T04:59:59.000Z", 21, 6) === "2026-11-27T04:59:59.000Z", "one second before 9 at night: it goes now");
ok(until("2026-11-27T05:00:00.000Z", 21, 6) === "2026-11-27T14:00:00.000Z", "9 at night: held until 6 the next morning", until("2026-11-27T05:00:00.000Z", 21, 6));
ok(until("2026-11-27T06:30:10.250Z", 21, 6) === "2026-11-27T14:00:00.000Z", "10:30 at night: held until 6 sharp", until("2026-11-27T06:30:10.250Z", 21, 6));
ok(until("2026-11-27T13:59:00.000Z", 21, 6) === "2026-11-27T14:00:00.000Z", "a minute before 6: held one minute");
ok(until("2026-11-27T14:00:00.000Z", 21, 6) === "2026-11-27T14:00:00.000Z", "6 on the dot: it goes");
ok(until("2026-07-01T05:30:00.000Z", 21, 6) === "2026-07-01T13:00:00.000Z", "in summer 6 in the morning is an hour earlier on the server's clock", until("2026-07-01T05:30:00.000Z", 21, 6));
ok(until("2026-11-01T05:30:00.000Z", 21, 6) === "2026-11-01T14:00:00.000Z", "the night the clocks go back, 6 is still 6", until("2026-11-01T05:30:00.000Z", 21, 6));
ok(until("2026-03-08T06:30:00.000Z", 21, 6) === "2026-03-08T13:00:00.000Z", "the night the clocks go forward, 6 is still 6", until("2026-03-08T06:30:00.000Z", 21, 6));
ok(until("2026-11-26T21:30:00.000Z", 13, 15) === "2026-11-26T23:00:00.000Z", "a daytime stretch holds until its own end", until("2026-11-26T21:30:00.000Z", 13, 15));
ok(until("2026-11-27T06:30:00.000Z", 8, 8) === "2026-11-27T06:30:00.000Z", "no quiet hours: it always goes now");
ok(until("2026-11-27T06:30:00.000Z", undefined, undefined) === "2026-11-27T14:00:00.000Z", "hours that are missing fall back to 9 and 6", until("2026-11-27T06:30:00.000Z", undefined, undefined));
ok(quietUntil(at("2026-11-27T06:30:00.000Z"), 21, 6) > at("2026-11-27T06:30:00.000Z"), "a held alert is always held into the future");

// ---- alerts: the words -----------------------------------------------------
ok(dayLabel("2026-11-28") === "Sat Nov 28" && dayLabel("2026-12-05") === "Sat Dec 5" && dayLabel("2027-01-01") === "Fri Jan 1", "a date reads the way a person says it", dayLabel("2026-11-28"));
ok(dayLabel("2026-02-30") === "" && dayLabel(null) === "" && dayLabel("soon") === "", "a date that is not a date has no label");
ok(tripLink(TRIP_A) === "https://coachpilot.org/rigs/#/crew/trip/" + TRIP_A, "a trip's link opens that trip");
ok(TRIPS_LINK === "https://coachpilot.org/rigs/#/trips" && CREW_LINK === "https://coachpilot.org/rigs/#/crew", "and the other two links are the trips tab and the crew screen");

const squid = { id: TRIP_A, title: "Squid at Redondo", date: "2026-11-28" };
const said2 = (o) => alertWords({ name: "Coach", trip: squid, ...o });
const w1 = said2({ kind: "trip_new", status: "idea" });
ok(JSON.stringify(w1) === JSON.stringify({ title: "Coach floated a trip", body: "Squid at Redondo, Sat Nov 28", url: tripLink(TRIP_A) }), "an idea: who floated it, the trip and day, and its link", JSON.stringify(w1));
ok(said2({ kind: "trip_new", status: "planned" }).title === "Coach planned a trip", "a planned trip");
ok(said2({ kind: "trip_status", news: "on" }).title === "Coach says it is on", "it is on");
ok(said2({ kind: "trip_status", news: "off" }).title === "Coach called it off", "it was called off");
ok(said2({ kind: "trip_status", news: "moved" }).title === "Coach moved the day", "the date moved");
ok(said2({ kind: "trip_status", news: "time" }).title === "Coach changed the time", "the time moved");
const gone = said2({ kind: "trip_status", news: "gone" });
ok(gone.title === "Coach deleted the trip" && gone.url === TRIPS_LINK && gone.body === "Squid at Redondo, Sat Nov 28", "a deleted trip links to the trips tab, since the trip is not there to open", JSON.stringify(gone));
ok(said2({ kind: "note" }).title === "Coach left a note", "a note");
ok(said2({ kind: "gear", label: "ring nets" }).title === "Coach put you down for ring nets", "a list line handed to you");
ok(said2({ kind: "catch", species: "coho" }).title === "Coach landed a coho" && said2({ kind: "catch", species: "eel" }).title === "Coach landed an eel", "a catch, with a or an");
ok(said2({ kind: "catch", species: "  " }).title === "Coach landed a fish", "a catch with no fish named");
const testWords = alertWords({ kind: "test" });
ok(JSON.stringify(testWords) === JSON.stringify({ title: "Rig Card test", body: "It works.", url: CREW_LINK }), "the test alert", JSON.stringify(testWords));
ok(alertWords({ kind: "trip_status", name: "Coach", trip: squid, news: "done" }) === null && alertWords({ kind: "weather", name: "Coach", trip: squid }) === null && alertWords(null) === null,
  "nothing to say means no alert at all");
ok(alertWords({ kind: "note", name: "", trip: squid }).title === "Someone left a note", "a blank name still reads");
const longOne = alertWords({ kind: "gear", name: "N".repeat(60), label: "L".repeat(120), trip: { id: TRIP_A, title: "T".repeat(120), date: "2026-11-28" } });
ok(longOne.title.length <= 90 && longOne.body.length <= 85, "long names, lines and titles are clipped", longOne.title.length + " " + longOne.body.length);
ok(alertWords({ kind: "note", name: "Coach", trip: { id: TRIP_A, title: "Squid", date: null } }).body === "Squid", "a trip with no date still reads");
for (const w of [w1, gone, longOne, said2({ kind: "gear", label: "ring nets" }), said2({ kind: "catch", species: "coho" })]) {
  ok(!w.title.includes(LONG_DASH) && !w.body.includes(LONG_DASH) && !/undefined|null|NaN/.test(w.title + w.body), "the words hold no long dash and no blanks: " + w.title.slice(0, 40));
}

const rowOf = (w, kind) => ({ id: "9d0e3c1a-1111-4222-8333-444455556666", kind, ...w });
const text1 = textWords(rowOf(w1, "trip_new"), false);
ok(text1 === "Rig Card: Coach floated a trip. Squid at Redondo, Sat Nov 28. " + tripLink(TRIP_A), "a text: Rig Card, who did what, the trip and day, the link", text1);
ok(textWords(rowOf(w1, "trip_new"), true) === text1 + " Reply STOP to stop.", "the first text ever to a person says how to stop");
ok(textWords(rowOf(testWords, "test"), false) === "Rig Card test. It works." && textWords(rowOf(testWords, "test"), true) === "Rig Card test. It works. Reply STOP to stop.", "the test text");
const longText = textWords(rowOf(longOne, "gear"), true);
ok(longText.length < 300 && longText.includes(tripLink(TRIP_A)) && longText.endsWith(" Reply STOP to stop."), "the longest text there can be is under 300 and keeps its link whole", longText.length);
const tooMuch = textWords({ kind: "note", title: "A".repeat(400), body: "B".repeat(400), url: tripLink(TRIP_A) }, true);
ok(tooMuch.length < 300 && tooMuch.includes(tripLink(TRIP_A)) && tooMuch.endsWith(" Reply STOP to stop."), "even a row with far too many words in it", tooMuch.length);
const p1 = pushWords(rowOf(w1, "trip_new"));
ok(JSON.stringify(p1) === JSON.stringify({ title: "Coach floated a trip", body: "Squid at Redondo, Sat Nov 28", url: tripLink(TRIP_A), tag: "crew-9d0e3c1a-1111-4222-8333-444455556666" }),
  "a phone alert: who did what, the trip and day, the link to open, and a tag of its own", JSON.stringify(p1));

// what happened to a trip, from what changed on it
const was = { status: "idea", trip_date: "2026-11-28", from_hour: 17, to_hour: 21 };
ok(statusNews(was, { status: "planned" }) === "on", "an idea raised to planned is on");
ok(statusNews({ ...was, status: "planned" }, { status: "idea" }) === "off", "planned put back to an idea is off");
ok(statusNews(was, { trip_date: "2026-11-29" }) === "moved", "a new date is moved");
ok(statusNews(was, { from_hour: 18 }) === "time" && statusNews(was, { to_hour: 22 }) === "time", "a new window is a new time");
ok(statusNews(was, { status: "planned", trip_date: "2026-11-29", from_hour: 18 }) === "on", "on and moved at once says it is on, and the alert carries the new day");
ok(statusNews(was, { trip_date: "2026-11-29", to_hour: 22 }) === "moved", "a new day and time is moved");
ok(statusNews(was, { title: "Squid, late" }) === null && statusNews(was, { note: "bring the lantern" }) === null, "a new title or note is not news");
ok(statusNews({ ...was, status: "planned" }, { status: "done" }) === null && statusNews({ ...was, status: "done" }, { status: "planned" }) === null, "done and reopened are not news");
ok(statusNews(was, {}) === null && statusNews(null, { status: "planned" }) === null && statusNews(was, null) === null, "nothing changed, nothing to say");

// ---- alerts: the limits ----------------------------------------------------
ok(DAILY_CAP === 30 && NOTE_GAP_MS === 120000, "30 a day, and two minutes between notes");
ok(!capReached(0) && !capReached(29) && capReached(30) && capReached(31), "the 31st alert of the day is not sent");
ok(capReached(NaN) && capReached(undefined), "not knowing how many went means send no more");
const T0 = Date.parse("2026-11-26T20:00:00Z");
ok(noteTooSoon(T0, T0 + 1000) && noteTooSoon(T0, T0 + 119999), "a second note inside two minutes is too soon");
ok(!noteTooSoon(T0, T0 + 120000) && !noteTooSoon(T0, T0 + 600000), "at two minutes it goes again");
ok(!noteTooSoon(null, T0) && !noteTooSoon(undefined, T0) && !noteTooSoon(NaN, T0), "the first note is never too soon");

// ---- alerts: which channel, and how a row ends -----------------------------
ok(wantsText({ test: false, texts: true, push: "none" }) && wantsText({ test: false, texts: true, push: "failed" }), "a text goes when there is no phone alert, or every one failed");
ok(!wantsText({ test: false, texts: true, push: "sent" }), "a phone alert that landed is enough: no text as well");
ok(!wantsText({ test: false, texts: false, push: "failed" }) && !wantsText({ test: true, texts: false, push: "none" }), "texts off means no text");
ok(wantsText({ test: true, texts: true, push: "sent" }), "a test tries both, so each can be seen to work");
const end = (push, text) => JSON.stringify(rowOutcome({ push, text }));
ok(end("sent", "off") === JSON.stringify({ status: "sent", channel: "push", error: null }), "a phone alert that landed: sent, by push");
ok(end("none", "sent") === JSON.stringify({ status: "sent", channel: "text", error: null }) && end("failed", "sent") === JSON.stringify({ status: "sent", channel: "text", error: null }),
  "a text that went: sent, by text");
ok(end("sent", "sent") === JSON.stringify({ status: "sent", channel: "push+text", error: null }), "a test that reached both");
ok(end("failed", "off") === JSON.stringify({ status: "failed", channel: null, error: "push failed" }), "every phone alert failed and no text could go: failed");
ok(end("none", "failed") === JSON.stringify({ status: "failed", channel: null, error: "text failed" }) && end("failed", "failed") === JSON.stringify({ status: "failed", channel: null, error: "push failed, text failed" }),
  "a text that failed: failed");
ok(end("none", "nophone") === JSON.stringify({ status: "skipped", channel: null, error: "no phone" }), "texts on with no number on the account: skipped, nothing was tried");
ok(end("failed", "nophone") === JSON.stringify({ status: "failed", channel: null, error: "push failed" }), "a failed phone alert and no number: failed");
ok(end("none", "stopped") === JSON.stringify({ status: "skipped", channel: null, error: "texts stopped" }), "someone who replied STOP: skipped");
ok(end("none", "off") === JSON.stringify({ status: "skipped", channel: null, error: "no channel" }), "nothing to send to: skipped");

// ---- alerts: a phone that wants them ---------------------------------------
const P256 = "B" + "A".repeat(86), AUTHKEY = "A".repeat(22);
const sub = pushSubInput({ endpoint: "https://fcm.googleapis.com/fcm/send/abc123", p256dh: P256, auth: AUTHKEY, ua: "  Mozilla/5.0 (iPhone)  " });
ok(JSON.stringify(sub) === JSON.stringify({ endpoint: "https://fcm.googleapis.com/fcm/send/abc123", p256dh: P256, auth: AUTHKEY, ua: "Mozilla/5.0 (iPhone)" }), "a phone's alert address and its two keys", JSON.stringify(sub));
ok(pushSubInput({ endpoint: "https://web.push.apple.com/QGx", p256dh: P256 + "=", auth: AUTHKEY + "==" }).auth === AUTHKEY, "padding on a key is dropped, and the phone's name is optional");
ok(pushSubInput({ endpoint: "https://example.invalid/push/" + TRIP_A, p256dh: P256, auth: AUTHKEY }).ua === null, "an address that leads nowhere is still an address");
ok(pushSubInput({ endpoint: "https://a.example/x", p256dh: P256, auth: AUTHKEY, ua: "u".repeat(900) }).ua.length <= 200, "a long phone name is clipped");
for (const [bad, why] of [[{ endpoint: "http://fcm.googleapis.com/x" }, "plain http"], [{ endpoint: "https://localhost/x" }, "this machine"], [{ endpoint: "https://127.0.0.1/x" }, "a bare number address"],
  [{ endpoint: "https://[::1]/x" }, "a bare v6 address"], [{ endpoint: "https://intranet/x" }, "a name with no dot"], [{ endpoint: "https://user:pw@a.example/x" }, "a sign-in inside the address"],
  [{ endpoint: "https://a.example:8443/x" }, "an odd port"], [{ endpoint: "not a url" }, "not an address"], [{ endpoint: "https://a.example/" + "x".repeat(1000) }, "an address that is far too long"],
  [{ endpoint: 7 }, "a number"], [{ p256dh: "short" }, "a short key"], [{ p256dh: P256 + "!" }, "a key with a stray mark"], [{ auth: "" }, "no second key"], [{ auth: "x".repeat(200) }, "a second key that is too long"]]) {
  const m = said(() => pushSubInput({ endpoint: "https://a.example/x", p256dh: P256, auth: AUTHKEY, ...bad }));
  ok(m && plain(m), `a phone is refused for ${why}: ${m}`, m);
}
ok(threw(() => pushSubInput(null)) && threw(() => pushSubInput({})), "no body is refused, not a crash");

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
  ok(typeof hello.body.vapidKey === "string" && /^[A-Za-z0-9_-]{80,100}$/.test(hello.body.vapidKey), "and hands over the public key a phone needs to ask for alerts", JSON.stringify(hello.body).slice(0, 80));
  const badKey = await post({ action: "deliver" }, { "x-cron-key": "not-the-key" });
  ok(badKey.status === 403 && typeof badKey.body.error === "string" && Object.keys(badKey.body).length === 1, "deliver with the wrong key is turned away, and told nothing", JSON.stringify(badKey));
  const noKey = await post({ action: "deliver" });
  ok(noKey.status === 401, "deliver with no key and no sign-in is turned away", JSON.stringify(noKey));
  const deadLink = await post({ action: "join", token: newToken(), peek: true });
  ok(deadLink.status === 410 && /not good any more/.test(deadLink.body.error || ""), "a made-up join link is a dead link", JSON.stringify(deadLink));
  const noLink = await post({ action: "join" });
  ok(noLink.status === 400, "join with no link at all is bad input", JSON.stringify(noLink));
  for (const a of ["invite", "trip_create", "member_remove", "catch_link", "prefs_get", "prefs_set", "push_subscribe", "test_alert", "outbox", "crew_rename", "crew_name_open", "nonsense"]) {
    const r = await post({ action: a });
    ok(r.status === 401, `${a} with no sign-in is turned away`, JSON.stringify(r));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
