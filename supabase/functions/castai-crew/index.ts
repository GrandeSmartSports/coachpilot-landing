// Rig Card Crew: one small, invite-only group that sees the same week.
// PUBLIC endpoint, verify_jwt off: the function reads the caller's token
// itself so it can answer 401 in its own words instead of a gateway's.
//
// POST { action, ... }. The contract (every action, body and answer) is
// docs/superpowers/plans/2026-11-26-rig-card-crew-pieces-2-4.md.
//
//   no token:  hello, join
//   cron key:  deliver (header x-cron-key, from the castai-crew-deliver job)
//   token:     state, invite, link, member_remove,
//              trip_create, trip_update, trip_delete, trip, going,
//              comment_add, comment_delete, list_add, list_update, list_delete,
//              catch_link, catch_delete,
//              prefs_get, prefs_set, push_subscribe, push_unsubscribe, test_alert,
//              outbox, outbox_clear, deliver (own crew only)
//
// Errors are { error: "<plain words>" } with a real status: 400 bad input,
// 401 no good token, 403 not allowed, 404 not found or not your crew, 410 a
// dead link. Bad input is never a 500, and no answer ever carries a phone
// number, an email or the reason for a fault.
//
//   lib.ts         the database client, answers and refusals, who the caller is
//   people.ts      hello, join, state, invite, link, member_remove
//   trips.ts       trips, going, notes, the list, catches
//   alerts.ts      prefs, phones, the outbox, sending texts and phone alerts
//   webpush.ts     the Web Push sender, a copy of _shared/webpush.ts
//   crew-core.mjs  the rules, as plain functions the node tests run too
import {
  deliverCron, deliverMine, outbox, outboxClear, prefsGet, prefsSet, pushSubscribe, pushUnsubscribe, testAlert,
} from "./alerts.ts";
import { Body, caller, context, CORS, Ctx, json, Later, Refuse } from "./lib.ts";
import { hello, invite, join, link, memberRemove, state } from "./people.ts";
import {
  catchDelete, catchLink, commentAdd, commentDelete, going, listAdd, listDelete, listUpdate, tripCreate, tripDelete,
  tripFull, tripUpdate,
} from "./trips.ts";

// The edge runtime keeps a request's worker alive for work handed to it here.
declare const EdgeRuntime: { waitUntil?: (work: Promise<unknown>) => void } | undefined;

const OPEN = new Map<string, (body: Body) => Promise<unknown>>([
  ["hello", hello],
  ["join", join],
]);

const CREW = new Map<string, (ctx: Ctx, body: Body) => Promise<unknown>>([
  ["invite", invite],
  ["link", link],
  ["member_remove", memberRemove],
  ["trip_create", tripCreate],
  ["trip_update", tripUpdate],
  ["trip_delete", tripDelete],
  ["trip", tripFull],
  ["going", going],
  ["comment_add", commentAdd],
  ["comment_delete", commentDelete],
  ["list_add", listAdd],
  ["list_update", listUpdate],
  ["list_delete", listDelete],
  ["catch_link", catchLink],
  ["catch_delete", catchDelete],
  ["prefs_get", prefsGet],
  ["prefs_set", prefsSet],
  ["push_subscribe", pushSubscribe],
  ["push_unsubscribe", pushUnsubscribe],
  ["test_alert", testAlert],
  ["outbox", outbox],
  ["outbox_clear", outboxClear],
  ["deliver", deliverMine],
]);

// Start what a write left for after its answer: sending the alerts it queued.
// The answer does not wait for it, and a failure there is only logged.
function afterAnswer(work: Later[]) {
  if (!work.length) return;
  const all = Promise.allSettled(work.map((fn) => fn())).then((done) => {
    for (const d of done) {
      if (d.status === "rejected") console.error("crew: after-answer work failed:", d.reason instanceof Error ? d.reason.message : String(d.reason));
    }
  });
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(all);
}

const MAX_BODY = 20000;

// The body as an object, or null when it is not one.
async function read(req: Request): Promise<Body | null> {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new Refuse(400, "That is too much to send at once.");
  try {
    const body = JSON.parse(text);
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

async function answer(req: Request): Promise<Response> {
  const body = await read(req);
  const action = body && typeof body.action === "string" ? body.action : "";

  const open = OPEN.get(action);
  if (open) return json(await open(body!));
  // The cron job shows its key instead of signing in. A wrong key is a 403.
  if (action === "deliver" && req.headers.has("x-cron-key")) return json(await deliverCron(req.headers.get("x-cron-key") || ""));

  const user = await caller(req);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!body) return json({ error: "That did not read as a request." }, 400);
  if (action === "state") return json(await state(user.id));

  const run = CREW.get(action);
  if (!run) return json({ error: "That is not something the crew function does." }, 400);
  const ctx = await context(user.id);
  if (!ctx) return json({ error: "You are not on a crew yet." }, 403);
  const out = await run(ctx, body);
  afterAnswer(ctx.later);
  return json(out);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "Post only." }, 405);
  try {
    return await answer(req);
  } catch (e) {
    if (e instanceof Refuse) return json({ error: e.message }, e.status);
    // A fault of ours. The detail goes to the log and nowhere else.
    console.error("crew fault:", e instanceof Error ? e.message : String(e));
    return json({ error: "Something went wrong on our end. Try again." }, 500);
  }
});
