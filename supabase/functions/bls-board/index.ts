// bls-board: BLS Website Build board (spec ~/Workspace/ops/bls-website/board-hub-spec.md, 2026-11-03).
// One shared link for everyone. No sign-in, no tokens: people pick a name from the roster (bls_board_people)
// or type one. Daniel (admin) sends his PIN in x-admin-pin. The PIN is read from bls_board_settings key admin_pin
// (rotate by updating that row). Give it its own long PIN: never reuse a PIN that appears anywhere in this public
// repo. Wrong PINs are rate limited (10 per IP and 30 overall per 15 minutes, then 429 even for the right PIN).
// Cron calls tick with x-cron-key (bls_board_settings key cron_key).
// Deploy: supabase functions deploy bls-board --project-ref geigvuysptjvvqanumld --no-verify-jwt
// Tables: bls_board_pages, bls_board_phases, bls_board_people, bls_board_items, bls_board_events,
// bls_board_settings (RLS on, no policies: this function is the only reader and writer).
// Page states (Coach 11/4): Building, Waiting on info, Board review (the 48 hour countdown), On hold (a concern paused the
// clock), Scheduled for deployment (the clock ran out), Live. The running clock lives in ready_deadline (Board review only);
// a frozen clock lives in hold_remaining_ms (On hold only).
// Addendum 11/4: each page has reviewers (roster names) and asks ([{text, people}]). Public "What's new" is only
// page_update events (Daniel's plain-words notes, admin_update) and live events; every other event kind is admin only
// and comes back to Daniel as `activity`.
import { createClient } from "jsr:@supabase/supabase-js@2";

const H = 3600 * 1000;
const H24 = 24 * H;
const H48 = 48 * H;
const STATES = ["building", "waiting", "review", "hold", "scheduled", "live"] as const;
const STATE_LABEL: Record<string, string> = {
  building: "Building", waiting: "Waiting on info", review: "Board review",
  hold: "On hold", scheduled: "Scheduled for deployment", live: "Live",
};
const KINDS = ["comment", "suggestion", "concern", "approve", "help", "private"];
const STATUSES = ["open", "resolved", "accepted", "declined"];
const STATUS_LABEL: Record<string, string> = { open: "Reopened", resolved: "Resolved", accepted: "Will change", declined: "Keep as is" };
const EMAIL_KINDS = ["comment", "concern", "suggestion", "private", "help"]; // Coach 11/5: every piece of board feedback emails him right away (approvals too, see toggleApproval)
const ADMIN_NAME = "Daniel (Website)";
const ADMIN_ROLE = "Website";
const NOTIFY_TO = "danielgrande0326@gmail.com";
const FROM = "BLS Website Build <noreply@coachpilot.org>";
const SITE = "https://go.blslittleleague.org/bls/preview/";
const LOGO = "https://go.blslittleleague.org/bls/assets/bls-logo.png";
const TZ = "America/Los_Angeles";
const DIGEST_HOUR = 18;
const MAX_LINKS = 5;
const RATE_MAX = 30;
const MAX_REQUEST = 20000;
const PIN_WINDOW = 15 * 60 * 1000;
const PIN_IP_MAX = 10;
const PIN_ALL_MAX = 30;
const EMAIL_HOUR_MAX = 20;
const ITEM_COLS = "id, slug, kind, body, author_name, author_role, is_admin, parent_id, variant, pin_x, pin_y, pin_w, req_item, status, resolution_note, hidden, created_at, resolved_at, emailed_at, to_board";
const PAGE_COLS = "slug, title, state, phase_id, ready_deadline, hold_remaining_ms, due_date, live_since, live_url, note, sort, updated_at, reviewers, asks";
const EVENT_COLS = "id, slug, kind, detail, actor, item_id, created_at";
// The only event kinds everyone sees. All others (state changes, countdowns, feedback activity) are admin only.
const PUBLIC_EVENTS = ["page_update", "live"];
const MAX_REVIEWERS = 30;
const MAX_ASKS = 10;
const UPDATE_MIN = 3;
const UPDATE_MAX = 280;
const ASK_MIN = 3;
const ASK_MAX = 200;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin, x-cron-key, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (status: number, error: string) => json({ ok: false, error }, status);
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const bad = (msg: string): never => { throw new HttpError(400, msg); };

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

type Page = {
  slug: string; title: string; state: string; phase_id: string | null; ready_deadline: string | null;
  hold_remaining_ms: number | null; due_date: string | null; live_since: string | null; live_url: string | null;
  note: string | null; sort: number; updated_at: string;
  reviewers: string[]; asks: Ask[];
};
type Ask = { text: string; people: string[] };
type Ev = { id: number; slug: string | null; kind: string; detail: string; actor: string; item_id: string | null; created_at: string };
type Item = {
  id: string; slug: string | null; kind: string; body: string; author_name: string; author_role: string | null;
  is_admin: boolean; parent_id: string | null; variant: string | null; pin_x: number | null; pin_y: number | null;
  pin_w: number | null; req_item: string | null; status: string; resolution_note: string | null; hidden: boolean;
  created_at: string; resolved_at: string | null; emailed_at: string | null;
  to_board?: boolean | null;
};

// ---------- small helpers ----------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const oneLine = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "");
// Body text: drop bidi overrides and control characters (keeps new lines, tabs and emoji joiners).
const multiLine = (v: unknown) =>
  (typeof v === "string" ? v.replace(/\r\n?/g, "\n").replace(/[‪-‮⁦-⁩]/g, "").replace(/[^\P{Cc}\n\t]/gu, "").trim() : "");
// Names and roles: NFKC (full-width letters become plain ones), no invisible format or control characters.
const cleanLabel = (v: unknown) =>
  (typeof v === "string" ? v.normalize("NFKC").replace(/\p{Cc}/gu, " ").replace(/\p{Cf}/gu, "").replace(/\s+/g, " ").trim() : "");
// Lengths in characters (code points), the way Postgres char_length counts them.
const cpLen = (s: string) => [...s].length;
const cpSlice = (s: string, n: number) => [...s].slice(0, n).join("");
const nameKey = (n: string) => n.replace(/\s+/g, " ").trim().toLowerCase();
const isReservedName = (n: string) => /\(\s*website\s*\)/i.test(n) || /^daniel\s*\(/i.test(n);
// Constant-time compare for the PIN and the cron key.
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0, n = Math.max(x.length, y.length); i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
const isTestName = (n: string | null | undefined) => /^zztest/i.test(n || "");
const isTestSlug = (s: string | null | undefined) => /^zztest/.test(s || "");
const linkCount = (t: string) => (t.match(/https?:\/\/|www\./gi) || []).length;
const esc = (t: string) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const isoNow = () => new Date().toISOString();

function fmtDur(ms: number): string {
  if (ms <= 0) return "no time";
  const mins = Math.floor(ms / 60000);
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  const p = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return h ? `${p(d, "day")} ${p(h, "hour")}` : p(d, "day");
  if (h > 0) return m ? `${p(h, "hour")} ${p(m, "minute")}` : p(h, "hour");
  return m > 0 ? p(m, "minute") : "under a minute";
}

function pacific(d = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

// ---------- settings (cached briefly per instance) ----------
let settingsCache: { at: number; map: Record<string, string> } | null = null;
async function settings(fresh = false): Promise<Record<string, string>> {
  if (!fresh && settingsCache && Date.now() - settingsCache.at < 30000) return settingsCache.map;
  const { data, error } = await db.from("bls_board_settings").select("key, value");
  if (error) throw error;
  const map: Record<string, string> = {};
  for (const r of data || []) map[r.key] = r.value;
  settingsCache = { at: Date.now(), map };
  return map;
}
async function setSetting(key: string, value: string) {
  await db.from("bls_board_settings").upsert({ key, value }, { onConflict: "key" });
  settingsCache = null;
}

// ---------- wrong-PIN lockout ----------
// Per IP (in memory per instance) and overall (settings row pin_fail = "<window start ms>:<count>", updated with a
// compare-and-swap so instances agree). Past the limit, any request that sends a PIN gets 429 until the window ends.
const pinFails = new Map<string, number[]>();
function ipPinFails(ip: string, now = Date.now()): number[] {
  const arr = (pinFails.get(ip) || []).filter((t) => now - t < PIN_WINDOW);
  if (arr.length) pinFails.set(ip, arr); else pinFails.delete(ip);
  return arr;
}
function parseFail(v: string | null | undefined) {
  const m = /^(\d+):(\d+)$/.exec(v || "");
  return m ? { start: Number(m[1]), count: Number(m[2]) } : { start: 0, count: 0 };
}
async function pinLocked(ip: string): Promise<boolean> {
  if (ipPinFails(ip).length >= PIN_IP_MAX) return true;
  const { data } = await db.from("bls_board_settings").select("value").eq("key", "pin_fail").maybeSingle();
  const g = parseFail(data?.value);
  return g.count >= PIN_ALL_MAX && Date.now() - g.start < PIN_WINDOW;
}
async function recordPinFail(ip: string) {
  const now = Date.now();
  const arr = ipPinFails(ip, now);
  arr.push(now);
  pinFails.set(ip, arr);
  if (pinFails.size > 5000) for (const k of [...pinFails.keys()]) ipPinFails(k, now);
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await db.from("bls_board_settings").select("value").eq("key", "pin_fail").maybeSingle();
    if (!data) {
      const { error } = await db.from("bls_board_settings").insert({ key: "pin_fail", value: `${now}:1` });
      if (!error) return;
      continue;
    }
    const g = parseFail(data.value);
    const next = now - g.start >= PIN_WINDOW ? `${now}:1` : `${g.start}:${g.count + 1}`;
    const { data: upd } = await db.from("bls_board_settings").update({ value: next }).eq("key", "pin_fail").eq("value", data.value).select("key");
    if (upd?.length) return;
  }
}

// Returns true (valid PIN) or false (no PIN sent). A wrong PIN is 401; too many wrong PINs is 429.
async function adminFrom(req: Request): Promise<boolean> {
  const pin = req.headers.get("x-admin-pin") || "";
  if (!pin) return false;
  const ip = ipOf(req);
  if (await pinLocked(ip)) throw new HttpError(429, "Too many wrong PIN tries. Admin mode is locked for 15 minutes.");
  const s = await settings();
  if (s.admin_pin && sameSecret(pin, s.admin_pin)) return true;
  await recordPinFail(ip);
  throw new HttpError(401, "Wrong PIN.");
}
async function requireAdmin(req: Request) {
  const ok = await adminFrom(req);
  if (!ok) throw new HttpError(401, "Admin PIN required.");
}

// ---------- abuse guard: 30 posts per IP per hour (in memory per instance) ----------
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < H);
  if (arr.length >= RATE_MAX) { hits.set(ip, arr); return true; }
  arr.push(now);
  hits.set(ip, arr);
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > H) hits.delete(k);
  return false;
}
// The edge sets cf-connecting-ip (and x-real-ip to the same value). x-forwarded-for can be set by the client, so it is ignored.
const ipOf = (req: Request) => req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";

