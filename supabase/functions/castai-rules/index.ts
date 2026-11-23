// WDFW emergency fishing rules, for the Rig Card (coachpilot.org/rigs) and
// later CastAI. PUBLIC, read-only, verify_jwt off.
//
// GET  -> { checked, rules: [...] } newest first, last 200 days.
// The RSS is re-read at most every 30 minutes, whenever anyone asks, and by
// pg_cron every 6 hours (castai-rules-sync) so it is fresh even when nobody
// opens the page. Rules are kept in castai_wdfw_rules, because the RSS only
// carries the last ~30 items and an old rule can still be in force.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseRss } from "./rss-core.mjs";

const RSS = "https://wdfw.wa.gov/fishing/regulations/emergency-rules/rss";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type" };

async function sync(force: boolean) {
  const { data: st } = await db.from("castai_wdfw_rules_sync").select("*").eq("id", 1).maybeSingle();
  const last = st?.last_run ? Date.parse(st.last_run) : 0;
  if (Date.now() - last < (force ? 5 : 30) * 60e3) return;
  await db.from("castai_wdfw_rules_sync").upsert({ id: 1, last_run: new Date().toISOString() });
  try {
    const res = await fetch(RSS, { headers: { "User-Agent": "RigCard/1.0 (coachpilot.org/rigs)" } });
    if (!res.ok) throw new Error("WDFW RSS " + res.status);
    const rules = parseRss(await res.text());
    if (!rules.length) throw new Error("WDFW RSS had no items");
    const now = new Date().toISOString();
    const { error } = await db.from("castai_wdfw_rules").upsert(rules.map((r) => ({ ...r, last_seen: now })), { onConflict: "link" });
    if (error) throw error;
    await db.from("castai_wdfw_rules_sync").upsert({ id: 1, last_run: now, last_ok: now, last_error: null });
  } catch (e) {
    await db.from("castai_wdfw_rules_sync").upsert({ id: 1, last_error: String((e as Error).message || e).slice(0, 300) });
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  try {
    const url = new URL(req.url);
    await sync(url.searchParams.get("sync") === "1");
    const since = new Date(Date.now() - 200 * 864e5).toISOString();
    const [{ data: rules, error }, { data: st }] = await Promise.all([
      db.from("castai_wdfw_rules").select("link,title,published,effective,body").gte("published", since)
        .order("published", { ascending: false }).limit(200),
      db.from("castai_wdfw_rules_sync").select("last_ok,last_error").eq("id", 1).maybeSingle(),
    ]);
    if (error) throw error;
    return new Response(JSON.stringify({ checked: st?.last_ok || null, error: st?.last_error || null, rules: rules || [] }), {
      headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "public, max-age=120, s-maxage=120" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });
  }
});
