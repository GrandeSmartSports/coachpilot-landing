// Rig Card Crew: one small, invite-only group that sees the same week.
// PUBLIC endpoint, verify_jwt off: the function reads the caller's token
// itself so it can answer 401 in its own words instead of a gateway's.
//
// POST { action, ... }. The contract (every action, body and answer) is
// docs/superpowers/plans/2026-11-26-rig-card-crew-pieces-2-4.md.
//
//   no token:  hello, join
//   token:     state, invite, link, member_remove,
//              trip_create, trip_update, trip_delete, trip, going,
//              comment_add, comment_delete, list_add, list_update, list_delete,
//              catch_add, catch_delete
//
// Errors are { error: "<plain words>" } with a real status: 400 bad input,
// 401 no good token, 403 not allowed, 404 not found or not your crew, 410 a
// dead link. Bad input is never a 500, and no answer ever carries a phone
// number, an email or the reason for a fault.
//
//   lib.ts         the database client, answers and refusals, who the caller is
//   people.ts      hello, join, state, invite, link, member_remove
//   trips.ts       trips, going, notes, the list, catches
//   crew-core.mjs  the rules, as plain functions the node tests run too
import { Body, caller, context, CORS, Ctx, json, Refuse } from "./lib.ts";
import { hello, invite, join, link, memberRemove, state } from "./people.ts";
import {
  catchAdd, catchDelete, commentAdd, commentDelete, going, listAdd, listDelete, listUpdate, tripCreate, tripDelete,
  tripFull, tripUpdate,
} from "./trips.ts";

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
  ["catch_add", catchAdd],
  ["catch_delete", catchDelete],
]);

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

  const user = await caller(req);
  if (!user) return json({ error: "Sign in first." }, 401);
  if (!body) return json({ error: "That did not read as a request." }, 400);
  if (action === "state") return json(await state(user.id));

  const run = CREW.get(action);
  if (!run) return json({ error: "That is not something the crew function does." }, 400);
  const ctx = await context(user.id);
  if (!ctx) return json({ error: "You are not on a crew yet." }, 403);
  return json(await run(ctx, body));
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