// ---------- data access ----------
async function getPage(slug: string): Promise<Page | null> {
  const { data, error } = await db.from("bls_board_pages").select(PAGE_COLS).eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data as Page | null;
}
async function getItem(id: string): Promise<Item | null> {
  if (!UUID.test(id)) return null;
  const { data, error } = await db.from("bls_board_items").select(ITEM_COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Item | null;
}
async function phaseName(id: string | null): Promise<string> {
  if (!id) return "";
  const { data } = await db.from("bls_board_phases").select("name").eq("id", id).maybeSingle();
  return data?.name || "";
}
async function event(slug: string | null, kind: string, detail: string, actor: string, item_id: string | null = null) {
  await db.from("bls_board_events").insert({ slug, kind, detail, actor, item_id });
}
async function updatePage(slug: string, patch: Partial<Page>): Promise<Page> {
  const { data, error } = await db.from("bls_board_pages").update({ ...patch, updated_at: isoNow() }).eq("slug", slug).select(PAGE_COLS).single();
  if (error) throw error;
  return data as Page;
}

function remainingOf(p: Page, now = Date.now()): number | null {
  if (p.state === "review" && p.ready_deadline) return Math.max(0, Date.parse(p.ready_deadline) - now);
  if (p.state === "hold") return p.hold_remaining_ms == null ? null : Number(p.hold_remaining_ms);
  return null;
}
const pageLabel = (p: { title: string } | null) => (p ? p.title : "Board discussion");

// ---------- email (Resend) ----------
async function sendEmail(subject: string, heading: string, lines: { label?: string; text: string }[], link: string): Promise<boolean> {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return false;
  const text = [heading, "", ...lines.map((l) => (l.label ? `${l.label}: ${l.text}` : l.text)), "", `Open the board: ${link}`].join("\n");
  const rows = lines.map((l) => (l.label
    ? `<p style="margin:16px 0 0;font:700 12px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7279">${esc(l.label)}</p><p style="margin:4px 0 0;font:400 16px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326;white-space:pre-wrap">${esc(l.text)}</p>`
    : `<p style="margin:12px 0 0;font:400 16px/1.5 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326;white-space:pre-wrap">${esc(l.text)}</p>`)).join("");
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f6"><div style="max-width:600px;margin:0 auto;padding:16px">
<div style="background:#fff;border-radius:14px 14px 0 0;border-top:5px solid #cd163f;padding:18px 22px 14px">
  <img src="${LOGO}" width="64" height="64" border="0" alt="BLS Little League" style="display:block;width:64px;height:64px;margin:0 0 10px">
  <div style="font:700 11px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.2em;text-transform:uppercase;color:#cd163f">BLS Website Build</div>
  <div style="margin-top:4px;font:800 21px/1.2 -apple-system,Helvetica,Arial,sans-serif;color:#00013a">${esc(heading)}</div>
</div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:4px 22px 22px;border-top:1px solid #dde3ea">
  ${rows}
  <p style="margin:22px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;border-radius:10px;background:#1452a0;color:#fff;text-decoration:none;font:700 15px/1.2 -apple-system,Helvetica,Arial,sans-serif">Open the board</a></p>
</div></div></body></html>`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [NOTIFY_TO], subject, text, html }),
    });
    return res.ok;
  } catch (_e) {
    return false;
  }
}
// ---------- replies to a board member (Coach 11/5: "I need a way to respond... let them know I saw it and it's fixed") ----------
// Goes out as website@blslittleleague.org through the league's own Gmail API project when the BLS_GMAIL_* secrets are
// set (same setup as bls-gateway), else from the Resend sender. Only when the member left an email in the picker.
const GM = { id: Deno.env.get("BLS_GMAIL_CLIENT_ID") || "", secret: Deno.env.get("BLS_GMAIL_CLIENT_SECRET") || "", refresh: Deno.env.get("BLS_GMAIL_REFRESH_TOKEN") || "", user: Deno.env.get("BLS_GMAIL_USER") || "website@blslittleleague.org" };
let gmTok: { token: string; exp: number } | null = null;
async function gmailToken(): Promise<string | null> {
  if (!(GM.id && GM.secret && GM.refresh)) return null;
  if (gmTok && gmTok.exp > Date.now() + 60_000) return gmTok.token;
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: GM.id, client_secret: GM.secret, refresh_token: GM.refresh, grant_type: "refresh_token" }) }).catch(() => null);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) return null;
  gmTok = { token: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return gmTok.token;
}
const b64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
async function sendTo(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const tok = await gmailToken();
  if (tok) {
    const bnd = "b" + crypto.randomUUID().replace(/-/g, "");
    const mime = [`From: BLS Little League <${GM.user}>`, `To: ${to}`, `Reply-To: ${GM.user}`, `Subject: =?UTF-8?B?${b64(subject)}?=`, "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${bnd}"`, "", `--${bnd}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(text),
      `--${bnd}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(html), `--${bnd}--`, ""].join("\r\n");
    const raw = b64(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) }).catch(() => null);
    if (res && res.ok) return true;
  }
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return false;
  const res = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "BLS Little League <noreply@coachpilot.org>", reply_to: GM.user, to: [to], subject, text, html }) }).catch(() => null);
  return !!(res && res.ok);
}
async function memberEmail(name: string | null): Promise<string | null> {
  if (!name) return null;
  const { data } = await db.from("bls_board_people").select("name, email").eq("active", true);
  const p = (data || []).find((x: { name: string; email: string | null }) => sameName(x.name, name) && x.email);
  return p ? String(p.email) : null;
}
// Daniel answered a member's note: one short email with their note, his words, and the page.
async function notifyAuthor(item: Item, answer: string): Promise<boolean> {
  if (isDaniel(item)) return false;
  const to = await memberEmail(item.author_name);
  if (!to) return false;
  const page = item.slug ? await getPage(item.slug) : null;
  const where = page ? page.title : "the BLS website";
  const first = String(item.author_name || "").split(" ")[0];
  const link = page ? `${SITE}${item.variant === "today" ? "today" : "proposed"}/${page.slug}.html` : SITE;
  const subject = `Daniel saw your note on ${where}`;
  const text = `${first},\n\nYour note on ${where}: "${item.body || ""}"\n\nDaniel: ${answer}\n\n${link}\n\nBLS Little League website`;
  const F = "-apple-system,Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f6"><div style="max-width:560px;margin:0 auto;padding:16px">
<div style="background:#fff;border-radius:14px;border-top:5px solid #cd163f;padding:22px 22px 24px">
  <img src="${LOGO}" width="56" height="56" border="0" alt="BLS Little League" style="display:block;width:56px;height:56px;margin:0 0 10px">
  <div style="font:700 11px/1.3 ${F};letter-spacing:.2em;text-transform:uppercase;color:#cd163f">BLS website</div>
  <div style="margin-top:6px;font:800 22px/1.2 ${F};color:#00013a">${esc(subject)}</div>
  <p style="margin:14px 0 0;font:400 13px/1.4 ${F};letter-spacing:.08em;text-transform:uppercase;color:#6b7279">Your note</p>
  <p style="margin:4px 0 0;font:400 16px/1.5 ${F};color:#1f2326;white-space:pre-wrap">${esc(item.body || "")}</p>
  <p style="margin:14px 0 0;font:400 13px/1.4 ${F};letter-spacing:.08em;text-transform:uppercase;color:#6b7279">Daniel</p>
  <p style="margin:4px 0 0;font:400 16px/1.5 ${F};color:#1f2326;white-space:pre-wrap">${esc(answer)}</p>
  <p style="margin:20px 0 0"><a href="${esc(link)}" style="display:inline-block;padding:12px 18px;border-radius:999px;background:#cd163f;color:#fff;text-decoration:none;font:700 15px/1.2 ${F}">Open ${esc(where)}</a></p>
</div></div></body></html>`;
  return await sendTo(to, subject, text, html);
}

// Links straight to the item: the page version it was left on (Proposed by default), or the index for board-wide items.
const adminLink = (slug: string | null, item: { id: string; variant: string | null } | null = null) => {
  const hash = item ? `#blsb=${item.id}` : "";
  return slug ? `${SITE}${item?.variant === "today" ? "today" : "proposed"}/${slug}.html?admin${hash}` : `${SITE}?admin${hash}`;
};

