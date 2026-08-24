// Cougar Funds shared logic: config parsing + progress math.
// Used by cougars/funds.html (type="module") and unit-tested by tests/cougars-funds.smoke.mjs.

// Defensive parse of the team_funds config value (JSON array of funds).
export function parseFunds(raw) {
  let list = raw;
  if (typeof raw === "string") {
    try { list = JSON.parse(raw); } catch (e) { return []; }
  }
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const id = typeof f.id === "string" ? f.id.trim() : "";
    const name = typeof f.name === "string" ? f.name.trim() : "";
    if (!id || !name) continue;
    const goal = (f.goal_cents === null || f.goal_cents === undefined || f.goal_cents === "")
      ? null
      : (Number.isFinite(Number(f.goal_cents)) ? Math.max(0, Math.round(Number(f.goal_cents))) : null);
    const raised = Number.isFinite(Number(f.raised_cents)) ? Math.max(0, Math.round(Number(f.raised_cents))) : 0;
    out.push({
      id,
      name,
      goal_cents: goal,
      raised_cents: raised,
      per_note: typeof f.per_note === "string" && f.per_note ? f.per_note : null,
      blurb: typeof f.blurb === "string" && f.blurb ? f.blurb : null,
      active: f.active !== false,
    });
  }
  return out;
}

// $ formatting: whole dollars stay whole ($325), partial cents show two places ($12.50).
export function dollars(cents) {
  const n = Math.max(0, Math.round(Number(cents) || 0));
  const whole = Math.floor(n / 100);
  const rem = n % 100;
  if (rem === 0) return "$" + whole.toLocaleString("en-US");
  return "$" + whole.toLocaleString("en-US") + "." + String(rem).padStart(2, "0");
}

// Progress for one fund.
// Goal set:  { open: false, pct: 0-100 (capped), label: "$X of $Y" }
// Open goal: { open: true,  pct: null,           label: "$X raised so far" }
export function fundProgress(fund) {
  const raised = Math.max(0, Math.round(Number(fund && fund.raised_cents) || 0));
  const goal = fund && fund.goal_cents !== null && fund.goal_cents !== undefined
    ? Math.max(0, Math.round(Number(fund.goal_cents) || 0))
    : null;
  if (goal === null || goal === 0) {
    return { open: true, pct: null, label: dollars(raised) + " raised so far" };
  }
  const pct = Math.max(0, Math.min(100, Math.round((raised / goal) * 100)));
  return { open: false, pct, label: dollars(raised) + " of " + dollars(goal) };
}
