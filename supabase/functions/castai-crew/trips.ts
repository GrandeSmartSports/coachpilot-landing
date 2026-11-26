// Crew trips, and what hangs off one: who is going, notes pinned to the run
// card, the list, and catches. Every row is checked to belong to the caller's
// own crew before anything is read or written; otherwise the answer is a 404.
import {
  canEditTrip, catchInput, cleanAnswer, cleanSection, cleanText, statusChangeAllowed, tripInput, tripPatch,
} from "./crew-core.mjs";
import { Body, clean, clientId, Ctx, db, has, must, pieces, refuse, uuid } from "./lib.ts";

type Row = Record<string, any>;

const TRIPS = "castai_crew_trips", GOING = "castai_crew_trip_going", NOTES = "castai_crew_comments",
  ITEMS = "castai_crew_list_items", CATCHES = "castai_crew_catches";

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
const shapeCatch = (ctx: Ctx, c: Row) => ({
  id: c.id, species: c.species, lengthIn: num(c.length_in), weightLb: num(c.weight_lb), lure: c.lure, notes: c.notes,
  by: who(ctx, c.user_id), at: iso(c.created_at), mine: c.user_id === ctx.me,
});
const shapeGoing = (ctx: Ctx, rows: Row[]) =>
  rows.filter((g) => ctx.names.has(g.user_id))
    .sort((a, b) => stamp(a.updated_at) - stamp(b.updated_at) || String(a.user_id).localeCompare(String(b.user_id)))
    .map((g) => ({ id: g.user_id, name: ctx.names.get(g.user_id)!, answer: g.answer }));

// updatedAt is the newest of the trip's own change and anything on it. Every
// write to a trip's notes, list, catches or answers also touches the trip, so
// a tick or a delete moves it too.
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

// A note, list line or catch by its id. One that is on another crew's trip
// reads exactly like one that does not exist.
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

export async function tripCreate(ctx: Ctx, body: Body) {
  const f = clean(() => tripInput(body, ctx.today));
  const { row, fresh } = await addOnce(TRIPS, ["crew_id", ctx.crew.id], {
    crew_id: ctx.crew.id, created_by: ctx.me, plan_id: f.planId, spot_id: f.spotId, species: f.species, title: f.title,
    trip_date: f.date, from_hour: f.from, to_hour: f.to, status: f.status, note: f.note,
  }, clientId(body));
  // The maker is going. Sent twice, this never overwrites an answer changed since.
  if (fresh || row.created_by === ctx.me) {
    must(await db.from(GOING).upsert({ trip_id: row.id, user_id: ctx.me, answer: "going" },
      { onConflict: "trip_id,user_id", ignoreDuplicates: true }), "maker going");
  }
  return { ok: true, trip: await oneTrip(ctx, row) };
}

export async function tripUpdate(ctx: Ctx, body: Body) {
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
  return { ok: true, trip: await oneTrip(ctx, row!) };
}

export async function tripDelete(ctx: Ctx, body: Body) {
  const trip = await tripRow(ctx, body.tripId);
  if (!canEditTrip(ctx.member, trip)) refuse(403, "Only the person who made this trip, or the owner, can delete it.");
  must(await db.from(TRIPS).delete().eq("id", trip.id), "trip delete");
  return { ok: true };
}

// One trip with everything on it.
export async function tripFull(ctx: Ctx, body: Body) {
  const trip = await tripRow(ctx, body.tripId);
  const [going, notes, items, catches] = (await Promise.all([
    db.from(GOING).select("*").eq("trip_id", trip.id),
    db.from(NOTES).select("*").eq("trip_id", trip.id).order("created_at").order("id"),
    db.from(ITEMS).select("*").eq("trip_id", trip.id).order("sort").order("created_at").order("id"),
    db.from(CATCHES).select("*").eq("trip_id", trip.id).order("created_at").order("id"),
  ])).map((res, i) => (must(res, "trip part " + i) || []) as Row[]);
  return {
    trip: shapeTrip(ctx, trip, going, notes, items, catches),
    comments: notes.filter((c) => !c.hidden).map((c) => shapeNote(ctx, c)),
    list: items.map((i) => shapeItem(ctx, i)),
    catches: catches.map((c) => shapeCatch(ctx, c)),
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
  const trip = await tripRow(ctx, body.tripId);
  const { row, fresh } = await addOnce(NOTES, ["trip_id", trip.id], { trip_id: trip.id, user_id: ctx.me, section, body: text }, cid);
  if (fresh) await touch(trip.id);
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
  const trip = await tripRow(ctx, body.tripId);
  const last = must(await db.from(ITEMS).select("sort").eq("trip_id", trip.id).order("sort", { ascending: false }).limit(1), "list end") as Row[] | null;
  const sort = last && last[0] ? Number(last[0].sort) + 1 : 1;
  const { row, fresh } = await addOnce(ITEMS, ["trip_id", trip.id],
    { trip_id: trip.id, label, assigned_to: to, created_by: ctx.me, sort }, cid);
  if (fresh) await touch(trip.id);
  return { ok: true, item: shapeItem(ctx, row) };
}

// Anyone on the crew ticks and assigns. Only the adder or the owner renames.
export async function listUpdate(ctx: Ctx, body: Body) {
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

export async function catchAdd(ctx: Ctx, body: Body) {
  const f = clean(() => catchInput(body));
  const cid = clientId(body);
  const trip = await tripRow(ctx, body.tripId);
  const { row, fresh } = await addOnce(CATCHES, ["trip_id", trip.id], {
    trip_id: trip.id, user_id: ctx.me, species: f.species, length_in: f.lengthIn, weight_lb: f.weightLb, lure: f.lure, notes: f.notes,
  }, cid);
  if (fresh) await touch(trip.id);
  return { ok: true, catch: shapeCatch(ctx, row) };
}

// A catch is its angler's own. Not even the owner deletes someone else's.
export async function catchDelete(ctx: Ctx, body: Body) {
  const row = await childRow(ctx, CATCHES, body.catchId, "catch", "That catch is not here any more.");
  if (row.user_id !== ctx.me) refuse(403, "Only the person who logged it can delete a catch.");
  must(await db.from(CATCHES).delete().eq("id", row.id), "catch delete");
  await touch(row.trip_id);
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
