// Alerts: what each person has switched on, the phones that asked for them,
// the outbox every alert passes through, and the sender.
//
// The decisions live in crew-core.mjs as plain functions the node tests run:
// who hears about what, quiet hours, the words, the daily cap, the two minute
// note rule and how a row ends. This file only reads, writes and sends.
//
// Every alert is one outbox row per person. A write queues its rows before it
// answers, then sends the ones that are due once the answer has gone. Rows
// held by quiet hours wait for the cron job (deliver with the cron key).
//
// No answer here carries a phone number. A number is read from the account at
// the moment a text goes, and it is never logged.
import {
  alertWords, audience, capReached, hears, normalizePhone, NOTE_GAP_MS, noteTooSoon, prefsPatch, prefsView, pushSubInput,
  pushWords, quietUntil, rowOutcome, textWords, wantsText,
} from "./crew-core.mjs";
import { accounts, Body, clean, Ctx, db, must, refuse, setting } from "./lib.ts";
import { sendWebPush } from "./webpush.ts";

type Row = Record<string, any>;
type Prefs = {
  texts: boolean; push: boolean; evTrips: boolean; evStatus: boolean; evNotes: boolean; evGearCatches: boolean;
  quietFrom: number; quietTo: number; textsStopped: boolean;
};

const PREFS = "castai_crew_notify_prefs", SUBS = "castai_crew_push_subs", OUTBOX = "castai_crew_outbox";
const SUB_MAX = 10; // phones per person. The oldest go first.
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "", TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "",
  TWILIO_FROM = Deno.env.get("TWILIO_FROM") || "";
const TWILIO_STOPPED = 21610; // the person replied STOP to this number

const stamp = () => new Date().toISOString();
const words = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---- what a person has switched on -----------------------------------------

async function prefRows(ids: string[]): Promise<Map<string, Row>> {
  const map = new Map<string, Row>();
  if (!ids.length) return map;
  const rows = must(await db.from(PREFS).select("*").in("user_id", ids), "prefs") as Row[] | null;
  for (const r of rows || []) map.set(r.user_id, r);
  return map;
}

// Each person's switches. Someone who never opened Alerts has everything off.
export async function prefsFor(ids: string[]): Promise<Map<string, Prefs>> {
  const rows = await prefRows(ids);
  return new Map(ids.map((id) => [id, prefsView(rows.get(id) || null) as Prefs]));
}

// pushFails is every failed phone alert in a row across this person's phones,
// so the page can say when alerts are not reaching a phone.
async function prefsAnswer(userId: string) {
  const [rows, facts, subsRes] = await Promise.all([
    prefRows([userId]),
    accounts([userId]),
    db.from(SUBS).select("fails").eq("user_id", userId),
  ]);
  const subs = (must(subsRes, "push subs") || []) as Row[];
  return {
    prefs: prefsView(rows.get(userId) || null) as Prefs,
    hasPhone: !!facts.get(userId)?.hasPhone,
    pushSubs: subs.length,
    pushFails: subs.reduce((n, s) => n + Number(s.fails || 0), 0),
  };
}

export function prefsGet(ctx: Ctx) {
  return prefsAnswer(ctx.me);
}

export async function prefsSet(ctx: Ctx, body: Body) {
  const patch = clean(() => prefsPatch(body)) as Row;
  must(await db.from(PREFS).upsert({ user_id: ctx.me, ...patch, updated_at: stamp() }, { onConflict: "user_id" }), "prefs set");
  return prefsAnswer(ctx.me);
}

// ---- phones that asked for alerts ------------------------------------------

// The same phone asking twice is one row. A phone that signs in as someone
// else moves to them.
export async function pushSubscribe(ctx: Ctx, body: Body) {
  const sub = clean(() => pushSubInput(body)) as Row;
  must(
    await db.from(SUBS).upsert(
      { user_id: ctx.me, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth, ua: sub.ua, fails: 0 },
      { onConflict: "endpoint" },
    ),
    "push subscribe",
  );
  const extra = must(
    await db.from(SUBS).select("id").eq("user_id", ctx.me).order("created_at", { ascending: false }).order("id").range(SUB_MAX, SUB_MAX + 50),
    "push subs",
  ) as Row[] | null;
  if (extra && extra.length) must(await db.from(SUBS).delete().in("id", extra.map((r) => r.id)), "old push subs");
  return { ok: true };
}

