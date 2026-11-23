// Offline test of the BLS registration reminder mail (supabase/functions/bls-gateway/remind.ts): copy, date switches,
// send order (league Gmail first, Resend only as a per-message backup) and bulk pacing. Sends nothing.
// Run: node tests/bls-remind-mail.test.mjs
import fs from "node:fs";
import { stripTypeScriptTypes } from "node:module";

const dir = new URL("../supabase/functions/bls-gateway/", import.meta.url);
const src = fs.readFileSync(new URL("remind.ts", dir), "utf8");
const gw = fs.readFileSync(new URL("index.ts", dir), "utf8");
const M = await import("data:text/javascript;base64," + Buffer.from(stripTypeScriptTypes(src)).toString("base64"));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log("ok  ", m); } else { fail++; console.log("FAIL", m, extra === undefined ? "" : JSON.stringify(extra).slice(0, 300)); } };
const all = (m) => [m.subject, m.text, m.html, JSON.stringify(m.headers)].join("\n");
const DASH = /[\u2012\u2013\u2014\u2015]|&mdash;|&ndash;|&#821[12];/;
const T = (iso) => Date.parse(iso);
const REG = "https://www.blslittleleague.org/Default.aspx?tabid=716844", INFO = "https://www.blslittleleague.org/Default.aspx?tabid=716841";

