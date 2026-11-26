// The crew's decisions, with no imports, so the Deno function and the node
// tests run the same code: people and how they sign in, trips, join links,
// catches, and alerts (who hears about what, quiet hours, the words, the
// limits). Everything here is a plain function: it reads what it is given and
// either answers or throws an Error whose message is words a person can read
// on a phone.

export const SECTIONS = ["plan", "what", "gear", "bait", "how", "wx", "river", "spot", "expect", "rules"];
export const ANSWERS = ["going", "maybe", "out"];
export const STATUSES = ["idea", "planned", "done"];
export const LINK_BASE = "https://coachpilot.org/rigs/#/join/";
export const LINK_DAYS = 30;
export const DEAD_LINK = "That link is not good any more. Ask for a new one.";

const say = (words) => { throw new Error(words); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// ---- people ----------------------------------------------------------------

// Coach types a number the way he has it in his phone. Everything here has to
// land on one account, because the account IS the phone number.
export function normalizePhone(raw) {
  const digits = String(raw == null ? "" : raw).replace(/\D+/g, "");
  if (digits.length === 10) return "+1" + digits;
  if (digits.length === 11 && digits[0] === "1") return "+" + digits;
  say("That does not look like a US phone number.");
}

// Only the owner adds people. Everyone else is along for the ride.
export function canInvite(member) {
  return !!member && member.role === "owner";
}

// An invited number may already have a CastAI account. Attach it; never make
// a second account for the same person.
export function inviteOutcome({ user, member }) {
  if (member) return "already";
  return user ? "attach" : "create";
}

// Every invited account needs an address to mint its sign-in. This one is a
// stand-in that goes nowhere and is never shown to anyone.
export function placeholderEmail() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return "crew-" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") + "@members.coachpilot.org";
}

// The mark an invite leaves on an account it made. It lives in app_metadata,
// which a person cannot set on themselves.
export function inviteMade(user) {
  return !!user && isObject(user.app_metadata) && user.app_metadata.crew_invited === true;
}

// Un-inviting someone who never joined should leave no empty account behind.
// Only an account the invite itself made, that has never signed in, that is on
// no other crew and owns none. Anything else is somebody's real account: keep it.
export function ghostAccount({ user, otherCrews, ownsCrew } = {}) {
  return inviteMade(user) && !user.last_sign_in_at && otherCrews === 0 && ownsCrew === false;
}

// ---- small cleaners --------------------------------------------------------

export function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

// Postgres cannot hold a zero byte or half of a surrogate pair. Drop the first
// and mend the second, so odd input is cleaned instead of crashing a write.
function storable(text) {
  const out = text.split(String.fromCharCode(0)).join("");
  return typeof out.toWellFormed === "function" ? out.toWellFormed() : out;
}

// Trims. Throws when there is nothing left, or more than max. `what` names the
// thing in the refusal ("title", "note"), so the words fit the box they are for.
export function cleanText(value, max, what) {
  const the = what ? "The " + what : "That";
  if (typeof value !== "string") say(the + " cannot be empty.");
  const text = storable(value).trim();
  if (!text) say(the + " cannot be empty.");
  if (text.length > max) say(the + " is too long. Keep it to " + max + " characters.");
  return text;
}

// The same, for a box that may be left empty: blank comes back as null.
export function optionalText(value, max, what) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") say((what ? "The " + what : "That") + " has to be words.");
  return value.trim() ? cleanText(value, max, what) : null;
}

export function cleanSection(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !SECTIONS.includes(value)) say("That is not a part of the run card.");
  return value;
}

export function cleanAnswer(value) {
  if (typeof value !== "string" || !ANSWERS.includes(value)) say("The answer is going, maybe or out.");
  return value;
}

// A number that may be left out. Text that is plainly a number counts, since
// a form field hands over text.
function optionalNumber(value, what) {
  if (value === undefined || value === null || value === "") return null;
  let n = NaN;
  if (typeof value === "number") n = value;
  else if (typeof value === "string" && /^\s*\d+(\.\d+)?\s*$/.test(value)) n = Number(value);
  if (!Number.isFinite(n)) say("The " + what + " has to be a number.");
  return n;
}

// ---- dates -----------------------------------------------------------------