// Taking away a phone that is not there is still fine.
export async function pushUnsubscribe(ctx: Ctx, body: Body) {
  if (typeof body.endpoint !== "string" || !body.endpoint || body.endpoint.length > 1000) {
    refuse(400, "That phone alert address does not look right.");
  }
  must(await db.from(SUBS).delete().eq("user_id", ctx.me).eq("endpoint", body.endpoint), "push unsubscribe");
  return { ok: true };
}

// ---- queueing --------------------------------------------------------------

// Something happened on a trip. trip is its row. gone: it was just deleted, so
// nothing can point at it. going: its answers, when the caller already has them.
// tell: the sender's own pick of who hears (null means the usual people).
export type Happened = {
  kind: "trip_new" | "trip_status" | "note" | "gear" | "catch";
  trip: Row;
  gone?: boolean;
  news?: string;
  label?: string;
  species?: string;
  going?: Row[];
  assignee?: string | null;
  tell: string[] | null;
};

// Who was already sent a note about this trip by this author in the last two
// minutes. A note that was itself held back by this rule does not count, so a
// long run of notes still gets through once every two minutes.
async function notedLately(tripId: string, by: string, to: string[], now: Date): Promise<Set<string>> {
  const rows = must(
    await db.from(OUTBOX).select("to_user, created_at, error").eq("kind", "note").eq("trip_id", tripId).eq("by_user", by)
      .gte("created_at", new Date(now.getTime() - NOTE_GAP_MS).toISOString()).in("to_user", to),
    "recent notes",
  ) as Row[] | null;
  const out = new Set<string>();
  for (const r of rows || []) {
    if (r.error !== "note too soon" && noteTooSoon(Date.parse(r.created_at), now.getTime())) out.add(r.to_user);
  }
  return out;
}

// Queue one row for each person who should hear, then leave the sending of
// the ones that are due for after the answer. A failure here is logged and
// never fails the write that caused it: the trip, note or tick is already saved.
export async function announce(ctx: Ctx, ev: Happened) {
  try {
    const said = alertWords({
      kind: ev.kind, name: ctx.member.display_name, status: ev.trip.status, news: ev.news, label: ev.label, species: ev.species,
      trip: { id: ev.gone ? null : ev.trip.id, title: ev.trip.title, date: ev.trip.trip_date },
    }) as { title: string; body: string; url: string } | null;
    if (!said) return;
    const ids = ctx.members.map((m) => m.user_id);
    const usual = ev.tell === null && (ev.kind === "trip_status" || ev.kind === "note" || ev.kind === "catch");
    const [prefs, going] = await Promise.all([
      prefsFor(ids),
      ev.going || !usual
        ? Promise.resolve(ev.going || [])
        : db.from("castai_crew_trip_going").select("user_id, answer").eq("trip_id", ev.trip.id).then((res) => (must(res, "going") || []) as Row[]),
    ]);
    const to = audience({
      kind: ev.kind, by: ctx.me, members: ids, going, maker: ev.trip.created_by, assignee: ev.assignee, prefs, tell: ev.tell,
    }) as string[];
    if (!to.length) return;

    const tripId = ev.gone ? null : ev.trip.id as string;
    const now = new Date();
    const soon = ev.kind === "note" && tripId ? await notedLately(tripId, ctx.me, to, now) : new Set<string>();
    const rows = to.map((id) => {
      const p = prefs.get(id)!;
      const hush = soon.has(id);
      return {
        crew_id: ctx.crew.id, trip_id: tripId, to_user: id, by_user: ctx.me, kind: ev.kind, title: said.title, body: said.body, url: said.url,
        send_after: (quietUntil(now, p.quietFrom, p.quietTo) as Date).toISOString(),
        status: hush ? "skipped" : "queued", error: hush ? "note too soon" : null,
      };
    });
    const made = (must(await db.from(OUTBOX).insert(rows).select("id, status, send_after"), "outbox") || []) as Row[];
    const due = made.filter((r) => r.status === "queued" && Date.parse(r.send_after) <= Date.now()).map((r) => r.id as string);
    if (due.length) ctx.later.push(() => deliver({ ids: due }));
  } catch (e) {
    console.error("crew: alert not queued:", words(e));
  }
}

