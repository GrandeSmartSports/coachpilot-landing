/* Field Command umpire reminders: the pure core the flm-reminders edge
   function runs on. No network, no Deno, no secrets, so tests/fields.smoke.mjs
   can unit test date targeting, the email kill switch, and the parent-cc rule
   exactly as they ship. */

export function addDays(dateStr, n) {
  const p = String(dateStr || "").split("-");
  const d = new Date(Date.UTC(+p[0], (+p[1] || 1) - 1, (+p[2] || 1) + n));
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return d.getUTCFullYear() + "-" + mm + "-" + dd;
}

export function fmtTime(t) {
  const p = String(t || "").split(":");
  let h = +p[0] || 0;
  const m = +p[1] || 0;
  const ap = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return h + (m ? ":" + (m < 10 ? "0" : "") + m : "") + " " + ap;
}

/* Which reminders go out on a given run day?
   morning_of: an ACCEPTED assignment on a SCHEDULED game today.
   day_before: an ACCEPTED assignment on a SCHEDULED game tomorrow.
   Offered, declined, and turned-back assignments never remind. Draft,
   postponed, cancelled, and completed games never remind. */
export function targetsFor(assignments, games, todayStr) {
  const tomorrow = addDays(todayStr, 1);
  const byId = new Map((games || []).map((g) => [g.id, g]));
  const out = [];
  for (const a of (assignments || [])) {
    if (a.status !== "accepted") continue;
    const g = byId.get(a.game_id);
    if (!g || g.status !== "scheduled") continue;
    if (g.game_date === todayStr) out.push({ assignment: a, game: g, kind: "morning_of" });
    else if (g.game_date === tomorrow) out.push({ assignment: a, game: g, kind: "day_before" });
  }
  return out;
}

/* The recipient rule lives in ONE place: a minor umpire's parent email is
   ALWAYS cc'd. A test_to override redirects the To address but can never
   remove the parent cc. */
export function recipientsFor(ump, testTo) {
  const to = String(testTo || (ump && ump.email) || "").trim();
  const cc = ump && ump.is_minor && String(ump.parent_email || "").includes("@")
    ? [String(ump.parent_email).trim()]
    : [];
  return { to, cc };
}

/* The kill switch: when email is off, every target is logged as intent and
   nothing is sent. There is no third bucket, so nothing slips through. */
export function plan(emailEnabled, targets) {
  if (!emailEnabled) return { send: [], logOnly: (targets || []).slice() };
  return { send: (targets || []).slice(), logOnly: [] };
}

/* One plain-words sentence per reminder. */
export function reminderLine(kind, game, matchup, venue, roleWord) {
  const when = kind === "morning_of" ? "today" : "tomorrow";
  return "You are the " + roleWord + " umpire for " + matchup + " " + when + " (" + game.game_date + ") at " + fmtTime(game.start_time) + ", " + venue + ".";
}