// "Today" is the day in Seattle, whatever clock the server keeps.
export function todayIn(now = new Date(), zone = "America/Los_Angeles") {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type).value;
  return get("year") + "-" + get("month") + "-" + get("day");
}

export function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function realDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const back = new Date(Date.UTC(y, m - 1, d));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

function tripDate(value, todayIso) {
  if (!realDate(value)) say("That date does not look right.");
  if (value > addDays(todayIso, 366)) say("That date is more than a year out.");
  if (value < addDays(todayIso, -30)) say("That date is too far back.");
  return value;
}

function hour(value, what) {
  const n = optionalNumber(value, what);
  if (n !== null && (n < 0 || n > 24)) say("Hours run from 0 to 24.");
  return n;
}

function windowOk(from, to) {
  if (from !== null && to !== null && !(to > from)) say("The end has to come after the start.");
}

function slug(value, what) {
  if (typeof value !== "string" || !/^[a-z0-9-]{1,80}$/.test(value)) say("That " + what + " is not one the app knows.");
  return value;
}

// ---- trips -----------------------------------------------------------------

// member: { user_id, role }. trip: { created_by, status, trip_date }.
// The owner, or the person who made the trip.
export function canEditTrip(member, trip) {
  if (!member || !trip) return false;
  if (member.role === "owner") return true;
  return !!member.user_id && !!trip.created_by && member.user_id === trip.created_by;
}

// idea -> planned: anyone on the crew. planned -> idea and done -> planned:
// whoever can edit the trip. -> done: whoever can edit it at any time, and
// anyone once the day has come. done never goes straight back to an idea.
export function statusChangeAllowed(member, trip, to, todayIso) {
  if (!member || !trip || !STATUSES.includes(to)) return false;
  const from = trip.status;
  if (to === from) return true;
  const edit = canEditTrip(member, trip);
  if (to === "planned") return from === "idea" || edit;
  if (to === "idea") return from === "planned" && edit;
  return edit || String(trip.trip_date) <= todayIso;
}

// A new trip. Returns the cleaned fields or throws in plain words.
export function tripInput(body, todayIso) {
  if (!isObject(body)) say("That did not read as a trip.");
  const out = {
    planId: slug(body.planId, "trip"),
    spotId: slug(body.spotId, "spot"),
    species: cleanText(body.species, 40, "fish"),
    title: cleanText(body.title, 120, "title"),
    date: tripDate(body.date, todayIso),
    from: hour(body.from, "start"),
    to: hour(body.to, "end"),
    status: body.status === undefined || body.status === null ? "idea" : body.status,
    note: optionalText(body.note, 280, "note"),
  };
  windowOk(out.from, out.to);
  if (out.status !== "idea" && out.status !== "planned") say("A new trip is an idea or planned.");
  return out;
}

// A change to a trip that exists (trip is its row). Returns only the fields
// that were sent, cleaned. The window is judged with whatever half is already
// there. A date is judged only when it moves, so an old trip can still be
// marked done.
export function tripPatch(body, trip, todayIso) {
  if (!isObject(body) || !isObject(trip)) say("There is nothing to change.");
  const out = {};
  if (has(body, "title")) out.title = cleanText(body.title, 120, "title");
  if (has(body, "note")) out.note = optionalText(body.note, 280, "note");
  if (has(body, "date")) out.date = body.date === trip.trip_date ? body.date : tripDate(body.date, todayIso);
  if (has(body, "from")) out.from = hour(body.from, "start");
  if (has(body, "to")) out.to = hour(body.to, "end");
  if (has(body, "status")) {
    if (!STATUSES.includes(body.status)) say("A trip is an idea, planned or done.");
    out.status = body.status;
  }
  if (!Object.keys(out).length) say("There is nothing to change.");
  const cur = (v) => (v === undefined || v === null ? null : Number(v));
  windowOk(has(out, "from") ? out.from : cur(trip.from_hour), has(out, "to") ? out.to : cur(trip.to_hour));
  return out;
}

// ---- join links ------------------------------------------------------------

