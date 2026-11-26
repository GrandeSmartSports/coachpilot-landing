// Crew trips, and what hangs off one: who is going, notes pinned to the run
// card, the list, and catches. Every row is checked to belong to the caller's
// own crew before anything is read or written; otherwise the answer is a 404.
//
// A catch is a row in CastAI's own catch_logs, written by the angler with
// their own sign-in. Here it is only linked to a trip and read back for the
// crew. catch_logs is read, never written.
//
// A write that the crew should hear about takes an optional tell (the sender's
// pick of who hears) and ends by queueing its alert. See alerts.ts.
import {
  canEditTrip, catchView, cleanAnswer, cleanSection, cleanTell, cleanText, seedId, seedLabels, statusChangeAllowed, statusNews,
  tripInput, tripPatch,
} from "./crew-core.mjs";
import { announce } from "./alerts.ts";
import { Body, clean, clientId, Ctx, db, has, must, pieces, refuse, uuid } from "./lib.ts";

type Row = Record<string, any>;

const TRIPS = "castai_crew_trips", GOING = "castai_crew_trip_going", NOTES = "castai_crew_comments",
  ITEMS = "castai_crew_list_items", CATCHES = "castai_crew_catches", LOGS = "catch_logs";
const LOG_COLS = "id, user_id, species, catch_date, weight, length, photo_url, notes, lure, created_at";
// Where CastAI keeps catch photos. Each angler has a folder named by their id.
const PHOTOS = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "") + "/storage/v1/object/public/catch-photos/";

// The sender's own pick of who hears about a write, checked before anything is written.
const tellOf = (body: Body) => clean(() => cleanTell(body.tell)) as string[] | null;

// ---- what the page gets ----------------------------------------------------

// A name, never a phone number or an address. Someone who has left the crew
// has no name here any more, so their old rows read as from nobody.
const who = (ctx: Ctx, id: string | null) => (id && ctx.names.has(id) ? { id, name: ctx.names.get(id)! } : null);
const iso = (t: string) => new Date(t).toISOString();
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const stamp = (t: string) => Date.parse(t);

const shapeNote = (ctx: Ctx, c: Row) => ({
  id: c.id, section: c.section, body: c.body, by: who(ctx, c.user_id), at: iso(c.created_at), mine: c.user_id === ctx.me,
});
const shapeItem = (ctx: Ctx, i: Row) => ({
  id: i.id, label: i.label, assignedTo: who(ctx, i.assigned_to), done: !!i.done, mine: i.created_by === ctx.me,
});
// log is the angler's row in catch_logs, link is its row here.
function shapeCatch(ctx: Ctx, log: Row, link: Row) {
  const v = catchView(log, PHOTOS + log.user_id + "/") as Row;
  return {
    id: v.id as string, species: v.species as string, lengthIn: v.lengthIn as number | null, weightLb: v.weightLb as number | null,
    lure: v.lure as string | null, notes: v.notes as string | null, photoUrl: v.photoUrl as string | null,
    by: who(ctx, log.user_id), at: (v.at as string | null) || iso(link.created_at), mine: log.user_id === ctx.me,
  };
}
const shapeGoing = (ctx: Ctx, rows: Row[]) =>
  rows.filter((g) => ctx.names.has(g.user_id))
    .sort((a, b) => stamp(a.updated_at) - stamp(b.updated_at) || String(a.user_id).localeCompare(String(b.user_id)))
    .map((g) => ({ id: g.user_id, name: ctx.names.get(g.user_id)!, answer: g.answer }));

