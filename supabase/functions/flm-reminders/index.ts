// Field Command umpire reminders (v1). Deployed to the CoachPilot Supabase
// project (geigvuysptjvvqanumld) via Supabase MCP deploy_edge_function,
// verify_jwt off. This repo copy is the source of truth.
//
// Called daily by pg_cron (see BACKEND-CONTRACT.md) with the x-cron-key
// header. Manual runs work with x-admin-pin. Sends day-before and morning-of
// reminder emails to ACCEPTED umpires of SCHEDULED games. When the
// flm_settings.email_enabled kill switch is "false" (the default), every
// reminder is logged to flm_activity as intent instead of being sent, so a
// demo can show the feature without emailing anyone. A minor umpire's parent
// email is always cc'd; that rule lives in reminders-core.mjs.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { addDays, targetsFor, recipientsFor, plan, reminderLine, fmtTime } from "./reminders-core.mjs";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin, x-cron-key",
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

async function setting(key: string): Promise<string> {
  const { data } = await db.from("flm_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? "";
}

async function log(action: string, detail: string, actor = "system") {
  await db.from("flm_activity").insert({ action, detail, actor });
}

function pacificToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function emailHtml(league: string, heading: string, lines: string[]): string {
  const body = lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#3c463f;">${escHtml(l)}</p>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(league)} Umpires</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">${escHtml(heading)}</h1>
    ${body}
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">Your games are always at <a href="https://coachpilot.org/fields/umpire.html" style="color:#2d6a4f;">coachpilot.org/fields/umpire.html</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(league)} Field Command. Reply to this email to reach the league.</p>
</div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const cronKey = req.headers.get("x-cron-key") ?? "";
    const pin = req.headers.get("x-admin-pin") ?? "";
    const [realKey, realPin] = await Promise.all([setting("cron_key"), setting("admin_pin")]);
    const authed = (cronKey.length > 0 && cronKey === realKey) || (pin.length > 0 && pin === realPin);
    if (!authed) return json({ ok: false, error: "unauthorized" }, 401);

    let b: Record<string, unknown> = {};
    if (req.method === "POST") {
      try { b = await req.json(); } catch (_e) { b = {}; }
    }
    const today = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : pacificToday();
    const testTo = typeof b.test_to === "string" && String(b.test_to).includes("@") ? String(b.test_to).trim() : "";
    const tomorrow = addDays(today, 1);
    const emailEnabled = (await setting("email_enabled")) === "true";
    const league = (await setting("league_name")) || "Field Command";

    const { data: games } = await db.from("flm_games").select("*").in("game_date", [today, tomorrow]).eq("status", "scheduled");
    const gameIds = (games ?? []).map((g: { id: string }) => g.id);
    let assignments: Record<string, unknown>[] = [];
    if (gameIds.length) {
      const { data: a } = await db.from("flm_ump_assignments").select("*").in("game_id", gameIds).eq("status", "accepted");
      assignments = a ?? [];
    }
    const targets = targetsFor(assignments, games ?? [], today);

    // Name lookups for plain-words lines.
    const [teams, fields, exts, umps] = await Promise.all([
      db.from("flm_teams").select("id,name"),
      db.from("flm_fields").select("id,name"),
      db.from("flm_ext_teams").select("id,team_name,league_name"),
      db.from("flm_umps").select("*"),
    ]);
    const teamName = (id: string | null) => (teams.data ?? []).find((t: { id: string }) => t.id === id)?.name ?? "?";
    const extName = (id: string | null) => {
      const x = (exts.data ?? []).find((e: { id: string }) => e.id === id);
      return x ? `${x.team_name} (${x.league_name})` : "?";
    };
    // deno-lint-ignore no-explicit-any
    const matchup = (g: any) => `${teamName(g.home_team_id)} vs ${g.ext_team_id ? extName(g.ext_team_id) : teamName(g.away_team_id)}`;
    // deno-lint-ignore no-explicit-any
    const venue = (g: any) => g.field_id ? ((fields.data ?? []).find((f: { id: string }) => f.id === g.field_id)?.name ?? "?") : `at ${g.venue_text ?? "?"}`;
    const umpById = (id: string) => (umps.data ?? []).find((u: { id: string }) => u.id === id);

    const p = plan(emailEnabled, targets);
    const results: Record<string, unknown>[] = [];
    let sent = 0, logged = 0;

    for (const t of p.logOnly) {
      // deno-lint-ignore no-explicit-any
      const a = t.assignment as any, g = t.game as any;
      const ump = umpById(a.ump_id);
      if (!ump) continue;
      const kindWord = t.kind === "morning_of" ? "morning-of" : "day-before";
      await log("ump_email", `Email is off. Would have sent a ${kindWord} reminder to ${ump.name} for ${matchup(g)} on ${g.game_date} at ${fmtTime(g.start_time)}${ump.is_minor ? " (parent cc)" : ""}.`);
      logged++;
      results.push({ ump: ump.name, kind: t.kind, game_date: g.game_date, action: "logged" });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    // With test_to set, send exactly ONE real email (a minor ump first, so the
    // parent-cc proof is visible in the delivered headers).
    let sendList = p.send;
    if (testTo && sendList.length > 1) {
      // deno-lint-ignore no-explicit-any
      sendList = [sendList.find((t: any) => (umpById((t.assignment as any).ump_id) ?? {}).is_minor) ?? sendList[0]];
    }
    for (const t of sendList) {
      // deno-lint-ignore no-explicit-any
      const a = t.assignment as any, g = t.game as any;
      const ump = umpById(a.ump_id);
      if (!ump) continue;
      const { to, cc } = recipientsFor(ump, testTo);
      if (!to.includes("@")) {
        await log("ump_email", `No email on file for ${ump.name}: could not send their reminder for ${g.game_date}.`);
        results.push({ ump: ump.name, kind: t.kind, game_date: g.game_date, action: "no_email" });
        continue;
      }
      const line = reminderLine(t.kind, g, matchup(g), venue(g), a.role);
      const heading = t.kind === "morning_of" ? "Game day reminder" : "You umpire tomorrow";
      const body: Record<string, unknown> = {
        from: "Field Command <noreply@cueops.io>",
        reply_to: "Daniel.Grande@ymail.com",
        to: [to],
        subject: `${league}: you umpire ${t.kind === "morning_of" ? "today" : "tomorrow"} (${g.game_date})`,
        html: emailHtml(league, heading, [line, "If you can no longer make it, open the umpire page and turn the game back so the league can cover it."]),
      };
      if (cc.length) body.cc = cc;
      if (!RESEND_API_KEY) {
        await log("ump_email", `Email is on but not configured (no key). Reminder for ${ump.name}, ${g.game_date} not sent.`);
        results.push({ ump: ump.name, kind: t.kind, game_date: g.game_date, action: "not_configured" });
        continue;
      }
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        let id = "";
        try { id = (await res.json()).id ?? ""; } catch (_e) { id = ""; }
        sent++;
        await log("ump_email", `Sent a ${t.kind === "morning_of" ? "morning-of" : "day-before"} reminder to ${ump.name}${cc.length ? " (parent cc'd)" : ""} for ${matchup(g)} on ${g.game_date}.`);
        results.push({ ump: ump.name, kind: t.kind, game_date: g.game_date, action: "sent", resend_id: id, to, cc });
      } else {
        const err = `${res.status} ${(await res.text()).slice(0, 120)}`;
        await log("ump_email", `Reminder email to ${ump.name} for ${g.game_date} failed: ${err}`);
        results.push({ ump: ump.name, kind: t.kind, game_date: g.game_date, action: "failed", error: err });
      }
      if (sendList.length > 1) await new Promise((r) => setTimeout(r, 550));
    }

    return json({ ok: true, date: today, email_enabled: emailEnabled, considered: targets.length, sent, logged, test: !!testTo, results });
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