// 32 random bytes, base64url. This is the only time the token exists in the
// clear on the server: what gets stored is hashToken(token).
export function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token) {
  const sum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(token)));
  return Array.from(new Uint8Array(sum), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function joinLink(token) {
  return LINK_BASE + token;
}

// What someone pastes may be the bare token, the whole link, or the whole text
// message with the link inside it. Anything else comes back as "".
export function joinToken(raw) {
  if (typeof raw !== "string" || raw.length > 400) return "";
  const text = raw.trim();
  if (/^[A-Za-z0-9_-]{43}$/.test(text)) return text;
  const m = text.match(/\/join\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/);
  return m ? m[1] : "";
}

// ---- who signs in with a link, and who with a code -------------------------

export const CODE_ONLY = "They sign in with their number and a code.";
export const CODE_ONLY_SELF = "You sign in with your number and a code.";

// A join link signs a person in with no code. That is right for an account
// that exists only because the owner added a name. Any other account belonged
// to somebody first, and whoever held its link would be inside it, so it signs
// in with its number and a texted code. Not knowing means a code.
export function signInWith(invited) {
  return invited === true ? "link" : "code";
}

// What the owner gets back after adding someone. An account the invite did not
// make never carries a link, whatever was handed in.
export function inviteAnswer({ created, name, userId, invited, link } = {}) {
  const signIn = signInWith(invited);
  return { ok: true, created: !!created, name, userId, link: signIn === "link" && link ? link : null, signIn };
}

// May a link be made? null means yes. Otherwise the status and the words. A
// member asking about anyone but themselves is turned away before anything is
// said about that person.
export function linkRefusal({ owner, self, onCrew, invited } = {}) {
  if (!owner && !self) return { status: 403, words: "Only the owner can make a link for someone else." };
  if (!onCrew) return { status: 404, words: "That person is not on the crew." };
  if (invited !== true) return { status: 403, words: self ? CODE_ONLY_SELF : CODE_ONLY };
  return null;
}

// ---- the list a trip starts with -------------------------------------------

export const SEED_MAX = 40;

// The run card's gear lines for the plan, which the page sends with a new trip.
export function seedLabels(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) say("The starting list has to be a list of lines.");
  if (value.length > SEED_MAX) say("A trip starts with " + SEED_MAX + " lines at most.");
  return value.map((line) => cleanText(line, 120, "line"));
}

// The id of one starting line. It is worked out from the trip and the line's
// place, so a new trip sent twice lands its list once.
export async function seedId(tripId, index) {
  const hex = await hashToken(String(tripId) + ":seed:" + index);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join("-");
}

// ---- catches ---------------------------------------------------------------

// One line of words no longer than max, with three dots where it was cut.
// Three plain dots, since one fancy character makes a whole text cost double.
function clip(value, max) {
  const text = typeof value === "string" ? storable(value).replace(/\s+/g, " ").trim() : "";
  return text.length > max ? text.slice(0, Math.max(max - 3, 0)).trimEnd() + "..." : text;
}

// The same for words that may run over several lines.
function cut(value, max) {
  const text = typeof value === "string" ? storable(value).trim() : "";
  return text.length > max ? text.slice(0, max - 3).trimEnd() + "..." : text;
}

// A catch photo is shown only when it sits in the angler's own folder of the
// catch-photos bucket (folder ends with their id and a slash). The angler
// writes that address themselves, so anything else is left out.
export function photoUrl(raw, folder) {
  if (typeof raw !== "string" || typeof folder !== "string" || !folder || raw.length > 300 || !raw.startsWith(folder)) return null;
  const file = raw.slice(folder.length);
  return /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,120}$/.test(file) && !file.includes("..") ? raw : null;
}

// A row of CastAI's own catch_logs, as the crew sees it. The angler wrote the
// row with their own sign-in, so it has been through none of the cleaners
// above: everything is clipped here. CastAI keeps length in inches and weight
// in pounds.
export function catchView(row, folder) {
  const size = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const when = (v) => {
    const t = typeof v === "string" && v ? Date.parse(v) : NaN;
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  };
  return {
    id: row.id,
    species: clip(row.species, 40) || "Fish",
    lengthIn: size(row.length),
    weightLb: size(row.weight),
    lure: clip(row.lure, 80) || null,
    notes: cut(row.notes, 500) || null,
    photoUrl: photoUrl(row.photo_url, folder),
    at: when(row.catch_date) || when(row.created_at),
  };
}