// updatedAt is the newest of the trip's own change and anything on it. Every
// write to a trip's notes, list, catches or answers also touches the trip, so
// a tick or a delete moves it too. catches are the link rows.
function shapeTrip(ctx: Ctx, t: Row, going: Row[], notes: Row[], items: Row[], catches: Row[]) {
  const newest = Math.max(stamp(t.updated_at), ...going.map((g) => stamp(g.updated_at)),
    ...notes.map((c) => stamp(c.created_at)), ...items.map((i) => stamp(i.created_at)), ...catches.map((c) => stamp(c.created_at)));
  return {
    id: t.id, planId: t.plan_id, spotId: t.spot_id, species: t.species, title: t.title, date: t.trip_date,
    from: num(t.from_hour), to: num(t.to_hour), status: t.status, note: t.note, by: who(ctx, t.created_by),
    going: shapeGoing(ctx, going),
    counts: {
      comments: notes.filter((c) => !c.hidden).length, list: items.length,
      listDone: items.filter((i) => i.done).length, catches: catches.length,
    },
    updatedAt: new Date(newest).toISOString(),
  };
}

// Rows for a set of trips, asked for a few trips at a time.
async function forTrips(table: string, cols: string, ids: string[]): Promise<Row[]> {
  const parts = await Promise.all(pieces(ids, 20).map((some) => db.from(table).select(cols).in("trip_id", some)));
  return parts.flatMap((res) => (must(res, table) || []) as Row[]);
}

function byTrip(rows: Row[]): Map<string, Row[]> {
  const map = new Map<string, Row[]>();
  for (const r of rows) {
    if (!map.has(r.trip_id)) map.set(r.trip_id, []);
    map.get(r.trip_id)!.push(r);
  }
  return map;
}

// The Trip objects for these rows, with who is going and the counts.
export async function shapeTrips(ctx: Ctx, trips: Row[]) {
  if (!trips.length) return [];
  const ids = trips.map((t) => t.id);
  const [going, notes, items, catches] = (await Promise.all([
    forTrips(GOING, "trip_id, user_id, answer, updated_at", ids),
    forTrips(NOTES, "trip_id, hidden, created_at", ids),
    forTrips(ITEMS, "trip_id, done, created_at", ids),
    forTrips(CATCHES, "trip_id, created_at", ids),
  ])).map(byTrip);
  const of = (m: Map<string, Row[]>, id: string) => m.get(id) || [];
  return trips.map((t) => shapeTrip(ctx, t, of(going, t.id), of(notes, t.id), of(items, t.id), of(catches, t.id)));
}

// Trips dated from this day onward, oldest first.
export async function tripsSince(ctx: Ctx, sinceIso: string) {
  const rows = must(
    await db.from(TRIPS).select("*").eq("crew_id", ctx.crew.id).gte("trip_date", sinceIso)
      .order("trip_date").order("from_hour", { nullsFirst: false }).order("created_at").order("id").limit(500),
    "trips",
  ) as Row[] | null;
  return shapeTrips(ctx, rows || []);
}

// ---- finding a row, and proving it is this crew's --------------------------

async function tripRow(ctx: Ctx, raw: unknown): Promise<Row> {
  const id = uuid(raw, "trip");
  const row = must(await db.from(TRIPS).select("*").eq("id", id).eq("crew_id", ctx.crew.id).maybeSingle(), "trip") as Row | null;
  if (!row) refuse(404, "That trip is not here any more.");
  return row!;
}

// A note or a list line by its id. One that is on another crew's trip reads
// exactly like one that does not exist.
async function childRow(ctx: Ctx, table: string, raw: unknown, what: string, gone: string): Promise<Row> {
  const id = uuid(raw, what);
  const row = must(await db.from(table).select("*").eq("id", id).maybeSingle(), table) as Row | null;
  if (!row) refuse(404, gone);
  const trip = must(await db.from(TRIPS).select("id").eq("id", row!.trip_id).eq("crew_id", ctx.crew.id).maybeSingle(), "trip") as Row | null;
  if (!trip) refuse(404, gone);
  return row!;
}

const touch = async (tripId: string) =>
  void must(await db.from(TRIPS).update({ updated_at: new Date().toISOString() }).eq("id", tripId), "touch trip");

async function oneTrip(ctx: Ctx, row: Row) {
  return (await shapeTrips(ctx, [row]))[0];
}

