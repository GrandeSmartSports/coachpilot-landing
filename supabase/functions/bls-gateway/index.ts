// bls-gateway: BLS Little League board tools. Website review form: no sign-in, reviewer types a name and clicks Send.
// Table: bls_review_responses (CoachPilot project, bls_ prefix). Admin report behind the BLS board admin code (stored in the database).
import { createClient } from "jsr:@supabase/supabase-js@2";

const REVIEWS: Record<string, { title: string; items: number; url: string; names: string[] }> = {
  "website-updates-2026": {
    title: "BLS Website Updates", items: 16, url: "https://coachpilot.org/bls/website-updates",
    names: ["Home page news", "Calendar", "Fan Store slide", "Sudden Cardiac Arrest menu", "Safety Plan menu link", "Sponsor logo links", "Social media icons", "Fall Ball page",
      "Between-season pages", "Cleared volunteer list", "Coaches Corner", "Health & Safety heading", "All-Stars page", "Forms", "Corporate Match page", "FAQ question"],
  },
};
const ACCT_KEYS = ["instagram", "youtube", "twitter", "flickr"];
const DECISIONS = ["", "approve", "discuss"];
const NOTIFY_TO = "website@blslittleleague.org";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
// The admin code lives in the database (bls_board_settings.admin_pin, shared with the BLS build board), never in this public repo.
async function adminCode(): Promise<string> {
  const { data } = await db.from("bls_board_settings").select("value").eq("key", "admin_pin").maybeSingle();
  return String(data?.value ?? "");
}
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

