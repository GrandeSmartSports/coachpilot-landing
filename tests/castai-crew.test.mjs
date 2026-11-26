// The crew function's decisions, tested without a network: how a phone number
// typed by a human becomes one account, who may invite, and what happens when
// an invited number already has a CastAI account.
// Run: node tests/castai-crew.test.mjs
import { canInvite, inviteOutcome, normalizePhone } from "../supabase/functions/castai-crew/crew-core.mjs";

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 200)); }
};
const threw = (fn) => { try { fn(); return false; } catch (e) { return true; } };

// Coach will type a number the way he has it in his phone. Every one of these
// has to reach the same account, or the code never arrives.
ok(normalizePhone("253 555 0147") === "+12535550147", "spaces and no country code");
ok(normalizePhone("(253) 555-0147") === "+12535550147", "brackets and a dash");
ok(normalizePhone("+1 253 555 0147") === "+12535550147", "already international");
ok(normalizePhone("1-253-555-0147") === "+12535550147", "a leading 1");
ok(normalizePhone(" 2535550147 ") === "+12535550147", "stray spaces");
ok(threw(() => normalizePhone("555-0147")), "too short is refused");
ok(threw(() => normalizePhone("+44 7700 900123")), "not a US number is refused");
ok(threw(() => normalizePhone("")), "empty is refused");
ok(threw(() => normalizePhone(null)), "nothing at all is refused");
try { normalizePhone("555"); } catch (e) {
  ok(/phone number/i.test(e.message) && !/—/.test(e.message), "the refusal is in plain words", e.message);
}

ok(canInvite({ role: "owner" }), "the owner invites");
ok(!canInvite({ role: "member" }), "a member does not");
ok(!canInvite(null), "nobody invites when there is no membership");

// An invited phone that already has a CastAI account is attached, never doubled.
ok(inviteOutcome({ user: { id: "u1" }, member: { user_id: "u1" } }) === "already", "already on the crew");
ok(inviteOutcome({ user: { id: "u1" }, member: null }) === "attach", "an existing account is attached");
ok(inviteOutcome({ user: null, member: null }) === "create", "a new number gets an account");

// Live: the deployed function must turn away anyone without a good token,
// and must never answer a bad request with a 500.
const URL = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-crew";
const post = async (body, headers) => {
  try {
    const r = await fetch(URL, { method: "POST", headers: { "Content-Type": "application/json", ...(headers || {}) },
      body: typeof body === "string" ? body : JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  } catch (e) { return { status: 0, body: { error: e.message } }; }
};
const noToken = await post({ action: "state" });
if (noToken.status === 0) console.log("skip  live checks: no network");
else {
  ok(noToken.status === 401, "no token is turned away", JSON.stringify(noToken));
  ok(!/service|key|secret/i.test(JSON.stringify(noToken.body)), "the refusal gives nothing away", JSON.stringify(noToken.body));
  const badToken = await post({ action: "state" }, { Authorization: "Bearer not.a.real.token" });
  ok(badToken.status === 401, "a bad token is turned away", JSON.stringify(badToken));
  const junk = await post("{ not json", { Authorization: "Bearer not.a.real.token" });
  ok(junk.status === 401, "junk with a bad token is still a 401, never a 500", JSON.stringify(junk));
  const getOnly = await fetch(URL).then((r) => r.status).catch(() => 0);
  ok(getOnly === 405 || getOnly === 401, "GET is not how you talk to it", getOnly);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