// Insert, or hand back the row a write with this clientId already made. That
// is what makes a phone's waiting-to-send queue safe to send twice.
async function addOnce(table: string, scope: [string, string], row: Row, cid: string | null) {
  const ins = await db.from(table).insert({ ...row, client_id: cid }).select("*").single();
  if (!ins.error) return { row: ins.data as Row, fresh: true };
  if (ins.error.code === "23505" && cid) {
    const old = must(await db.from(table).select("*").eq(scope[0], scope[1]).eq("client_id", cid).maybeSingle(), table + " resend") as Row | null;
    if (old) return { row: old, fresh: false };
  }
  throw new Error("db " + table + " insert: " + JSON.stringify(ins.error));
}

// Someone a list line can be handed to: nobody, or a person on this crew.
function assignee(ctx: Ctx, value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  const id = uuid(value, "person");
  if (!ctx.names.has(id)) refuse(400, "That person is not on the crew.");
  return id;
}

// ---- trips -----------------------------------------------------------------

// The list a trip starts with: the run card's gear lines, in order. Each
// line's id is worked out from the trip and its place, and they all go in as
// one write, so a new trip sent twice has its list once.
async function seedList(tripId: string, by: string, labels: string[]) {
  const rows = await Promise.all(labels.map(async (label, i) => ({
    trip_id: tripId, label, created_by: by, sort: i + 1, client_id: await seedId(tripId, i) as string,
  })));
  const ins = await db.from(ITEMS).insert(rows);
  if (ins.error && ins.error.code !== "23505") throw new Error("db seed list: " + JSON.stringify(ins.error));
}

export async function tripCreate(ctx: Ctx, body: Body) {
  const f = clean(() => tripInput(body, ctx.today));
  const seed = clean(() => seedLabels(body.seedList)) as string[];
  const tell = tellOf(body);
  const { row, fresh } = await addOnce(TRIPS, ["crew_id", ctx.crew.id], {
    crew_id: ctx.crew.id, created_by: ctx.me, plan_id: f.planId, spot_id: f.spotId, species: f.species, title: f.title,
    trip_date: f.date, from_hour: f.from, to_hour: f.to, status: f.status, note: f.note,
  }, clientId(body));
  // The maker is going. Sent twice, this never overwrites an answer changed since.
  if (fresh || row.created_by === ctx.me) {
    must(await db.from(GOING).upsert({ trip_id: row.id, user_id: ctx.me, answer: "going" },
      { onConflict: "trip_id,user_id", ignoreDuplicates: true }), "maker going");
    if (seed.length) await seedList(row.id, ctx.me, seed);
  }
  if (fresh) await announce(ctx, { kind: "trip_new", trip: row, tell });
  return { ok: true, trip: await oneTrip(ctx, row) };
}

export async function tripUpdate(ctx: Ctx, body: Body) {
  const tell = tellOf(body);
  const trip = await tripRow(ctx, body.tripId);
  const p = clean(() => tripPatch(body, trip, ctx.today) as unknown as Body);
  const set: Row = {};
  if (has(p, "title") && p.title !== trip.title) set.title = p.title;
  if (has(p, "note") && p.note !== trip.note) set.note = p.note;
  if (has(p, "date") && p.date !== trip.trip_date) set.trip_date = p.date;
  if (has(p, "from") && p.from !== num(trip.from_hour)) set.from_hour = p.from;
  if (has(p, "to") && p.to !== num(trip.to_hour)) set.to_hour = p.to;
  if (Object.keys(set).length && !canEditTrip(ctx.member, trip)) {
    refuse(403, "Only the person who made this trip, or the owner, can change it.");
  }
  if (has(p, "status") && p.status !== trip.status) {
    if (trip.status === "done" && p.status === "idea") refuse(400, "A finished trip goes back to planned first.");
    if (!statusChangeAllowed(ctx.member, trip, p.status, ctx.today)) {
      refuse(403, "Only the person who made this trip, or the owner, can do that.");
    }
    set.status = p.status;
  }
  // Asking for what it already is changes nothing and is fine.
  if (!Object.keys(set).length) return { ok: true, trip: await oneTrip(ctx, trip) };
  set.updated_at = new Date().toISOString();
  const row = must(await db.from(TRIPS).update(set).eq("id", trip.id).select("*").maybeSingle(), "trip update") as Row | null;
  if (!row) refuse(404, "That trip is not here any more.");
  // It is on, it was called off, or the day or time moved. Nothing else is news.
  const news = statusNews(trip, set) as string | null;
  if (news) await announce(ctx, { kind: "trip_status", trip: row!, news, tell });
  return { ok: true, trip: await oneTrip(ctx, row!) };
}