// Global brake on instant emails: past EMAIL_HOUR_MAX in the last hour, items wait for the 6 PM digest instead.
async function emailBudgetLeft(): Promise<boolean> {
  const { count, error } = await db.from("bls_board_items").select("id", { count: "exact", head: true })
    .gt("emailed_at", new Date(Date.now() - H).toISOString());
  if (error) throw error;
  return (count ?? 0) < EMAIL_HOUR_MAX;
}

async function emailForItem(item: Item, page: Page | null, effect: string): Promise<boolean> {
  const where = pageLabel(page);
  const who = item.author_role ? `${item.author_name}, ${item.author_role}` : item.author_name;
  let subject = "";
  if (item.kind === "comment") subject = `Feedback on ${where} from ${item.author_name}`;
  else if (item.kind === "approve") subject = `${item.author_name} approved ${where}`;
  else if (item.kind === "concern") subject = `Concern on ${where} from ${item.author_name}`;
  else if (item.kind === "suggestion") subject = `Suggestion on ${where} from ${item.author_name}`;
  else if (item.kind === "help") subject = `Help offer on ${where} from ${item.author_name}`;
  else subject = page ? `Private message about ${where} from ${item.author_name}` : `Private message from ${item.author_name}`;
  const lines: { label?: string; text: string }[] = [{ label: "From", text: who }, { label: "Page", text: where }];
  if (item.req_item) lines.push({ label: "Can help with", text: item.req_item });
  if (item.variant) lines.push({ label: "Version", text: item.variant === "today" ? "Today" : "Proposed" });
  if (item.pin_x != null) lines.push({ label: "Spot", text: "Pinned on the page" });
  if (item.body) lines.push({ label: "Message", text: item.body });
  if (effect) lines.push({ label: "Board review clock", text: effect });
  lines.push({ text: "Open the board to reply or mark it Fixed. If they left an email, your answer goes to them from website@blslittleleague.org." });
  return await sendEmail(subject, subject, lines, adminLink(item.slug, item));
}

// Open concerns and suggestions on a page (top-level, not hidden). Optionally only one kind.
async function openCount(slug: string, kinds: string[], exceptId: string | null = null): Promise<number> {
  let q = db.from("bls_board_items").select("id", { count: "exact", head: true })
    .eq("slug", slug).in("kind", kinds).eq("status", "open").eq("hidden", false).is("parent_id", null);
  if (exceptId) q = q.neq("id", exceptId);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

// ---------- countdown engine (Board review is the 48 hour countdown) ----------
// Turns finished Board review countdowns into Scheduled for deployment. Conditional update, so concurrent ticks never
// double-write.
async function expire(): Promise<string[]> {
  const nowIso = isoNow();
  const { data, error } = await db.from("bls_board_pages")
    .update({ state: "scheduled", ready_deadline: null, hold_remaining_ms: null, updated_at: nowIso })
    .eq("state", "review").not("ready_deadline", "is", null).lte("ready_deadline", nowIso).select(PAGE_COLS);
  if (error) throw error;
  const out: string[] = [];
  for (const p of (data || []) as Page[]) {
    out.push(p.slug);
    const ph = await phaseName(p.phase_id);
    const where = ph ? `in ${ph}` : "for the next update";
    await event(p.slug, "scheduled", `Board review finished. ${p.title} was scheduled for deployment ${where}.`, "System");
    if (!isTestSlug(p.slug)) {
      const open = await openCount(p.slug, ["concern", "suggestion"]);
      const still = open ? ` ${open} ${open === 1 ? "concern or suggestion is" : "concerns or suggestions are"} still open.` : "";
      await sendEmail(`Board review finished on ${p.title}`, `${p.title} is scheduled for deployment ${where}`,
        [{ text: `The 48 hour Board review on ${p.title} reached zero. It is now Scheduled for deployment ${where}.${still}` }],
        adminLink(p.slug));
    }
  }
  return out;
}

// Applies the suggestion and concern rules to a page in Board review. Returns a plain-English effect line.
async function applyFeedbackRules(slug: string, kind: string, actor: string): Promise<{ page: Page | null; effect: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const p = await getPage(slug);
    if (!p) return { page: null, effect: "" };
    if (p.state === "hold") {
      const held = remainingOf(p);
      return { page: p, effect: kind === "concern" ? (held != null ? `Already On hold with ${fmtDur(held)} left.` : "Already On hold.") : "" };
    }
    if (p.state !== "review" || !p.ready_deadline) return { page: p, effect: "" };
    const now = Date.now();
    const rem = Math.max(0, Date.parse(p.ready_deadline) - now);
    if (kind === "suggestion") {
      const next = Math.min(rem + H24, H48);
      const added = next - rem;
      const { data } = await db.from("bls_board_pages")
        .update({ ready_deadline: new Date(now + next).toISOString(), updated_at: isoNow() })
        .eq("slug", slug).eq("state", "review").eq("ready_deadline", p.ready_deadline).select(PAGE_COLS);
      if (!data?.length) continue;
      if (added > 60000) await event(slug, "time_added", `A suggestion added ${fmtDur(added)} back to the ${p.title} Board review.`, actor);
      return { page: data[0] as Page, effect: added > 60000 ? `${fmtDur(added)} added back. ${fmtDur(next)} left in Board review.` : `No time added (Board review is at its 48 hour cap).` };
    }
    if (kind === "concern") {
      const { data } = await db.from("bls_board_pages")
        .update({ state: "hold", ready_deadline: null, hold_remaining_ms: rem, updated_at: isoNow() })
        .eq("slug", slug).eq("state", "review").eq("ready_deadline", p.ready_deadline).select(PAGE_COLS);
      if (!data?.length) continue;
      await event(slug, "hold", `${p.title} went On hold for a concern with ${fmtDur(rem)} left in Board review.`, actor);
      return { page: data[0] as Page, effect: `The page is now On hold with ${fmtDur(rem)} left in Board review.` };
    }
    return { page: p, effect: "" };
  }
  return { page: await getPage(slug), effect: "" };
}

// Moves a page to a new state and keeps the clock columns consistent. Writes the matching event.
// Board review always gets a fresh 48 hour clock, except when it resumes an On hold page that has a frozen clock.
async function setState(p: Page, to: string, actor: string, extra: Partial<Page> = {}, why = ""): Promise<Page> {
  const now = Date.now();
  const patch: Partial<Page> = { ...extra, state: to, ready_deadline: null, hold_remaining_ms: null };
  let kind = "state_changed";
  let detail = `${p.title} moved from ${STATE_LABEL[p.state]} to ${STATE_LABEL[to]}.${why ? " " + why : ""}`;
  if (to === "review") {
    const resume = p.state === "hold" && p.hold_remaining_ms != null;
    const rem = resume ? Number(p.hold_remaining_ms) : H48;
    patch.ready_deadline = new Date(now + rem).toISOString();
    kind = resume ? "resumed" : "countdown_started";
    detail = resume
      ? `${p.title} Board review resumed with ${fmtDur(rem)} left.`
      : `Daniel started Board review on ${p.title}. The 48 hour countdown started.`;
  } else if (to === "hold") {
    const rem = remainingOf(p, now);
    patch.hold_remaining_ms = p.state === "review" ? rem : (p.state === "hold" ? p.hold_remaining_ms : null);
    kind = "hold";
    detail = `${p.title} went On hold${patch.hold_remaining_ms != null ? ` with ${fmtDur(Number(patch.hold_remaining_ms))} left in Board review` : ""}.`;
  } else if (to === "scheduled") {
    const ph = await phaseName(extra.phase_id !== undefined ? extra.phase_id as string | null : p.phase_id);
    kind = "scheduled";
    detail = `${p.title} was scheduled for deployment ${ph ? `in ${ph}` : "for the next update"}.`;
  } else if (to === "live") {
    patch.live_since = extra.live_since || pacific().date;
    kind = "live";
    detail = `${p.title} went live on blslittleleague.org.`;
  }
  const out = await updatePage(p.slug, patch);
  if (p.state !== to || to === "review") await event(p.slug, kind, detail, actor);
  return out;
}