// ---- alerts: what a person has switched on ---------------------------------

export const KINDS = ["trip_new", "trip_status", "note", "gear", "catch", "test"];
export const DAILY_CAP = 30;
export const NOTE_GAP_MS = 120000;
export const TRIPS_LINK = "https://coachpilot.org/rigs/#/trips";
export const CREW_LINK = "https://coachpilot.org/rigs/#/crew";
export const STOP_WORDS = " Reply STOP to stop.";

// The page's name for each switch, and its column.
const SWITCHES = [["texts", "texts"], ["push", "push"], ["evTrips", "ev_trips"], ["evStatus", "ev_status"], ["evNotes", "ev_notes"],
  ["evGearCatches", "ev_gear_catches"], ["textsStopped", "texts_stopped"]];
const HOURS = [["quietFrom", "quiet_from"], ["quietTo", "quiet_to"]];
// Which switch covers which kind of alert. A test has none: it always goes.
const KIND_SWITCH = { trip_new: "evTrips", trip_status: "evStatus", note: "evNotes", gear: "evGearCatches", catch: "evGearCatches" };

const quietHour = (v, fallback) => (Number.isInteger(v) && v >= 0 && v <= 23 ? v : fallback);

// A stored row, or nothing, in the page's own names. Everyone starts with both
// channels off; once one is on, all four kinds are ready and the phone stays
// quiet from 9 at night to 6.
export function prefsView(row) {
  const r = isObject(row) ? row : {};
  return {
    texts: r.texts === true,
    push: r.push === true,
    evTrips: r.ev_trips !== false,
    evStatus: r.ev_status !== false,
    evNotes: r.ev_notes !== false,
    evGearCatches: r.ev_gear_catches !== false,
    quietFrom: quietHour(r.quiet_from, 21),
    quietTo: quietHour(r.quiet_to, 6),
    textsStopped: r.texts_stopped === true,
  };
}

// A change to them: only the fields that were sent, as columns.
export function prefsPatch(body) {
  if (!isObject(body)) say("There is nothing to change.");
  const out = {};
  for (const [name, col] of SWITCHES) {
    if (!has(body, name)) continue;
    if (typeof body[name] !== "boolean") say("Each switch is on or off.");
    out[col] = body[name];
  }
  for (const [name, col] of HOURS) {
    if (!has(body, name)) continue;
    const raw = body[name];
    const n = typeof raw === "string" && /^\d{1,2}$/.test(raw.trim()) ? Number(raw) : raw;
    if (!Number.isInteger(n) || n < 0 || n > 23) say("Quiet hours run from 0 to 23.");
    out[col] = n;
  }
  if (!Object.keys(out).length) say("There is nothing to change.");
  return out;
}

// Can this person be told? A channel has to be on, and that kind of alert.
// With no kind it only asks whether a channel is on.
export function hears(prefs, kind) {
  if (!isObject(prefs) || !(prefs.texts === true || prefs.push === true)) return false;
  if (kind === undefined || kind === "test") return true;
  const name = KIND_SWITCH[kind];
  return !!name && prefs[name] === true;
}

// ---- alerts: who hears about what ------------------------------------------

