// Rig Card Crew: one small, invite-only group that sees the same week.
// PUBLIC endpoint, verify_jwt off: the function reads the caller's token
// itself so it can answer 401 in its own words instead of a gateway's.
//
// POST { action: "state" }                 -> who am I, my crew, the members
// POST { action: "invite", name, phone }   -> owner only; attach or create
//
// The crew tables carry no policies, so this service-role client is the only
// way in. A member's phone number never leaves this function.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { canInvite, inviteOutcome, normalizePhone } from "./crew-core.mjs";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function caller(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  return error || !data?.user ? null : data.user;
}

// The crew this person is on, plus their row on it.
async function myCrew(userId: string) {
  const { data } = await db.from("castai_crew_members").select("crew_id, role, display_name").eq("user_id", userId).limit(1);
  const member = data && data[0];
  if (!member) return { member: null, crew: null };
  const { data: c } = await db.from("castai_crew").select("id, name").eq("id", member.crew_id).maybeSingle();
  return { member, crew: c || null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "post only" }, 405);
  try {
    const user = await caller(req);
    if (!user) return json({ error: "sign in first" }, 401);

    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { body = {}; }
    const action = String(body.action || "");

    if (action === "state") {
      const { member, crew } = await myCrew(user.id);
      const me = { id: user.id, name: member?.display_name || "You" };
      if (!crew) return json({ me, crew: null, members: [] });
      const { data: rows } = await db.from("castai_crew_members")
        .select("user_id, role, display_name").eq("crew_id", crew.id).order("joined_at");
      return json({
        me,
        crew: { id: crew.id, name: crew.name, role: member!.role },
        members: (rows || []).map((r) => ({ id: r.user_id, name: r.display_name, role: r.role })),
      });
    }

    if (action === "invite") {
      const { member, crew } = await myCrew(user.id);
      if (!canInvite(member) || !crew) return json({ error: "only the owner can add someone" }, 403);
      const name = String(body.name || "").trim();
      if (name.length < 1 || name.length > 60) return json({ error: "a name is needed" }, 400);
      let phone: string;
      try { phone = normalizePhone(body.phone); } catch (e) { return json({ error: (e as Error).message }, 400); }

      // Does this number already have an account? listUsers is the only way
      // to look one up by phone with the service role.
      const { data: found } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const existing = (found?.users || []).find((u) => (u.phone || "") === phone.replace("+", "") || u.phone === phone) || null;
      const already = existing
        ? (await db.from("castai_crew_members").select("user_id").eq("crew_id", crew.id).eq("user_id", existing.id).maybeSingle()).data
        : null;
      const outcome = inviteOutcome({ user: existing, member: already });
      if (outcome === "already") return json({ ok: true, created: false, name });

      let userId = existing?.id;
      if (outcome === "create") {
        const { data: made, error } = await db.auth.admin.createUser({ phone, phone_confirm: true });
        if (error || !made?.user) return json({ error: "could not add that number" }, 500);
        userId = made.user.id;
      }
      const { error: mErr } = await db.from("castai_crew_members")
        .insert({ crew_id: crew.id, user_id: userId, role: "member", display_name: name, invited_by: user.id });
      if (mErr) return json({ error: "could not add them to the crew" }, 500);
      return json({ ok: true, created: outcome === "create", name });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