// Who was going is read before the trip goes, since its answers go with it.
// The alert is queued after, pointing at no trip, so it is not swept away too.
export async function tripDelete(ctx: Ctx, body: Body) {
  const tell = tellOf(body);
  const trip = await tripRow(ctx, body.tripId);
  if (!canEditTrip(ctx.member, trip)) refuse(403, "Only the person who made this trip, or the owner, can delete it.");
  const going = (must(await db.from(GOING).select("user_id, answer").eq("trip_id", trip.id), "going before delete") || []) as Row[];
  must(await db.from(TRIPS).delete().eq("id", trip.id), "trip delete");
  await announce(ctx, { kind: "trip_status", trip, gone: true, news: "gone", going, tell });
  return { ok: true };
}

// A trip's catches: the links here, and each one's row in CastAI's catch log.
async function catchesOf(ctx: Ctx, tripId: string) {
  const links = (must(await db.from(CATCHES).select("*").eq("trip_id", tripId).order("created_at").order("catch_id"), "catch links") || []) as Row[];
  if (!links.length) return { links, shown: [] };
  const parts = await Promise.all(pieces(links.map((l) => l.catch_id as string), 50).map((some) => db.from(LOGS).select(LOG_COLS).in("id", some)));
  const logs = new Map(parts.flatMap((res) => (must(res, "catch logs") || []) as Row[]).map((l) => [l.id as string, l]));
  const shown = links.filter((l) => logs.has(l.catch_id)).map((l) => shapeCatch(ctx, logs.get(l.catch_id)!, l))
    .sort((a, b) => stamp(a.at) - stamp(b.at) || a.id.localeCompare(b.id));
  return { links, shown };
}

// One trip with everything on it.
export async function tripFull(ctx: Ctx, body: Body) {
  const trip = await tripRow(ctx, body.tripId);
  const [parts, catches] = await Promise.all([
    Promise.all([
      db.from(GOING).select("*").eq("trip_id", trip.id),
      db.from(NOTES).select("*").eq("trip_id", trip.id).order("created_at").order("id"),
      db.from(ITEMS).select("*").eq("trip_id", trip.id).order("sort").order("created_at").order("id"),
    ]),
    catchesOf(ctx, trip.id),
  ]);
  const [going, notes, items] = parts.map((res, i) => (must(res, "trip part " + i) || []) as Row[]);
  return {
    trip: shapeTrip(ctx, trip, going, notes, items, catches.links),
    comments: notes.filter((c) => !c.hidden).map((c) => shapeNote(ctx, c)),
    list: items.map((i) => shapeItem(ctx, i)),
    catches: catches.shown,
  };
}

export async function going(ctx: Ctx, body: Body) {
  const answer = clean(() => cleanAnswer(body.answer));
  const trip = await tripRow(ctx, body.tripId);
  const now = new Date().toISOString();
  must(await db.from(GOING).upsert({ trip_id: trip.id, user_id: ctx.me, answer, updated_at: now }, { onConflict: "trip_id,user_id" }), "going");
  await touch(trip.id);
  const rows = must(await db.from(GOING).select("*").eq("trip_id", trip.id), "going list") as Row[] | null;
  return { ok: true, going: shapeGoing(ctx, rows || []) };
}

// ---- notes -----------------------------------------------------------------