async function applyTimer(p: Page, timer: string): Promise<Page> {
  const now = Date.now();
  const frozen = p.state === "hold" && p.hold_remaining_ms != null;
  switch (timer) {
    case "start": {
      const out = await updatePage(p.slug, { state: "review", ready_deadline: new Date(now + H48).toISOString(), hold_remaining_ms: null });
      await event(p.slug, "countdown_started", `Daniel started Board review on ${p.title}. The 48 hour countdown started.`, ADMIN_NAME);
      return out;
    }
    case "pause": {
      if (p.state !== "review" || !p.ready_deadline) throw new HttpError(409, "The Board review clock is not running.");
      const rem = remainingOf(p, now) ?? 0;
      const out = await updatePage(p.slug, { state: "hold", ready_deadline: null, hold_remaining_ms: rem });
      await event(p.slug, "hold", `Daniel paused the ${p.title} Board review with ${fmtDur(rem)} left.`, ADMIN_NAME);
      return out;
    }
    case "resume": {
      if (!frozen) throw new HttpError(409, "There is no paused Board review clock.");
      return await setState(p, "review", ADMIN_NAME);
    }
    case "add24": {
      if (p.state === "review" && p.ready_deadline) {
        const out = await updatePage(p.slug, { ready_deadline: new Date(Math.max(now, Date.parse(p.ready_deadline)) + H24).toISOString() });
        await event(p.slug, "time_added", `Daniel added 24 hours to the ${p.title} Board review.`, ADMIN_NAME);
        return out;
      }
      if (frozen) {
        const out = await updatePage(p.slug, { hold_remaining_ms: Number(p.hold_remaining_ms) + H24 });
        await event(p.slug, "time_added", `Daniel added 24 hours to the ${p.title} Board review.`, ADMIN_NAME);
        return out;
      }
      throw new HttpError(409, "There is no Board review clock on this page.");
    }
    case "clear": {
      if (p.state !== "review" && p.state !== "hold") return p;
      const out = await updatePage(p.slug, { state: "building", ready_deadline: null, hold_remaining_ms: null });
      await event(p.slug, "cleared", `Daniel cleared the ${p.title} Board review clock. It went back to Building.`, ADMIN_NAME);
      return out;
    }
    case "schedule_now":
      return await setState(p, "scheduled", ADMIN_NAME);
  }
  return bad("Unknown timer action.");
}

// ---------- public shapes ----------
const isDaniel = (i: Item) => !!i.is_admin || String(i.author_name || "").trim().toLowerCase() === "daniel grande";
// resolution_note is Daniel's own text with no to_board switch, so members get the status word only (Coach 11/4).
const publicItem = (i: Item, admin = false, me = "") => ({
  id: i.id, slug: i.slug, kind: i.kind, body: i.body, author_name: i.author_name, author_role: i.author_role,
  is_admin: i.is_admin, parent_id: i.parent_id, variant: i.variant, pin_x: i.pin_x, pin_y: i.pin_y, pin_w: i.pin_w,
  req_item: i.req_item, status: i.status, resolution_note: admin || sameName(i.author_name, me) ? i.resolution_note : null, created_at: i.created_at, resolved_at: i.resolved_at,
  to_board: !!i.to_board,
});
// What a reader may see (one rule for state, counts and approvers). Members: approvals only until Daniel opens comments
// (Coach 11/4), and never one of Daniel's own posts unless he marked it for the board. Approvals are exempt from the
// Daniel rule so his own Approve toggle keeps working when he picks his name as a member (approvers are public by
// contract; the note on his approval is blanked in buildState).
// A member always sees their own notes, and Daniel's replies on them, so his answer reaches them (Coach 11/5:
// "no way of circling back"). The viewer's name comes from the picker (?me=), the same trust level as posting.
const sameName = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
function visibleTo(items: Item[], admin: boolean, commentsPublic: boolean, me = ""): Item[] {
  if (admin) return items;
  const mineIds = new Set(items.filter((i) => sameName(i.author_name, me) && !i.parent_id).map((i) => i.id));
  return items.filter((i) => i.kind === "approve" || (commentsPublic && !(isDaniel(i) && !i.to_board))
    || (me && (sameName(i.author_name, me) || (i.parent_id && mineIds.has(i.parent_id)))));
}

// Counts are top-level items only (replies are part of their thread), never private or hidden ones.
function publicPage(p: Page, all: Item[] = [], now = Date.now()) {
  const mine = all.filter((i) => i.slug === p.slug && i.kind !== "private" && !i.hidden && !i.parent_id);
  const n = (k: string) => mine.filter((i) => i.kind === k).length;
  const open = (k: string) => mine.filter((i) => i.kind === k && i.status === "open").length;
  return {
    slug: p.slug, title: p.title, state: p.state, phase_id: p.phase_id, remaining_ms: remainingOf(p, now),
    due_date: p.due_date, live_since: p.live_since, live_url: p.live_url, note: p.note, sort: p.sort, updated_at: p.updated_at,
    reviewers: Array.isArray(p.reviewers) ? p.reviewers : [],
    asks: Array.isArray(p.asks) ? p.asks.map((a) => ({ text: a.text, people: Array.isArray(a.people) ? a.people : [] })) : [],
    counts: {
      approve: n("approve"), comment: n("comment"), suggestion: n("suggestion"), concern: n("concern"), help: n("help"),
      open: open("concern") + open("suggestion"), open_concern: open("concern"), open_suggestion: open("suggestion"),
    },
    approvers: mine.filter((i) => i.kind === "approve").sort((a, b) => a.created_at.localeCompare(b.created_at)).map((i) => i.author_name),
  };
}

// The page as the caller may see it: counts and approvers go through the same filter as state.
async function pageWithCounts(slug: string, admin: boolean): Promise<ReturnType<typeof publicPage> | null> {
  const p = await getPage(slug);
  if (!p) return null;
  const { data } = await db.from("bls_board_items").select(ITEM_COLS).eq("slug", slug).eq("hidden", false).neq("kind", "private").is("parent_id", null);
  const commentsPublic = admin ? true : (await settings()).comments_public === "true";
  return publicPage(p, visibleTo((data || []) as Item[], admin, commentsPublic));
}

async function buildState(admin: boolean, includeTest: boolean, me = "") {
  await expire();
  const evQuery = () => db.from("bls_board_events").select(EVENT_COLS).order("created_at", { ascending: false }).order("id", { ascending: false });
  const [pagesR, phasesR, peopleR, itemsR, eventsR, activityR] = await Promise.all([
    db.from("bls_board_pages").select(PAGE_COLS).order("sort").order("slug"),
    db.from("bls_board_phases").select("id, name, target_date, note, sort").order("sort").order("name"),
    db.from("bls_board_people").select("name, role, sort, email").eq("active", true).order("sort").order("name"),
    db.from("bls_board_items").select(ITEM_COLS).eq("hidden", false).order("created_at", { ascending: false }).limit(1000),
    // What's new: page updates and pages going live, for everyone
    evQuery().in("kind", PUBLIC_EVENTS).limit(60),
    // Daniel's "All activity": every event kind
    admin ? evQuery().limit(150) : Promise.resolve({ data: [], error: null }),
  ]);
  for (const r of [pagesR, phasesR, peopleR, itemsR, eventsR, activityR]) if (r.error) throw r.error;
  const now = Date.now();
  const testOk = (slug: string | null, name: string | null) => includeTest || (!isTestSlug(slug) && !isTestName(name));
  let items = (itemsR.data || []) as Item[];
  items = items.filter((i) => testOk(i.slug, i.author_name));
  const visibleIds = new Set(items.map((i) => i.id));
  items = items.filter((i) => !i.parent_id || visibleIds.has(i.parent_id));
  // Comments, suggestions, concerns and help offers stay between the writer and Daniel until he opens the discussion
  // (Coach 11/4), and Daniel's own notes stay off the board unless marked: see visibleTo. Daniel's own state reads the
  // setting fresh, so the Inbox switch never snaps back to a cached value right after he flips it.
  const commentsPublic = (await settings(admin)).comments_public === "true";
  items = visibleTo(items, admin, commentsPublic, me);
  const pages = ((pagesR.data || []) as Page[]).filter((p) => includeTest || !isTestSlug(p.slug)).map((p) => publicPage(p, items, now));
  const listed = items.filter((i) => admin || i.kind !== "private" || sameName(i.author_name, me) || (i.parent_id && items.some((p) => p.id === i.parent_id && sameName(p.author_name, me)))).slice(0, 500).map((i) => {
    const o = publicItem(i, admin, me);
    // An approval's note is text too: members read it only once comments are open, and never Daniel's unless marked.
    if (!admin && i.kind === "approve" && (!commentsPublic || (isDaniel(i) && !i.to_board))) o.body = "";
    return o;
  });
  // A ZZTEST page update (test runs post them board-wide) only shows with test=1.
  const evOk = (e: Ev) => testOk(e.slug, e.actor) && (includeTest || e.kind !== "page_update" || !isTestName(e.detail));
  const events = ((eventsR.data || []) as Ev[]).filter((e) => PUBLIC_EVENTS.includes(e.kind) && evOk(e)).slice(0, 20);
  let activity = (activityR.data || []) as Ev[];
  const evItemIds = [...new Set(activity.map((e) => e.item_id).filter(Boolean))] as string[];
  if (evItemIds.length) {
    const { data: hid } = await db.from("bls_board_items").select("id").in("id", evItemIds).eq("hidden", true);
    const hidden = new Set((hid || []).map((h: { id: string }) => h.id));
    activity = activity.filter((e) => !e.item_id || !hidden.has(e.item_id));
  }
  activity = activity.filter(evOk).slice(0, 40);
  // A page update's detail names the page ("Champions: 2025 team photo approved for the page."), so a board page that
  // prints detail alone still says which page changed. text is Daniel's words as he posted them.
  const titles = new Map(((pagesR.data || []) as Page[]).map((p) => [p.slug, p.title]));
  const evOut = (e: Ev) => {
    const base = { id: e.id, slug: e.slug, kind: e.kind, detail: e.detail, actor: e.actor, created_at: e.created_at };
    if (e.kind !== "page_update") return base;
    const text = String(e.detail || "").trim();
    const line = /[.!?]$/.test(text) ? text : text + ".";
    const title = e.slug ? titles.get(e.slug) : null;
    return { ...base, text, detail: title ? `${title}: ${line}` : line.charAt(0).toUpperCase() + line.slice(1) };
  };
  return {
    ok: true,
    now: new Date(now).toISOString(),
    viewer: { admin, name: admin ? ADMIN_NAME : null },
    comments_public: commentsPublic,
    people: ((peopleR.data || []) as { name: string; role: string; email?: string | null }[]).filter((p) => includeTest || !isTestName(p.name)).map((p) => ({ name: p.name, role: p.role, has_email: !!p.email })),
    pages,
    phases: ((phasesR.data || []) as { name: string }[]).filter((p) => includeTest || !isTestName(p.name)),
    items: listed,
    events: events.map(evOut),
    ...(admin ? { activity: activity.map(evOut) } : {}),
  };
}

