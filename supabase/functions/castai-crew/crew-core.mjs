// The crew's decisions, with no imports, so the Deno function and the node
// tests run the same code. Everything here is a plain function: it reads what
// it is given and either answers or throws an Error whose message is words a
// person can read on a phone.

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

// Un-inviting someone who never joined should leave no empty account behind.
// Only an account the invite itself made, that has never signed in, that is on
// no other crew and owns none. The mark lives in app_metadata, which a person
// cannot set on themselves. Anything else is somebody's real account: keep it.
export function ghostAccount({ user, otherCrews, ownsCrew } = {}) {
  return !!user && isObject(user.app_metadata) && user.app_metadata.crew_invited === true &&
    !user.last_sign_in_at && otherCrews === 0 && ownsCrew === false;
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

// A fish somebody landed on a crew trip.
export function catchInput(body) {
  if (!isObject(body)) say("That did not read as a catch.");
  const out = {
    species: cleanText(body.species, 40, "fish"),
    lengthIn: optionalNumber(body.lengthIn, "length"),
    weightLb: optionalNumber(body.weightLb, "weight"),
    lure: optionalText(body.lure, 80, "lure"),
    notes: optionalText(body.notes, 500, "note"),
  };
  if (out.lengthIn !== null && !(out.lengthIn > 0 && out.lengthIn <= 240)) say("That length does not look right.");
  if (out.weightLb !== null && !(out.weightLb > 0 && out.weightLb <= 2000)) say("That weight does not look right.");
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