function clean(raw: any, count: number) {
  const out: any = { items: {}, accounts: {}, general: clip(raw?.general, 4000).trim() };
  for (let i = 1; i <= count; i++) {
    const k = String(i); const it = raw?.items?.[k] || {};
    const d = DECISIONS.includes(it.d) ? it.d : "";
    const note = clip(it.note, 4000).trim();
    if (d || note) out.items[k] = { d, note };
  }
  for (const a of ACCT_KEYS) { const u = clip(raw?.accounts?.[a], 500).trim(); if (u) out.accounts[a] = u; }
  return out;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function emailCoach(review: string, name: string, data: any): Promise<boolean> {
  const meta = REVIEWS[review];
  const vals = Object.values(data.items) as any[];
  const approved = vals.filter((x) => x.d === "approve").length;
  const discuss = vals.filter((x) => x.d === "discuss").length;
  const unmarked = meta.items - approved - discuss;
  const summary = `${approved} approved, ${discuss} to discuss, ${unmarked} not marked`;
  const text: string[] = [`${name} reviewed ${meta.title}.`, summary, ""];
  const rows: string[] = [];
  const tag = (d: string) => d === "approve"
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#1452a0;color:#fff;font:700 12px/1.2 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.04em">APPROVED</span>`
    : d === "discuss"
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#cd163f;color:#fff;font:700 12px/1.2 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.04em">DISCUSS</span>`
    : `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#e2e5e8;color:#555;font:700 12px/1.2 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.04em">NOT MARKED</span>`;
  for (let i = 1; i <= meta.items; i++) {
    const it = data.items[String(i)] || { d: "", note: "" };
    const label = it.d === "approve" ? "Approved" : it.d === "discuss" ? "Discuss" : "Not marked";
    text.push(`${i}. ${meta.names[i - 1]}: ${label}${it.note ? ". " + it.note : ""}`);
    rows.push(`<tr><td style="padding:12px 0;border-top:1px solid #e2e5e8;vertical-align:top;width:28px;font:700 16px/1.3 -apple-system,Helvetica,Arial,sans-serif;color:#cd163f">${i}</td>
      <td style="padding:12px 0;border-top:1px solid #e2e5e8;vertical-align:top;font:600 16px/1.3 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${esc(meta.names[i - 1])}
      ${it.note ? `<div style="margin-top:4px;font:400 15px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#555">${esc(it.note)}</div>` : ""}</td>
      <td style="padding:12px 0 12px 8px;border-top:1px solid #e2e5e8;vertical-align:top;text-align:right;white-space:nowrap">${tag(it.d)}</td></tr>`);
  }
  const acc = Object.entries(data.accounts || {}) as [string, string][];
  const extra: string[] = [];
  if (acc.length) { text.push("", "BLS accounts: " + acc.map(([a, u]) => `${a} ${u}`).join(", ")); extra.push(`<p style="margin:18px 0 0;font:600 13px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7279">BLS accounts</p>` + acc.map(([a, u]) => `<p style="margin:6px 0 0;font:400 15px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${esc(a)}: ${esc(u)}</p>`).join("")); }
  if (data.general) { text.push("", "General notes: " + data.general); extra.push(`<p style="margin:18px 0 0;font:600 13px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7279">General notes</p><p style="margin:6px 0 0;font:400 15px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${esc(data.general)}</p>`); }
  text.push("", `Sent from ${meta.url}`);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f6"><div style="max-width:600px;margin:0 auto;padding:16px">
<div style="background:#fff;border-radius:14px 14px 0 0;border-top:5px solid #cd163f;padding:18px 22px 14px">
  <img src="https://coachpilot.org/bls/assets/bls-logo.png" width="72" height="72" border="0" alt="BLS Little League" style="display:block;width:72px;height:72px;margin:0 0 10px">
  <div style="font:700 11px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#cd163f">Bonney Lake Sumner Little League</div>
  <div style="margin-top:4px;font:800 22px/1.15 -apple-system,Helvetica,Arial,sans-serif;color:#00013a">${esc(meta.title)}</div>
  <div style="margin-top:4px;font:400 15px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#5f6b7a">Review from <strong style="color:#1a1f26">${esc(name)}</strong></div>
</div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:6px 22px 22px;border-top:1px solid #dde3ea">
  <p style="margin:0 0 6px;font:600 16px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${summary}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.join("")}</table>
  ${extra.join("")}
  <p style="margin:22px 0 0;font:400 13px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#6b7279">Sent from <a href="${meta.url}" style="color:#1452a0">${meta.url.replace("https://", "")}</a></p>
</div></div></body></html>`;
  return (await resendSend({ to: [NOTIFY_TO], subject: `BLS website review from ${name}: ${summary}`, text: text.join("\n"), html })).ok;
}

// ---------- Registration-day reminders (table bls_reg_reminders) ----------
// A family leaves an email on the Registration page (or go.blslittleleague.org/bls/remind/), gets one confirmation
// now and one email the morning registration opens. pg_cron calls remind_send on Nov 27 with x-cron-key.
const GW = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-gateway";
const REMIND_PAGE = "https://go.blslittleleague.org/bls/remind/";
const REGISTER_URL = "https://www.blslittleleague.org/Default.aspx?tabid=716844";
const REG_INFO_URL = "https://www.blslittleleague.org/Default.aspx?tabid=716841";
const BLS_REPLY_TO = "website@blslittleleague.org";
const OPEN_DAY = "Friday, November 27";
const SIGNUP_IP_HOURLY = 6;

const emailOk = (e: string) => e.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e);
async function settingValue(key: string): Promise<string> {
  const { data } = await db.from("bls_board_settings").select("value").eq("key", key).maybeSingle();
  return String(data?.value ?? "");
}
async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "";
  const salt = await settingValue("cron_key");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip + "|" + salt));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}
const F = "-apple-system,Helvetica,Arial,sans-serif";
function blsEmail(title: string, lead: string, ctaText: string, ctaUrl: string, foot: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f6"><div style="max-width:560px;margin:0 auto;padding:16px">
<div style="background:#fff;border-radius:14px;border-top:5px solid #cd163f;padding:22px 22px 24px">
  <img src="https://coachpilot.org/bls/assets/bls-logo.png" width="64" height="64" border="0" alt="BLS Little League" style="display:block;width:64px;height:64px;margin:0 0 10px">
  <div style="font:700 11px/1.3 ${F};letter-spacing:.2em;text-transform:uppercase;color:#cd163f">Bonney Lake Sumner Little League</div>
  <div style="margin-top:6px;font:800 24px/1.15 ${F};color:#00013a">${title}</div>
  <p style="margin:12px 0 0;font:400 16px/1.5 ${F};color:#1f2326">${lead}</p>
  <p style="margin:20px 0 0"><a href="${ctaUrl}" style="display:inline-block;background:#cd163f;color:#fff;text-decoration:none;font:700 16px/1 ${F};padding:14px 22px;border-radius:999px">${ctaText}</a></p>
  <p style="margin:22px 0 0;font:400 13px/1.5 ${F};color:#6b7279">${foot}</p>
</div></div></body></html>`;
}
// Preferred path (Coach 11/5: league email must outlive any one person): Gmail API as website@blslittleleague.org,
// via a refresh token from the league's own Google Cloud project (bls-website-email). Falls back to Resend if unset.
const GM = { id: Deno.env.get("BLS_GMAIL_CLIENT_ID") || "", secret: Deno.env.get("BLS_GMAIL_CLIENT_SECRET") || "", refresh: Deno.env.get("BLS_GMAIL_REFRESH_TOKEN") || "", user: Deno.env.get("BLS_GMAIL_USER") || "website@blslittleleague.org" };
let gmTok: { token: string; exp: number } | null = null;
async function gmailToken(): Promise<string | null> {
  if (gmTok && gmTok.exp > Date.now() + 60_000) return gmTok.token;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GM.id, client_secret: GM.secret, refresh_token: GM.refresh, grant_type: "refresh_token" }) }).catch(() => null);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) return null;
  gmTok = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return gmTok.token;
}
const b64url = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const encWord = (s: string) => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;
async function gmailSend(msg: Record<string, unknown>): Promise<{ ok: boolean; id?: string }> {
  const tok = await gmailToken();
  if (!tok) return { ok: false };
  const to = (msg.to as string[]).join(", ");
  const bnd = "b" + crypto.randomUUID().replace(/-/g, "");
  const extra = Object.entries((msg.headers as Record<string, string>) || {}).map(([k, v]) => `${k}: ${v}`);
  const mime = [
    `From: BLS Little League <${GM.user}>`, `To: ${to}`, `Reply-To: ${BLS_REPLY_TO}`, `Subject: ${encWord(String(msg.subject || ""))}`, "MIME-Version: 1.0", ...extra,
    `Content-Type: multipart/alternative; boundary="${bnd}"`, "",
    `--${bnd}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", btoa(unescape(encodeURIComponent(String(msg.text || "")))),
    `--${bnd}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", btoa(unescape(encodeURIComponent(String(msg.html || "")))),
    `--${bnd}--`, "",
  ].join("\r\n");
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw: b64url(mime) }) }).catch(() => null);
  if (!res || !res.ok) return { ok: false };
  const j = await res.json().catch(() => ({}));
  return { ok: true, id: j?.id };
}
async function resendSend(msg: Record<string, unknown>): Promise<{ ok: boolean; id?: string }> {
  // BLS mail only leaves through website@ (Coach 11/5): no outside-domain fallback
  return await gmailSend(msg);
}
function unsubUrl(token: string) { return `${GW}?action=remind_unsub&t=${encodeURIComponent(token)}`; }
function confirmMsg(to: string, token: string) {
  const u = unsubUrl(token);
  return {
    to: [to], subject: "You're on the list for BLS registration day", headers: { "List-Unsubscribe": `<${u}>` },
    text: `Spring 2027 registration opens ${OPEN_DAY}. We'll email you that morning.\n\nBlack Friday sale Nov 27 to 29: $50 off per family. Early Bird Nov 30 to Dec 31: $25 off per family.\n\nRegistration info: ${REG_INFO_URL}\n\nDidn't sign up for this? Ignore it, or remove your email here: ${u}`,
    html: blsEmail("You're on the list", `Spring 2027 registration opens <b>${OPEN_DAY}</b>. We'll email you that morning.<br><br>Black Friday sale Nov 27 to 29: $50 off per family. Early Bird Nov 30 to Dec 31: $25 off per family.`,
      "Registration info", REG_INFO_URL, `Didn't sign up for this? Ignore it, or <a href="${u}" style="color:#1452a0">remove your email</a>.`),
  };
}
function reminderMsg(to: string, token: string) {
  const u = unsubUrl(token);
  return {
    to: [to], subject: "BLS registration is open today", headers: { "List-Unsubscribe": `<${u}>` },
    text: `Spring 2027 registration for Bonney Lake Sumner Little League opens today.\n\nBlack Friday sale through Sunday, Nov 29: $50 off per family.\n\nRegister: ${REGISTER_URL}\nRegistration info: ${REG_INFO_URL}\n\nYou asked for this one-time reminder. Remove your email: ${u}`,
    html: blsEmail("Registration is open today", `Spring 2027 registration for Bonney Lake Sumner Little League opens today.<br><br><b>Black Friday sale through Sunday, Nov 29: $50 off per family.</b>`,
      "Register now", REGISTER_URL, `You asked for this one-time reminder. <a href="${REG_INFO_URL}" style="color:#1452a0">Registration info</a> &middot; <a href="${u}" style="color:#1452a0">Remove your email</a>`),
  };
}
async function readBody(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) { const j = await req.json().catch(() => ({})); return Object.fromEntries(Object.entries(j || {}).map(([k, v]) => [k, String(v ?? "")])); }
  const t = await req.text().catch(() => "");
  return Object.fromEntries(new URLSearchParams(t).entries());
}
const redirect = (to: string) => new Response(null, { status: 303, headers: { ...cors, Location: to } });
const safeNext = (n: string) => (n.startsWith("https://go.blslittleleague.org/") || n.startsWith("https://www.blslittleleague.org/")) ? n.split("#")[0].split("?")[0] : REMIND_PAGE;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  try {
    if (action === "remind_signup" && req.method === "POST") {
      const b = await readBody(req);
      const wantsJson = (req.headers.get("content-type") || "").includes("application/json");
      const next = safeNext(String(b.next || ""));
      const fail = (msg: string, code = 400) => wantsJson ? json({ error: msg }, code) : redirect(`${next}?err=${encodeURIComponent(msg)}`);
      const email = String(b.email || "").trim().toLowerCase();
      if (String(b.website || "").trim()) return wantsJson ? json({ ok: true }) : redirect(`${next}?ok=1`); // honeypot: pretend
      if (!emailOk(email)) return fail("Please enter a valid email address.");
      const hash = await ipHash(req);
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await db.from("bls_reg_reminders").select("id", { count: "exact", head: true }).eq("ip_hash", hash).gte("created_at", since);
      if ((count || 0) >= SIGNUP_IP_HOURLY) return wantsJson ? json({ ok: true }) : redirect(`${next}?ok=1`); // quiet cap
      const { data: existing } = await db.from("bls_reg_reminders").select("id, unsub_token, confirm_sent_at, unsubscribed_at").eq("email_key", email).maybeSingle();
      let token = existing?.unsub_token as string | undefined;
      if (!existing) {
        const { data: row, error } = await db.from("bls_reg_reminders").insert({ email, email_key: email, source: clip(b.source, 40) || "page", ip_hash: hash }).select("unsub_token").single();
        if (error || !row) return fail("Could not save that. Please try again.", 500);
        token = row.unsub_token;
      } else if (existing.unsubscribed_at) {
        await db.from("bls_reg_reminders").update({ unsubscribed_at: null, confirm_sent_at: null, reminder_sent_at: null, source: clip(b.source, 40) || "page" }).eq("id", existing.id);
      }
      if (!existing || existing.unsubscribed_at || !existing.confirm_sent_at) {
        const sent = await resendSend(confirmMsg(email, token!));
        if (sent.ok) await db.from("bls_reg_reminders").update({ confirm_sent_at: new Date().toISOString() }).eq("email_key", email);
      }
      return wantsJson ? json({ ok: true }) : redirect(`${next}?ok=1`);
    }
    if (action === "remind_unsub") {
      const t = url.searchParams.get("t") || "";
      if (t) await db.from("bls_reg_reminders").update({ unsubscribed_at: new Date().toISOString() }).eq("unsub_token", t).is("unsubscribed_at", null);
      return redirect(`${REMIND_PAGE}?gone=1`);
    }
    if (action === "remind_send" && req.method === "POST") {
      const pin = req.headers.get("x-admin-pin") || "", ck = req.headers.get("x-cron-key") || "";
      const [code, cronKey] = await Promise.all([adminCode(), settingValue("cron_key")]);
      const isAdmin = !!code && pin === code, isCron = !!cronKey && ck === cronKey;
      if (!isAdmin && !isCron) return json({ error: "Not allowed" }, 401);
      const b = await readBody(req);
      if (isAdmin && b.test_to) { // sample to one inbox, rows untouched
        if (!emailOk(String(b.test_to))) return json({ error: "Bad test_to" }, 400);
        const r = await resendSend(reminderMsg(String(b.test_to).toLowerCase(), "test"));
        return json({ ok: r.ok, id: r.id, test: true });
      }
      const { data: rows } = await db.from("bls_reg_reminders").select("id, email, unsub_token").is("reminder_sent_at", null).is("unsubscribed_at", null).order("created_at").limit(500);
      let sent = 0, failed = 0;
      for (const r of rows || []) {
        const res = await resendSend(reminderMsg(r.email, r.unsub_token));
        if (res.ok) { sent++; await db.from("bls_reg_reminders").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id); } else failed++;
        await new Promise((ok) => setTimeout(ok, 550)); // Resend default rate: 2 requests per second
      }
      return json({ ok: true, sent, failed, remaining: Math.max(0, (rows || []).length - sent - failed) });
    }
    if (action === "remind_delete" && req.method === "POST") { // admin: honor a removal request, or clear a test row
      const pin = req.headers.get("x-admin-pin") || "";
      const code = await adminCode();
      if (!code || pin !== code) return json({ error: "Wrong PIN" }, 401);
      const b = await readBody(req);
      const email = String(b.email || "").trim().toLowerCase();
      if (!emailOk(email)) return json({ error: "Bad email" }, 400);
      const { error } = await db.from("bls_reg_reminders").delete().eq("email_key", email);
      return json({ ok: !error });
    }
    if (action === "remind_report") {
      const pin = req.headers.get("x-admin-pin") || "";
      const code = await adminCode();
      if (!code || pin !== code) return json({ error: "Wrong PIN" }, 401);
      const { data: rows } = await db.from("bls_reg_reminders").select("email, source, created_at, confirm_sent_at, reminder_sent_at, unsubscribed_at, unsub_token").order("created_at", { ascending: false }).limit(2000);
      const all = rows || [];
      return json({ total: all.length, active: all.filter((r) => !r.unsubscribed_at).length, reminded: all.filter((r) => r.reminder_sent_at).length, unsubscribed: all.filter((r) => r.unsubscribed_at).length, rows: all });
    }
    if (action === "review_submit" && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const review = String(body.review || "");
      if (!REVIEWS[review]) return json({ error: "Unknown review" }, 400);
      const name = clip(body.name, 80).replace(/\s+/g, " ").trim();
      if (name.length < 2) return json({ error: "Please enter your name first." }, 400);
      const data = clean(body.data, REVIEWS[review].items);
      if (!Object.keys(data.items).length && !data.general && !Object.keys(data.accounts).length) return json({ error: "Nothing to send yet. Mark at least one item or add a note." }, 400);
      const name_key = name.toLowerCase();
      const { error } = await db.from("bls_review_responses").upsert({ review, name_key, reviewer_name: name, data, updated_at: new Date().toISOString() }, { onConflict: "review,name_key" });
      if (error) return json({ error: "Could not send. Please try again." }, 500);
      const emailed = await emailCoach(review, name, data);
      return json({ ok: true, emailed });
    }
    if (action === "review_report") {
      const pin = req.headers.get("x-admin-pin") || "";
      const code = await adminCode();
      if (!code || pin !== code) return json({ error: "Wrong PIN" }, 401);
      const review = url.searchParams.get("review") || "website-updates-2026";
      const { data: rows } = await db.from("bls_review_responses").select("reviewer_name, data, updated_at").eq("review", review).order("updated_at", { ascending: false });
      return json({ review, responses: (rows || []).map((r) => ({ name: r.reviewer_name, data: r.data, updated_at: r.updated_at })) });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