// ---------- feedback ----------
async function readName(b: Record<string, unknown>, admin: boolean): Promise<{ name: string; role: string | null }> {
  if (admin) return { name: ADMIN_NAME, role: ADMIN_ROLE };
  const name = cleanLabel(b.name);
  if (cpLen(name) < 2 || cpLen(name) > 80) bad("Please pick your name first (2 to 80 characters).");
  if (isReservedName(name)) bad("That name is reserved. Please pick your own name.");
  let role: string | null = cpSlice(cleanLabel(b.role), 120) || null;
  if (linkCount(name) || (role && linkCount(role))) bad("Names and roles cannot have links.");
  if (role && /^\(?\s*website\s*\)?$/i.test(role)) bad("Please use your own role.");
  if (!role) {
    const { data } = await db.from("bls_board_people").select("name, role").eq("active", true);
    const hit = (data || []).find((p: { name: string; role: string }) => nameKey(p.name) === nameKey(name));
    if (hit?.role) role = hit.role;
  }
  return { name, role };
}

const TEST_ONLY = "Test posts go on the zztest page or the board discussion.";

async function toggleApproval(req: Request, b: Record<string, unknown>, mode: "toggle" | "on", adminIn?: boolean) {
  const admin = adminIn ?? await adminFrom(req);
  const slug = typeof b.slug === "string" ? b.slug : "";
  if (!slug) bad("Pick a page to approve.");
  const page = await getPage(slug);
  if (!page) throw new HttpError(404, "That page is not on the board.");
  const { name, role } = await readName(b, admin);
  if (!admin && isTestName(name) && !isTestSlug(slug)) bad(TEST_ONLY);
  const note = multiLine(b.note ?? b.body);
  if (cpLen(note) > 4000) bad("Please keep it under 4000 characters.");
  if (linkCount(note) > MAX_LINKS) bad("Too many links. Please keep it to 5 or fewer.");
  const { data: rows, error } = await db.from("bls_board_items").select(ITEM_COLS)
    .eq("slug", slug).eq("kind", "approve").eq("hidden", false);
  if (error) throw error;
  const mine = ((rows || []) as Item[]).find((i) => nameKey(i.author_name) === nameKey(name));
  if (mine && mode === "on") return { ok: true, approved: true, item: publicItem(mine, admin), page: await pageWithCounts(slug, admin) };
  if (!admin && !isTestSlug(slug) && rateLimited(ipOf(req))) throw new HttpError(429, "Too many posts from here. Please try again in a bit.");
  if (mine) {
    await db.from("bls_board_items").delete().eq("id", mine.id);
    return { ok: true, approved: false, page: await pageWithCounts(slug, admin) };
  }
  const { data: ins, error: insErr } = await db.from("bls_board_items")
    .insert({ slug, kind: "approve", body: note, author_name: name, author_role: role, is_admin: admin }).select(ITEM_COLS).single();
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") return { ok: true, approved: true, page: await pageWithCounts(slug, admin) };
    throw insErr;
  }
  await event(slug, "approved", `${name} approved ${page.title}.`, name, (ins as Item).id);
  if (!admin && !isTestSlug(slug) && await emailBudgetLeft()) {
    if (await emailForItem(ins as Item, page, "")) await db.from("bls_board_items").update({ emailed_at: isoNow() }).eq("id", (ins as Item).id);
  }
  return { ok: true, approved: true, item: publicItem(ins as Item, admin), page: await pageWithCounts(slug, admin) };
}

async function postItem(req: Request, b: Record<string, unknown>) {
  const admin = await adminFrom(req);
  let kind = String(b.kind || "");
  if (!KINDS.includes(kind)) bad("Pick what kind of feedback this is.");
  if (kind === "approve") return await toggleApproval(req, b, "on", admin);
  const slug = b.slug == null || b.slug === "" ? null : String(b.slug);
  const page = slug ? await getPage(slug) : null;
  if (slug && !page) throw new HttpError(404, "That page is not on the board.");
  const { name, role } = await readName(b, admin);
  // Test names (ZZTEST...) only ever touch the zztest page or the board discussion, never a real page.
  const test = !admin && isTestName(name);
  if (test && slug && !isTestSlug(slug)) bad(TEST_ONLY);
  const body = multiLine(b.body);

  let parent: Item | null = null;
  if (b.parent_id != null && b.parent_id !== "") {
    parent = await getItem(String(b.parent_id));
    if (!parent || parent.hidden || (!admin && parent.kind === "private")) throw new HttpError(404, "Could not find that comment.");
    if (parent.parent_id) bad("Replies go on the first comment in a thread.");
    if (parent.slug !== slug) bad("That reply belongs to a different page.");
    // A reply takes its kind from the thread: private under a private message, a plain comment everywhere else.
    // So a reply never moves a countdown, never sends an instant email, and never sits privately inside a public thread.
    if (parent.kind === "private") kind = "private";
    else if (kind === "private") bad("A private message cannot be a reply. Send it as a new private message.");
    else kind = "comment";
  }

  const reqItem = !parent && kind === "help" ? cpSlice(oneLine(b.req_item), 500) || null : null;
  if (cpLen(body) > 4000) bad("Please keep it under 4000 characters.");
  if (!body && !(kind === "help" && reqItem)) bad("Please write a message first.");
  if (linkCount(body) + linkCount(reqItem || "") > MAX_LINKS) bad("Too many links. Please keep it to 5 or fewer.");

  // Spots are for top-level items only; replies ignore variant and pin fields.
  let variant: string | null = null, pin_x: number | null = null, pin_y: number | null = null, pin_w: number | null = null;
  if (!parent && b.variant != null && b.variant !== "") {
    variant = String(b.variant);
    if (variant !== "today" && variant !== "proposed") bad("Version must be today or proposed.");
  }
  if (!parent && (b.pin_x != null || b.pin_y != null)) {
    pin_x = Number(b.pin_x); pin_y = Number(b.pin_y);
    if (!Number.isFinite(pin_x) || !Number.isFinite(pin_y) || pin_x < 0 || pin_x > 100 || pin_y < 0 || pin_y > 100) bad("That spot is off the page.");
    if (!slug || !variant) bad("A spot needs a page and a version.");
    if (b.pin_w != null && b.pin_w !== "") {
      const w = Math.round(Number(b.pin_w));
      if (Number.isFinite(w) && w >= 200 && w <= 10000) pin_w = w;
    }
  }

  if (!admin && !isTestSlug(slug) && rateLimited(ipOf(req))) throw new HttpError(429, "Too many posts from here. Please try again in a bit.");

  const { data: ins, error } = await db.from("bls_board_items").insert({
    slug, kind, body, author_name: name, author_role: role, is_admin: admin, parent_id: parent?.id ?? null,
    variant, pin_x, pin_y, pin_w, req_item: reqItem, to_board: admin && b.to_board === true,
  }).select(ITEM_COLS).single();
  if (error) throw error;
  const item = ins as Item;

  if (kind !== "private") {
    const where = pageLabel(page);
    const evKind = parent ? "replied" : ({ comment: "commented", suggestion: "suggested", concern: "concern", help: "help" } as Record<string, string>)[kind];
    const verb = parent ? `replied on ${where}`
      : kind === "comment" ? `commented on ${where}`
      : kind === "suggestion" ? `suggested a change on ${where}`
      : kind === "concern" ? `raised a concern on ${where}`
      : `offered to help on ${where}${reqItem ? `: ${reqItem}` : ""}`;
    await event(slug, evKind, `${name} ${verb}.`, name, item.id);
  }

  let effect = "";
  let outPage = page;
  const top = !parent;
  if (top && !admin && slug && (!test || isTestSlug(slug)) && (kind === "suggestion" || kind === "concern")) {
    const r = await applyFeedbackRules(slug, kind, name);
    effect = r.effect;
    outPage = r.page;
  }

  // Instant email for top-level concern, suggestion, help and private items. Past the hourly cap (or if the send
  // fails) emailed_at stays empty and the 6 PM digest lists the item instead.
  let emailed = false;
  if (top && !admin && !test && !isTestSlug(slug) && EMAIL_KINDS.includes(kind) && await emailBudgetLeft()) {
    emailed = await emailForItem(item, outPage, effect);
    if (emailed) await db.from("bls_board_items").update({ emailed_at: isoNow() }).eq("id", item.id);
  }

  return { ok: true, item: publicItem(item, admin), page: slug ? await pageWithCounts(slug, admin) : null, emailed };
}