// Someone left the crew: nothing still waiting from it should reach them.
export async function forgetAlerts(crewId: string, userId: string) {
  must(await db.from(OUTBOX).delete().eq("crew_id", crewId).eq("to_user", userId).eq("status", "queued"), "forget alerts");
}

// ---- sending ---------------------------------------------------------------

// What is known about one person while a batch is sent: their switches, their
// phones, how many alerts reached them in the last day, and whether a text
// would be their first. The number is looked up only if a text is to go.
type Person = { prefs: Prefs; first: boolean; subs: Row[]; sent: number; phone?: string | null };

async function person(id: string, people: Map<string, Person>): Promise<Person> {
  const have = people.get(id);
  if (have) return have;
  const [prefRes, subsRes, sentRes] = await Promise.all([
    db.from(PREFS).select("*").eq("user_id", id).maybeSingle(),
    db.from(SUBS).select("*").eq("user_id", id),
    db.from(OUTBOX).select("id", { count: "exact", head: true }).eq("to_user", id).eq("status", "sent")
      .gte("sent_at", new Date(Date.now() - 864e5).toISOString()),
  ]);
  if (sentRes.error) throw new Error("db sent count: " + JSON.stringify(sentRes.error));
  const pref = must(prefRes, "prefs") as Row | null;
  const p: Person = {
    prefs: prefsView(pref) as Prefs,
    first: !pref || !pref.first_text_at,
    subs: (must(subsRes, "push subs") || []) as Row[],
    sent: typeof sentRes.count === "number" ? sentRes.count : NaN,
  };
  people.set(id, p);
  return p;
}

// Every phone the person has. One that the push service says is gone (404 or
// 410) is taken off. Any other failure is counted against that phone.
async function pushAll(p: Person, row: Row): Promise<"sent" | "failed"> {
  const payload = pushWords(row) as { title: string; body: string; url: string; tag: string };
  const gone: string[] = [];
  const landed = await Promise.all(p.subs.map(async (sub) => {
    let res: { ok: boolean; status?: number } = { ok: false };
    try {
      res = await sendWebPush({ endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth }, payload);
    } catch {
      res = { ok: false };
    }
    if (res.ok) {
      sub.fails = 0;
      must(await db.from(SUBS).update({ last_ok_at: stamp(), fails: 0 }).eq("id", sub.id), "push ok");
    } else if (res.status === 404 || res.status === 410) {
      gone.push(sub.id);
      must(await db.from(SUBS).delete().eq("id", sub.id), "push gone");
    } else {
      sub.fails = Number(sub.fails || 0) + 1;
      must(await db.from(SUBS).update({ fails: sub.fails }).eq("id", sub.id), "push failed");
    }
    return res.ok;
  }));
  if (gone.length) p.subs = p.subs.filter((s) => !gone.includes(s.id));
  return landed.some(Boolean) ? "sent" : "failed";
}

async function phoneOf(userId: string): Promise<string | null> {
  const { data, error } = await db.auth.admin.getUserById(userId);
  if (error || !data?.user) throw new Error("account lookup failed: " + (error?.name || "no user"));
  try {
    return data.user.phone ? normalizePhone(data.user.phone) as string : null;
  } catch {
    return null;
  }
}

