/* Field Command iCal feed core (Phase 3).
   Pure functions, no network: the flm-ics edge function imports this file to
   build .ics output, and tests/fields.smoke.mjs imports the same file to unit
   test it. Deploy note: this exact file ships alongside the edge function's
   index.ts, so repo and deployed copies never drift.

   Feed rules:
   - Published games only: drafts NEVER appear in a feed (filterGames drops them).
   - Postponed games stay on the calendar with a "POSTPONED: " prefix so parents
     see the change instead of a silent disappearance; cancelled games get
     "CANCELLED: " and STATUS:CANCELLED.
   - UIDs are stable across edits (flm-<game id>@coachpilot.org), so a moved
     game updates in place on the subscriber's calendar.
   - Times are wall-clock Pacific via an embedded VTIMEZONE. */

const TZID = "America/Los_Angeles";

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  "TZID:" + TZID,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0800",
  "TZOFFSETTO:-0700",
  "TZNAME:PDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0700",
  "TZOFFSETTO:-0800",
  "TZNAME:PST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/* Escape per RFC 5545: backslash, semicolon, comma, newline. */
export function escapeText(s) {
  return String(s == null ? "" : s)
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/* Fold long content lines at 74 chars (RFC 5545 says max 75 octets). */
export function foldLine(line) {
  if (line.length <= 74) return line;
  const parts = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 73) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  if (rest.length) parts.push(" " + rest);
  return parts.join("\r\n");
}

function dtLocal(dateStr, timeStr) {
  return String(dateStr).replace(/-/g, "") + "T" + (String(timeStr).slice(0, 8) + ":00").slice(0, 8).replace(/:/g, "");
}

function dtUtc(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/* sel: { team: teamId } | { division: name } | {} for the whole league.
   Draft games are always dropped: a feed can never leak a half-built season. */
export function filterGames(games, sel) {
  return (games || []).filter((g) => {
    if (g.status === "draft") return false;
    if (sel && sel.team) return g.home_team_id === sel.team || g.away_team_id === sel.team;
    if (sel && sel.division) return g.division === sel.division;
    return true;
  });
}

/* games: filtered flm_games rows. ctx: { teams, fields, ext_teams } (gateway
   state shape). opts: { name, now }. Returns the full .ics text (CRLF). */
export function buildIcs(games, ctx, opts) {
  const teams = (ctx && ctx.teams) || [];
  const fields = (ctx && ctx.fields) || [];
  const exts = (ctx && ctx.ext_teams) || [];
  const teamName = (id) => (teams.find((t) => t.id === id) || {}).name || "?";
  const oppName = (g) => {
    if (g.ext_team_id) {
      const x = exts.find((e) => e.id === g.ext_team_id);
      return x ? x.team_name + " (" + x.league_name + ")" : "interlock opponent";
    }
    return teamName(g.away_team_id);
  };
  const venue = (g) => {
    if (g.field_id) return (fields.find((f) => f.id === g.field_id) || {}).name || "";
    return g.venue_text || "";
  };
  const calName = (opts && opts.name) || "Field Command games";
  const stamp = dtUtc(opts && opts.now);

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Field Command//flm-ics//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:" + escapeText(calName),
    "X-WR-TIMEZONE:" + TZID,
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ].concat(VTIMEZONE);

  for (const g of games || []) {
    let summary = teamName(g.home_team_id) + " vs " + oppName(g);
    if (g.status === "postponed") summary = "POSTPONED: " + summary;
    else if (g.status === "cancelled") summary = "CANCELLED: " + summary;
    const descParts = [];
    if (g.division) descParts.push(g.division);
    if (g.status === "postponed") descParts.push("This game is postponed. Watch the schedule for the makeup time.");
    if (g.status === "cancelled") descParts.push("This game is cancelled.");
    if (g.notes) descParts.push(g.notes);
    lines.push(
      "BEGIN:VEVENT",
      "UID:flm-" + g.id + "@coachpilot.org",
      "DTSTAMP:" + (g.created_at ? dtUtc(g.created_at) : stamp),
      "DTSTART;TZID=" + TZID + ":" + dtLocal(g.game_date, g.start_time),
      "DTEND;TZID=" + TZID + ":" + dtLocal(g.game_date, g.end_time),
      "SUMMARY:" + escapeText(summary)
    );
    const loc = venue(g);
    if (loc) lines.push("LOCATION:" + escapeText(loc));
    if (descParts.length) lines.push("DESCRIPTION:" + escapeText(descParts.join(" ")));
    lines.push("STATUS:" + (g.status === "cancelled" ? "CANCELLED" : g.status === "postponed" ? "TENTATIVE" : "CONFIRMED"));
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