// ---------- admin ----------
function optDate(v: unknown, label: string): string | null {
  if (v == null || v === "") return null;
  const s = String(v);
  // Round trip so dates that do not exist (2026-02-31) are refused here, not by Postgres.
  const t = DATE.test(s) ? new Date(s + "T00:00:00Z") : null;
  if (!t || Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== s) bad(`${label} must be a date like 2026-11-15.`);
  return s;
}

// Active roster, keyed by the lowercased name, so reviewers and ask names are stored exactly as the roster spells them.
async function rosterNames(): Promise<Map<string, string>> {
  const { data, error } = await db.from("bls_board_people").select("name").eq("active", true);
  if (error) throw error;
  return new Map((data || []).map((p: { name: string }) => [nameKey(p.name), p.name]));
}
function rosterList(v: unknown, roster: Map<string, string>, what: string): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) bad(`${what} must be a list of names.`);
  const list = v as unknown[];
  if (list.length > MAX_REVIEWERS) bad(`${what}: up to ${MAX_REVIEWERS} names.`);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of list) {
    if (typeof n !== "string") bad(`${what} must be a list of names.`);
    const typed = cleanLabel(n);
    const canon = roster.get(nameKey(typed));
    if (!canon) bad(`${cpSlice(typed, 80) || "That name"} is not on the board list.`);
    const k = nameKey(canon!);
    if (!seen.has(k)) { seen.add(k); out.push(canon!); }
  }
  return out;
}
function readAsks(v: unknown, roster: Map<string, string>): Ask[] {
  if (v == null) return [];
  if (!Array.isArray(v)) bad("Asks must be a list.");
  const list = v as unknown[];
  if (list.length > MAX_ASKS) bad(`Up to ${MAX_ASKS} asks per page.`);
  const seen = new Set<string>();
  return list.map((a) => {
    if (!a || typeof a !== "object" || Array.isArray(a)) bad("Each ask needs its text and the people to ask.");
    const r = a as Record<string, unknown>;
    const text = oneLine(multiLine(r.text));
    if (cpLen(text) < ASK_MIN || cpLen(text) > ASK_MAX) bad(`Each ask must be ${ASK_MIN} to ${ASK_MAX} characters.`);
    if (linkCount(text) > MAX_LINKS) bad("Too many links. Please keep it to 5 or fewer.");
    if (seen.has(text.toLowerCase())) bad("Two asks have the same text.");
    seen.add(text.toLowerCase());
    return { text, people: rosterList(r.people, roster, "People for an ask") };
  });
}

async function adminPage(b: Record<string, unknown>) {
  const slug = String(b.slug || "");
  let p = await getPage(slug);
  if (!p) throw new HttpError(404, "That page is not on the board.");
  const extra: Partial<Page> = {};
  if ("reviewers" in b || "asks" in b) {
    const roster = await rosterNames();
    if ("reviewers" in b) extra.reviewers = rosterList(b.reviewers, roster, "Reviewers");
    if ("asks" in b) extra.asks = readAsks(b.asks, roster);
  }
  if ("phase_id" in b) {
    const id = b.phase_id == null || b.phase_id === "" ? null : String(b.phase_id);
    if (id) {
      if (!UUID.test(id)) bad("Unknown phase.");
      const { data } = await db.from("bls_board_phases").select("id").eq("id", id).maybeSingle();
      if (!data) bad("Unknown phase.");
    }
    extra.phase_id = id;
  }
  if ("due_date" in b) extra.due_date = optDate(b.due_date, "Due date");
  if ("live_since" in b) extra.live_since = optDate(b.live_since, "Live since");
  if ("live_url" in b) {
    const u = oneLine(b.live_url);
    if (u && (!/^https?:\/\/\S+$/i.test(u) || u.length > 500)) bad("Live link must start with https://");
    extra.live_url = u || null;
  }
  if ("note" in b) {
    const n = oneLine(b.note);
    if (cpLen(n) > 500) bad("Please keep the note under 500 characters.");
    extra.note = n || null;
  }
  const timer = b.timer == null || b.timer === "" ? "" : String(b.timer);
  if (timer && !["start", "pause", "resume", "add24", "clear", "schedule_now"].includes(timer)) bad("Unknown timer action.");
  const state = b.state == null || b.state === "" ? "" : String(b.state);
  if (state && !(STATES as readonly string[]).includes(state)) bad("Unknown page state.");

  // A timer that already lands on the requested state (e.g. {state:'review', timer:'start'}) does the move itself,
  // so the page gets one event, not two. Setting state review on a page already in Board review restarts its 48 hours.
  const timerTarget: Record<string, string> = { start: "review", resume: "review", pause: "hold", schedule_now: "scheduled", clear: "building" };
  const timerDoesIt = !!timer && timerTarget[timer] === state;
  if (state && (state !== p.state || state === "review") && !timerDoesIt) p = await setState(p, state, ADMIN_NAME, extra);
  else if (Object.keys(extra).length) p = await updatePage(p.slug, extra);
  if (timer) p = await applyTimer(p, timer);
  return { ok: true, page: await pageWithCounts(p.slug, true) };
}

async function adminResolve(b: Record<string, unknown>) {
  const item = await getItem(String(b.id || ""));
  if (!item) throw new HttpError(404, "Could not find that item.");
  const status = String(b.status || "");
  if (!STATUSES.includes(status)) bad("Status must be open, resolved, accepted or declined.");
  const note = multiLine(b.note);
  if (cpLen(note) > 2000) bad("Please keep the note under 2000 characters.");
  const { data: upd, error } = await db.from("bls_board_items").update({
    status, resolution_note: note || null, resolved_at: status === "open" ? null : isoNow(),
  }).eq("id", item.id).select(ITEM_COLS).single();
  if (error) throw error;
  // the member hears back when Daniel closes their note (status word plus his note), not on a reopen
  const emailed = status !== "open" && item.status !== status ? await notifyAuthor(item, `${status === "resolved" ? "Fixed" : STATUS_LABEL[status]}.${note ? " " + note : ""}`) : false;

  let page: Page | null = item.slug ? await getPage(item.slug) : null;
  const affects = !!page && !item.parent_id && (item.kind === "concern" || item.kind === "suggestion") && item.status !== status;
  if (affects && page) {
    const kindWord = item.kind === "concern" ? "a concern" : "a suggestion";
    await event(page.slug, "resolved", `Daniel answered ${kindWord} on ${page.title}: ${STATUS_LABEL[status]}.`, ADMIN_NAME, item.id);
    // Keep as is resumes only a Board review clock that was paused (a frozen clock exists). A page Daniel put On hold
    // from Building or Waiting with the state picker has no clock and stays where it is.
    if (status === "declined" && page.state === "hold" && page.hold_remaining_ms != null) {
      page = await resumeIfClear(page, item.id);
    } else if (status === "accepted" && ["review", "hold", "scheduled"].includes(page.state)) {
      // Will change pulls a page that is in Board review or heading to the live site back to Building and clears the
      // clock. Building and Waiting stay put.
      page = await setState(page, "building", ADMIN_NAME, {}, "Daniel is making a change.");
    }
  }
  return { ok: true, item: publicItem(upd as Item, true), page: page ? await pageWithCounts(page.slug, true) : null };
}