// One text through Twilio. code is Twilio's own error number when it has one.
async function sendText(to: string, text: string): Promise<{ ok: boolean; code?: number }> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return { ok: false };
  try {
    const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_SID + "/Messages.json", {
      method: "POST",
      headers: { Authorization: "Basic " + btoa(TWILIO_SID + ":" + TWILIO_TOKEN), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: text }),
      signal: AbortSignal.timeout(10000),
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) return { ok: true };
    const code = j && typeof j.code === "number" ? j.code as number : undefined;
    console.error("crew: text not sent, status", res.status, "code", code ?? "none");
    return { ok: false, code };
  } catch (e) {
    console.error("crew: text not sent:", e instanceof Error ? e.name : "error");
    return { ok: false };
  }
}

async function textOne(row: Row, p: Person): Promise<"sent" | "failed" | "stopped" | "nophone"> {
  if (p.prefs.textsStopped) return "stopped";
  if (p.phone === undefined) p.phone = await phoneOf(row.to_user);
  if (!p.phone) return "nophone";
  const res = await sendText(p.phone, textWords(row, p.first) as string);
  if (res.ok) {
    if (p.first) {
      p.first = false;
      must(await db.from(PREFS).update({ first_text_at: stamp() }).eq("user_id", row.to_user).is("first_text_at", null), "first text");
    }
    return "sent";
  }
  if (res.code === TWILIO_STOPPED) {
    p.prefs.textsStopped = true;
    must(await db.from(PREFS).update({ texts_stopped: true, updated_at: stamp() }).eq("user_id", row.to_user), "texts stopped");
    return "stopped";
  }
  return "failed";
}

// Send one row that this run has already picked up, and write down how it
// ended. The person's switches are read again here, so an alert held overnight
// respects what they have switched off since. Phone alert first; a text when
// there is no phone to alert or every one failed. A test tries both.
async function sendRow(row: Row, people: Map<string, Person>) {
  let end: { status: string; channel: string | null; error: string | null } = { status: "failed", channel: null, error: "fault" };
  let push: "sent" | "failed" | "none" = "none", text: "sent" | "failed" | "stopped" | "nophone" | "off" = "off";
  try {
    const p = await person(row.to_user, people);
    if (!hears(p.prefs, row.kind)) end = { status: "skipped", channel: null, error: "alerts off" };
    else if (capReached(p.sent)) end = { status: "skipped", channel: null, error: "daily cap" };
    else {
      if (p.prefs.push && p.subs.length) push = await pushAll(p, row);
      if (wantsText({ test: row.kind === "test", texts: p.prefs.texts, push })) text = await textOne(row, p);
      end = rowOutcome({ push, text }) as typeof end;
      if (end.status === "sent") p.sent++;
    }
  } catch (e) {
    console.error("crew: alert not sent:", words(e));
  }
  must(await db.from(OUTBOX).update({ status: end.status, channel: end.channel, error: end.error, sent_at: stamp() }).eq("id", row.id), "outbox done");
  return { ...end, push, text };
}

type Scope = { ids?: string[]; crewId?: string };

// Send what is due: queued, not picked up, and past its send_after. Each row
// is picked up by setting sent_at only if nobody else has, so the cron job and
// an after-answer run can never both send it. Returns how many were sent.
export async function deliver(scope: Scope, budgetMs = 40000): Promise<number> {
  const started = Date.now();
  let due = db.from(OUTBOX).select("*").eq("status", "queued").is("sent_at", null).lte("send_after", stamp());
  if (scope.ids) due = due.in("id", scope.ids);
  if (scope.crewId) due = due.eq("crew_id", scope.crewId);
  const rows = (must(await due.order("created_at").order("id").limit(200), "outbox due") || []) as Row[];
  const people = new Map<string, Person>();
  let sent = 0;
  for (const row of rows) {
    if (Date.now() - started > budgetMs) break; // the rest wait for the next run
    const mine = must(
      await db.from(OUTBOX).update({ sent_at: stamp() }).eq("id", row.id).eq("status", "queued").is("sent_at", null).select("id"),
      "outbox pick up",
    ) as Row[] | null;
    if (!mine || !mine.length) continue;
    if ((await sendRow(row, people)).status === "sent") sent++;
  }
  return sent;
}

