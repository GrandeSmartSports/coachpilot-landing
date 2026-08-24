// Field Command iCal feeds (Phase 3). PUBLIC, read-only, verify_jwt off.
// One subscription URL per team, per division, or for the whole league:
//   .../flm-ics/league.ics
//   .../flm-ics/team/<team id>.ics
//   .../flm-ics/division/<division name>.ics
// Pretty URLs: coachpilot.org/fields/ics/* rewrites here (vercel.json).
// Query-param form also works: ?team=<id>, ?division=<name>.
// Feed rules (published games only, POSTPONED prefix, stable UIDs) live in
// ics-core.mjs, shared with the repo's unit tests.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildIcs, filterGames } from "./ics-core.mjs";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const HEADERS: Record<string, string> = {
  "Content-Type": "text/calendar; charset=utf-8",
  "Content-Disposition": "inline; filename=field-command.ics",
  "Cache-Control": "public, max-age=300, s-maxage=300",
  "Access-Control-Allow-Origin": "*",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type" } });
  }
  try {
    const url = new URL(req.url);
    // Path after the function slug: /flm-ics/team/<id>.ics -> ["team", "<id>.ics"]
    const segs = url.pathname.split("/").filter(Boolean);
    const at = segs.indexOf("flm-ics");
    const rest = at >= 0 ? segs.slice(at + 1) : [];
    const strip = (s: string) => decodeURIComponent(s || "").replace(/\.ics$/i, "");
    const sel: { team?: string; division?: string } = {};
    if (rest[0] === "team" && rest[1]) sel.team = strip(rest[1]);
    else if (rest[0] === "division" && rest[1]) sel.division = strip(rest[1]);
    else if (url.searchParams.get("team")) sel.team = url.searchParams.get("team")!;
    else if (url.searchParams.get("division")) sel.division = url.searchParams.get("division")!;

    const [games, teams, fields, exts, lg] = await Promise.all([
      db.from("flm_games").select("id,created_at,division,home_team_id,away_team_id,ext_team_id,field_id,venue_text,game_date,start_time,end_time,status,notes").neq("status", "draft").order("game_date").order("start_time"),
      db.from("flm_teams").select("id,name,division"),
      db.from("flm_fields").select("id,name"),
      db.from("flm_ext_teams").select("id,league_name,team_name"),
      db.from("flm_settings").select("value").eq("key", "league_name").maybeSingle(),
    ]);
    const league = lg.data?.value || "Field Command";
    let name = league + " games";
    if (sel.team) {
      const t = (teams.data ?? []).find((x: { id: string }) => x.id === sel.team);
      name = (t ? t.name : "Team") + " games";
    } else if (sel.division) {
      name = sel.division + " games (" + league + ")";
    }
    const shown = filterGames(games.data ?? [], sel);
    const ics = buildIcs(shown, { teams: teams.data ?? [], fields: fields.data ?? [], ext_teams: exts.data ?? [] }, { name });
    return new Response(ics, { headers: HEADERS });
  } catch (e) {
    return new Response("Feed error: " + String(e).slice(0, 200), { status: 500, headers: { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" } });
  }
});