// The sender's own pick of who to tell. Nothing means the usual people. A list
// means exactly those, and an empty list means nobody.
export function cleanTell(value) {
  if (value === undefined || value === null) return null;
  if (!Array.isArray(value) || value.length > 50 || !value.every(isUuid)) say("Tell is a list of people on the crew.");
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

// Who gets an alert. members: every id on the crew. going: the trip's answers
// ({ user_id, answer }). prefs: id to prefsView, as a Map or a plain object.
//   trip_new      everyone else on the crew
//   trip_status   everyone going or maybe, plus the maker
//   note          the same
//   catch         the same
//   gear          the person the line was handed to
// Always minus whoever did it, and only people on the crew with a channel on
// and that kind on. tell swaps the usual people for the sender's own pick,
// except that a list line is only ever told to the person it was handed to.
export function audience({ kind, by, members, going, maker, assignee, prefs, tell } = {}) {
  const crew = new Set(members || []);
  const prefsOf = (id) => (prefs instanceof Map ? prefs.get(id) : isObject(prefs) ? prefs[id] : null);
  let pool;
  if (kind === "gear") pool = assignee ? [assignee] : [];
  else if (kind === "trip_new") pool = [...crew];
  else pool = [...(going || []).filter((g) => g.answer === "going" || g.answer === "maybe").map((g) => g.user_id), maker];
  if (Array.isArray(tell)) pool = kind === "gear" ? pool.filter((id) => tell.includes(id)) : tell;
  const out = [];
  for (const id of pool) {
    if (!id || id === by || !crew.has(id) || out.includes(id)) continue;
    if (hears(prefsOf(id), kind)) out.push(id);
  }
  return out;
}

// ---- alerts: quiet hours ---------------------------------------------------

export function inQuiet(hour, from, to) {
  if (from === to) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

function clock(now, zone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { h: get("hour") % 24, m: get("minute"), s: get("second") };
}

// When an alert made now may go to someone whose quiet hours run from `from`
// to `to` (hours 0 to 23 in Seattle; the same hour twice means none). Not
// quiet: now. Quiet: the next time the clock there reads `to` on the dot.
export function quietUntil(now, from, to, zone = "America/Los_Angeles") {
  const f = quietHour(from, 21), t = quietHour(to, 6);
  const c = clock(now, zone);
  if (!inQuiet(c.h, f, t)) return now;
  const ahead = ((t - c.h + 24) % 24) || 24;
  let at = new Date(now.getTime() + ahead * 3600e3 - (c.m * 60 + c.s) * 1000 - now.getMilliseconds());
  // A clock change in between leaves it an hour out. Put it back on the hour.
  const off = (t - clock(at, zone).h + 24) % 24;
  if (off === 1) at = new Date(at.getTime() + 3600e3);
  else if (off === 23) at = new Date(at.getTime() - 3600e3);
  return at;
}

// ---- alerts: the words -----------------------------------------------------

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11-28" as "Sat Nov 28".
export function dayLabel(iso) {
  if (!realDate(iso)) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] + " " + MONTHS[m - 1] + " " + d;
}

export function tripLink(id) {
  return "https://coachpilot.org/rigs/#/crew/trip/" + id;
}

// What a change to a trip amounts to. before is its row, set holds only the
// columns that really changed. "on": an idea became a plan. "off": a plan went
// back to an idea. "moved": a new day. "time": a new window. Anything else
// (a new title, a note, done, reopened) is not news and comes back null.
export function statusNews(before, set) {
  if (!isObject(before) || !isObject(set)) return null;
  if (has(set, "status") && set.status !== before.status) {
    if (set.status === "idea" && before.status === "planned") return "off";
    if (set.status === "planned" && before.status === "idea") return "on";
  }
  if (has(set, "trip_date") && set.trip_date !== before.trip_date) return "moved";
  if (has(set, "from_hour") || has(set, "to_hour")) return "time";
  return null;
}

const NEWS = { on: "says it is on", off: "called it off", moved: "moved the day", time: "changed the time", gone: "deleted the trip" };

// The words of one alert: title "<Name> <did what>", body "<Trip title>,
// <Sat Nov 28>", and the link it opens. null means there is nothing to say.
//   { kind, name, trip: { id, title, date }, status?, news?, label?, species? }
export function alertWords(ev) {
  if (!isObject(ev)) return null;
  if (ev.kind === "test") return { title: "Rig Card test", body: "It works.", url: CREW_LINK };
  const trip = isObject(ev.trip) ? ev.trip : {};
  let did = "", url = trip.id ? tripLink(trip.id) : CREW_LINK;
  if (ev.kind === "trip_new") did = ev.status === "planned" ? "planned a trip" : "floated a trip";
  else if (ev.kind === "trip_status") {
    did = (typeof ev.news === "string" && has(NEWS, ev.news) && NEWS[ev.news]) || "";
    if (ev.news === "gone") url = TRIPS_LINK;
  } else if (ev.kind === "note") did = "left a note";
  else if (ev.kind === "gear") did = "put you down for " + (clip(ev.label, 40) || "something");
  else if (ev.kind === "catch") {
    const fish = clip(ev.species, 40) || "fish";
    did = "landed " + (/^[aeiou]/i.test(fish) ? "an " : "a ") + fish;
  }
  if (!did) return null;
  const title = clip(trip.title, 70), day = dayLabel(trip.date);
  return { title: (clip(ev.name, 30) || "Someone") + " " + did, body: title && day ? title + ", " + day : title || day, url };
}

// A text: "Rig Card: <Name> <did what>. <Trip title>, <Sat Nov 28>. <link>",
// under 300 characters with the link kept whole. The first text ever sent to a
// person ends with how to stop them.
export function textWords(row, first) {
  const tail = first ? STOP_WORDS : "";
  if (row.kind === "test") return "Rig Card test. It works." + tail;
  const lead = "Rig Card: ", end = ". " + row.url + tail;
  const title = clip(row.title, 100);
  const body = clip(row.body, Math.max(299 - lead.length - title.length - 2 - end.length, 3));
  return lead + title + ". " + body + end;
}

// What a phone alert carries. The page's worker shows title and body, opens
// url on a tap, and uses tag so one alert never shows twice.
export function pushWords(row) {
  return { title: row.title, body: row.body, url: row.url, tag: "crew-" + row.id };
}

// ---- alerts: the limits ----------------------------------------------------

// At most 30 a day to one person. Not knowing how many went means no more.
export function capReached(sentInLastDay) {
  return !(typeof sentInLastDay === "number" && sentInLastDay < DAILY_CAP);
}

// A note to the same person about the same trip from the same author inside
// two minutes of the last one is not sent. lastMs is when that last one was.
export function noteTooSoon(lastMs, nowMs) {
  return typeof lastMs === "number" && Number.isFinite(lastMs) && nowMs - lastMs < NOTE_GAP_MS;
}

// ---- alerts: which channel, and how a row ends -----------------------------

// push is how the phone alerts went: "sent", "failed" or "none". A text goes
// when texts are on and no phone alert landed. A test tries both, so each can
// be seen to work.
export function wantsText({ test, texts, push } = {}) {
  return texts === true && (test === true || push !== "sent");
}

// How an outbox row ends. text is "sent", "failed", "stopped" (they replied
// STOP), "nophone" (no number on the account) or "off". Sent when anything
// landed, failed when something was tried and nothing landed, skipped when
// there was nothing to try.
export function rowOutcome({ push, text } = {}) {
  const sent = [push === "sent" ? "push" : "", text === "sent" ? "text" : ""].filter(Boolean);
  if (sent.length) return { status: "sent", channel: sent.join("+"), error: null };
  const failed = [push === "failed" ? "push failed" : "", text === "failed" ? "text failed" : ""].filter(Boolean);
  if (failed.length) return { status: "failed", channel: null, error: failed.join(", ") };
  return { status: "skipped", channel: null, error: text === "stopped" ? "texts stopped" : text === "nophone" ? "no phone" : "no channel" };
}

// ---- alerts: a phone that wants them ---------------------------------------

// A browser's push subscription: the address its push service gave it, and the
// two keys alerts to it are sealed with. The address has to be a real https
// one out on the internet, since the server is going to post to it.
export function pushSubInput(body) {
  if (!isObject(body)) say("That did not read as a phone to alert.");
  let url = null;
  try {
    url = typeof body.endpoint === "string" && body.endpoint.length <= 1000 ? new URL(body.endpoint) : null;
  } catch (e) {
    url = null;
  }
  const host = url ? url.hostname : "";
  const out = !!url && url.protocol === "https:" && !url.username && !url.password && !url.port &&
    host.includes(".") && !host.startsWith("[") && !/^[\d.]+$/.test(host) && !/(^|\.)localhost$/i.test(host);
  if (!out) say("That phone alert address does not look right.");
  const key = (v, min, max) => {
    const text = typeof v === "string" ? v.replace(/=+$/, "") : "";
    return new RegExp("^[A-Za-z0-9_-]{" + min + "," + max + "}$").test(text) ? text : "";
  };
  const p256dh = key(body.p256dh, 80, 100), auth = key(body.auth, 16, 64);
  if (!p256dh || !auth) say("That phone alert key does not look right.");
  return { endpoint: body.endpoint, p256dh, auth, ua: clip(body.ua, 200) || null };
}