// How many alerts are still being held for later.
async function held(scope: Scope): Promise<number> {
  let q = db.from(OUTBOX).select("id", { count: "exact", head: true }).eq("status", "queued").is("sent_at", null).gt("send_after", stamp());
  if (scope.crewId) q = q.eq("crew_id", scope.crewId);
  const res = await q;
  if (res.error) throw new Error("db held count: " + JSON.stringify(res.error));
  return res.count || 0;
}

// A row picked up over ten minutes ago and never finished belongs to a run
// that died. It is given up on, not sent again: a late alert is better lost
// than doubled. Rows older than 30 days are cleared out.
async function tidy() {
  must(
    await db.from(OUTBOX).update({ status: "failed", error: "gave up" }).eq("status", "queued").lt("sent_at", new Date(Date.now() - 600e3).toISOString()),
    "outbox stale",
  );
  must(await db.from(OUTBOX).delete().lt("created_at", new Date(Date.now() - 30 * 864e5).toISOString()), "outbox old");
}

function sameKey(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// The cron job, every 5 minutes: everything that is due, for every crew.
export async function deliverCron(key: string) {
  const want = await setting("cron_key");
  if (!want || !sameKey(key, want)) refuse(403, "That key is not right.");
  await tidy();
  const sent = await deliver({});
  return { ok: true, sent, held: await held({}) };
}

// A signed-in person may ask for the same, for their own crew only. It sends
// nothing the cron job would not send within five minutes anyway.
export async function deliverMine(ctx: Ctx) {
  const sent = await deliver({ crewId: ctx.crew.id });
  return { ok: true, sent, held: await held({ crewId: ctx.crew.id }) };
}

// "Rig Card test. It works." to the caller, right now, whatever the hour. It
// is its own outbox row, picked up as it is made.
export async function testAlert(ctx: Ctx) {
  const said = alertWords({ kind: "test" }) as { title: string; body: string; url: string };
  const now = stamp();
  const row = must(
    await db.from(OUTBOX).insert({
      crew_id: ctx.crew.id, trip_id: null, to_user: ctx.me, by_user: ctx.me, kind: "test", title: said.title, body: said.body, url: said.url,
      send_after: now, sent_at: now,
    }).select("*").single(),
    "test alert",
  ) as Row;
  const end = await sendRow(row, new Map());
  return { ok: true, push: end.push, text: end.text === "nophone" || end.text === "off" ? "none" : end.text };
}

// ---- what was sent to me ---------------------------------------------------

const iso = (t: string | null) => (t ? new Date(t).toISOString() : null);

// The caller's own alerts, newest first: what each said, how it ended and why.
export async function outbox(ctx: Ctx) {
  const rows = (must(
    await db.from(OUTBOX).select("*").eq("to_user", ctx.me).eq("crew_id", ctx.crew.id).order("created_at", { ascending: false }).order("id").limit(50),
    "outbox",
  ) || []) as Row[];
  return {
    rows: rows.map((r) => ({
      id: r.id, kind: r.kind, title: r.title, body: r.body, url: r.url, tripId: r.trip_id,
      by: r.by_user && ctx.names.has(r.by_user) ? { id: r.by_user, name: ctx.names.get(r.by_user)! } : null,
      status: r.status, channel: r.channel, why: r.error, at: iso(r.created_at), sendAfter: iso(r.send_after), sentAt: iso(r.sent_at),
    })),
  };
}

// Clear the caller's own alerts that never went: the ones still waiting, and
// the skipped and failed ones. What was really sent stays, since the daily cap
// is counted from it.
export async function outboxClear(ctx: Ctx) {
  const gone = (must(await db.from(OUTBOX).delete().eq("to_user", ctx.me).neq("status", "sent").select("id"), "outbox clear") || []) as Row[];
  return { ok: true, cleared: gone.length };
}