// ---- the Nov 27 reminder ----
const r = M.reminderMsg("family@example.com", "tok123");
ok(r.subject === "BLS registration is open today", "reminder subject", r.subject);
ok(/registration is open now/i.test(r.text) && /registration is open now/i.test(r.html), "body says registration is open now");
ok(r.html.includes(`href="${REG}"`) && />Register now</.test(r.html) && r.text.includes(`Register now: ${REG}`), "Register now goes to 716844");
ok(r.html.includes(`href="${INFO}"`) && />Registration info</.test(r.html) && r.text.includes(`Registration info: ${INFO}`), "Registration info goes to 716841");
ok(/Black Friday sale through Sun, Nov 29: \$50 off per family/.test(r.text) && /Black Friday sale through Sun, Nov 29: \$50 off per family/.test(r.html), "Black Friday line");
ok(/Then Early Bird: \$25 off per family Nov 30 to Dec 31/.test(r.text) && /Then Early Bird: \$25 off per family Nov 30 to Dec 31/.test(r.html), "Early Bird line");
const imgs = [...r.html.matchAll(/<img[^>]+src="([^"]+)"/g)].map((x) => x[1]);
ok(imgs.length === 1 && /^https:\/\/(go|www)\.blslittleleague\.org\//.test(imgs[0]), "logo hosted on a league address", imgs);
ok(!/coachpilot/i.test(all(r)), "no CoachPilot anywhere in the rendered reminder");
ok(!/coachpilot/i.test(M.LEAGUE_FROM) && M.LEAGUE_FROM === "BLS Little League <website@blslittleleague.org>", "league From line");
ok(!DASH.test(all(r)), "no em or en dashes in the reminder");
const unsub = `${M.GW}?action=remind_unsub&t=tok123`;
ok(/You asked for this reminder\./.test(r.text) && /You asked for this reminder\./.test(r.html), "footer keeps 'You asked for this reminder.'");
ok(r.html.includes(`href="${unsub}"`) && r.text.includes(unsub), "per-recipient remove link in the body");
ok(r.headers["List-Unsubscribe"] === `<${unsub}>`, "List-Unsubscribe header kept");
ok(!/one message|one email|one-time|one reminder|only email/i.test(all(r)), "no single-email wording in the reminder");

// ---- confirmation date switch ----
const before = M.confirmMsg("family@example.com", "tok9", T("2026-11-27T07:59:59Z"));
const open = M.confirmMsg("family@example.com", "tok9", T("2026-11-27T08:00:00Z"));
const early = M.confirmMsg("family@example.com", "tok9", T("2026-11-30T09:00:00Z"));
const full = M.confirmMsg("family@example.com", "tok9", T("2027-01-02T09:00:00Z"));
ok(before.subject === "You're on the list for BLS registration day" && /opens Friday, November 27\. We'll email you that morning\./.test(before.text), "before Nov 27 08:00Z: registration day confirmation unchanged");
ok(open.subject === "You're on the list for BLS league reminders" && /on the list for future BLS league reminders/.test(open.text) && /on the list for future BLS league reminders/.test(open.html), "from Nov 27 08:00Z: on the list for future BLS league reminders");
ok(!/We'll email you that morning/.test(open.text) && /registration is open now/i.test(open.text) && open.html.includes(`href="${REG}"`), "open confirmation points to Register now");
ok(/Black Friday sale through Sun, Nov 29/.test(open.text) && /Early Bird: \$25 off per family through Dec 31/.test(early.text) && !/Black Friday/.test(early.text), "confirmation sale line follows the date");
ok(!/Black Friday|Early Bird|\$\d+ off/.test(full.text + full.html), "no sale line from Jan 1, 2027");
for (const [n, m] of [["before", before], ["open", open], ["early", early], ["full", full]]) {
  ok(!/coachpilot/i.test(all(m)) && !DASH.test(all(m)), `confirmation (${n}): no CoachPilot, no dashes`);
  ok(!/one message|one email|one-time|one reminder|only email/i.test(all(m)), `confirmation (${n}): no single-email wording`);
  ok(m.headers["List-Unsubscribe"] === `<${M.GW}?action=remind_unsub&t=tok9>` && m.html.includes("remove your email"), `confirmation (${n}): remove link and List-Unsubscribe`);
}

// ---- send order: Gmail first, Resend per message only when Gmail fails ----
const msg = M.reminderMsg("x@example.com", "t");
const noSleep = async () => {};
const mk = (results) => { const calls = []; const f = async (m) => { calls.push(m); const r = results.shift(); if (r instanceof Error) throw r; return r; }; f.calls = calls; return f; };
let logs = [];
const log = (l) => logs.push(l);

let g = mk([{ ok: true, id: "g1" }]), rs = mk([{ ok: true, id: "r1" }]);
let out = await M.sendLeagueFirst(msg, g, rs, { log, sleep: noSleep, tag: "row=1" });
ok(out.ok && out.path === "gmail" && out.id === "g1" && g.calls.length === 1 && rs.calls.length === 0, "Gmail takes it: Resend never called", out);
ok(logs.length === 1 && /\[bls-mail\] row=1 path=gmail/.test(logs[0]) && !/x@example\.com/.test(logs[0]), "logs path=gmail, not the address", logs);

logs = []; g = mk([{ ok: false, status: 400 }]); rs = mk([{ ok: true, id: "r2" }]);
out = await M.sendLeagueFirst(msg, g, rs, { log, sleep: noSleep, tag: "row=2" });
ok(out.ok && out.path === "resend" && g.calls.length === 1 && rs.calls.length === 1, "Gmail refuses: this message falls back to Resend", out);
ok(/path=resend gmail_status=400/.test(logs[0]), "logs path=resend with the Gmail status", logs);

logs = []; g = mk([{ ok: false }]); rs = mk([{ ok: true, id: "r3" }]);
out = await M.sendLeagueFirst(msg, g, rs, { log, sleep: noSleep });
ok(out.path === "resend" && /gmail_status=no-token/.test(logs[0]), "no Gmail token: Resend backup", logs);

logs = []; g = mk([new Error("network")]); rs = mk([{ ok: true, id: "r4" }]);
out = await M.sendLeagueFirst(msg, g, rs, { log, sleep: noSleep });
ok(out.path === "resend", "Gmail throws: Resend backup");

logs = []; g = mk([{ ok: false, status: 429 }, { ok: true, id: "g5" }]); rs = mk([{ ok: true }]);
out = await M.sendLeagueFirst(msg, g, rs, { log, sleep: noSleep });
ok(out.path === "gmail" && g.calls.length === 2 && rs.calls.length === 0, "Gmail rate limit: one retry on Gmail before any fallback", out);

logs = []; g = mk([{ ok: false, status: 503 }, { ok: false, status: 503 }]); rs = mk([{ ok: false, status: 429 }, { ok: false, status: 429 }]);
out = await M.sendLeagueFirst(msg, g, rs, { log, sleep: noSleep });
ok(!out.ok && out.path === "none" && /path=none gmail_status=503 resend_status=429/.test(logs[0]), "both fail: reported as path=none", logs);

g = mk([{ ok: true }]); rs = mk([]);
await M.sendLeagueFirst(msg, g, rs, { log: () => {}, sleep: noSleep });
ok(g.calls[0] === msg, "Gmail gets the same message object (subject, body, List-Unsubscribe header)");

// ---- the gateway wires reminder and confirmation through leagueSend ----
ok(/leagueSend\(confirmMsg\(/.test(gw) && /leagueSend\(reminderMsg\(String\(b\.test_to\)/.test(gw) && /leagueSend\(reminderMsg\(r\.email, r\.unsub_token\)/.test(gw), "confirmation, test send and bulk send all use leagueSend");
ok(!/resendSend\((confirmMsg|reminderMsg)/.test(gw), "no reminder mail left on the Resend-first path");
ok(/sendLeagueFirst\(msg as any, gmailSend,/.test(gw), "leagueSend passes Gmail as the first sender");
ok(/`From: \$\{LEAGUE_FROM\}`/.test(gw) && /`Reply-To: \$\{BLS_REPLY_TO\}`/.test(gw) && /const BLS_REPLY_TO = LEAGUE_ADDR;/.test(gw), "Gmail From and Reply-To are website@blslittleleague.org");
const testAt = gw.indexOf("if (isAdmin && b.test_to)"), returnAt = gw.indexOf("return json({ ok: r.ok, id: r.id, test: true", testAt), selectAt = gw.indexOf('.from("bls_reg_reminders").select("id, email, unsub_token")');
ok(testAt > 0 && returnAt > testAt && selectAt > returnAt && !gw.slice(testAt, returnAt).includes("bls_reg_reminders"), "test_to returns before any list row is read or written");
ok(!/coachpilot\.org/i.test(src), "remind.ts has no coachpilot.org address or link");

// ---- bulk pacing: 130 rows inside the function time limit ----
{
  let t = 0, inflight = 0, maxInflight = 0, marked = 0;
  const rows = Array.from({ length: 130 }, (_, i) => ({ id: i }));
  const res = await M.sendInBatches(rows,
    async () => { inflight++; maxInflight = Math.max(maxInflight, inflight); await new Promise((r) => setImmediate(r)); inflight--; return true; },
    async (went) => { marked += went.length; t += 100; },
    { now: () => t, sleep: async (ms) => { t += ms; } });
  ok(res.sent === 130 && res.failed === 0 && res.not_tried === 0 && marked === 130, "130 rows all sent and marked", res);
  ok(maxInflight <= M.BATCH_SIZE && maxInflight > 1, `at most ${M.BATCH_SIZE} sends in flight at once`, maxInflight);
  ok(res.ms < M.BUDGET_MS && res.ms <= Math.ceil(130 / M.BATCH_SIZE) * M.BATCH_MS, `130 rows paced in ${(res.ms / 1000).toFixed(1)} s (budget ${M.BUDGET_MS / 1000} s)`, res.ms);
  ok(M.BUDGET_MS + 2 * (2 * M.SEND_TIMEOUT_MS + 1000) < 150_000, "budget plus one worst-case batch stays under the 150 s function limit");
}
{
  let t = 0;
  const rows = Array.from({ length: 130 }, (_, i) => ({ id: i }));
  const res = await M.sendInBatches(rows, async () => { t += 20_000; return true; }, async () => {}, { now: () => t, sleep: async (ms) => { t += ms; } });
  ok(res.not_tried > 0 && res.sent + res.not_tried === 130, "slow sends: stops at the time budget and reports the rest as not tried", res);
}
{
  let t = 0; const marked = [];
  const rows = Array.from({ length: 7 }, (_, i) => ({ id: i }));
  const res = await M.sendInBatches(rows, async (r) => r.id % 2 === 0, async (went) => { marked.push(...went.map((x) => x.id)); }, { now: () => t, sleep: async (ms) => { t += ms; } });
  ok(res.sent === 4 && res.failed === 3 && marked.join() === "0,2,4,6", "only rows that went out are marked sent", { res, marked });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