export async function commentAdd(ctx: Ctx, body: Body) {
  const section = clean(() => cleanSection(body.section));
  const text = clean(() => cleanText(body.body, 1000, "note"));
  const cid = clientId(body);
  const tell = tellOf(body);
  const trip = await tripRow(ctx, body.tripId);
  const { row, fresh } = await addOnce(NOTES, ["trip_id", trip.id], { trip_id: trip.id, user_id: ctx.me, section, body: text }, cid);
  if (fresh) {
    await touch(trip.id);
    await announce(ctx, { kind: "note", trip, tell });
  }
  return { ok: true, comment: shapeNote(ctx, row) };
}

// Soft: the note is hidden, not destroyed. Asked twice, it is still fine.
export async function commentDelete(ctx: Ctx, body: Body) {
  const note = await childRow(ctx, NOTES, body.commentId, "note", "That note is not here any more.");
  if (note.user_id !== ctx.me && !ctx.owner) refuse(403, "Only the person who wrote it, or the owner, can delete a note.");
  if (!note.hidden) {
    must(await db.from(NOTES).update({ hidden: true }).eq("id", note.id), "note hide");
    await touch(note.trip_id);
  }
  return { ok: true };
}

// ---- the list --------------------------------------------------------------

export async function listAdd(ctx: Ctx, body: Body) {
  const label = clean(() => cleanText(body.label, 120, "line"));
  const to = assignee(ctx, body.assignedTo);
  const cid = clientId(body);
  const tell = tellOf(body);
  const trip = await tripRow(ctx, body.tripId);
  const last = must(await db.from(ITEMS).select("sort").eq("trip_id", trip.id).order("sort", { ascending: false }).limit(1), "list end") as Row[] | null;
  const sort = last && last[0] ? Number(last[0].sort) + 1 : 1;
  const { row, fresh } = await addOnce(ITEMS, ["trip_id", trip.id],
    { trip_id: trip.id, label, assigned_to: to, created_by: ctx.me, sort }, cid);
  if (fresh) {
    await touch(trip.id);
    await handed(ctx, trip, row, tell);
  }
  return { ok: true, item: shapeItem(ctx, row) };
}

// A line was handed to someone. Only that person is told, and never the one
// who did the handing.
async function handed(ctx: Ctx, trip: Row, item: Row, tell: string[] | null) {
  if (!item.assigned_to || item.assigned_to === ctx.me) return;
  await announce(ctx, { kind: "gear", trip, label: item.label, assignee: item.assigned_to, tell });
}

// Anyone on the crew ticks and assigns. Only the adder or the owner renames.
export async function listUpdate(ctx: Ctx, body: Body) {
  const tell = tellOf(body);
  const item = await childRow(ctx, ITEMS, body.itemId, "list line", "That line is not on the list any more.");
  if (!has(body, "done") && !has(body, "assignedTo") && !has(body, "label")) refuse(400, "There is nothing to change.");
  const set: Row = {};
  if (has(body, "done")) {
    if (typeof body.done !== "boolean") refuse(400, "Done is yes or no.");
    if (body.done !== !!item.done) set.done = body.done;
  }
  if (has(body, "assignedTo")) {
    const to = assignee(ctx, body.assignedTo);
    if (to !== (item.assigned_to || null)) set.assigned_to = to;
  }
  if (has(body, "label")) {
    const label = clean(() => cleanText(body.label, 120, "line"));
    if (label !== item.label) {
      if (item.created_by !== ctx.me && !ctx.owner) refuse(403, "Only the person who added it, or the owner, can rename it.");
      set.label = label;
    }
  }
  if (!Object.keys(set).length) return { ok: true, item: shapeItem(ctx, item) };
  const row = must(await db.from(ITEMS).update(set).eq("id", item.id).select("*").maybeSingle(), "list update") as Row | null;
  if (!row) refuse(404, "That line is not on the list any more.");
  await touch(item.trip_id);
  if (has(set, "assigned_to") && set.assigned_to) {
    const trip = must(await db.from(TRIPS).select("*").eq("id", item.trip_id).maybeSingle(), "trip of line") as Row | null;
    if (trip) await handed(ctx, trip, row!, tell);
  }
  return { ok: true, item: shapeItem(ctx, row!) };
}

