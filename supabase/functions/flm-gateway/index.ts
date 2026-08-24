// Field Command gateway (v11). Deployed to the CoachPilot Supabase project
// (geigvuysptjvvqanumld) via Supabase MCP deploy_edge_function, verify_jwt off.
// This repo copy is the source of truth since Phase 3; keep it in sync with
// every deploy.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function getPin(): Promise<string> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "admin_pin").single();
  return data?.value ?? "";
}

async function log(action: string, detail: string, actor = "") {
  await db.from("flm_activity").insert({ action, detail, actor });
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat_9_11", "sat_11_1", "sat_1_3", "sat_3_5"];
const SEVERITIES = ["info", "warning", "urgent"];
const GAME_STATUSES = ["draft", "scheduled", "postponed", "cancelled", "completed"];
const UMP_ROLES = ["plate", "base"];
const UMP_DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ADMIN_ALERT_EMAIL = "Daniel.Grande@ymail.com";
const PUBLIC_TEAM_COLS = "id,name,coach_name,coach_phone,division,is_active,created_at";
const PUBLIC_EXT_COLS = "id,league_name,team_name,division";

// Interlock game shape: opponent is away_team_id (our league) XOR ext_team_id
// (another league); venue is field_id (our field) XOR venue_text (their venue).
// Both rules are also enforced by DB check constraints.
function gameShapeError(g: Record<string, unknown>): string | null {
  const opp = [g.away_team_id, g.ext_team_id].filter((v) => v).length;
  if (opp !== 1) return "pick exactly one opponent: a league team or an external team";
  const ven = [g.field_id, g.venue_text].filter((v) => v).length;
  if (ven !== 1) return "pick exactly one venue: one of our fields or an external venue";
  return null;
}

async function gameNames(g: { home_team_id: string; away_team_id: string | null; ext_team_id: string | null; field_id: string | null; venue_text: string | null }): Promise<string> {
  const [h, a, x, f] = await Promise.all([
    db.from("flm_teams").select("name").eq("id", g.home_team_id).single(),
    g.away_team_id ? db.from("flm_teams").select("name").eq("id", g.away_team_id).single() : Promise.resolve({ data: null }),
    g.ext_team_id ? db.from("flm_ext_teams").select("team_name,league_name").eq("id", g.ext_team_id).single() : Promise.resolve({ data: null }),
    g.field_id ? db.from("flm_fields").select("name").eq("id", g.field_id).single() : Promise.resolve({ data: null }),
  ]);
  const opp = x.data ? `${x.data.team_name} (${x.data.league_name})` : (a.data?.name ?? "?");
  const where = f.data?.name ?? (g.venue_text ? `${g.venue_text}` : "?");
  return `${h.data?.name ?? "?"} vs ${opp} at ${where}`;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function announcementEmailHtml(leagueName: string, a: { title: string; body: string; severity: string }): string {
  const sevColor = a.severity === "urgent" ? "#b3432b" : a.severity === "warning" ? "#a8571d" : "#2d6a4f";
  const sevLabel = a.severity === "urgent" ? "URGENT" : a.severity === "warning" ? "HEADS UP" : "LEAGUE NOTICE";
  const bodyHtml = escHtml(a.body).replace(/\n/g, "<br />");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)}</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <div style="display:inline-block;background:${sevColor};color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;border-radius:12px;padding:3px 12px;margin-bottom:12px;">${sevLabel}</div>
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">${escHtml(a.title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#3c463f;">${bodyHtml}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">See the full field schedule any time at <a href="https://coachpilot.org/fields/" style="color:#2d6a4f;">coachpilot.org/fields</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command. Reply to this email to reach the league.</p>
</div>
</body></html>`;
}

// ---------- Phase 4: umpires ----------
// Privacy hard line: umpire emails and phones NEVER leave the gateway except
// to the admin console (PIN) and to Resend. Public reads get id + name only.
function pacificToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}
function tMin(t: unknown): number {
  const p = String(t ?? "").split(":");
  return (+p[0] || 0) * 60 + (+p[1] || 0);
}
function timesOverlap(a1: unknown, a2: unknown, b1: unknown, b2: unknown): boolean {
  return tMin(a1) < tMin(b2) && tMin(b1) < tMin(a2);
}
async function emailOn(): Promise<boolean> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "email_enabled").maybeSingle();
  return data?.value === "true";
}
async function umpDefaults(): Promise<Record<string, number>> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "ump_defaults").maybeSingle();
  try {
    const o = JSON.parse(data?.value ?? "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (_e) {
    return {};
  }
}
function neededFor(game: { umps_needed?: number | null; division?: string }, defs: Record<string, number>): number {
  if (game.umps_needed !== null && game.umps_needed !== undefined) return game.umps_needed;
  const d = defs[game.division ?? ""];
  return typeof d === "number" ? d : 1;
}
// deno-lint-ignore no-explicit-any
async function umpAuth(b: Record<string, unknown>): Promise<any | null> {
  if (!b.ump_id || !b.ump_pin) return null;
  const { data } = await db.from("flm_umps").select("*").eq("id", b.ump_id).maybeSingle();
  if (!data || !data.active) return null;
  if (String(b.ump_pin) !== String(data.pin)) return null;
  return data;
}
function umpEmailHtml(leagueName: string, heading: string, lines: string[]): string {
  const body = lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#3c463f;">${escHtml(l)}</p>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)} Umpires</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">${escHtml(heading)}</h1>
    ${body}
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">Your games are always at <a href="https://coachpilot.org/fields/umpire.html" style="color:#2d6a4f;">coachpilot.org/fields/umpire.html</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command. Reply to this email to reach the league.</p>
</div>
</body></html>`;
}
async function resendSend(body: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!RESEND_API_KEY) return { ok: false, error: "email is not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 120)}` };
  try {
    return { ok: true, id: (await res.json()).id ?? "" };
  } catch (_e) {
    return { ok: true, id: "" };
  }
}
// The ONE send path for every umpire email. Parent cc for minors is enforced
// here, from the umpire record itself, so no caller can skip it.
// deno-lint-ignore no-explicit-any
async function sendUmpEmail(ump: any, subject: string, html: string, testTo = ""): Promise<{ ok: boolean; id?: string; cc?: string[]; error?: string }> {
  const to = (testTo || String(ump.email ?? "")).trim();
  if (!to.includes("@")) return { ok: false, error: `no email on file for ${ump.name}` };
  const cc = ump.is_minor && String(ump.parent_email ?? "").includes("@") ? [String(ump.parent_email).trim()] : [];
  const body: Record<string, unknown> = { from: "Field Command <noreply@cueops.io>", reply_to: ADMIN_ALERT_EMAIL, to: [to], subject, html };
  if (cc.length) body.cc = cc;
  const r = await resendSend(body);
  return { ...r, cc };
}
async function sendAdminEmail(subject: string, html: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return await resendSend({ from: "Field Command <noreply@cueops.io>", to: [ADMIN_ALERT_EMAIL], subject, html });
}
async function leagueName(): Promise<string> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "league_name").maybeSingle();
  return data?.value || "Field Command";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    // ---------- public ----------
    if (action === "state") {
      // Draft games are admin-only: parents and coaches never see a half-built
      // schedule. A valid PIN header on state includes drafts for the admin console.
      const pinHdr = req.headers.get("x-admin-pin") ?? "";
      const showDrafts = pinHdr.length > 0 && pinHdr === (await getPin());
      let gamesQ = db.from("flm_games").select("*").order("game_date").order("start_time");
      if (!showDrafts) gamesQ = gamesQ.neq("status", "draft");
      const [settings, seasons, fields, teams, slots, announcements, games, extTeams] = await Promise.all([
        db.from("flm_settings").select("key,value"),
        db.from("flm_seasons").select("*").order("sort"),
        db.from("flm_fields").select("*").order("sort"),
        db.from("flm_teams").select(PUBLIC_TEAM_COLS).order("name"),
        db.from("flm_slots").select("*"),
        db.from("flm_announcements").select("id,created_at,title,body,severity").eq("active", true).order("created_at", { ascending: false }).limit(10),
        gamesQ,
        db.from("flm_ext_teams").select(showDrafts ? "*" : PUBLIC_EXT_COLS).order("league_name").order("team_name"),
      ]);
      const s: Record<string, string> = {};
      (settings.data ?? []).forEach((r: { key: string; value: string }) => {
        if (r.key !== "admin_pin" && r.key !== "cron_key") s[r.key] = r.value;
      });
      const out: Record<string, unknown> = { ok: true, settings: s, seasons: seasons.data, fields: fields.data, teams: teams.data, slots: slots.data, announcements: announcements.data, games: games.data, ext_teams: extTeams.data };
      // Umpire roster + assignments ride on state ONLY for the admin console.
      // The public portal never receives an umps key at all.
      if (showDrafts) {
        const [umps, assigns] = await Promise.all([
          db.from("flm_umps").select("*").order("name"),
          db.from("flm_ump_assignments").select("*").order("created_at"),
        ]);
        out.umps = umps.data;
        out.ump_assignments = assigns.data;
      }
      return json(out);
    }

    if (action === "claim" && req.method === "POST") {
      const b = await req.json();
      const { season_id, day_key, field_id, team_id } = b;
      if (!season_id || !day_key || !field_id || !team_id || !DAY_KEYS.includes(day_key)) {
        return json({ ok: false, error: "missing or invalid fields" }, 400);
      }
      const { data: season } = await db.from("flm_seasons").select("label,locked").eq("id", season_id).single();
      if (!season) return json({ ok: false, error: "unknown season" }, 400);
      if (season.locked) return json({ ok: false, error: "This schedule window is locked by the league." }, 403);
      const { data: existing } = await db.from("flm_slots").select("id,team_id,label").eq("season_id", season_id).eq("day_key", day_key).eq("field_id", field_id);
      if ((existing ?? []).some((s: { team_id: string | null }) => s.team_id === team_id)) {
        return json({ ok: false, error: "Your team already holds this slot." }, 409);
      }
      if ((existing ?? []).length > 0 && !b.allow_share) {
        return json({ ok: false, error: "taken", taken: true, existing }, 409);
      }
      const { data: team } = await db.from("flm_teams").select("name").eq("id", team_id).single();
      if (!team) return json({ ok: false, error: "unknown team" }, 400);
      const note = String(b.note ?? "").slice(0, 200);
      const { data: slot, error } = await db.from("flm_slots").insert({
        season_id, day_key, field_id, team_id,
        label: team.name, note, claimed_by: "coach",
      }).select().single();
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("claim", `${team.name} claimed ${day_key} (season ${season.label})${note ? " — " + note : ""}`, team.name);
      return json({ ok: true, slot });
    }

    if (action === "release" && req.method === "POST") {
      const b = await req.json();
      const { slot_id, team_id } = b;
      if (!slot_id || !team_id) return json({ ok: false, error: "missing fields" }, 400);
      const { data: slot } = await db.from("flm_slots").select("id,team_id,label,day_key,season_id").eq("id", slot_id).single();
      if (!slot) return json({ ok: false, error: "not found" }, 404);
      if (slot.team_id !== team_id) return json({ ok: false, error: "Only the team holding a slot can release it." }, 403);
      const { data: season } = await db.from("flm_seasons").select("locked").eq("id", slot.season_id).single();
      if (season?.locked) return json({ ok: false, error: "This schedule window is locked by the league." }, 403);
      await db.from("flm_slots").delete().eq("id", slot_id);
      await log("release", `${slot.label} released ${slot.day_key}`, slot.label);
      return json({ ok: true });
    }

    // ---------- umpires (per-ump PIN, never the admin PIN) ----------
    if (action === "ump_list") {
      // Login picker only: names, no contact info, ever.
      const { data } = await db.from("flm_umps").select("id,name").eq("active", true).order("name");
      return json({ ok: true, umps: data });
    }

    if (action === "ump_state" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const [mineQ, allQ] = await Promise.all([
        db.from("flm_ump_assignments").select("*").eq("ump_id", ump.id).order("created_at"),
        db.from("flm_ump_assignments").select("game_id,status"),
      ]);
      // Per-game fill counts (numbers only, no other umpire names or ids).
      const fill: Record<string, { accepted: number; offered: number }> = {};
      for (const a of (allQ.data ?? [])) {
        const f = (fill[a.game_id] = fill[a.game_id] ?? { accepted: 0, offered: 0 });
        if (a.status === "accepted") f.accepted++;
        if (a.status === "offered") f.offered++;
      }
      const myAcc = (mineQ.data ?? []).filter((a: { status: string }) => a.status === "accepted");
      let tally = 0;
      if (myAcc.length) {
        const { data: gs } = await db.from("flm_games").select("id,game_date,status").in("id", myAcc.map((a: { game_id: string }) => a.game_id));
        const today = pacificToday();
        tally = (gs ?? []).filter((g: { status: string; game_date: string }) => g.status === "completed" || (g.status !== "cancelled" && g.game_date < today)).length;
      }
      return json({
        ok: true,
        ump: { id: ump.id, name: ump.name, levels: ump.levels, is_minor: ump.is_minor, availability: ump.availability },
        assignments: mineQ.data, fill, tally,
      });
    }

    if (action === "ump_claim" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const { data: game } = await db.from("flm_games").select("*").eq("id", b.game_id).maybeSingle();
      if (!game) return json({ ok: false, error: "game not found" }, 404);
      if (game.status !== "scheduled") return json({ ok: false, error: "Only published, scheduled games can be taken." }, 400);
      const today = pacificToday();
      if (game.game_date < today) return json({ ok: false, error: "That game is in the past." }, 400);
      if (!(ump.levels ?? []).includes(game.division)) return json({ ok: false, error: "That game is not in one of your levels." }, 403);
      const av = ump.availability ?? {};
      const dow = UMP_DOW[new Date(game.game_date + "T12:00:00Z").getUTCDay()];
      if ((av.days ?? {})[dow] === false || (av.blocked ?? []).includes(game.game_date)) {
        return json({ ok: false, error: "You are marked unavailable that day. Update your availability first." }, 409);
      }
      const { data: myActive } = await db.from("flm_ump_assignments").select("game_id,status").eq("ump_id", ump.id).in("status", ["offered", "accepted"]);
      const activeIds = (myActive ?? []).map((a: { game_id: string }) => a.game_id);
      if (activeIds.includes(game.id)) return json({ ok: false, error: "You already have this game." }, 409);
      if (activeIds.length) {
        const { data: myGames } = await db.from("flm_games").select("id,game_date,start_time,end_time").in("id", activeIds);
        const clash = (myGames ?? []).find((g: { game_date: string; start_time: string; end_time: string }) =>
          g.game_date === game.game_date && timesOverlap(g.start_time, g.end_time, game.start_time, game.end_time));
        if (clash) return json({ ok: false, error: "You already have a game at that time that day." }, 409);
      }
      const { data: gameA } = await db.from("flm_ump_assignments").select("status,role").eq("game_id", game.id);
      const accepted = (gameA ?? []).filter((a: { status: string }) => a.status === "accepted");
      const needed = neededFor(game, await umpDefaults());
      if (accepted.length >= needed) return json({ ok: false, error: "This game already has its umpires. Thank you anyway!" }, 409);
      const role = accepted.some((a: { role: string }) => a.role === "plate") ? "base" : "plate";
      // Self-claim is volunteer-friendly: it lands as accepted right away.
      const ins = await db.from("flm_ump_assignments").insert({
        game_id: game.id, ump_id: ump.id, role, status: "accepted", responded_at: new Date().toISOString(),
      }).select().single();
      if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
      await log("ump", `${ump.name} took the ${role} umpire spot for ${await gameNames(game)} on ${game.game_date}`, ump.name);
      return json({ ok: true, assignment: ins.data });
    }

    if (action === "ump_respond" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const { data: a } = await db.from("flm_ump_assignments").select("*").eq("id", b.assignment_id).maybeSingle();
      if (!a || a.ump_id !== ump.id) return json({ ok: false, error: "assignment not found" }, 404);
      // Offer state machine: offered -> accepted | declined; accepted -> turned_back.
      const moves: Record<string, [string, string]> = {
        accept: ["offered", "accepted"], decline: ["offered", "declined"], turn_back: ["accepted", "turned_back"],
      };
      const mv = moves[String(b.response)];
      if (!mv) return json({ ok: false, error: "response must be accept, decline, or turn_back" }, 400);
      if (a.status !== mv[0]) return json({ ok: false, error: `That game is ${a.status}, so this response does not apply anymore.` }, 409);
      const upd = await db.from("flm_ump_assignments").update({ status: mv[1], responded_at: new Date().toISOString() }).eq("id", a.id).select().single();
      if (upd.error) return json({ ok: false, error: upd.error.message }, 500);
      const { data: game } = await db.from("flm_games").select("*").eq("id", a.game_id).maybeSingle();
      const gname = game ? `${await gameNames(game)} on ${game.game_date}` : "a game";
      const words: Record<string, string> = { accept: "accepted the offer to work", decline: "declined the offer to work", turn_back: "turned back" };
      const reopened = mv[1] === "declined" || mv[1] === "turned_back";
      await log("ump", `${ump.name} ${words[String(b.response)]} ${gname}.${reopened ? " The spot is open again." : ""}`, ump.name);
      if (reopened) {
        // Declines and turn-backs flag the league right away (kill-switched).
        const line = `${ump.name} ${mv[1] === "declined" ? "declined the offer for" : "turned back"} ${gname}. The spot is open on the umpire page again.`;
        if (await emailOn()) {
          const r = await sendAdminEmail(`${await leagueName()}: umpire spot open again`, umpEmailHtml(await leagueName(), "An umpire spot opened up", [line]));
          await log("ump_email", r.ok ? `Alert emailed to the league: ${line}` : `Alert email failed (${r.error}): ${line}`, "system");
        } else {
          await log("ump_email", `Email is off. Would have alerted the league: ${line}`, "system");
        }
      }
      return json({ ok: true, assignment: upd.data });
    }

    if (action === "ump_availability" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const av = b.availability;
      if (!av || typeof av !== "object" || Array.isArray(av)) return json({ ok: false, error: "availability must be an object" }, 400);
      const days: Record<string, boolean> = {};
      for (const k of UMP_DOW) days[k] = ((av.days ?? {})[k]) !== false;
      const blocked = Array.isArray(av.blocked)
        ? av.blocked.map((d: unknown) => String(d)).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60)
        : [];
      const upd = await db.from("flm_umps").update({ availability: { days, blocked } }).eq("id", ump.id).select("availability").single();
      if (upd.error) return json({ ok: false, error: upd.error.message }, 500);
      await log("ump", `${ump.name} updated their availability`, ump.name);
      return json({ ok: true, availability: upd.data.availability });
    }

    if (action === "ump_change_pin" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const np = String(b.new_pin ?? "");
      if (!/^\d{4}$/.test(np)) return json({ ok: false, error: "The new PIN must be exactly 4 digits." }, 400);
      await db.from("flm_umps").update({ pin: np }).eq("id", ump.id);
      await log("ump", `${ump.name} changed their PIN`, ump.name);
      return json({ ok: true });
    }

    // ---------- admin ----------
    const pin = req.headers.get("x-admin-pin") ?? "";
    const adminOk = pin.length > 0 && pin === (await getPin());
    if (!adminOk) return json({ ok: false, error: "unauthorized" }, 401);

    if (action === "activity") {
      const { data } = await db.from("flm_activity").select("*").order("created_at", { ascending: false }).limit(150);
      return json({ ok: true, activity: data });
    }

    if (action === "admin_teams") {
      const { data } = await db.from("flm_teams").select("id,name,coach_name,coach_email,division,is_active").order("name");
      return json({ ok: true, teams: data });
    }

    if (action === "admin_umps") {
      // Admin console only: the one read that includes umpire contact info.
      const { data } = await db.from("flm_umps").select("*").order("name");
      return json({ ok: true, umps: data });
    }

    if (action === "admin_announcements") {
      const { data } = await db.from("flm_announcements").select("*").order("created_at", { ascending: false }).limit(30);
      return json({ ok: true, announcements: data });
    }

    if (action === "events_summary") {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const base = () => db.from("flm_events").select("*", { count: "exact", head: true });
      const counts = await Promise.all([
        base().eq("event", "page_view"),
        base().eq("event", "page_view").gte("created_at", since),
        base().eq("event", "page_view").eq("page", "fields").gte("created_at", since),
        base().eq("event", "page_view").eq("page", "fields-admin").gte("created_at", since),
        base().eq("event", "js_error"),
        base().eq("event", "js_error").gte("created_at", since),
      ]).then((rs) => rs.map((r) => r.count ?? 0));
      return json({
        ok: true,
        views_total: counts[0], views_7d: counts[1],
        views_7d_public: counts[2], views_7d_admin: counts[3],
        errors_total: counts[4], errors_7d: counts[5],
      });
    }

    if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
    const b = await req.json();

    if (action === "admin_ump") {
      if (b.delete_id) {
        const { data: u } = await db.from("flm_umps").select("name").eq("id", b.delete_id).maybeSingle();
        await db.from("flm_umps").delete().eq("id", b.delete_id);
        await log("ump_admin", `Removed umpire ${u?.name ?? b.delete_id}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      for (const k of ["name", "email", "phone", "parent_email", "notes"]) {
        if (b[k] !== undefined) row[k] = String(b[k]).trim().slice(0, 160);
      }
      if (b.pin !== undefined) {
        if (!/^\d{4}$/.test(String(b.pin))) return json({ ok: false, error: "PIN must be exactly 4 digits" }, 400);
        row.pin = String(b.pin);
      }
      if (b.levels !== undefined) {
        if (!Array.isArray(b.levels)) return json({ ok: false, error: "levels must be a list of divisions" }, 400);
        row.levels = b.levels.map((d: unknown) => String(d).trim()).filter((d: string) => d).slice(0, 20);
      }
      if (b.is_minor !== undefined) row.is_minor = !!b.is_minor;
      if (b.active !== undefined) row.active = !!b.active;
      let res;
      if (b.id) {
        const { data: cur } = await db.from("flm_umps").select("*").eq("id", b.id).maybeSingle();
        if (!cur) return json({ ok: false, error: "not found" }, 404);
        const merged = { ...cur, ...row };
        if (merged.is_minor && !String(merged.parent_email ?? "").includes("@")) {
          return json({ ok: false, error: "A minor umpire needs a parent email on file. Every email to them cc's the parent." }, 400);
        }
        res = await db.from("flm_umps").update(row).eq("id", b.id).select().single();
      } else {
        if (!row.name) return json({ ok: false, error: "name required" }, 400);
        if (!row.pin) row.pin = String(Math.floor(1000 + Math.random() * 9000));
        if (row.is_minor === true && !String(row.parent_email ?? "").includes("@")) {
          return json({ ok: false, error: "A minor umpire needs a parent email on file. Every email to them cc's the parent." }, 400);
        }
        res = await db.from("flm_umps").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("ump_admin", `${b.id ? "Updated" : "Added"} umpire ${res.data?.name}`, "admin");
      return json({ ok: true, ump: res.data });
    }

    if (action === "admin_ump_assign") {
      if (b.delete_id) {
        const { data: a } = await db.from("flm_ump_assignments").select("*").eq("id", b.delete_id).maybeSingle();
        if (!a) return json({ ok: false, error: "not found" }, 404);
        const [{ data: u }, { data: g }] = await Promise.all([
          db.from("flm_umps").select("name").eq("id", a.ump_id).maybeSingle(),
          db.from("flm_games").select("*").eq("id", a.game_id).maybeSingle(),
        ]);
        await db.from("flm_ump_assignments").delete().eq("id", b.delete_id);
        await log("ump_admin", `Withdrew ${u?.name ?? "an umpire"} from ${g ? `${await gameNames(g)} on ${g.game_date}` : "a game"}`, "admin");
        return json({ ok: true });
      }
      const { game_id, ump_id } = b;
      if (!game_id || !ump_id) return json({ ok: false, error: "game_id and ump_id required" }, 400);
      const role = UMP_ROLES.includes(b.role) ? b.role : "plate";
      const [{ data: game }, { data: ump }] = await Promise.all([
        db.from("flm_games").select("*").eq("id", game_id).maybeSingle(),
        db.from("flm_umps").select("*").eq("id", ump_id).maybeSingle(),
      ]);
      if (!game) return json({ ok: false, error: "game not found" }, 404);
      if (!ump || !ump.active) return json({ ok: false, error: "unknown or inactive umpire" }, 400);
      const { data: existingA } = await db.from("flm_ump_assignments").select("id,status").eq("game_id", game_id).eq("ump_id", ump_id).in("status", ["offered", "accepted"]);
      const dup = (existingA ?? [])[0];
      if (dup) return json({ ok: false, error: `${ump.name} already has this game (${dup.status}).` }, 409);
      // Admin assignment starts as an OFFER: the ump accepts or declines on their page.
      const ins = await db.from("flm_ump_assignments").insert({ game_id, ump_id, role, status: "offered" }).select().single();
      if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
      const gname = `${await gameNames(game)} on ${game.game_date}`;
      await log("ump_admin", `Offered ${ump.name} the ${role} umpire spot for ${gname}`, "admin");
      let email: Record<string, unknown> = { skipped: true };
      const line = `You are offered the ${role} umpire spot for ${gname}, ${String(game.start_time).slice(0, 5)} to ${String(game.end_time).slice(0, 5)}. Open the umpire page to accept or decline.`;
      if (await emailOn()) {
        const ln = await leagueName();
        const r = await sendUmpEmail(ump, `${ln}: game offer for ${game.game_date}`, umpEmailHtml(ln, "You have a game offer", [line]), typeof b.test_to === "string" ? b.test_to.trim() : "");
        email = r;
        await log("ump_email", r.ok ? `Offer email sent to ${ump.name}${(r.cc ?? []).length ? " (parent cc'd)" : ""} for ${gname}` : `Offer email to ${ump.name} failed: ${r.error}`, "system");
      } else {
        await log("ump_email", `Email is off. Would have emailed ${ump.name} the offer for ${gname}.`, "system");
      }
      return json({ ok: true, assignment: ins.data, email });
    }

    if (action === "admin_settings") {
      if (typeof b.email_enabled === "string") {
        if (b.email_enabled !== "true" && b.email_enabled !== "false") {
          return json({ ok: false, error: "email_enabled must be true or false" }, 400);
        }
        await db.from("flm_settings").upsert({ key: "email_enabled", value: b.email_enabled }, { onConflict: "key" });
        await log("settings", b.email_enabled === "true" ? "Email sending turned ON" : "Email sending turned OFF. Reminders and offers are logged, not sent.", "admin");
      }
      if (typeof b.ump_defaults === "string") {
        try {
          const o = JSON.parse(b.ump_defaults);
          if (!o || typeof o !== "object" || Array.isArray(o) || Object.values(o).some((v) => typeof v !== "number" || v < 0 || v > 6)) {
            return json({ ok: false, error: "ump_defaults must map divisions to a number of umpires (0 to 6)" }, 400);
          }
        } catch (_e) {
          return json({ ok: false, error: "ump_defaults must be valid JSON" }, 400);
        }
        await db.from("flm_settings").upsert({ key: "ump_defaults", value: b.ump_defaults }, { onConflict: "key" });
      }
      for (const key of ["league_name", "rules", "practice_rules", "season_gen_config"]) {
        if (typeof b[key] === "string") {
          if (key === "practice_rules") {
            try {
              const r = JSON.parse(b[key]);
              if (typeof r.max_weekdays !== "number" || typeof r.max_weekend !== "number" || !Array.isArray(r.alternatives ?? [])) {
                return json({ ok: false, error: "practice_rules must include numeric max_weekdays and max_weekend" }, 400);
              }
            } catch (_e) {
              return json({ ok: false, error: "practice_rules must be valid JSON" }, 400);
            }
          }
          if (key === "season_gen_config") {
            try {
              const c = JSON.parse(b[key]);
              if (!c || typeof c !== "object" || Array.isArray(c)) {
                return json({ ok: false, error: "season_gen_config must be a JSON object" }, 400);
              }
            } catch (_e) {
              return json({ ok: false, error: "season_gen_config must be valid JSON" }, 400);
            }
          }
          await db.from("flm_settings").upsert({ key, value: b[key] }, { onConflict: "key" });
        }
      }
      await log("settings", "League settings updated", "admin");
      return json({ ok: true });
    }

    if (action === "admin_announcement") {
      if (b.delete_id) {
        const { data: a } = await db.from("flm_announcements").select("title").eq("id", b.delete_id).single();
        await db.from("flm_announcements").delete().eq("id", b.delete_id);
        await log("announce", `Deleted announcement ${a?.title ?? b.delete_id}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      if (b.title !== undefined) row.title = String(b.title).trim().slice(0, 160);
      if (b.body !== undefined) row.body = String(b.body).trim().slice(0, 2000);
      if (b.severity !== undefined) {
        if (!SEVERITIES.includes(b.severity)) return json({ ok: false, error: "severity must be info, warning, or urgent" }, 400);
        row.severity = b.severity;
      }
      if (b.active !== undefined) row.active = !!b.active;
      let res;
      if (b.id) res = await db.from("flm_announcements").update(row).eq("id", b.id).select().single();
      else {
        if (!row.title) return json({ ok: false, error: "title required" }, 400);
        res = await db.from("flm_announcements").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("announce", `${b.id ? "Updated" : "Posted"} announcement ${res.data?.title}${b.id && b.active === false ? " (deactivated)" : ""}`, "admin");
      return json({ ok: true, announcement: res.data });
    }

    if (action === "admin_announcement_email") {
      if (!b.id) return json({ ok: false, error: "announcement id required" }, 400);
      const { data: a } = await db.from("flm_announcements").select("*").eq("id", b.id).single();
      if (!a) return json({ ok: false, error: "announcement not found" }, 404);
      const { data: teams } = await db.from("flm_teams").select("coach_name,coach_email").eq("is_active", true);
      const seen = new Set<string>();
      const coachEmails: string[] = [];
      for (const t of (teams ?? [])) {
        const e = String(t.coach_email ?? "").trim().toLowerCase();
        if (e && e.includes("@") && !seen.has(e)) { seen.add(e); coachEmails.push(e); }
      }
      if (b.preview) return json({ ok: true, recipients: coachEmails.length });

      const testTo = typeof b.test_to === "string" && b.test_to.includes("@") ? b.test_to.trim() : "";
      const recipients = testTo ? [testTo] : coachEmails;
      if (recipients.length === 0) return json({ ok: false, error: "No coach emails on file yet. Add emails to teams first." }, 400);
      if (recipients.length > 100) return json({ ok: false, error: "recipient list too large" }, 400);

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
      if (!RESEND_API_KEY) return json({ ok: false, error: "email is not configured" }, 500);
      const { data: lg } = await db.from("flm_settings").select("value").eq("key", "league_name").maybeSingle();
      const leagueName = lg?.value || "Field Command";
      const html = announcementEmailHtml(leagueName, a);
      const subject = `${leagueName}: ${a.title}`;
      const sent: string[] = [];
      const ids: string[] = [];
      const failed: Array<{ to: string; error: string }> = [];
      for (const to of recipients) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Field Command <noreply@cueops.io>", reply_to: "Daniel.Grande@ymail.com", to: [to], subject, html }),
        });
        if (res.ok) {
          sent.push(to);
          try { ids.push((await res.json()).id ?? ""); } catch (_e) { ids.push(""); }
        } else {
          failed.push({ to, error: `${res.status} ${(await res.text()).slice(0, 120)}` });
        }
        if (recipients.length > 1) await new Promise((r) => setTimeout(r, 550));
      }
      if (sent.length > 0) {
        await db.from("flm_announcements").update({ emailed_at: new Date().toISOString() }).eq("id", b.id);
      }
      await log("announce_email", testTo ? `Test email of "${a.title}" sent to ${testTo}` : `Announcement "${a.title}" emailed to ${sent.length} coaches${failed.length ? `, ${failed.length} failed` : ""}`, "admin");
      return json({ ok: true, sent_count: sent.length, failed, resend_ids: ids, test: !!testTo });
    }

    if (action === "admin_upsert_field") {
      const row: Record<string, unknown> = { name: String(b.name ?? "").trim() };
      if (!row.name) return json({ ok: false, error: "name required" }, 400);
      if (b.sort !== undefined) row.sort = b.sort;
      if (b.is_active !== undefined) row.is_active = !!b.is_active;
      if (b.notes !== undefined) row.notes = String(b.notes).slice(0, 300);
      if (b.divisions !== undefined) {
        if (!Array.isArray(b.divisions)) return json({ ok: false, error: "divisions must be a list" }, 400);
        row.divisions = b.divisions.map((d: unknown) => String(d).trim()).filter((d: string) => d).slice(0, 20);
      }
      let res;
      if (b.id) res = await db.from("flm_fields").update(row).eq("id", b.id).select().single();
      else res = await db.from("flm_fields").insert(row).select().single();
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("field", `${b.id ? "Updated" : "Added"} field ${row.name}`, "admin");
      return json({ ok: true, field: res.data });
    }

    if (action === "admin_delete_field") {
      const { data: f } = await db.from("flm_fields").select("name").eq("id", b.id).single();
      await db.from("flm_fields").delete().eq("id", b.id);
      await log("field", `Deleted field ${f?.name ?? b.id}`, "admin");
      return json({ ok: true });
    }

    if (action === "admin_upsert_team") {
      const row: Record<string, unknown> = {};
      for (const k of ["name", "coach_name", "coach_phone", "coach_email", "division"]) {
        if (b[k] !== undefined) row[k] = String(b[k]).trim().slice(0, 120);
      }
      if (b.is_active !== undefined) row.is_active = !!b.is_active;
      let res;
      if (b.id) res = await db.from("flm_teams").update(row).eq("id", b.id).select().single();
      else {
        if (!row.name) return json({ ok: false, error: "name required" }, 400);
        res = await db.from("flm_teams").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("team", `${b.id ? "Updated" : "Added"} team ${res.data?.name}`, "admin");
      return json({ ok: true, team: res.data });
    }

    if (action === "admin_delete_team") {
      const { data: t } = await db.from("flm_teams").select("name").eq("id", b.id).single();
      await db.from("flm_teams").delete().eq("id", b.id);
      await log("team", `Deleted team ${t?.name ?? b.id}`, "admin");
      return json({ ok: true });
    }

    // External teams: opponents from OTHER leagues (Auburn LL, Kent LL...).
    // They live in flm_ext_teams and never mix into flm_teams, so they can
    // never claim practice slots or show up in coach pickers or compliance.
    if (action === "admin_ext_team") {
      if (b.delete_id) {
        const { data: x } = await db.from("flm_ext_teams").select("team_name,league_name").eq("id", b.delete_id).single();
        const del = await db.from("flm_ext_teams").delete().eq("id", b.delete_id);
        if (del.error) {
          const msg = del.error.message.includes("violates foreign key")
            ? "That team still has games on the schedule. Delete or reassign its games first."
            : del.error.message;
          return json({ ok: false, error: msg }, 409);
        }
        await log("ext_team", `Deleted external team ${x ? `${x.team_name} (${x.league_name})` : b.delete_id}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      for (const k of ["league_name", "team_name", "division"]) {
        if (b[k] !== undefined) row[k] = String(b[k]).trim().slice(0, 120);
      }
      if (b.notes !== undefined) row.notes = String(b.notes).trim().slice(0, 300);
      let res;
      if (b.id) res = await db.from("flm_ext_teams").update(row).eq("id", b.id).select().single();
      else {
        if (!row.league_name || !row.team_name) return json({ ok: false, error: "league name and team name are both required" }, 400);
        res = await db.from("flm_ext_teams").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("ext_team", `${b.id ? "Updated" : "Added"} external team ${res.data?.team_name} (${res.data?.league_name})`, "admin");
      return json({ ok: true, ext_team: res.data });
    }

    if (action === "admin_upsert_season") {
      const row: Record<string, unknown> = {};
      if (b.label !== undefined) row.label = String(b.label).trim().slice(0, 80);
      if (b.start_date !== undefined) row.start_date = b.start_date || null;
      if (b.end_date !== undefined) row.end_date = b.end_date || null;
      if (b.sort !== undefined) row.sort = b.sort;
      if (b.locked !== undefined) row.locked = !!b.locked;
      if (b.is_active !== undefined) row.is_active = !!b.is_active;
      let res;
      if (b.id) res = await db.from("flm_seasons").update(row).eq("id", b.id).select().single();
      else {
        if (!row.label) return json({ ok: false, error: "label required" }, 400);
        res = await db.from("flm_seasons").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("season", `${b.id ? "Updated" : "Added"} window ${res.data?.label}`, "admin");
      return json({ ok: true, season: res.data });
    }

    if (action === "admin_delete_season") {
      const { data: s } = await db.from("flm_seasons").select("label").eq("id", b.id).single();
      await db.from("flm_seasons").delete().eq("id", b.id);
      await log("season", `Deleted window ${s?.label ?? b.id} (and its slots)`, "admin");
      return json({ ok: true });
    }

    if (action === "admin_slot") {
      if (b.delete_id) {
        const { data: s } = await db.from("flm_slots").select("label,day_key").eq("id", b.delete_id).single();
        await db.from("flm_slots").delete().eq("id", b.delete_id);
        await log("slot", `Admin removed ${s?.label ?? "slot"} from ${s?.day_key ?? "?"}`, "admin");
        return json({ ok: true });
      }
      if (b.id) {
        const row: Record<string, unknown> = {};
        if (b.team_id !== undefined) row.team_id = b.team_id || null;
        if (b.label !== undefined) row.label = String(b.label).slice(0, 160);
        if (b.note !== undefined) row.note = String(b.note).slice(0, 200);
        const res = await db.from("flm_slots").update(row).eq("id", b.id).select().single();
        if (res.error) return json({ ok: false, error: res.error.message }, 500);
        await log("slot", `Admin updated slot ${res.data?.label}`, "admin");
        return json({ ok: true, slot: res.data });
      }
      const { season_id, day_key, field_id } = b;
      if (!season_id || !day_key || !field_id || !DAY_KEYS.includes(day_key)) return json({ ok: false, error: "missing fields" }, 400);
      let label = String(b.label ?? "").slice(0, 160);
      if (!label && b.team_id) {
        const { data: t } = await db.from("flm_teams").select("name").eq("id", b.team_id).single();
        label = t?.name ?? "";
      }
      const res = await db.from("flm_slots").insert({ season_id, day_key, field_id, team_id: b.team_id || null, label, note: String(b.note ?? "").slice(0, 200), claimed_by: "admin" }).select().single();
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("slot", `Admin placed ${label} on ${day_key}`, "admin");
      return json({ ok: true, slot: res.data });
    }

    if (action === "admin_game") {
      if (b.delete_id) {
        const { data: g } = await db.from("flm_games").select("*").eq("id", b.delete_id).single();
        if (!g) return json({ ok: false, error: "not found" }, 404);
        await db.from("flm_games").delete().eq("id", b.delete_id);
        await log("game", `Deleted game ${await gameNames(g)} on ${g.game_date}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      for (const k of ["season_id", "home_team_id", "away_team_id", "ext_team_id", "field_id", "game_date", "start_time", "end_time"]) {
        if (b[k] !== undefined) row[k] = b[k] || null;
      }
      if (b.venue_text !== undefined) row.venue_text = b.venue_text ? String(b.venue_text).trim().slice(0, 160) || null : null;
      if (b.division !== undefined) row.division = String(b.division).trim().slice(0, 60);
      if (b.notes !== undefined) row.notes = b.notes === null ? null : String(b.notes).slice(0, 300);
      if (b.status !== undefined) {
        if (!GAME_STATUSES.includes(b.status)) return json({ ok: false, error: "status must be draft, scheduled, postponed, cancelled, or completed" }, 400);
        row.status = b.status;
      }
      if (b.umps_needed !== undefined) {
        if (b.umps_needed === null || b.umps_needed === "") row.umps_needed = null;
        else {
          const n = +b.umps_needed;
          if (!Number.isInteger(n) || n < 0 || n > 6) return json({ ok: false, error: "umpires needed must be a number from 0 to 6" }, 400);
          row.umps_needed = n;
        }
      }
      if (row.home_team_id && row.home_team_id === row.away_team_id) return json({ ok: false, error: "home and away must be different teams" }, 400);
      if (row.start_time && row.end_time && String(row.end_time) <= String(row.start_time)) return json({ ok: false, error: "end time must be after start time" }, 400);
      let res;
      if (b.id) {
        res = await db.from("flm_games").update(row).eq("id", b.id).select().single();
      } else {
        for (const k of ["season_id", "home_team_id", "game_date", "start_time", "end_time"]) {
          if (!row[k]) return json({ ok: false, error: `${k} required` }, 400);
        }
        const shapeErr = gameShapeError(row);
        if (shapeErr) return json({ ok: false, error: shapeErr }, 400);
        res = await db.from("flm_games").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      const g = res.data;
      // Phase 3: moves, rainouts, and makeups pass a plain-words activity_note
      // ("Moved X from A to B") so the activity log reads like a story.
      const note = typeof b.activity_note === "string" && b.activity_note.trim() ? b.activity_note.trim().slice(0, 300) : "";
      await log("game", note || `${b.id ? "Updated" : "Scheduled"} game ${await gameNames(g)} on ${g.game_date} (${g.status})`, "admin");
      return json({ ok: true, game: g });
    }

    if (action === "admin_games_bulk") {
      // Season generator + Phase 3 season management.
      // op: insert (default, drafts only) | publish | discard | rainout.
      const op = String(b.op ?? "insert");

      if (op === "publish") {
        let q = db.from("flm_games").update({ status: "scheduled" }).eq("status", "draft");
        if (b.season_id) q = q.eq("season_id", b.season_id);
        const { data, error } = await q.select("id");
        if (error) return json({ ok: false, error: error.message }, 500);
        const n = (data ?? []).length;
        await log("games_bulk", `Published ${n} draft games to the live schedule`, "admin");
        return json({ ok: true, published: n });
      }

      if (op === "discard") {
        let q = db.from("flm_games").delete().eq("status", "draft");
        if (b.season_id) q = q.eq("season_id", b.season_id);
        const { data, error } = await q.select("id");
        if (error) return json({ ok: false, error: error.message }, 500);
        const n = (data ?? []).length;
        await log("games_bulk", `Discarded ${n} draft games`, "admin");
        return json({ ok: true, discarded: n });
      }

      if (op === "rainout") {
        // Classic rainy Saturday: postpone every SCHEDULED game on one date in
        // one confirmed action. Drafts, cancelled, completed, and already
        // postponed games are untouched.
        if (!b.date) return json({ ok: false, error: "date required" }, 400);
        let q = db.from("flm_games").update({ status: "postponed" }).eq("game_date", b.date).eq("status", "scheduled");
        if (b.season_id) q = q.eq("season_id", b.season_id);
        const { data, error } = await q.select("id");
        if (error) return json({ ok: false, error: error.message }, 500);
        const n = (data ?? []).length;
        await log("games_bulk", `Rained out ${n} games on ${b.date}. They are in the makeup tray.`, "admin");
        return json({ ok: true, postponed: n });
      }

      if (op !== "insert") return json({ ok: false, error: "op must be insert, publish, discard, or rainout" }, 400);
      const games = Array.isArray(b.games) ? b.games : [];
      if (games.length === 0 || games.length > 200) return json({ ok: false, error: "games must be a list of 1 to 200" }, 400);
      const rows: Record<string, unknown>[] = [];
      for (const g of games) {
        for (const k of ["season_id", "home_team_id", "game_date", "start_time", "end_time"]) {
          if (!g[k]) return json({ ok: false, error: `${k} required on every game` }, 400);
        }
        const shapeErr = gameShapeError(g);
        if (shapeErr) return json({ ok: false, error: `${shapeErr} (every game)` }, 400);
        if (g.home_team_id === g.away_team_id) return json({ ok: false, error: "home and away must be different teams" }, 400);
        if (String(g.end_time) <= String(g.start_time)) return json({ ok: false, error: "end time must be after start time" }, 400);
        rows.push({
          season_id: g.season_id,
          division: String(g.division ?? "").trim().slice(0, 60),
          home_team_id: g.home_team_id,
          away_team_id: g.away_team_id || null,
          ext_team_id: g.ext_team_id || null,
          field_id: g.field_id || null,
          venue_text: g.venue_text ? String(g.venue_text).trim().slice(0, 160) || null : null,
          game_date: g.game_date,
          start_time: g.start_time,
          end_time: g.end_time,
          status: "draft",
          notes: g.notes ? String(g.notes).slice(0, 300) : null,
        });
      }
      const { data, error } = await db.from("flm_games").insert(rows).select("id");
      if (error) return json({ ok: false, error: error.message }, 500);
      // One summary row for the whole generation: the client sends summary text
      // on the last chunk only, so chunked inserts do not spam the activity log.
      if (typeof b.summary === "string" && b.summary.trim()) {
        await log("games_bulk", b.summary.trim().slice(0, 300), "admin");
      }
      return json({ ok: true, inserted: (data ?? []).length });
    }

    if (action === "admin_import") {
      const summary = { fields_created: 0, teams_created: 0, teams_updated: 0, slots_created: 0, slots_removed: 0 };

      for (const t of (b.teams ?? [])) {
        const name = String(t.name ?? "").trim();
        const coach = String(t.coach_name ?? "").trim();
        const division = String(t.division ?? "").trim();
        if (!name && !coach) continue;
        // Match an existing team: exact team name, else same coach in the same division
        // (a coach can legitimately run one baseball and one softball team).
        let existing = name
          ? (await db.from("flm_teams").select("id").ilike("name", name).maybeSingle()).data
          : null;
        if (!existing && coach) {
          const { data: byCoach } = await db.from("flm_teams").select("id,division").ilike("coach_name", coach);
          const pool = byCoach ?? [];
          existing = pool.find((r: { division: string }) => r.division === division) ?? (pool.length === 1 ? pool[0] : null);
        }
        const row: Record<string, string> = { coach_name: coach, coach_phone: String(t.coach_phone ?? "").trim(), division };
        if (t.coach_email !== undefined) row.coach_email = String(t.coach_email ?? "").trim().slice(0, 120);
        if (existing) {
          await db.from("flm_teams").update(row).eq("id", existing.id);
          summary.teams_updated++;
        } else {
          await db.from("flm_teams").insert({ name: name || coach, ...row });
          summary.teams_created++;
        }
      }

      if (!b.contacts_only && b.season && Array.isArray(b.slots)) {
        const label = String(b.season.label ?? "").trim();
        if (!label) return json({ ok: false, error: "season label required" }, 400);
        let { data: season } = await db.from("flm_seasons").select("id").eq("label", label).maybeSingle();
        if (!season) {
          const { data: maxSort } = await db.from("flm_seasons").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
          const ins = await db.from("flm_seasons").insert({ label, start_date: b.season.start_date || null, end_date: b.season.end_date || null, sort: (maxSort?.sort ?? 0) + 1 }).select("id").single();
          if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
          season = ins.data;
        }

        if (b.mode === "replace") {
          const del = await db.from("flm_slots").delete().eq("season_id", season.id).select("id");
          summary.slots_removed = (del.data ?? []).length;
        }

        const { data: allFields } = await db.from("flm_fields").select("id,name");
        const fieldMap = new Map((allFields ?? []).map((f: { id: string; name: string }) => [f.name.trim().toLowerCase(), f.id]));
        let sortBase = (allFields ?? []).length;
        for (const fname of (b.fields ?? [])) {
          const key = String(fname).trim().toLowerCase();
          if (key && !fieldMap.has(key)) {
            const ins = await db.from("flm_fields").insert({ name: String(fname).trim(), sort: sortBase++ }).select("id,name").single();
            if (ins.data) { fieldMap.set(key, ins.data.id); summary.fields_created++; }
          }
        }

        const { data: allTeams } = await db.from("flm_teams").select("id,name");
        const teamMap = new Map((allTeams ?? []).map((t: { id: string; name: string }) => [t.name.trim().toLowerCase(), t.id]));

        for (const s of (b.slots ?? [])) {
          if (!DAY_KEYS.includes(s.day_key)) continue;
          const fid = fieldMap.get(String(s.field_name ?? "").trim().toLowerCase());
          if (!fid) continue;
          const tkey = String(s.team_name ?? "").trim().toLowerCase();
          const tid = tkey ? (teamMap.get(tkey) ?? null) : null;
          const { error } = await db.from("flm_slots").insert({ season_id: season.id, day_key: s.day_key, field_id: fid, team_id: tid, label: String(s.label ?? s.team_name ?? "").slice(0, 160), claimed_by: "import" });
          if (!error) summary.slots_created++;
        }
      }

      await log("import", `Excel import: +${summary.slots_created} slots (${summary.slots_removed} replaced), +${summary.fields_created} fields, +${summary.teams_created} new / ${summary.teams_updated} updated teams`, "admin");
      return json({ ok: true, summary });
    }

    return json({ ok: false, error: "unknown action" }, 404);
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