// Resumes an On hold page's Board review with at least 24 hours when no other concern is open. Conditional writes, so
// a concern that lands while this runs keeps (or puts) the page On hold.
async function resumeIfClear(page: Page, exceptId: string): Promise<Page> {
  if (await openCount(page.slug, ["concern"], exceptId)) return page;
  const held = Number(page.hold_remaining_ms);
  const rem = Math.max(held, H24);
  const deadline = new Date(Date.now() + rem).toISOString();
  const { data, error } = await db.from("bls_board_pages")
    .update({ state: "review", ready_deadline: deadline, hold_remaining_ms: null, updated_at: isoNow() })
    .eq("slug", page.slug).eq("state", "hold").eq("hold_remaining_ms", held).select(PAGE_COLS);
  if (error) throw error;
  if (!data?.length) return (await getPage(page.slug)) || page;
  if (await openCount(page.slug, ["concern"], exceptId)) {
    const { data: back } = await db.from("bls_board_pages")
      .update({ state: "hold", ready_deadline: null, hold_remaining_ms: held, updated_at: isoNow() })
      .eq("slug", page.slug).eq("state", "review").eq("ready_deadline", deadline).select(PAGE_COLS);
    return (back?.[0] as Page) || (await getPage(page.slug)) || page;
  }
  await event(page.slug, "resumed", `${page.title} Board review resumed with ${fmtDur(rem)} left.`, ADMIN_NAME);
  return data[0] as Page;
}

async function adminReply(b: Record<string, unknown>) {
  const parent = await getItem(String(b.parent_id || ""));
  if (!parent || parent.hidden) throw new HttpError(404, "Could not find that comment.");
  if (parent.parent_id) bad("Replies go on the first comment in a thread.");
  const body = multiLine(b.body);
  if (!body) bad("Please write a reply first.");
  if (cpLen(body) > 4000) bad("Please keep it under 4000 characters.");
  const kind = parent.kind === "private" ? "private" : "comment";
  const { data, error } = await db.from("bls_board_items").insert({
    slug: parent.slug, kind, body, author_name: ADMIN_NAME, author_role: ADMIN_ROLE, is_admin: true, parent_id: parent.id,
    variant: parent.variant, to_board: b.to_board === true,
  }).select(ITEM_COLS).single();
  if (error) throw error;
  if (kind !== "private") {
    const page = parent.slug ? await getPage(parent.slug) : null;
    await event(parent.slug, "replied", `Daniel replied on ${pageLabel(page)}.`, ADMIN_NAME, (data as Item).id);
  }
  const emailed = await notifyAuthor(parent, body);
  return { ok: true, item: publicItem(data as Item, true), emailed };
}

// A page update: one short line in plain words about a real change to a page (or board-wide when slug is null).
// It is the public "What's new". {id, delete: true} removes one.
async function adminUpdate(b: Record<string, unknown>) {
  if (b.delete === true) {
    const id = Number(b.id);
    if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, "Could not find that update.");
    const { data, error } = await db.from("bls_board_events").delete().eq("id", id).eq("kind", "page_update").select("id");
    if (error) throw error;
    if (!data?.length) throw new HttpError(404, "Could not find that update.");
    return { ok: true, deleted: true };
  }
  const slug = b.slug == null || b.slug === "" ? null : String(b.slug);
  const page = slug ? await getPage(slug) : null;
  if (slug && !page) throw new HttpError(404, "That page is not on the board.");
  const text = oneLine(multiLine(b.text));
  if (cpLen(text) < UPDATE_MIN || cpLen(text) > UPDATE_MAX) bad(`An update must be ${UPDATE_MIN} to ${UPDATE_MAX} characters.`);
  if (linkCount(text) > MAX_LINKS) bad("Too many links. Please keep it to 5 or fewer.");
  const { data, error } = await db.from("bls_board_events")
    .insert({ slug, kind: "page_update", detail: text, actor: ADMIN_NAME }).select(EVENT_COLS).single();
  if (error) throw error;
  const e = data as Ev;
  return { ok: true, event: { id: e.id, slug: e.slug, kind: e.kind, detail: e.detail, actor: e.actor, created_at: e.created_at } };
}

async function adminHide(b: Record<string, unknown>) {
  const item = await getItem(String(b.id || ""));
  if (!item) throw new HttpError(404, "Could not find that item.");
  const hidden = b.hidden === false ? false : true;
  const { data, error } = await db.from("bls_board_items").update({ hidden }).eq("id", item.id).select(ITEM_COLS).single();
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "That person already has an approval on this page.");
    throw error;
  }
  return { ok: true, item: { ...publicItem(data as Item, true), hidden: (data as Item).hidden } };
}

async function listPhases() {
  const { data } = await db.from("bls_board_phases").select("id, name, target_date, note, sort").order("sort").order("name");
  return data || [];
}
async function adminPhase(b: Record<string, unknown>) {
  const id = b.id ? String(b.id) : "";
  if (id && !UUID.test(id)) throw new HttpError(404, "Could not find that phase.");
  if (id && b.delete === true) {
    const { data } = await db.from("bls_board_phases").delete().eq("id", id).select("id");
    if (!data?.length) throw new HttpError(404, "Could not find that phase.");
    return { ok: true, deleted: true, phases: await listPhases() };
  }
  const patch: Record<string, unknown> = {};
  if (!id || "name" in b) {
    const name = oneLine(b.name);
    if (cpLen(name) < 1 || cpLen(name) > 80) bad("Phase name must be 1 to 80 characters.");
    patch.name = name;
  }
  if ("target_date" in b) patch.target_date = optDate(b.target_date, "Target date");
  if ("note" in b) {
    const n = oneLine(b.note);
    if (cpLen(n) > 500) bad("Please keep the note under 500 characters.");
    patch.note = n || null;
  }
  if ("sort" in b) {
    const s = Number(b.sort);
    if (!Number.isInteger(s)) bad("Sort must be a whole number.");
    patch.sort = s;
  }
  const q = id
    ? db.from("bls_board_phases").update(patch).eq("id", id).select("id, name, target_date, note, sort")
    : db.from("bls_board_phases").insert(patch).select("id, name, target_date, note, sort");
  const { data, error } = await q;
  if (error) throw error;
  if (!data?.length) throw new HttpError(404, "Could not find that phase.");
  return { ok: true, phase: data[0], phases: await listPhases() };
}

async function listPeople() {
  const { data, error } = await db.from("bls_board_people").select("id, name, role, sort, active, created_at").order("sort").order("name");
  if (error) throw error;
  return data || [];
}
async function adminPerson(b: Record<string, unknown>) {
  const id = b.id ? String(b.id) : "";
  if (id && !UUID.test(id)) throw new HttpError(404, "Could not find that person.");
  if (id && b.delete === true) {
    const { data } = await db.from("bls_board_people").delete().eq("id", id).select("id");
    if (!data?.length) throw new HttpError(404, "Could not find that person.");
    return { ok: true, deleted: true, people: await listPeople() };
  }
  const patch: Record<string, unknown> = {};
  if (!id || "name" in b) {
    const name = oneLine(b.name);
    if (cpLen(name) < 2 || cpLen(name) > 80) bad("Name must be 2 to 80 characters.");
    patch.name = name;
  }
  if (!id || "role" in b) {
    const role = oneLine(b.role);
    if (cpLen(role) > 120) bad("Role must be under 120 characters.");
    patch.role = role;
  }
  if ("sort" in b) {
    const s = Number(b.sort);
    if (!Number.isInteger(s)) bad("Sort must be a whole number.");
    patch.sort = s;
  } else if (!id) {
    const { data: last } = await db.from("bls_board_people").select("sort").order("sort", { ascending: false }).limit(1);
    patch.sort = ((last?.[0]?.sort as number) ?? 0) + 1;
  }
  if ("active" in b) patch.active = b.active !== false;
  let oldName = "";
  if (id && typeof patch.name === "string") {
    const { data: was } = await db.from("bls_board_people").select("name").eq("id", id).maybeSingle();
    oldName = was?.name || "";
  }
  const q = id
    ? db.from("bls_board_people").update(patch).eq("id", id).select("id, name, role, sort, active, created_at")
    : db.from("bls_board_people").insert(patch).select("id, name, role, sort, active, created_at");
  const { data, error } = await q;
  if (error) {
    if ((error as { code?: string }).code === "23505") throw new HttpError(409, "Someone with that name is already on the list.");
    throw error;
  }
  if (!data?.length) throw new HttpError(404, "Could not find that person.");
  if (oldName && oldName !== data[0].name) await renameOnPages(oldName, data[0].name as string);
  return { ok: true, person: data[0], people: await listPeople() };
}

// A rename in the People panel carries over to every page's reviewers and asks.
async function renameOnPages(oldName: string, newName: string) {
  const { data, error } = await db.from("bls_board_pages").select("slug, reviewers, asks");
  if (error) throw error;
  const k = nameKey(oldName);
  const swap = (list: string[]) => (list || []).map((n) => (nameKey(n) === k ? newName : n));
  for (const p of (data || []) as { slug: string; reviewers: string[]; asks: Ask[] }[]) {
    const reviewers = swap(p.reviewers);
    const asks = (p.asks || []).map((a) => ({ ...a, people: swap(a.people) }));
    if (JSON.stringify(reviewers) === JSON.stringify(p.reviewers || []) && JSON.stringify(asks) === JSON.stringify(p.asks || [])) continue;
    await db.from("bls_board_pages").update({ reviewers, asks }).eq("slug", p.slug);
  }
}

