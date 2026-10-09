// cp-gateway v1. Privileged actions for the CoachPilot spine. Service role lives ONLY here.
// Deployed with --no-verify-jwt because invite_lookup and invite_accept run before an account exists;
// every other action verifies the caller's JWT itself via auth.getUser(token).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const URL_ = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const db = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SITE = "https://coachpilot.org";

type Caller = { personId: string; authId: string; email: string };
async function caller(req: Request): Promise<Caller | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token || token === ANON) return null;
  const anonClient = createClient(URL_, ANON, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data } = await anonClient.auth.getUser(token);
  if (!data?.user) return null;
  const { data: p } = await db.from("cp_people").select("id,email").eq("auth_user_id", data.user.id).maybeSingle();
  if (!p) return null;
  return { personId: p.id, authId: data.user.id, email: p.email };
}
async function hasRole(personId: string, where: { team_id?: string; league_id?: string }, roles: string[]): Promise<boolean> {
  let q = db.from("cp_memberships").select("id", { count: "exact", head: true }).eq("person_id", personId).eq("status", "active").in("role", roles);
  if (where.team_id) q = q.eq("team_id", where.team_id);
  if (where.league_id) q = q.eq("league_id", where.league_id);
  const { count } = await q;
  return (count ?? 0) > 0;
}
async function isPlatformAdmin(personId: string) { return hasRole(personId, {}, ["platform_admin"]); }
async function leagueOfTeam(teamId: string): Promise<string | null> { const { data } = await db.from("cp_teams").select("league_id").eq("id", teamId).maybeSingle(); return data?.league_id ?? null; }
async function canManageTeam(personId: string, teamId: string): Promise<boolean> {
  if (await hasRole(personId, { team_id: teamId }, ["head_coach"])) return true;
  const lg = await leagueOfTeam(teamId);
  if (lg && await hasRole(personId, { league_id: lg }, ["league_admin"])) return true;
  return isPlatformAdmin(personId);
}
async function audit(actor: string | null, action: string, table: string | null, id: string | null, meta: Record<string, unknown> = {}) {
  await db.from("cp_audit").insert({ actor_person_id: actor, action, subject_table: table, subject_id: id, meta });
}
async function flag(key: string): Promise<boolean> { const { data } = await db.from("cp_settings").select("value").eq("key", key).maybeSingle(); return data?.value === true; }
const mask = (e: string) => { const [u, d] = e.split("@"); return (u.slice(0, 1) + "***") + "@" + d; };

// Select-then-insert, not ON CONFLICT upsert: the backstop unique indexes are partial
// (e.g. "where team_id is not null"), and Postgres's ON CONFLICT column-list inference only
// matches non-partial indexes unless the predicate is restated in the conflict clause, which
// PostgREST's upsert(onConflict:) has no way to pass. A 23505 on the insert here means someone
// else's concurrent request just created the same row; treat that as success, not an error.
async function ensureMembership(fields: Record<string, unknown>, match: Record<string, string>): Promise<string | null> {
  const { count } = await db.from("cp_memberships").select("id", { count: "exact", head: true }).match(match);
  if ((count ?? 0) > 0) return null;
  const { error } = await db.from("cp_memberships").insert(fields);
  if (error && error.code !== "23505") return error.message;
  return null;
}