export async function listDelete(ctx: Ctx, body: Body) {
  const item = await childRow(ctx, ITEMS, body.itemId, "list line", "That line is not on the list any more.");
  if (item.created_by !== ctx.me && !ctx.owner) refuse(403, "Only the person who added it, or the owner, can take it off.");
  must(await db.from(ITEMS).delete().eq("id", item.id), "list delete");
  await touch(item.trip_id);
  return { ok: true };
}

// ---- catches ---------------------------------------------------------------

// Put a catch from the caller's own CastAI catch log on a trip. The page has
// already written that row with the angler's own sign-in; this checks it is
// there and theirs, and links it. Linking the same catch to the same trip
// again hands back what is there, so a phone can safely send it twice. A catch
// that is someone else's reads exactly like one that does not exist.
export async function catchLink(ctx: Ctx, body: Body) {
  const catchId = uuid(body.catchId, "catch");
  const tell = tellOf(body);
  const trip = await tripRow(ctx, body.tripId);
  const log = must(await db.from(LOGS).select(LOG_COLS).eq("id", catchId).maybeSingle(), "catch log") as Row | null;
  if (!log || log.user_id !== ctx.me) refuse(404, "That catch is not in your catch log.");
  const ins = await db.from(CATCHES).insert({ catch_id: catchId, trip_id: trip.id }).select("*").single();
  let link = ins.data as Row | null;
  if (ins.error) {
    // 23503: the catch was deleted in the moment between the check and the link.
    if (ins.error.code === "23503") refuse(404, "That catch is not in your catch log.");
    if (ins.error.code !== "23505") throw new Error("db catch link: " + JSON.stringify(ins.error));
    link = must(await db.from(CATCHES).select("*").eq("catch_id", catchId).maybeSingle(), "catch link again") as Row | null;
    if (!link) throw new Error("catch link vanished after a duplicate");
    if (link.trip_id !== trip.id) refuse(400, "That catch is already on another trip.");
  } else {
    await touch(trip.id);
    await announce(ctx, { kind: "catch", trip, species: (catchView(log!, "") as Row).species, tell });
  }
  return { ok: true, catch: shapeCatch(ctx, log!, link!) };
}

// A catch is its angler's own: not even the owner takes someone else's off a
// trip. This removes only the link. The catch itself stays in CastAI's log
// until its angler deletes it there, and deleting it there removes the link.
export async function catchDelete(ctx: Ctx, body: Body) {
  const gone = "That catch is not here any more.";
  const catchId = uuid(body.catchId, "catch");
  const link = must(await db.from(CATCHES).select("*").eq("catch_id", catchId).maybeSingle(), "catch link") as Row | null;
  if (!link) refuse(404, gone);
  const trip = must(await db.from(TRIPS).select("id").eq("id", link!.trip_id).eq("crew_id", ctx.crew.id).maybeSingle(), "trip of catch") as Row | null;
  if (!trip) refuse(404, gone);
  const log = must(await db.from(LOGS).select("user_id").eq("id", catchId).maybeSingle(), "catch owner") as Row | null;
  if (!log) refuse(404, gone);
  if (log!.user_id !== ctx.me) refuse(403, "Only the person who logged it can delete a catch.");
  must(await db.from(CATCHES).delete().eq("catch_id", catchId), "catch unlink");
  await touch(link!.trip_id);
  return { ok: true };
}

// When someone leaves the crew: they are no longer going anywhere with it,
// and nothing on a list is theirs to bring.
export async function forgetOnTrips(crewId: string, userId: string) {
  const trips = must(await db.from(TRIPS).select("id").eq("crew_id", crewId), "crew trips") as Row[] | null;
  for (const some of pieces((trips || []).map((t) => t.id as string), 50)) {
    must(await db.from(GOING).delete().eq("user_id", userId).in("trip_id", some), "forget going");
    must(await db.from(ITEMS).update({ assigned_to: null }).eq("assigned_to", userId).in("trip_id", some), "forget list");
  }
}
