import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_PIN = "0908";
const FORM_JERSEY = "uniform_sizes_2026fall";
const FORM_SWEAT = "sweatshirt_sizes_2026fall";
const FORM_VOL = "volunteer_2026fall";
const FORM_WALKUP = "walkup_2026fall";
const FORM_CAGEVOTE = "cage_vote_2026sep";
const FORM_PANTS = "pants_done_2026fall";

const VALID_JERSEY = ["GXS", "GS", "GM", "GL", "WS", "WM", "WL", "WXL", "WXXL"];
// Youth Gildan 18500B primary + two adult carryover sizes
const VALID_SWEAT = ["YXS", "YS", "YM", "YL", "YXL", "AXS", "AS"];
const VOL_CATEGORIES = [
  "field_setup", "teardown", "dugout_accessories", "bows", "socks", "cheer_crew", "chair_crew",
];
const VALID_PAGES = ["hub", "welcome", "sizes", "sweatshirt", "volunteer", "admin", "practice", "updates", "attendance", "coach", "walkup", "snacks", "funds", "cagevote", "share", "staff", "gameday"];
const ATTENDANCE_STATUSES = ["yes", "no", "maybe"];
const CAGE_CHOICES = ["monday", "tuesday", "wednesday"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const AUDIO_EXT: Record<string, string> = {
  "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/m4a": "m4a",
  "audio/wav": "wav", "audio/webm": "webm", "audio/aac": "aac", "audio/ogg": "ogg",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// ---------- Staff portal helpers (v19) ----------

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function resendSend(payload: Record<string, unknown>) {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return { ok: false, error: "no key" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, id: data?.id ?? null, error: data?.message ?? null };
}

// deno-lint-ignore no-explicit-any
async function staffAuth(body: any) {
  const id = typeof body?.staff_id === "string" ? body.staff_id : "";
  const pin = typeof body?.staff_pin === "string" ? body.staff_pin : "";
  if (!id || !pin) return null;
  const { data } = await supabase.from("cougars_staff").select("*").eq("id", id).maybeSingle();
  if (!data || !data.active || !data.pin) return null;
  if (String(pin) !== String(data.pin)) return null;
  return data;
}

function staffInviteEmailHtml(name: string, url: string): string {
  const first = name.split(" ")[0] || name;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f2ee;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#111111;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Cougars</div>
    <div style="color:#e63946;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">Coaching Staff</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#e63946 0 40px,#ffffff 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #e2ddd4;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <p style="margin:0 0 10px;font-size:17px;font-weight:bold;color:#111;">Hi ${escHtml(first)},</p>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3c3c3c;">Coach Daniel set you up on the Cougars staff page. Practice plans, game plans, walkup songs, all in one spot on your phone.</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#3c3c3c;">Tap the button, pick a 4 digit PIN, and your phone stays signed in.</p>
    <p style="margin:0 0 18px;"><a href="${url}" style="display:inline-block;background:#e63946;color:#ffffff;font-size:16px;font-weight:bold;text-decoration:none;padding:13px 26px;border-radius:9px;letter-spacing:0.5px;">SET MY PIN</a></p>
    <p style="margin:0;font-size:12.5px;color:#8a857c;">If the button does not open, paste this into your browser:<br>${escHtml(url)}</p>
  </div>
  <p style="text-align:center;font-size:12px;color:#8a857c;margin-top:12px;">Sent by the Cougars team hub. Reply to this email to reach Coach Daniel.</p>
</div>
</body></html>`;
}

async function getPlayers() {
  return await supabase
    .from("cougars_players")
    .select("id, first_name, last_name, jersey_size_requested")
    .eq("active", true)
    .order("first_name", { ascending: true });
}

// Latest-wins walkup rows for every active player. Shared by the PIN'd
// coach report and the staff portal (staff get the same list — song,
// start, phonetic, recording — it's game-day operational info).
async function buildWalkupReport() {
  const { data: allPlayers, error: pErr } = await getPlayers();
  if (pErr) return { error: pErr.message };
  const { data: rows, error: rErr } = await supabase
    .from("cougars_form_responses")
    .select("player_id, payload, submitted_at")
    .eq("form_key", FORM_WALKUP)
    .order("submitted_at", { ascending: false });
  if (rErr) return { error: rErr.message };
  const latest = new Map<string, any>();
  for (const r of rows ?? []) if (!latest.has(r.player_id)) latest.set(r.player_id, r);
  const report = [];
  for (const p of allPlayers ?? []) {
    const r = latest.get(p.id);
    let recordingUrl: string | null = null;
    if (r?.payload?.recording_path) {
      const { data: signed } = await supabase.storage
        .from("cougars-media").createSignedUrl(r.payload.recording_path, 3600);
      recordingUrl = signed?.signedUrl ?? null;
    }
    report.push({
      player_id: p.id, first_name: p.first_name, last_name: p.last_name,
      song_title: r?.payload?.song_title ?? null, song_artist: r?.payload?.song_artist ?? null,
      song_start: r?.payload?.song_start ?? null, phonetic: r?.payload?.phonetic ?? null,
      recording_url: recordingUrl, submitted_at: r?.submitted_at ?? null, responded: !!r,
    });
  }
  return { report, responded: report.filter((r) => r.responded).length, total: report.length };
}

// Per-player latest-wins size report for a given form_key (jersey or sweatshirt).
async function buildSizeReport(formKey: string, jerseyOnly = false) {
  const { data: allPlayers, error: pErr } = await getPlayers();
  if (pErr) return { error: pErr.message };
  const players = jerseyOnly ? (allPlayers ?? []).filter((p) => !!p.jersey_size_requested) : (allPlayers ?? []);

  const { data: responses, error: rErr } = await supabase
    .from("cougars_form_responses")
    .select("player_id, payload, submitted_by, submitted_at")
    .eq("form_key", formKey)
    .order("submitted_at", { ascending: false });
  if (rErr) return { error: rErr.message };

  const latestByPlayer = new Map<string, any>();
  for (const r of responses ?? []) {
    if (!latestByPlayer.has(r.player_id)) latestByPlayer.set(r.player_id, r);
  }

  const report = players.map((p) => {
    const r = latestByPlayer.get(p.id);
    return {
      player_id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      jersey_size_requested: p.jersey_size_requested,
      confirmed_size: r?.payload?.confirmed_size ?? null,
      back_name: r?.payload?.back_name ?? null,
      parent_name: r?.payload?.parent_name ?? r?.submitted_by ?? null,
      submitted_at: r?.submitted_at ?? null,
      responded: !!r,
    };
  });

  const outstanding = report.filter((r) => !r.responded);
  return {
    report,
    total: report.length,
    confirmed_count: report.length - outstanding.length,
    outstanding_count: outstanding.length,
    outstanding: outstanding.map((r) => ({
      player_id: r.player_id,
      first_name: r.first_name,
      last_name: r.last_name,
    })),
  };
}

// team_funds config: sanitize one fund entry from stored JSON or admin input.
function cleanFund(f: any) {
  const id = typeof f?.id === "string" ? f.id.trim().slice(0, 40) : "";
  const name = typeof f?.name === "string" ? f.name.trim().slice(0, 80) : "";
  if (!id || !name) return null;
  const goalRaw = f?.goal_cents;
  const goal = (goalRaw === null || goalRaw === undefined || goalRaw === "")
    ? null
    : (Number.isFinite(Number(goalRaw)) ? Math.max(0, Math.round(Number(goalRaw))) : null);
  const raised = Number.isFinite(Number(f?.raised_cents)) ? Math.max(0, Math.round(Number(f?.raised_cents))) : 0;
  return {
    id,
    name,
    goal_cents: goal,
    raised_cents: raised,
    per_note: typeof f?.per_note === "string" && f.per_note.trim() ? f.per_note.trim().slice(0, 120) : null,
    blurb: typeof f?.blurb === "string" && f.blurb.trim() ? f.blurb.trim().slice(0, 400) : null,
    active: f?.active !== false,
  };
}

async function readFunds() {
  const { data, error } = await supabase
    .from("cougars_config")
    .select("value, updated_at")
    .eq("key", "team_funds")
    .maybeSingle();
  if (error) return { error: error.message };
  let raw: any[] = [];
  try { raw = JSON.parse(data?.value ?? "[]"); } catch { raw = []; }
  if (!Array.isArray(raw)) raw = [];
  const funds = raw.map(cleanFund).filter((f) => f !== null);
  return { funds, updated_at: data?.updated_at ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  const requirePin = () => req.headers.get("x-admin-pin") === ADMIN_PIN;

  try {
    // ---------- STAFF PORTAL (v19) ----------
    // Assistant coaches: email -> magic link -> own 4-digit PIN, device
    // stays signed in. Partial visibility only: published practice plans
    // (served by practice-studio-gateway), the PUBLISHED game plan minus
    // coach notes, and walkups. Never: funds, family status, reports,
    // parent contact data, Email Studio.

    if (req.method === "POST" && action === "staff_request_access") {
      const body = await req.json().catch(() => null);
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
      if (!EMAIL_RE.test(email)) return json({ error: "valid email required" }, 400);
      const { data: staff } = await supabase.from("cougars_staff").select("*").ilike("email", email).maybeSingle();
      if (!staff || !staff.active) return json({ ok: true, found: false });
      const hasPin = Boolean(staff.pin && staff.email_confirmed_at);
      if (hasPin && body?.reset !== true) return json({ ok: true, found: true, has_pin: true });
      const token = randomToken();
      const expires = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
      const { error } = await supabase.from("cougars_staff").update({ invite_token: token, invite_expires_at: expires }).eq("id", staff.id);
      if (error) return json({ error: "could not create your link" }, 500);
      const link = `https://coachpilot.org/cougars/staff/?token=${token}`;
      const send = await resendSend({
        from: "Cougars Team Hub <noreply@coachpilot.org>",
        reply_to: "daniel.grande@ymail.com",
        to: [staff.email],
        subject: body?.reset === true ? "Reset your PIN — Cougars Staff" : "Your Cougars staff access",
        html: staffInviteEmailHtml(staff.name, link),
      }).catch(() => ({ ok: false }));
      return json({ ok: true, found: true, has_pin: false, sent: send?.ok !== false });
    }

    if (req.method === "POST" && action === "staff_verify_token") {
      const body = await req.json().catch(() => null);
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      if (!token) return json({ error: "link is missing" }, 400);
      const { data } = await supabase.from("cougars_staff").select("id,name,email,invite_expires_at,active").eq("invite_token", token).maybeSingle();
      if (!data || !data.active) return json({ error: "this link is not valid — ask Coach Daniel for a fresh one" }, 404);
      if (data.invite_expires_at && new Date(data.invite_expires_at).getTime() < Date.now()) {
        return json({ error: "this link has expired — enter your email on the staff page to get a new one" }, 410);
      }
      return json({ ok: true, staff: { name: data.name, email: data.email } });
    }

    if (req.method === "POST" && action === "staff_set_pin") {
      const body = await req.json().catch(() => null);
      const token = typeof body?.token === "string" ? body.token.trim() : "";
      const pin = typeof body?.new_pin === "string" ? body.new_pin.trim() : "";
      if (!token) return json({ error: "link is missing" }, 400);
      if (!/^\d{4}$/.test(pin)) return json({ error: "PIN must be exactly 4 digits" }, 400);
      const { data: found } = await supabase.from("cougars_staff").select("id,name,email,invite_expires_at,active").eq("invite_token", token).maybeSingle();
      if (!found || !found.active) return json({ error: "this link is not valid" }, 404);
      if (found.invite_expires_at && new Date(found.invite_expires_at).getTime() < Date.now()) {
        return json({ error: "this link has expired" }, 410);
      }
      const { error } = await supabase.from("cougars_staff").update({
        pin, invite_token: null, invite_expires_at: null, email_confirmed_at: new Date().toISOString(),
      }).eq("id", found.id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, staff: { id: found.id, name: found.name, email: found.email } });
    }

    if (req.method === "POST" && action === "staff_login") {
      const body = await req.json().catch(() => null);
      const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const pin = typeof body?.pin === "string" ? body.pin.trim() : "";
      if (!email || !/^\d{4}$/.test(pin)) return json({ error: "enter your email and 4 digit PIN" }, 400);
      const { data } = await supabase.from("cougars_staff").select("id,name,email,active,pin,email_confirmed_at").ilike("email", email).maybeSingle();
      if (!data || !data.active) return json({ error: "that email is not on the staff list — check with Coach Daniel" }, 404);
      if (!data.email_confirmed_at || !data.pin) return json({ error: "check your email for the setup link first" }, 403);
      if (String(pin) !== String(data.pin)) return json({ error: "that PIN did not work" }, 401);
      return json({ ok: true, staff: { id: data.id, name: data.name, email: data.email } });
    }

    // GET gameday_public -> the PUBLISHED lineup for parents. No login.
    // Names go out as First + Last-initial (same convention as the public
    // players action). Only battingOrder + innings positions + game meta —
    // no attendance, no notes, nothing else.
    if (req.method === "GET" && action === "gameday_public") {
      const { data: gs } = await supabase
        .from("ondeck_game_states")
        .select("state_published, game_meta, updated_at")
        .not("state_published", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!gs?.state_published || typeof gs.state_published !== "object") {
        return json({ published: false });
      }
      const sp = gs.state_published as Record<string, any>;
      // Build a full-name -> "First L." map from the roster; fall back to
      // first word + initial of the last word for names not on the roster.
      const { data: roster } = await getPlayers();
      const short = new Map<string, string>();
      for (const p of roster ?? []) {
        const full = (p.first_name + " " + (p.last_name ?? "")).trim().toLowerCase();
        short.set(full, p.first_name + " " + ((p.last_name ?? "").charAt(0) ? (p.last_name ?? "").charAt(0) + "." : ""));
      }
      const shorten = (name: unknown): string => {
        const n = String(name ?? "").trim();
        if (!n) return "";
        const hit = short.get(n.toLowerCase());
        if (hit) return hit;
        const parts = n.split(/\s+/);
        return parts.length > 1 ? parts[0] + " " + parts[parts.length - 1].charAt(0) + "." : n;
      };
      const battingOrder = Array.isArray(sp.battingOrder) ? sp.battingOrder.map(shorten) : [];
      const innings = Array.isArray(sp.innings)
        ? sp.innings.map((inn: any) => ({
            field: Array.isArray(inn?.field)
              ? inn.field.map((f: any) => ({ pos: String(f?.pos ?? ""), name: shorten(f?.name) }))
              : [],
          }))
        : [];
      return json({
        published: true,
        game_meta: gs.game_meta ?? null,
        updated_at: gs.updated_at ?? null,
        battingOrder,
        innings,
        totalInnings: sp.totalInnings ?? innings.length,
      });
    }

    if (req.method === "POST" && action === "staff_state") {
      const body = await req.json().catch(() => null);
      const staff = await staffAuth(body);
      if (!staff) return json({ error: "not signed in" }, 401);

      // Walkups: full game-day list (same as the coach report).
      const walkups = await buildWalkupReport();

      // Game plan: PUBLISHED state only. Coach's working copy is never
      // exposed; playerNotes and notes are stripped before it leaves.
      const { data: gs } = await supabase
        .from("ondeck_game_states")
        .select("state_published, game_meta, updated_at")
        .not("state_published", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let gameplan: Record<string, unknown> | null = null;
      if (gs?.state_published && typeof gs.state_published === "object") {
        const sp = gs.state_published as Record<string, unknown>;
        gameplan = {
          innings: sp.innings ?? null,
          battingOrder: sp.battingOrder ?? null,
          playerPositions: sp.playerPositions ?? null,
          batteries: sp.batteries ?? null,
          totalInnings: sp.totalInnings ?? null,
          attendance: sp.attendance ?? null,
          game_meta: gs.game_meta ?? null,
          updated_at: gs.updated_at ?? null,
        };
      }

      return json({
        ok: true,
        staff: { id: staff.id, name: staff.name, email: staff.email, role: staff.role },
        walkups: (walkups as any).error ? null : walkups,
        gameplan,
      });
    }

    // GET players -> no PII
    if (req.method === "GET" && action === "players") {
      const { data, error } = await getPlayers();
      if (error) return json({ error: error.message }, 500);
      const players = (data ?? []).map((p) => ({
        id: p.id,
        first_name: p.first_name,
        last_initial: (p.last_name ?? "").charAt(0),
        jersey_size_requested: p.jersey_size_requested,
      }));
      return json({ players });
    }

    // GET family_status -> public: completion booleans for one family (player_id keyed, no names returned)
    if (req.method === "GET" && action === "family_status") {
      const playerId = url.searchParams.get("player_id") ?? "";
      if (!playerId) return json({ error: "player_id required" }, 400);
      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id").eq("id", playerId).eq("active", true).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);
      const { data: rows, error: rErr } = await supabase
        .from("cougars_form_responses")
        .select("form_key")
        .eq("player_id", playerId)
        .in("form_key", [FORM_SWEAT, FORM_WALKUP, FORM_CAGEVOTE, FORM_PANTS]);
      if (rErr) return json({ error: rErr.message }, 500);
      const keys = new Set((rows ?? []).map((r) => r.form_key));
      return json({
        cage_vote: keys.has(FORM_CAGEVOTE),
        sweatshirt: keys.has(FORM_SWEAT),
        walkup: keys.has(FORM_WALKUP),
        pants: keys.has(FORM_PANTS),
      });
    }

    // GET family_status_all (PIN) -> Coach HQ: completion booleans for EVERY active family, aggregated server-side.
    // Full names are fine here: PIN-gated, never exposed through a public action.
    if (req.method === "GET" && action === "family_status_all") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const { data: allPlayers, error: pErr } = await getPlayers();
      if (pErr) return json({ error: pErr.message }, 500);
      const { data: rows, error: rErr } = await supabase
        .from("cougars_form_responses")
        .select("player_id, form_key")
        .in("form_key", [FORM_SWEAT, FORM_WALKUP, FORM_CAGEVOTE, FORM_PANTS]);
      if (rErr) return json({ error: rErr.message }, 500);
      const done = new Set<string>();
      for (const r of rows ?? []) done.add(r.player_id + "|" + r.form_key);
      const counts = { sweatshirt: 0, walkup: 0, cage_vote: 0, pants: 0 };
      const families = (allPlayers ?? []).map((p) => {
        const f = {
          player_id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          sweatshirt: done.has(p.id + "|" + FORM_SWEAT),
          walkup: done.has(p.id + "|" + FORM_WALKUP),
          cage_vote: done.has(p.id + "|" + FORM_CAGEVOTE),
          pants: done.has(p.id + "|" + FORM_PANTS),
        };
        if (f.sweatshirt) counts.sweatshirt++;
        if (f.walkup) counts.walkup++;
        if (f.cage_vote) counts.cage_vote++;
        if (f.pants) counts.pants++;
        return f;
      });
      return json({ families, counts, total: families.length });
    }

    // POST mark_done -> public: family marks an unverifiable item done (pants only); clears on all their devices
    if (req.method === "POST" && action === "mark_done") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const { player_id, item, parent_name } = body;
      if (!player_id || typeof player_id !== "string") return json({ error: "player_id required" }, 400);
      if (item !== "pants") return json({ error: "invalid item" }, 400);
      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id, first_name").eq("id", player_id).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);
      const cleanParent = typeof parent_name === "string" ? parent_name.trim().slice(0, 120) : null;
      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: FORM_PANTS,
        player_id,
        payload: { done: true, parent_name: cleanParent || null },
        submitted_by: cleanParent || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, item: "pants", first_name: player.first_name });
    }

    // POST subscribe_extra -> public: add a family member or friend to the email list
    if (req.method === "POST" && action === "subscribe_extra") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const email = typeof body.email === "string" ? body.email.trim().toLowerCase().slice(0, 200) : "";
      if (!EMAIL_RE.test(email)) return json({ error: "valid email required" }, 400);
      const name = typeof body.name === "string" && body.name.trim() ? body.name.trim().slice(0, 120) : null;
      const addedBy = typeof body.added_by === "string" && body.added_by.trim() ? body.added_by.trim().slice(0, 120) : null;
      const { data: existing, error: gErr } = await supabase
        .from("cougars_extra_subscribers").select("id, active").eq("email", email).maybeSingle();
      if (gErr) return json({ error: gErr.message }, 500);
      if (existing && existing.active) return json({ error: "already" }, 409);
      if (existing) {
        const { error: uErr } = await supabase
          .from("cougars_extra_subscribers")
          .update({ active: true, name: name ?? undefined, added_by: addedBy ?? undefined })
          .eq("id", existing.id);
        if (uErr) return json({ error: uErr.message }, 500);
        return json({ ok: true, reactivated: true });
      }
      const { error: iErr } = await supabase.from("cougars_extra_subscribers").insert({ email, name, added_by: addedBy });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true });
    }

    // GET extra_subscribers (PIN) -> full list for Coach HQ
    if (req.method === "GET" && action === "extra_subscribers") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const { data, error } = await supabase
        .from("cougars_extra_subscribers")
        .select("id, email, name, added_by, active, created_at")
        .order("created_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      return json({ subscribers: data ?? [] });
    }

    // POST remove_extra (PIN) -> deactivate a subscriber (kept for audit, excluded from blasts)
    if (req.method === "POST" && action === "remove_extra") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await supabase.from("cougars_extra_subscribers").update({ active: false }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // POST page_view -> anonymous visit ping (page name only, allowlisted)
    if (req.method === "POST" && action === "page_view") {
      const body = await req.json().catch(() => null);
      const page = body?.page;
      if (!VALID_PAGES.includes(page)) return json({ error: "invalid page" }, 400);
      const { error: iErr } = await supabase.from("cougars_page_views").insert({ page });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true });
    }

    // GET visits_report (PIN)
    if (req.method === "GET" && action === "visits_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const { data: rows, error } = await supabase
        .from("cougars_page_views")
        .select("page, viewed_at")
        .order("viewed_at", { ascending: false })
        .limit(20000);
      if (error) return json({ error: error.message }, 500);

      const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" });
      const todayStr = fmt.format(new Date());
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

      const byPage: Record<string, { today: number; week: number; total: number; last: string | null }> = {};
      for (const p of VALID_PAGES) byPage[p] = { today: 0, week: 0, total: 0, last: null };
      let grandTotal = 0;
      for (const r of rows ?? []) {
        const b = byPage[r.page];
        if (!b) continue;
        grandTotal++;
        b.total++;
        const t = new Date(r.viewed_at).getTime();
        if (t >= weekAgo) b.week++;
        if (fmt.format(new Date(r.viewed_at)) === todayStr) b.today++;
        if (!b.last) b.last = r.viewed_at;
      }
      return json({ pages: byPage, total: grandTotal });
    }

    // GET jersey report (PIN)
    if (req.method === "GET" && action === "size_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const r = await buildSizeReport(FORM_JERSEY, true);
      if ((r as any).error) return json(r, 500);
      return json(r);
    }

    // GET sweatshirt report (PIN)
    if (req.method === "GET" && action === "sweatshirt_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const r = await buildSizeReport(FORM_SWEAT);
      if ((r as any).error) return json(r, 500);
      return json(r);
    }

    // GET volunteer report (PIN)
    if (req.method === "GET" && action === "volunteer_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);

      const { data: players, error: pErr } = await getPlayers();
      if (pErr) return json({ error: pErr.message }, 500);
      const nameById = new Map<string, string>();
      for (const p of players ?? []) {
        nameById.set(p.id, p.first_name + " " + ((p.last_name ?? "").charAt(0) ? (p.last_name ?? "").charAt(0) + "." : ""));
      }

      const { data: rows, error: rErr } = await supabase
        .from("cougars_form_responses")
        .select("id, player_id, payload, submitted_by, submitted_at")
        .eq("form_key", FORM_VOL)
        .order("submitted_at", { ascending: false });
      if (rErr) return json({ error: rErr.message }, 500);

      const submissions = (rows ?? []).map((r) => ({
        id: r.id,
        player_label: r.player_id ? (nameById.get(r.player_id) ?? "") : "",
        parent_name: r.payload?.parent_name ?? r.submitted_by ?? null,
        categories: r.payload?.categories ?? [],
        other_text: r.payload?.other_text ?? null,
        submitted_at: r.submitted_at,
      }));
      return json({ submissions, count: submissions.length });
    }

    // GET funds -> public: active funds from cougars_config key team_funds; with PIN, includes inactive too
    if (req.method === "GET" && action === "funds") {
      const r = await readFunds();
      if ((r as any).error) return json(r, 500);
      const isAdmin = requirePin();
      const funds = (r.funds ?? []).filter((f: any) => isAdmin || f.active);
      return json({ funds, updated_at: r.updated_at });
    }

    // POST admin_funds (PIN) -> patch one fund's numbers, or replace the whole list
    if (req.method === "POST" && action === "admin_funds") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);

      const r = await readFunds();
      if ((r as any).error) return json(r, 500);
      let funds: any[] = r.funds ?? [];

      if (Array.isArray(body.funds)) {
        if (body.funds.length > 20) return json({ error: "too many funds" }, 400);
        funds = body.funds.map(cleanFund).filter((f: any) => f !== null);
      } else if (typeof body.id === "string" && body.id) {
        const f = funds.find((x) => x.id === body.id);
        if (!f) return json({ error: "fund not found" }, 404);
        if (body.raised_cents !== undefined) {
          const n = Number(body.raised_cents);
          if (!Number.isFinite(n) || n < 0) return json({ error: "invalid raised_cents" }, 400);
          f.raised_cents = Math.round(n);
        }
        if (body.goal_cents !== undefined) {
          if (body.goal_cents === null || body.goal_cents === "") {
            f.goal_cents = null;
          } else {
            const n = Number(body.goal_cents);
            if (!Number.isFinite(n) || n < 0) return json({ error: "invalid goal_cents" }, 400);
            f.goal_cents = Math.round(n);
          }
        }
        if (body.active !== undefined) f.active = body.active === true;
      } else {
        return json({ error: "id or funds required" }, 400);
      }

      const { error: uErr } = await supabase.from("cougars_config").upsert({
        key: "team_funds", value: JSON.stringify(funds), label: "Cougar Funds", updated_at: new Date().toISOString(),
      });
      if (uErr) return json({ error: uErr.message }, 500);
      return json({ ok: true, funds });
    }

    // POST submit_cage_vote -> multi-select nights; latest submission per family replaces the previous one entirely
    if (req.method === "POST" && action === "submit_cage_vote") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const { player_id, choices, parent_name } = body;
      if (!player_id || typeof player_id !== "string") return json({ error: "player_id required" }, 400);
      const list = Array.isArray(choices)
        ? [...new Set(choices.filter((c: unknown) => typeof c === "string" && CAGE_CHOICES.includes(c)))]
        : [];
      if (list.length === 0) return json({ error: "pick at least one night" }, 400);
      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id, first_name").eq("id", player_id).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);
      const cleanParent = typeof parent_name === "string" ? parent_name.trim().slice(0, 120) : null;
      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: FORM_CAGEVOTE,
        player_id,
        payload: { choices: list, parent_name: cleanParent || null },
        submitted_by: cleanParent || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, first_name: player.first_name, choices: list });
    }

    // GET cage_vote_report (PIN) -> latest submission per family; each chosen night counts once per family
    if (req.method === "GET" && action === "cage_vote_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const { data: allPlayers, error: pErr } = await getPlayers();
      if (pErr) return json({ error: pErr.message }, 500);
      const { data: rows, error: rErr } = await supabase
        .from("cougars_form_responses")
        .select("player_id, payload, submitted_at")
        .eq("form_key", FORM_CAGEVOTE)
        .order("submitted_at", { ascending: false });
      if (rErr) return json({ error: rErr.message }, 500);
      const latest = new Map<string, any>();
      for (const r of rows ?? []) if (!latest.has(r.player_id)) latest.set(r.player_id, r);
      const counts: Record<string, number> = { monday: 0, tuesday: 0, wednesday: 0 };
      const voted = [];
      const not_voted = [];
      for (const p of allPlayers ?? []) {
        const r = latest.get(p.id);
        let list: string[] = [];
        if (Array.isArray(r?.payload?.choices)) {
          list = r.payload.choices.filter((c: unknown) => typeof c === "string" && CAGE_CHOICES.includes(c));
        } else if (typeof r?.payload?.choice === "string" && CAGE_CHOICES.includes(r.payload.choice)) {
          list = [r.payload.choice]; // legacy single-choice rows
        }
        if (list.length > 0) {
          for (const c of list) counts[c]++;
          voted.push({ player_id: p.id, first_name: p.first_name, last_name: p.last_name, choices: list, submitted_at: r.submitted_at });
        } else {
          not_voted.push({ player_id: p.id, first_name: p.first_name, last_name: p.last_name });
        }
      }
      return json({ counts, voted, not_voted, total: (allPlayers ?? []).length });
    }

    // GET updates -> public, PUBLISHED only
    if (req.method === "GET" && action === "updates") {
      const { data, error } = await supabase
        .from("cougars_updates")
        .select("id, update_date, body")
        .eq("published", true)
        .order("update_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ updates: data ?? [] });
    }

    // GET all_updates (PIN) -> drafts + published for the coach dashboard
    if (req.method === "GET" && action === "all_updates") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const { data, error } = await supabase
        .from("cougars_updates")
        .select("id, update_date, body, published, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json({ error: error.message }, 500);
      return json({ updates: data ?? [] });
    }

    // POST post_update (PIN) -> checked-out DRAFT by default; publish is a separate explicit step
    if (req.method === "POST" && action === "post_update") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const text = typeof body?.body === "string" ? body.body.trim().slice(0, 8000) : "";
      if (!text) return json({ error: "body required" }, 400);
      const row: Record<string, unknown> = { body: text, published: body?.published === true };
      if (typeof body?.update_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.update_date)) {
        row.update_date = body.update_date;
      }
      const { data, error } = await supabase.from("cougars_updates").insert(row).select("id, update_date, published").single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: data.id, update_date: data.update_date, published: data.published });
    }

    // POST edit_update (PIN) -> edit a draft (or live entry) body
    if (req.method === "POST" && action === "edit_update") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const id = typeof body?.id === "string" ? body.id : "";
      const text = typeof body?.body === "string" ? body.body.trim().slice(0, 8000) : "";
      if (!id || !text) return json({ error: "id + body required" }, 400);
      const { error } = await supabase.from("cougars_updates").update({ body: text }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // POST publish_update (PIN) -> the check-in: draft goes live
    if (req.method === "POST" && action === "publish_update") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) return json({ error: "id required" }, 400);
      const { data, error } = await supabase
        .from("cougars_updates")
        .update({ published: true, update_date: new Date().toISOString().slice(0, 10) })
        .eq("id", id)
        .select("id, body")
        .single();
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, id: data.id, body: data.body });
    }

    // POST unpublish_update (PIN)
    if (req.method === "POST" && action === "unpublish_update") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const id = typeof body?.id === "string" ? body.id : "";
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await supabase.from("cougars_updates").update({ published: false }).eq("id", id);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // GET current_event -> public
    if (req.method === "GET" && action === "current_event") {
      const { data, error } = await supabase
        .from("cougars_config")
        .select("value, label")
        .eq("key", "attendance_event")
        .maybeSingle();
      if (error) return json({ error: error.message }, 500);
      if (!data || !data.value) return json({ event_key: null, label: null });
      return json({ event_key: data.value, label: data.label });
    }

    // POST set_event (PIN)
    if (req.method === "POST" && action === "set_event") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const label = typeof body?.label === "string" ? body.label.trim().slice(0, 120) : "";
      if (!label) return json({ error: "label required" }, 400);
      const eventKey = "attendance_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
      const { error } = await supabase.from("cougars_config").upsert({
        key: "attendance_event", value: eventKey, label, updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true, event_key: eventKey, label });
    }

    // POST submit_attendance -> dormant but kept
    if (req.method === "POST" && action === "submit_attendance") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const { player_id, status, parent_name, note, event_key } = body;
      if (!player_id || typeof player_id !== "string") return json({ error: "player_id required" }, 400);
      if (!ATTENDANCE_STATUSES.includes(status)) return json({ error: "invalid status" }, 400);
      if (typeof event_key !== "string" || !/^attendance_[a-z0-9_]{3,60}$/.test(event_key)) {
        return json({ error: "invalid event" }, 400);
      }
      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id, first_name").eq("id", player_id).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);
      const cleanParent = typeof parent_name === "string" ? parent_name.trim().slice(0, 120) : null;
      const cleanNote = typeof note === "string" ? note.trim().slice(0, 500) : null;
      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: event_key,
        player_id,
        payload: { status, note: cleanNote || null, parent_name: cleanParent || null },
        submitted_by: cleanParent || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, first_name: player.first_name, status });
    }

    // GET attendance_report (PIN) -> dormant but kept
    if (req.method === "GET" && action === "attendance_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      let eventKey = url.searchParams.get("event_key") ?? "";
      let label = eventKey;
      if (!eventKey) {
        const { data: cfg } = await supabase
          .from("cougars_config").select("value, label").eq("key", "attendance_event").maybeSingle();
        eventKey = cfg?.value ?? "";
        label = cfg?.label ?? "";
      }
      if (!eventKey) return json({ event_key: null, label: null, report: [], summary: { yes: 0, no: 0, maybe: 0, silent: 0 } });
      const { data: allPlayers, error: pErr } = await getPlayers();
      if (pErr) return json({ error: pErr.message }, 500);
      const { data: rows, error: rErr } = await supabase
        .from("cougars_form_responses")
        .select("player_id, payload, submitted_at")
        .eq("form_key", eventKey)
        .order("submitted_at", { ascending: false });
      if (rErr) return json({ error: rErr.message }, 500);
      const latest = new Map<string, any>();
      for (const r of rows ?? []) if (!latest.has(r.player_id)) latest.set(r.player_id, r);
      const report = (allPlayers ?? []).map((p) => {
        const r = latest.get(p.id);
        return {
          player_id: p.id, first_name: p.first_name, last_name: p.last_name,
          status: r?.payload?.status ?? null, note: r?.payload?.note ?? null,
          parent_name: r?.payload?.parent_name ?? null, submitted_at: r?.submitted_at ?? null,
        };
      });
      const summary = {
        yes: report.filter((r) => r.status === "yes").length,
        no: report.filter((r) => r.status === "no").length,
        maybe: report.filter((r) => r.status === "maybe").length,
        silent: report.filter((r) => !r.status).length,
      };
      return json({ event_key: eventKey, label, report, summary });
    }

    // GET taken_songs -> public, songs only (player_id for self-exclusion, no names)
    if (req.method === "GET" && action === "taken_songs") {
      const { data: rows, error } = await supabase
        .from("cougars_form_responses")
        .select("player_id, payload, submitted_at")
        .eq("form_key", FORM_WALKUP)
        .order("submitted_at", { ascending: false });
      if (error) return json({ error: error.message }, 500);
      const latest = new Map<string, any>();
      for (const r of rows ?? []) if (!latest.has(r.player_id)) latest.set(r.player_id, r);
      const songs = [];
      for (const [pid, r] of latest) {
        if (r.payload?.song_title) {
          songs.push({ player_id: pid, song_title: r.payload.song_title, song_artist: r.payload.song_artist ?? null });
        }
      }
      return json({ songs });
    }

    // POST submit_walkup -> multipart form: song pick + optional name recording
    if (req.method === "POST" && action === "submit_walkup") {
      let form: FormData;
      try { form = await req.formData(); } catch { return json({ error: "expected form data" }, 400); }
      const playerId = String(form.get("player_id") ?? "");
      if (!playerId) return json({ error: "player_id required" }, 400);

      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id, first_name").eq("id", playerId).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);

      const clean = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
      const songTitle = clean(form.get("song_title"), 150);
      const songArtist = clean(form.get("song_artist"), 150);
      const songStart = clean(form.get("song_start"), 20);
      const phonetic = clean(form.get("phonetic"), 200);
      const parentName = clean(form.get("parent_name"), 120);
      if (!songTitle) return json({ error: "song title required" }, 400);

      let recordingPath: string | null = null;
      const file = form.get("name_recording");
      if (file instanceof File && file.size > 0) {
        if (file.size > 8 * 1024 * 1024) return json({ error: "recording too large (8MB max)" }, 400);
        const ext = AUDIO_EXT[file.type];
        if (!ext) return json({ error: "recording must be an audio file" }, 400);
        recordingPath = `walkup-names/${playerId}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("cougars-media")
          .upload(recordingPath, file, { contentType: file.type });
        if (upErr) return json({ error: "upload failed: " + upErr.message }, 500);
      }

      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: FORM_WALKUP,
        player_id: playerId,
        payload: {
          song_title: songTitle, song_artist: songArtist || null, song_start: songStart || null,
          phonetic: phonetic || null, recording_path: recordingPath, parent_name: parentName || null,
        },
        submitted_by: parentName || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, first_name: player.first_name, has_recording: !!recordingPath });
    }

    // GET walkup_report (PIN) -> latest-wins per player, signed URLs for recordings
    if (req.method === "GET" && action === "walkup_report") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const r = await buildWalkupReport();
      if ((r as any).error) return json(r, 500);
      return json(r);
    }

    // GET snack_slots -> public board
    if (req.method === "GET" && action === "snack_slots") {
      const { data, error } = await supabase
        .from("cougars_snack_slots")
        .select("game_no, game_label, claimed_by, treat")
        .order("game_no", { ascending: true });
      if (error) return json({ error: error.message }, 500);
      return json({ slots: data ?? [] });
    }

    // POST claim_snack -> first come, first served
    if (req.method === "POST" && action === "claim_snack") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const gameNo = Number(body.game_no);
      const family = typeof body.family_name === "string" ? body.family_name.trim().slice(0, 80) : "";
      const treat = typeof body.treat === "string" ? body.treat.trim().slice(0, 200) : "";
      if (!Number.isInteger(gameNo) || gameNo < 1 || gameNo > 20) return json({ error: "invalid game" }, 400);
      if (!family) return json({ error: "family name required" }, 400);
      const { data, error } = await supabase
        .from("cougars_snack_slots")
        .update({ claimed_by: family, treat: treat || null, claimed_at: new Date().toISOString() })
        .eq("game_no", gameNo)
        .is("claimed_by", null)
        .select("game_no, game_label");
      if (error) return json({ error: error.message }, 500);
      if (!data || data.length === 0) return json({ error: "taken" }, 409);
      return json({ ok: true, game_no: gameNo, game_label: data[0].game_label });
    }

    // POST unclaim_snack (PIN) -> Coach can free a slot
    if (req.method === "POST" && action === "unclaim_snack") {
      if (!requirePin()) return json({ error: "unauthorized" }, 401);
      const body = await req.json().catch(() => null);
      const gameNo = Number(body?.game_no);
      if (!Number.isInteger(gameNo)) return json({ error: "invalid game" }, 400);
      const { error } = await supabase
        .from("cougars_snack_slots")
        .update({ claimed_by: null, treat: null, claimed_at: null })
        .eq("game_no", gameNo);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    // POST submit_size (jersey)
    if (req.method === "POST" && action === "submit_size") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const { player_id, confirmed_size, fits_check, parent_name } = body;
      if (!player_id || typeof player_id !== "string") return json({ error: "player_id required" }, 400);
      if (!VALID_JERSEY.includes(confirmed_size)) return json({ error: "invalid size" }, 400);
      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id, first_name").eq("id", player_id).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);
      const cleanParent = typeof parent_name === "string" ? parent_name.trim().slice(0, 120) : null;
      const cleanFits = typeof fits_check === "string" ? fits_check.trim().slice(0, 500) : null;
      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: FORM_JERSEY,
        player_id,
        payload: { confirmed_size, fits_check: cleanFits || null, parent_name: cleanParent || null },
        submitted_by: cleanParent || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, first_name: player.first_name, confirmed_size });
    }

    // POST submit_sweatshirt
    if (req.method === "POST" && action === "submit_sweatshirt") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const { player_id, confirmed_size, parent_name, back_name } = body;
      if (!player_id || typeof player_id !== "string") return json({ error: "player_id required" }, 400);
      if (!VALID_SWEAT.includes(confirmed_size)) return json({ error: "invalid size" }, 400);
      const cleanBack = typeof back_name === "string" ? back_name.trim().slice(0, 20) : "";
      if (cleanBack.length < 1) return json({ error: "back name required" }, 400);
      const { data: player, error: pErr } = await supabase
        .from("cougars_players").select("id, first_name").eq("id", player_id).maybeSingle();
      if (pErr) return json({ error: pErr.message }, 500);
      if (!player) return json({ error: "player not found" }, 404);
      const cleanParent = typeof parent_name === "string" ? parent_name.trim().slice(0, 120) : null;
      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: FORM_SWEAT,
        player_id,
        payload: { confirmed_size, back_name: cleanBack, parent_name: cleanParent || null },
        submitted_by: cleanParent || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true, first_name: player.first_name, confirmed_size, back_name: cleanBack });
    }

    // POST submit_volunteer
    if (req.method === "POST" && action === "submit_volunteer") {
      const body = await req.json().catch(() => null);
      if (!body) return json({ error: "invalid body" }, 400);
      const { player_id, parent_name, categories, other_text } = body;
      let cleanPlayer: string | null = null;
      if (player_id && typeof player_id === "string") {
        const { data: player } = await supabase
          .from("cougars_players").select("id").eq("id", player_id).maybeSingle();
        if (player) cleanPlayer = player_id;
      }
      const cleanCats = Array.isArray(categories)
        ? categories.filter((c) => VOL_CATEGORIES.includes(c)).slice(0, 20)
        : [];
      const cleanOther = typeof other_text === "string" ? other_text.trim().slice(0, 1000) : null;
      const cleanParent = typeof parent_name === "string" ? parent_name.trim().slice(0, 120) : null;
      if (cleanCats.length === 0 && !cleanOther) {
        return json({ error: "nothing selected" }, 400);
      }
      const { error: iErr } = await supabase.from("cougars_form_responses").insert({
        form_key: FORM_VOL,
        player_id: cleanPlayer,
        payload: { parent_name: cleanParent || null, categories: cleanCats, other_text: cleanOther || null },
        submitted_by: cleanParent || null,
      });
      if (iErr) return json({ error: iErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