async function sendInviteEmail(inv: { id: string; email: string; token: string; role: string }, actor: string): Promise<{ sent: boolean; suppressed: boolean }> {
  if (!(await flag("email_enabled"))) { await audit(actor, "email_suppressed", "cp_invites", inv.id, { to: inv.email }); return { sent: false, suppressed: true }; }
  const link = `${SITE}/join/${inv.token}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#222"><p>You have been invited to CoachPilot as ${inv.role.replace("_", " ")}.</p><p><a href="${link}" style="display:inline-block;background:#1F5F3F;color:#fff;padding:12px 18px;text-decoration:none;border-radius:6px">Accept invite</a></p><p>Or paste this link: ${link}</p><p>This invite expires in 30 days.</p></div>`;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${RESEND_KEY}` }, body: JSON.stringify({ from: "CoachPilot <noreply@coachpilot.org>", to: inv.email, subject: "Your CoachPilot invite", html }) });
  const ok = r.ok;
  if (ok) await db.from("cp_invites").update({ sent_at: new Date().toISOString() }).eq("id", inv.id);
  await audit(actor, ok ? "invite_sent" : "invite_send_failed", "cp_invites", inv.id, { to: inv.email, status: r.status });
  return { sent: ok, suppressed: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const action = new URL(req.url).searchParams.get("action") || "";
  const body = await req.json().catch(() => ({}));

  // ---- public (pre-account) actions ----
  if (action === "invite_lookup") {
    const { data: inv } = await db.from("cp_invites").select("id,email,role,league_id,team_id,player_id,expires_at,accepted_at,locked_at").eq("token", String(body.token || "")).maybeSingle();
    if (!inv || inv.accepted_at || inv.locked_at || new Date(inv.expires_at) < new Date()) return json({ error: "This invite is no longer valid. Ask your coach to send a new one." }, 410);
    const { data: lg } = inv.league_id ? await db.from("cp_leagues").select("name").eq("id", inv.league_id).maybeSingle() : { data: null };
    const { data: tm } = inv.team_id ? await db.from("cp_teams").select("name").eq("id", inv.team_id).maybeSingle() : { data: null };
    return json({ ok: true, invite: { email_masked: mask(inv.email), role: inv.role, league_name: lg?.name ?? null, team_name: tm?.name ?? null, needs_birthdate: inv.role === "guardian" } });
  }
  if (action === "invite_accept") {
    const token = String(body.token || "");
    const { data: inv } = await db.from("cp_invites").select("*").eq("token", token).maybeSingle();
    if (!inv || inv.accepted_at || new Date(inv.expires_at) < new Date()) return json({ error: "This invite is no longer valid. Ask your coach to send a new one." }, 410);
    if (inv.locked_at) return json({ error: "Too many wrong tries. Your coach has been notified and can send a new invite." }, 423);
    if (inv.role === "guardian") {
      const { data: kid } = await db.from("cp_player_private").select("birthdate").eq("player_id", inv.player_id).maybeSingle();
      const given = String(body.birthdate || "");
      if (!kid?.birthdate || given !== kid.birthdate) {
        const attempts = (inv.attempts ?? 0) + 1;
        const lock = attempts >= 3;
        await db.from("cp_invites").update({ attempts, locked_at: lock ? new Date().toISOString() : null }).eq("id", inv.id);
        if (lock) { await audit(null, "invite_locked", "cp_invites", inv.id, { reason: "birthdate" }); return json({ error: "Too many wrong tries. Your coach has been notified and can send a new invite." }, 423); }
        return json({ error: "That birthdate does not match our roster. Check it and try again." }, 400);
      }
    }
    // ensure person + auth user
    const name = String(body.name || "").trim();
    const { data: person } = await db.from("cp_people").upsert({ email: inv.email, name: name || inv.email.split("@")[0] }, { onConflict: "email", ignoreDuplicates: false }).select().single();
    if (name && person.name !== name) await db.from("cp_people").update({ name }).eq("id", person.id);
    let authUserId: string | null = person.auth_user_id;
    if (!authUserId) {
      const { data: existingId } = await db.rpc("cp_auth_user_id_by_email", { p_email: inv.email });
      if (existingId) {
        authUserId = existingId as string;
        await db.from("cp_people").update({ auth_user_id: authUserId }).eq("id", person.id);
      } else {
        const { data: created, error } = await db.auth.admin.createUser({ email: inv.email, email_confirm: true });
        if (created?.user) {
          authUserId = created.user.id;
          await db.from("cp_people").update({ auth_user_id: authUserId }).eq("id", person.id);
        } else if (error && /already/i.test(error.message)) {
          const { data: retryId } = await db.rpc("cp_auth_user_id_by_email", { p_email: inv.email });
          if (retryId) { authUserId = retryId as string; await db.from("cp_people").update({ auth_user_id: authUserId }).eq("id", person.id); }
        } else if (error) {
          return json({ error: "Could not create your account. Try again in a minute." }, 500);
        }
      }
      if (!authUserId) return json({ error: "Could not link your account. Contact support." }, 500);
    }
    // accepted first: a crash past this point leaves the invite dead, not reusable.
    await db.from("cp_invites").update({ accepted_at: new Date().toISOString() }).eq("id", inv.id);
    // memberships / guardian rows
    if (inv.role === "guardian") {
      const { count } = await db.from("cp_guardians").select("id", { count: "exact", head: true }).eq("player_id", inv.player_id).eq("status", "approved");
      const first = (count ?? 0) === 0;
      const row = { player_id: inv.player_id, person_id: person.id, is_primary: first, status: first ? "approved" : "pending", approved_by: first ? inv.invited_by : null };
      const { error: gErr } = await db.from("cp_guardians").insert(row);
      if (gErr && gErr.code === "23505") {
        const msg = (gErr.message || "") + (gErr.details || "");
        if (/player_id.*person_id/i.test(msg)) {
          // this person already holds a guardian row for this kid (re-accept case): upsert as before.
          await db.from("cp_guardians").upsert(row, { onConflict: "player_id,person_id" });
        } else {
          // lost the race to be primary: fall back to a pending co-guardian row.
          await db.from("cp_guardians").insert({ player_id: inv.player_id, person_id: person.id, is_primary: false, status: "pending", approved_by: null });
        }
      } else if (gErr) {
        return json({ error: "Could not record guardian. Try again." }, 500);
      }
      const mErr = await ensureMembership(
        { person_id: person.id, team_id: inv.team_id, role: "guardian", status: "active", season_label: null, invited_by: inv.invited_by, activated_at: new Date().toISOString() },
        { person_id: person.id, team_id: inv.team_id, role: "guardian" }
      );
      if (mErr) return json({ error: "Could not record membership. Try again." }, 500);
    } else {
      const match = inv.league_id ? { person_id: person.id, league_id: inv.league_id, role: inv.role } : { person_id: person.id, team_id: inv.team_id, role: inv.role };
      const mErr = await ensureMembership(
        { person_id: person.id, team_id: inv.team_id, league_id: inv.league_id, role: inv.role, status: "active", invited_by: inv.invited_by, activated_at: new Date().toISOString() },
        match
      );
      if (mErr) return json({ error: "Could not record membership. Try again." }, 500);
    }
    await audit(person.id, "invite_accepted", "cp_invites", inv.id, { role: inv.role });
    return json({ ok: true, email: inv.email });
  }

  // ---- authenticated actions ----
  const me = await caller(req);
  if (!me) return json({ error: "Sign in required" }, 401);

  if (action === "invite_create") {
    const role = String(body.role || "");
    const teamId = body.team_id ? String(body.team_id) : null;
    let leagueId = body.league_id ? String(body.league_id) : null;
    const playerId = body.player_id ? String(body.player_id) : null;
    if (role === "head_coach" || role === "assistant_coach" || role === "guardian") leagueId = null;
    const email = String(body.email || "").trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email" }, 400);
    let allowed = false;
    if (role === "league_admin" || role === "league_scheduler") allowed = !!leagueId && (await isPlatformAdmin(me.personId) || await hasRole(me.personId, { league_id: leagueId }, ["league_admin"]));
    else if (role === "head_coach") { const lg = teamId ? await leagueOfTeam(teamId) : null; allowed = !!teamId && (await isPlatformAdmin(me.personId) || (!!lg && await hasRole(me.personId, { league_id: lg }, ["league_admin"]))); }
    else if (role === "assistant_coach") allowed = !!teamId && await canManageTeam(me.personId, teamId);
    else if (role === "guardian") {
      if (!teamId || !playerId) return json({ error: "team_id and player_id required" }, 400);
      const { data: kid } = await db.from("cp_players").select("team_id").eq("id", playerId).maybeSingle();
      allowed = !!kid && kid.team_id === teamId && (await canManageTeam(me.personId, teamId) || (await db.from("cp_guardians").select("id", { count: "exact", head: true }).eq("player_id", playerId).eq("person_id", me.personId).eq("status", "approved").then(r => (r.count ?? 0) > 0)));
    }
    if (!allowed) return json({ error: "You cannot send that invite" }, 403);
    const { data: inv, error } = await db.from("cp_invites").insert({ email, role, league_id: leagueId, team_id: teamId, player_id: playerId, invited_by: me.personId }).select("id,token,email,role,expires_at").single();
    if (error) return json({ error: error.message }, 400);
    await audit(me.personId, "invite_created", "cp_invites", inv.id, { role, email });
    return json({ ok: true, invite: inv });
  }
  if (action === "invite_send" || action === "invite_resend") {
    const { data: inv } = await db.from("cp_invites").select("id,email,token,role,team_id,league_id,invited_by,accepted_at").eq("id", String(body.invite_id || "")).maybeSingle();
    if (!inv) return json({ error: "Invite not found" }, 404);
    if (inv.accepted_at) return json({ error: "Already accepted" }, 409);
    const allowed = inv.invited_by === me.personId || (inv.team_id ? await canManageTeam(me.personId, inv.team_id) : false) || (inv.league_id ? await hasRole(me.personId, { league_id: inv.league_id }, ["league_admin"]) : false) || await isPlatformAdmin(me.personId);
    if (!allowed) return json({ error: "Not yours to send" }, 403);
    const r = await sendInviteEmail(inv, me.personId);
    return json({ ok: true, ...r });
  }
  if (action === "invite_revoke") {
    const { data: inv } = await db.from("cp_invites").select("id,team_id,league_id,invited_by").eq("id", String(body.invite_id || "")).maybeSingle();
    if (!inv) return json({ error: "Invite not found" }, 404);
    const allowed = inv.invited_by === me.personId || (inv.team_id ? await canManageTeam(me.personId, inv.team_id) : false) || await isPlatformAdmin(me.personId);
    if (!allowed) return json({ error: "Not yours to revoke" }, 403);
    await db.from("cp_invites").update({ expires_at: new Date(0).toISOString() }).eq("id", inv.id);
    await audit(me.personId, "invite_revoked", "cp_invites", inv.id);
    return json({ ok: true });
  }
  if (action === "guardian_approve") {
    const { data: g } = await db.from("cp_guardians").select("id,player_id,status").eq("id", String(body.guardian_id || "")).maybeSingle();
    if (!g) return json({ error: "Not found" }, 404);
    const teamId = (await db.from("cp_players").select("team_id").eq("id", g.player_id).maybeSingle()).data?.team_id;
    const primary = await db.from("cp_guardians").select("id", { count: "exact", head: true }).eq("player_id", g.player_id).eq("person_id", me.personId).eq("is_primary", true).eq("status", "approved").then(r => (r.count ?? 0) > 0);
    if (!(primary || (teamId && await canManageTeam(me.personId, teamId)))) return json({ error: "Only the primary guardian or the head coach can approve" }, 403);
    await db.from("cp_guardians").update({ status: "approved", approved_by: me.personId }).eq("id", g.id);
    await audit(me.personId, "guardian_approved", "cp_guardians", g.id);
    return json({ ok: true });
  }
  if (action === "league_create") {
    if (!(await isPlatformAdmin(me.personId))) return json({ error: "Platform admin only" }, 403);
    const { data, error } = await db.from("cp_leagues").insert({ slug: String(body.slug || ""), name: String(body.name || ""), short_name: String(body.short_name || ""), sports: Array.isArray(body.sports) ? body.sports : [] }).select().single();
    if (error) return json({ error: error.message }, 400);
    await db.from("cp_memberships").insert({ person_id: me.personId, league_id: data.id, role: "league_admin", status: "active", activated_at: new Date().toISOString() });
    await audit(me.personId, "league_created", "cp_leagues", data.id, { slug: data.slug });
    return json({ ok: true, league: data });
  }
  if (action === "mirror_status") {
    if (!(await isPlatformAdmin(me.personId))) return json({ error: "Platform admin only" }, 403);
    const { data } = await db.from("cp_settings").select("value,updated_at").eq("key", "mirror_report").maybeSingle();
    return json({ ok: true, report: data?.value ?? null, updated_at: data?.updated_at ?? null });
  }
  return json({ error: "Unknown action" }, 404);
});
