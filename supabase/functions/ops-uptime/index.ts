// Empire uptime watchdog. Runs every 5 minutes via pg_cron + pg_net.
// LAW: every check hits its target EXACTLY like a real client does
// (headerless where pages call headerless) — born from the 2026-09-16
// flm-gateway outage where authed health checks stayed green for 7.5h
// while every real coach got 401s.
// Alerts: email on DOWN (2 consecutive fails) and on RECOVERY. Signal only.

const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdlaWd2dXlzcHRqdnZxYW51bWxkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMzIxODIsImV4cCI6MjA5MDgwODE4Mn0.DlzXoU3XUa7kAD9oN6hJ1MBXnC_KxzviqpL2vQxWSX8";
const CLIENT_HEADERS = { apikey: ANON, Authorization: "Bearer " + ANON };

type Check = { name: string; url: string; headers?: Record<string, string>; must: string[] };
const CHECKS: Check[] = [
  // Field Command gateway — HEADERLESS on purpose: that is how /fields calls it.
  { name: "flm-gateway state", url: "https://geigvuysptjvvqanumld.supabase.co/functions/v1/flm-gateway?action=state", must: ['"ok":true', '"settings"'] },
  { name: "fields page", url: "https://coachpilot.org/fields/", must: ["flm-gateway"] },
  { name: "cougars hub", url: "https://coachpilot.org/cougars/", must: [] },
  // OnDeck clients send the anon key — mimic that.
  { name: "ondeck gameday", url: "https://geigvuysptjvvqanumld.supabase.co/functions/v1/ondeck-gateway?action=gameday&team_id=e960debc-19c8-44a9-b084-e60d03bebdcc", headers: CLIENT_HEADERS, must: ['"ok":true', '"entries"'] },
  { name: "ondeck breaks", url: "https://geigvuysptjvvqanumld.supabase.co/functions/v1/ondeck-gateway?action=breaks", headers: CLIENT_HEADERS, must: ['"tracks"'] },
  { name: "ondeck app", url: "https://pwa-henna-ten.vercel.app/", must: ["OnDeck"] },
  { name: "sophie page", url: "https://coachpilot.org/sophie", must: [] },
  { name: "cueops site", url: "https://cueops.io", must: [] },
];

const FAILS_BEFORE_DOWN = 2;
const ALERT_TO = "daniel.grande@ymail.com";

import { createClient } from "jsr:@supabase/supabase-js@2";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

async function probe(c: Check): Promise<string | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(c.url, { headers: c.headers, signal: ctl.signal, redirect: "follow" });
    const body = await r.text();
    if (r.status !== 200) return `HTTP ${r.status}`;
    for (const m of c.must) if (!body.includes(m)) return `missing marker ${JSON.stringify(m)}`;
    return null;
  } catch (e) {
    return `fetch failed: ${String((e as Error)?.message ?? e).slice(0, 120)}`;
  } finally { clearTimeout(t); }
}

async function email(subject: string, text: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return;
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CoachPilot Ops <noreply@coachpilot.org>", to: [ALERT_TO], subject, text }),
  }).catch(() => {});
}
const pt = () => new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== Deno.env.get("OPS_UPTIME_SECRET")) {
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  }
  if (url.searchParams.get("test_alert") === "1") {
    await email("🟠 TEST: uptime alarms are live", `This is the watchdog test alarm. If you are reading this, DOWN/RECOVERED emails will reach you.\n\nChecked surfaces: ${CHECKS.map(c => c.name).join(", ")}\n${pt()} PT`);
    return new Response(JSON.stringify({ ok: true, test: "sent" }), { status: 200 });
  }

  const results: Record<string, string> = {};
  for (const c of CHECKS) {
    const err = await probe(c);
    const { data: st } = await db.from("ops_uptime_state").select("*").eq("check_name", c.name).maybeSingle();
    const now = new Date().toISOString();
    if (err) {
      const fails = (st?.consecutive_fails ?? 0) + 1;
      const wasDown = st?.status === "down";
      const goingDown = fails >= FAILS_BEFORE_DOWN && !wasDown;
      await db.from("ops_uptime_state").upsert({
        check_name: c.name, status: goingDown || wasDown ? "down" : "degraded",
        consecutive_fails: fails, last_error: err,
        down_since: wasDown ? st.down_since : (goingDown ? now : null), updated_at: now,
        last_ok_at: st?.last_ok_at ?? null,
      }, { onConflict: "check_name" });
      if (goingDown) await email(`🔴 DOWN: ${c.name}`, `${c.name} is failing as a real client sees it.\n\nError: ${err}\nURL: ${c.url}\nSince: ${pt()} PT (${fails} consecutive fails)\n\nNo action email will repeat; next email is recovery.`);
      results[c.name] = `FAIL ${err}`;
    } else {
      if (st?.status === "down") {
        const mins = st.down_since ? Math.round((Date.now() - new Date(st.down_since).getTime()) / 60000) : 0;
        await email(`🟢 RECOVERED: ${c.name}`, `${c.name} is healthy again.\nDowntime: about ${mins} min.\n${pt()} PT`);
      }
      await db.from("ops_uptime_state").upsert({
        check_name: c.name, status: "up", consecutive_fails: 0, last_error: null,
        down_since: null, last_ok_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }, { onConflict: "check_name" });
      results[c.name] = "ok";
    }
  }
  return new Response(JSON.stringify({ ok: true, results }), { status: 200, headers: { "Content-Type": "application/json" } });
});
