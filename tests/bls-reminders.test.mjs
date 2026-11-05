// Live test of the BLS registration-day reminder flow on bls-gateway (CoachPilot project).
// Uses Resend's sink address, so no human inbox gets mail. Needs BLS_ADMIN_CODE. Cleans up its row at the end.
const GW = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-gateway";
const PIN = process.env.BLS_ADMIN_CODE || "";
const EMAIL = "delivered@resend.dev";
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ""); } };
const post = (action, body, headers = {}) => fetch(`${GW}?action=${action}`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
const form = (action, data) => fetch(`${GW}?action=${action}`, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data).toString() });
const report = async () => (await fetch(`${GW}?action=remind_report`, { headers: { "x-admin-pin": PIN } })).json();
const row = async () => (await report()).rows.find((r) => r.email === EMAIL);

if (!PIN) { console.log("BLS_ADMIN_CODE missing"); process.exit(1); }
try {
  await post("remind_delete", { email: EMAIL }, { "x-admin-pin": PIN }); // start clean
  const before = (await report()).total;

  let r = await post("remind_signup", { email: "not-an-email" });
  ok(r.status === 400, "bad email is refused (JSON)", r.status);
  r = await post("remind_signup", { email: "bot@example.com", website: "http://spam" });
  ok(r.status === 200 && (await r.json()).ok === true, "honeypot answers ok");
  ok((await report()).total === before, "honeypot stores nothing");

  r = await post("remind_signup", { email: EMAIL.toUpperCase(), source: "test" });
  const j = await r.json();
  ok(r.status === 200 && j.ok === true, "JSON signup ok", j);
  let x = await row();
  ok(!!x && x.source === "test", "row stored, email lowercased", x);
  ok(!!x?.confirm_sent_at, "confirmation sent", x);
  const firstConfirm = x?.confirm_sent_at;

  r = await form("remind_signup", { email: EMAIL, next: "https://go.blslittleleague.org/bls/remind/", source: "page" });
  ok(r.status === 303 && r.headers.get("location") === "https://go.blslittleleague.org/bls/remind/?ok=1", "form post redirects to ?ok=1", [r.status, r.headers.get("location")]);
  x = await row();
  ok(x?.confirm_sent_at === firstConfirm, "repeat signup does not resend the confirmation");
  r = await form("remind_signup", { email: "nope", next: "https://evil.example/x" });
  ok(r.status === 303 && r.headers.get("location")?.startsWith("https://go.blslittleleague.org/bls/remind/?err="), "bad next falls back to our page with an error", r.headers.get("location"));

  r = await fetch(`${GW}?action=remind_unsub&t=${encodeURIComponent(x.unsub_token)}`, { redirect: "manual" });
  ok(r.status === 303 && r.headers.get("location") === "https://go.blslittleleague.org/bls/remind/?gone=1", "unsubscribe redirects to ?gone=1");
  x = await row();
  ok(!!x?.unsubscribed_at, "row marked unsubscribed");

  r = await post("remind_signup", { email: EMAIL });
  x = await row();
  ok(r.status === 200 && x && !x.unsubscribed_at, "re-signup clears unsubscribe");
  ok(x?.confirm_sent_at && x.confirm_sent_at !== firstConfirm, "re-signup sends a fresh confirmation");

  r = await post("remind_send", {}, { "x-cron-key": "wrong" });
  ok(r.status === 401, "remind_send refuses a wrong key");
  r = await post("remind_send", { test_to: EMAIL }, { "x-admin-pin": PIN });
  const t = await r.json();
  ok(r.status === 200 && t.ok === true && t.test === true, "admin sample reminder sends", t);
  x = await row();
  ok(!x?.reminder_sent_at, "sample send leaves rows untouched");

  r = await fetch(`${GW}?action=remind_report`);
  ok(r.status === 401, "report needs the PIN");
  const rep = await report();
  ok(typeof rep.total === "number" && Array.isArray(rep.rows), "report shape", Object.keys(rep));
} finally {
  const d = await (await post("remind_delete", { email: EMAIL }, { "x-admin-pin": PIN })).json();
  ok(d.ok === true, "test row removed");
  const left = await row();
  ok(!left, "no test data left behind");
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