// ---------- tick + digest ----------
async function digest(): Promise<string> {
  const pt = pacific();
  if (pt.hour < DIGEST_HOUR) return "not_yet";
  const s = await settings(true);
  if (s.last_digest_day === pt.date) return "done";
  const prevDay = s.last_digest_day ?? "";
  const { data: claimed } = await db.from("bls_board_settings").update({ value: pt.date }).eq("key", "last_digest_day").eq("value", prevDay).select("key");
  if (!claimed?.length) {
    if (s.last_digest_day === undefined) await setSetting("last_digest_day", pt.date);
    else return "done";
  }
  settingsCache = null;
  const since = s.last_digest_at && !Number.isNaN(Date.parse(s.last_digest_at)) ? new Date(s.last_digest_at).toISOString() : new Date(Date.now() - H24).toISOString();
  const until = isoNow();
  const { data, error } = await db.from("bls_board_items").select(ITEM_COLS).in("kind", ["comment", "approve"]).eq("hidden", false)
    .gt("created_at", since).lte("created_at", until).order("created_at");
  if (error) throw error;
  const real = (i: Item) => !i.is_admin && !isTestName(i.author_name) && !isTestSlug(i.slug);
  const items = ((data || []) as Item[]).filter(real);
  // Concerns, suggestions, help offers and private messages that got no instant email (hourly cap or a failed send).
  const { data: missedData, error: missedErr } = await db.from("bls_board_items").select(ITEM_COLS).in("kind", EMAIL_KINDS)
    .is("parent_id", null).is("emailed_at", null).eq("hidden", false).gt("created_at", since).lte("created_at", until).order("created_at");
  if (missedErr) throw missedErr;
  const missed = ((missedData || []) as Item[]).filter(real);
  if (!items.length && !missed.length) { await setSetting("last_digest_at", until); return "skipped"; }
  const { data: pagesData } = await db.from("bls_board_pages").select("slug, title");
  const titles = new Map((pagesData || []).map((p: { slug: string; title: string }) => [p.slug, p.title]));
  const comments = items.filter((i) => i.kind === "comment"), approvals = items.filter((i) => i.kind === "approve");
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const summary = [comments.length ? plural(comments.length, "comment") : "", approvals.length ? plural(approvals.length, "approval") : "",
    missed.length ? `${plural(missed.length, "message")} not emailed right away` : ""].filter(Boolean).join(", ");
  const lines: { label?: string; text: string }[] = [];
  if (missed.length) {
    const word: Record<string, string> = { concern: "Concern", suggestion: "Suggestion", help: "Help offer", private: "Private message" };
    lines.push({
      label: "Not emailed right away",
      text: "More than 20 came in within an hour, or the email failed. All of them are in the Inbox.\n" + missed.map((i) => {
        const where = i.slug ? titles.get(i.slug) || i.slug : "Board discussion";
        return `${word[i.kind] || "Message"} on ${where} from ${i.author_name}: ${i.body || i.req_item || ""}`;
      }).join("\n"),
    });
  }
  const bySlug = new Map<string, Item[]>();
  for (const i of items) { const k = i.slug || ""; if (!bySlug.has(k)) bySlug.set(k, []); bySlug.get(k)!.push(i); }
  for (const [slug, list] of bySlug) {
    const title = slug ? titles.get(slug) || slug : "Board discussion";
    lines.push({
      label: title,
      text: list.map((i) => i.kind === "approve"
        ? `${i.author_name} approved${i.body ? `: ${i.body}` : "."}`
        : `${i.author_name}${i.parent_id ? " (reply)" : ""}: ${i.body}`).join("\n"),
    });
  }
  const sent = await sendEmail(`Daily digest: ${summary}`, `Today on the board: ${summary}`, lines, `${SITE}?admin`);
  if (!sent) { await setSetting("last_digest_day", prevDay); return "send_failed"; }
  await setSetting("last_digest_at", until);
  return "sent";
}

async function tick(req: Request, b: Record<string, unknown>) {
  const key = req.headers.get("x-cron-key") || "";
  const s = await settings();
  const cronOk = !!key && !!s.cron_key && sameSecret(key, s.cron_key);
  if (!cronOk) await requireAdmin(req);
  const expired = await expire();
  const dg = b.no_digest === true ? "skipped_by_request" : await digest();
  return { ok: true, expired, digest: dg };
}

// ---------- router ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  try {
    let b: Record<string, unknown> = {};
    if (req.method === "POST") {
      // Refuse oversized bodies before reading them into memory.
      const declared = Number(req.headers.get("content-length") || "0");
      if (declared > MAX_REQUEST) return fail(413, "That is too long.");
      const raw = await req.text();
      if (raw.length > MAX_REQUEST) return fail(413, "That is too long.");
      if (raw) {
        try { b = JSON.parse(raw); } catch (_e) { return fail(400, "Could not read that request."); }
        if (!b || typeof b !== "object" || Array.isArray(b)) return fail(400, "Could not read that request.");
      }
    }
    const postOnly = () => { if (req.method !== "POST") throw new HttpError(405, "Use POST."); };
    switch (action) {
      case "state": {
        const admin = await adminFrom(req);
        return json(await buildState(admin, url.searchParams.get("test") === "1", String(url.searchParams.get("me") || "").slice(0, 80)));
      }
      case "set_email": { // a member leaves (or clears) an email so Daniel's answers can reach them; optional, never required
        postOnly();
        const name = String(b.name || "").replace(/\s+/g, " ").trim();
        const email = String(b.email || "").trim().toLowerCase();
        if (!name) bad("Pick your name first.");
        if (email && !(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email))) bad("That email does not look right.");
        const { data: who } = await db.from("bls_board_people").select("id, name").eq("active", true);
        const person = (who || []).find((p: { name: string }) => sameName(p.name, name)) as { id: string } | undefined;
        if (!person) throw new HttpError(400, "That name is not on the board list.");
        const { error } = await db.from("bls_board_people").update({ email: email || null }).eq("id", person.id);
        if (error) throw error;
        return json({ ok: true, has_email: !!email });
      }
      case "post": postOnly(); await expire(); return json(await postItem(req, b));
      case "approve": postOnly(); await expire(); return json(await toggleApproval(req, b, "toggle"));
      case "tick": return json(await tick(req, b));
      case "admin_people": await requireAdmin(req); return json({ ok: true, people: await listPeople() });
      case "admin_page": await requireAdmin(req); postOnly(); await expire(); return json(await adminPage(b));
      case "admin_resolve": await requireAdmin(req); postOnly(); await expire(); return json(await adminResolve(b));
      case "admin_reply": await requireAdmin(req); postOnly(); return json(await adminReply(b));
      case "admin_resend_email": { // send Daniel the instant email for one item again (he answers from its link)
        await requireAdmin(req); postOnly();
        const it = await getItem(String(b.id || ""));
        if (!it) throw new HttpError(404, "Could not find that item.");
        const pg = it.slug ? await getPage(it.slug) : null;
        return json({ ok: await emailForItem(it, pg, "") });
      }
      case "admin_hide": await requireAdmin(req); postOnly(); return json(await adminHide(b));
      case "admin_to_board": {
        await requireAdmin(req); postOnly();
        const it = await getItem(String(b.id || ""));
        if (!it) return json({ ok: false, error: "Could not find that post." }, 404);
        const { data: upd, error: e2 } = await db.from("bls_board_items").update({ to_board: b.to_board === true }).eq("id", it.id).select(ITEM_COLS).single();
        if (e2) throw e2;
        return json({ ok: true, item: publicItem(upd as Item, true) });
      }
      case "admin_setting": {
        await requireAdmin(req); postOnly();
        const key = String(b.key ?? ""), value = String(b.value ?? "");
        if (key !== "comments_public") return json({ ok: false, error: "That setting cannot be changed here." }, 400);
        if (value !== "true" && value !== "false") return json({ ok: false, error: "value must be true or false" }, 400);
        await setSetting(key, value);
        await db.from("bls_board_events").insert({ slug: null, kind: "state_changed", detail: value === "true" ? "Comments opened to everyone on the board." : "Comments set to Daniel only.", actor: ADMIN_NAME });
        return json({ ok: true, key, value });
      }
      case "admin_update": await requireAdmin(req); postOnly(); return json(await adminUpdate(b));
      case "admin_phase": await requireAdmin(req); postOnly(); return json(await adminPhase(b));
      case "admin_person": await requireAdmin(req); postOnly(); return json(await adminPerson(b));
    }
    return fail(400, "Unknown action.");
  } catch (e) {
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error("bls-board error", action, e instanceof Error ? e.message : JSON.stringify(e));
    return fail(500, "Something went wrong. Please try again.");
  }
});
