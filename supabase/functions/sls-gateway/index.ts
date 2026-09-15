// sls-gateway — Lessons with Sophie (CoachPilot project, geigvuysptjvvqanumld).
// Deploy: supabase functions deploy sls-gateway --no-verify-jwt
// Request-driven 1-on-1 lesson scheduler. Sophie never maintains an
// availability calendar; her calendar = sessions she has approved (accepted
// requests, direct bookings, materialized recurring slots). RLS on every
// sls_ table is enabled with zero policies — this gateway (service role) is
// the sole read/write path, matching the flm_/cougars_ pattern in
// ~/Workspace/ops/BACKEND-CONTRACT.md.
//
// Public actions: request_login, login_verify, submit_request, counter_info,
// counter_respond, manage_info, session_cancel, session_reschedule_start,
// ics_session, open_slots, whoami, device_revoke.
// Device recognition (Feature B, 2026-09-15): submit_request accepts a
// session_type ('one_on_one'|'small_group') + athletes[] array (Feature A)
// AND an optional device_token in place of parent contact fields. Trust
// rules: brand-new email+phone -> device token issued immediately;
// email/phone matches an EXISTING client from an unrecognized device ->
// request still goes through but NO token is issued, an "connect this
// device" magic-link email goes to the ON-FILE address instead, and the
// whoami response never echoes email/phone (only parent_first_name +
// athlete names/ages) so an unverified device can't fish out saved PII.
// login_verify (tapping any magic link) always issues a fresh device token.
// Admin actions (x-admin-pin header, checked against sls_settings.admin_pin):
// admin_state, admin_respond, admin_location, admin_locations, admin_clients,
// admin_direct_booking, admin_recurring_create, admin_recurring_cancel,
// admin_session_cancel, admin_push_subscribe, admin_set_alert_email,
// admin_windows, admin_window, admin_window_delete, admin_calendar_set,
// admin_calendar_disconnect. The calendar URL (sls_settings.sophie_calendar_url)
// is gateway-only and never appears in ANY response — every read exposes a
// masked string (maskCalendarUrl) instead.
// Cron action (x-cron-key header, checked against sls_settings.cron_key, OR
// a valid x-admin-pin): cron_tick — expires stale requests, sends Sophie's
// pre-expiry nudge, sends parent 24h-before reminders, tops up recurring
// materialization.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseIcsBusyIntervals } from "./ics-parse.mjs";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin, x-cron-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const SITE = "https://coachpilot.org";
const DURATION_MIN = 60;

// -------------- small helpers --------------
function escHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function isEmail(s: unknown): boolean {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function normPhone(s: unknown): string {
  return String(s ?? "").replace(/\D/g, "");
}
function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}
function fmtPacific(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      weekday: "short", month: "short", day: "numeric",
      hour: "numeric", minute: "2-digit",
    }) + " PT";
  } catch { return iso; }
}
function isFutureIso(s: unknown, minMinutesOut = 30): boolean {
  if (typeof s !== "string") return false;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return false;
  return t > Date.now() + minMinutesOut * 60000;
}
async function getSetting(key: string): Promise<string | null> {
  const { data } = await db.from("sls_settings").select("value").eq("key", key).maybeSingle();
  return data?.value ?? null;
}
async function setSetting(key: string, value: string): Promise<void> {
  await db.from("sls_settings").upsert({ key, value, updated_at: new Date().toISOString() });
}
async function requireAdminPin(req: Request): Promise<boolean> {
  const pin = req.headers.get("x-admin-pin") || "";
  if (!pin) return false;
  const real = await getSetting("admin_pin");
  return !!real && pin === real;
}
async function requireCron(req: Request): Promise<boolean> {
  const key = req.headers.get("x-cron-key") || "";
  if (key) {
    const real = await getSetting("cron_key");
    if (real && key === real) return true;
  }
  return await requireAdminPin(req);
}
function overlaps(aStart: number, aDur: number, bStart: number, bDur: number): boolean {
  const aEnd = aStart + aDur * 60000;
  const bEnd = bStart + bDur * 60000;
  return aStart < bEnd && bStart < aEnd;
}

// -------------- session types (1-on-1 / Small Group) --------------
// athlete_name/athlete_age remain the back-compat display columns (joined
// name label / first athlete's age) so every pre-existing reader (emails,
// ICS, push) keeps working untouched; `athletes` jsonb is the source of
// truth for new rows. Old rows and admin-created rows (direct booking,
// recurring) leave athletes empty, so every reader falls back to
// athlete_name/athlete_age when the array is empty.
type Athlete = { name: string; age: string };
function sanitizeAthletes(raw: unknown): Athlete[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => ({ name: String((a as Record<string, unknown>)?.name || "").trim(), age: String((a as Record<string, unknown>)?.age || "").trim() }))
    .filter((a) => a.name);
}
function athletesFromRow(row: Record<string, unknown>): Athlete[] {
  const arr = sanitizeAthletes(row.athletes);
  if (arr.length) return arr;
  const name = String(row.athlete_name || "").trim();
  return name ? [{ name, age: String(row.athlete_age || "") }] : [];
}
function athletesNamesJoined(athletes: Athlete[]): string {
  return athletes.map((a) => a.name).join(" & ");
}
function athletesLineHtml(athletes: Athlete[]): string {
  return athletes.map((a) => escHtml(a.name) + (a.age ? ` (${escHtml(a.age)})` : "")).join(", ");
}
function sessionTypeLabel(sessionType: unknown, count: number): string {
  return sessionType === "small_group" ? `Small Group (${count})` : "1-on-1";
}
// Adds any athlete not already on the client's saved roster (case-
// insensitive name match); returns the possibly-grown roster + whether it
// actually changed, so callers only write when there's something new.
function growAthleteRoster(existingAthletes: unknown, incoming: Athlete[]): { athletes: Athlete[]; changed: boolean } {
  const athletes = sanitizeAthletes(existingAthletes);
  const known = new Set(athletes.map((a) => a.name.toLowerCase()));
  let changed = false;
  for (const a of incoming) {
    if (!known.has(a.name.toLowerCase())) {
      athletes.push(a);
      known.add(a.name.toLowerCase());
      changed = true;
    }
  }
  return { athletes, changed };
}

// -------------- device recognition --------------
// Raw tokens live only in the browser's localStorage; the DB only ever
// sees a SHA-256 hash (sls_devices.token_hash), same "never store the
// secret itself" posture as every credential in this empire.
async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function issueDeviceToken(clientId: string): Promise<string> {
  const raw = randomToken();
  const token_hash = await sha256Hex(raw);
  await db.from("sls_devices").insert({ client_id: clientId, token_hash, expires_at: new Date(Date.now() + 365 * 86400000).toISOString() });
  return raw;
}
async function findDeviceByRawToken(raw: string): Promise<{ id: string; client_id: string; revoked: boolean; expires_at: string } | null> {
  if (!raw) return null;
  const token_hash = await sha256Hex(raw);
  const { data } = await db.from("sls_devices").select("id,client_id,revoked,expires_at").eq("token_hash", token_hash).maybeSingle();
  return data ?? null;
}
// Verifying a token also slides its expiry forward (365d from now), so an
// actively-used device never silently expires.
async function verifyDeviceToken(raw: string): Promise<{ id: string; client_id: string } | null> {
  const d = await findDeviceByRawToken(raw);
  if (!d || d.revoked || new Date(d.expires_at).getTime() < Date.now()) return null;
  await db.from("sls_devices").update({ last_seen_at: new Date().toISOString(), expires_at: new Date(Date.now() + 365 * 86400000).toISOString() }).eq("id", d.id);
  return { id: d.id, client_id: d.client_id };
}

// -------------- Resend email --------------
// Last-line-of-defense test guard: any email whose recipient OR content
// references a ZZTEST-marked entity is forced to Resend's blackhole address
// regardless of what sls_settings/client records say. Test data always
// carries the literal string "ZZTEST" in athlete/parent names, which flow
// into every subject line and body — so this catches the real leak pattern
// (a ZZTEST request triggering an alert to Sophie/Coach's REAL configured
// address), not just sends to already-fake test addresses.
const RESEND_BLACKHOLE = "delivered@resend.dev";
function domainsOf(addrs: string[]): string {
  return addrs.map((a) => (a.split("@")[1] || "unknown")).join(",");
}
async function resendSend(payload: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!RESEND_API_KEY) return { ok: false, error: "email is not configured" };

  let toList = Array.isArray(payload.to) ? (payload.to as string[]) : [];
  const subject = String(payload.subject || "");
  const html = String(payload.html || "");
  const isZztest = toList.some((t) => /zztest/i.test(t)) || /ZZTEST/.test(subject) || /ZZTEST/.test(html);
  if (isZztest && !toList.every((t) => t === RESEND_BLACKHOLE)) {
    toList = [RESEND_BLACKHOLE];
    payload = { ...payload, to: toList };
  }

  // Quota guard (2026-09-15): the blackhole reroute above still made a REAL
  // Resend API call, burning quota shared with other production domains
  // (CueOps auth email included) on every single test run. Any final
  // recipient on @resend.dev is a test sink by definition -- never actually
  // send it, just log and report success.
  if (toList.length && toList.every((t) => /@resend\.dev$/i.test(t))) {
    console.log(`[test-email suppressed] subject="${subject.slice(0, 60)}" to_domain=${domainsOf(toList)}`);
    return { ok: true, id: "suppressed" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "resend error");
    console.error(`sls email send failed: subject="${subject.slice(0, 60)}" to_domain=${domainsOf(toList)} status=${res.status}`);
    return { ok: false, error: errText };
  }
  const j = await res.json().catch(() => ({}));
  return { ok: true, id: j.id };
}
function emailShell(bodyHtml: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4ede3;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:18px 12px;">
  <div style="background:#1b2a4a;border-radius:14px 14px 0 0;padding:20px 24px;">
    <div style="color:#faf6ef;font-size:22px;font-weight:bold;letter-spacing:0.3px;">Lessons with Sophie</div>
    <div style="color:#d4a24c;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;margin-top:3px;">Private Softball &amp; Baseball Lessons</div>
  </div>
  <div style="background:#ffffff;border-radius:0 0 14px 14px;padding:24px;color:#26324f;font-size:15px;line-height:1.55;box-shadow:0 6px 20px rgba(27,42,74,0.08);">
    ${bodyHtml}
  </div>
  <div style="text-align:center;color:#8a8378;font-size:11.5px;margin-top:14px;">Scheduling powered by CoachPilot</div>
</div>
</body></html>`;
}
function btn(href: string, label: string, color = "#e8623c"): string {
  return `<a href="${href}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:9px;font-size:15px;">${escHtml(label)}</a>`;
}

async function sendMail(to: string, subject: string, html: string, replyTo?: string) {
  return await resendSend({
    from: "Lessons with Sophie <noreply@coachpilot.org>",
    to: [to],
    subject,
    html,
    ...(replyTo ? { reply_to: replyTo } : {}),
  });
}
async function sophieAlertEmail(): Promise<string> {
  return (await getSetting("sophie_alert_email")) || "daniel.grande@ymail.com";
}
// Sent when a submission's email/phone matches an existing client but the
// device itself isn't recognized (trust rule: attach the booking to the
// existing record, but don't hand a device token to an unverified
// browser). Reuses the same 10-minute single-use login token as "Book
// again with Sophie" — tapping it both logs them in AND, per login_verify,
// issues this device a token for next time.
async function sendDeviceLinkEmail(client: { id: string; parent_name: string; parent_email: string }) {
  const token = randomToken();
  await db.from("sls_tokens").insert({ token, purpose: "login", client_id: client.id, expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
  const link = `${SITE}/sophie/?login_token=${token}`;
  await sendMail(client.parent_email, "Connect this device to your Sophie account", emailShell(`
    <p style="margin:0 0 14px;">Hi ${escHtml((client.parent_name || "").split(" ")[0] || "there")},</p>
    <p style="margin:0 0 14px;">Looks like you've booked with Sophie before. Tap below to connect this device so next time you can skip straight to picking a time.</p>
    <p style="margin:0 0 18px;">${btn(link, "Connect This Device")}</p>
    <p style="margin:0;color:#8a8378;font-size:13px;">This link works for the next 10 minutes. If this wasn't you, you can ignore this email.</p>
  `));
}

// -------------- Web Push (ported from flm-gateway; same raw-WebCrypto VAPID
// signing, reusing the CoachPilot project's existing VAPID secrets) --------------
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:daniel@cueops.io";

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64Url(b: Uint8Array | ArrayBuffer): string {
  const arr = b instanceof Uint8Array ? b : new Uint8Array(b);
  let s = "";
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function importVapidPrivateKey(privRaw: string): Promise<CryptoKey> {
  const priv = b64urlToBytes(privRaw);
  const pub = b64urlToBytes(VAPID_PUBLIC);
  if (pub.length !== 65 || pub[0] !== 0x04) throw new Error("VAPID public key must be uncompressed P-256 (65 bytes)");
  const x = bytesToB64Url(pub.slice(1, 33));
  const y = bytesToB64Url(pub.slice(33, 65));
  const d = bytesToB64Url(priv);
  return await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true } as JsonWebKey,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}
async function makeVapidJwt(audience: string): Promise<string> {
  const header = { typ: "JWT", alg: "ES256" };
  const now = Math.floor(Date.now() / 1000);
  const claims = { aud: audience, exp: now + 12 * 3600, sub: VAPID_SUBJECT };
  const enc = new TextEncoder();
  const headerB64 = bytesToB64Url(enc.encode(JSON.stringify(header)));
  const claimsB64 = bytesToB64Url(enc.encode(JSON.stringify(claims)));
  const signInput = `${headerB64}.${claimsB64}`;
  const key = await importVapidPrivateKey(VAPID_PRIVATE);
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signInput));
  return `${signInput}.${bytesToB64Url(sig)}`;
}
async function encryptPushPayload(payload: Uint8Array, clientPubKeyB64: string, authSecretB64: string): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(clientPubKeyB64);
  const authSecret = b64urlToBytes(authSecretB64);
  const serverKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKey.publicKey));
  const clientPubKey = await crypto.subtle.importKey("raw", clientPub, { name: "ECDH", namedCurve: "P-256" }, true, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: clientPubKey }, serverKey.privateKey, 256));
  async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
    const keyPrk = await crypto.subtle.importKey("raw", salt, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info } as unknown as HkdfParams, keyPrk, len * 8));
  }
  const infoPart1 = new TextEncoder().encode("WebPush: info\0");
  const info1 = new Uint8Array(infoPart1.length + clientPub.length + serverPubRaw.length);
  info1.set(infoPart1, 0);
  info1.set(clientPub, infoPart1.length);
  info1.set(serverPubRaw, infoPart1.length + clientPub.length);
  const ikm = await hkdf(authSecret, shared, info1, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload, 0);
  padded[payload.length] = 0x02;
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded));
  const rs = new Uint8Array([0, 0, 0x10, 0]);
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  header.set(rs, 16);
  header[20] = 65;
  header.set(serverPubRaw, 21);
  const out = new Uint8Array(header.length + cipher.length);
  out.set(header, 0);
  out.set(cipher, header.length);
  return out;
}
async function sendWebPush(sub: { endpoint: string; p256dh: string; auth: string; id: string }, payload: { title: string; body: string; url?: string; tag?: string }): Promise<{ ok: boolean; status?: number }> {
  if (!VAPID_PRIVATE || !VAPID_PUBLIC) return { ok: false };
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await makeVapidJwt(audience);
  const body = new TextEncoder().encode(JSON.stringify(payload));
  const encBody = await encryptPushPayload(body, sub.p256dh, sub.auth);
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      "TTL": "60",
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC}`,
    },
    body: encBody,
  });
  if (res.status === 404 || res.status === 410) {
    await db.from("sls_push_subs").update({ active: false }).eq("id", sub.id);
  }
  return { ok: res.ok, status: res.status };
}
async function notifyAdminPush(payload: { title: string; body: string; url?: string; tag?: string }): Promise<void> {
  try {
    const { data: subs } = await db.from("sls_push_subs").select("id,endpoint,p256dh,auth").eq("active", true);
    if (!subs || !subs.length) return;
    for (const s of subs) await sendWebPush(s, payload).catch(() => {});
  } catch (_e) { /* never let a push failure break the caller */ }
}

// -------------- ICS --------------
function icsForSession(s: { id: string; athlete_name: string; starts_at: string; duration_minutes: number; location_name?: string; location_address?: string }): string {
  const dt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const start = dt(s.starts_at);
  const end = dt(new Date(new Date(s.starts_at).getTime() + s.duration_minutes * 60000).toISOString());
  const loc = [s.location_name, s.location_address].filter(Boolean).join(", ");
  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//CoachPilot//Lessons with Sophie//EN
BEGIN:VEVENT
UID:sls-${s.id}@coachpilot.org
DTSTAMP:${dt(new Date().toISOString())}
DTSTART:${start}
DTEND:${end}
SUMMARY:Lesson with Sophie: ${s.athlete_name}
LOCATION:${loc}
DESCRIPTION:Private lesson with Sophie.
END:VEVENT
END:VCALENDAR
`;
}
function gcalLink(s: { athlete_name: string; starts_at: string; duration_minutes: number; location_name?: string; location_address?: string }): string {
  const dt = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const start = dt(s.starts_at);
  const end = dt(new Date(new Date(s.starts_at).getTime() + s.duration_minutes * 60000).toISOString());
  const loc = [s.location_name, s.location_address].filter(Boolean).join(", ");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Lesson with Sophie: ${s.athlete_name}`,
    dates: `${start}/${end}`,
    location: loc,
    details: "Private lesson with Sophie.",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// -------------- location resolution --------------
async function resolveLocation(body: Record<string, unknown>, field = "location_id"): Promise<{ id: string; name: string; address: string } | null> {
  if (body.new_location && typeof body.new_location === "object") {
    const nl = body.new_location as Record<string, unknown>;
    const name = String(nl.name || "").trim();
    if (!name) return null;
    const address = String(nl.address || "").trim();
    const { data, error } = await db.from("sls_locations").insert({ name, address, active: true }).select("id,name,address").single();
    if (error) return null;
    return data;
  }
  const id = body[field];
  if (!id) return null;
  const { data } = await db.from("sls_locations").select("id,name,address").eq("id", id).maybeSingle();
  return data ?? null;
}

// -------------- Availability windows + calendar overlay --------------
// Windows only decide what SHOWS on the public page as a tappable open
// slot. Every booking (open-slot or manually proposed) still lands as a
// normal pending sls_requests row requiring Sophie's approval — there is
// no auto-confirm path here, by design.
const SLOT_DURATION_MIN = 60;
const SLOT_STEP_MIN = 60;
const OPEN_SLOT_HORIZON_DAYS = 21;
const MIN_NOTICE_HOURS = 12;
const CALENDAR_CACHE_MS = 15 * 60000;

function normalizeCalendarUrl(raw: string): string | null {
  const url = String(raw || "").trim();
  if (!url) return null;
  if (url.startsWith("webcal://")) return "https://" + url.slice("webcal://".length);
  if (url.startsWith("https://")) return url;
  return null;
}
function maskCalendarUrl(url: string): string {
  const tail = url.slice(-6).replace(/[^a-zA-Z0-9]/g, "");
  return `Connected ✓ · calendar ending …${tail || "?????"}`;
}

// Pacific weekday + "HH:MM" wall-clock time for a given UTC instant.
function pacificWeekdayAndTime(ms: number): { weekday: number; hh: number; mm: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const wdStr = parts.find((p) => p.type === "weekday")?.value ?? "Sun";
  let hh = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const mm = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  if (hh === 24) hh = 0;
  return { weekday: wdMap[wdStr] ?? 0, hh, mm };
}
function pacificDateParts(ms: number): { y: number; mo: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(ms));
  return {
    y: parseInt(parts.find((p) => p.type === "year")!.value, 10),
    mo: parseInt(parts.find((p) => p.type === "month")!.value, 10),
    d: parseInt(parts.find((p) => p.type === "day")!.value, 10),
  };
}
function pacificOffsetMinutesAt(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "shortOffset" }).formatToParts(new Date(utcMs));
  const tz = parts.find((p) => p.type === "timeZoneName");
  const m = tz && /GMT([+-]\d+)/.exec(tz.value);
  return m ? parseInt(m[1], 10) * 60 : -8 * 60;
}
function zonedWallClockToUtcMs(y: number, moZeroBased: number, d: number, hh: number, mi: number): number {
  const asUtcMs = Date.UTC(y, moZeroBased, d, hh, mi, 0);
  return asUtcMs - pacificOffsetMinutesAt(asUtcMs) * 60000;
}

// Fetches + parses the connected calendar, cached ~15 min in sls_settings.
// On any failure: logs it and returns an empty busy list (never throws,
// never blocks slot generation on windows-minus-sessions).
async function getBusyIntervals(horizonStartMs: number, horizonEndMs: number): Promise<{ start: number; end: number }[]> {
  const url = await getSetting("sophie_calendar_url");
  if (!url) return [];
  const cachedAt = await getSetting("calendar_busy_cache_at");
  if (cachedAt && Date.now() - new Date(cachedAt).getTime() < CALENDAR_CACHE_MS) {
    const cached = await getSetting("calendar_busy_cache");
    if (cached) {
      try { return JSON.parse(cached); } catch { /* fall through to refetch */ }
    }
  }
  try {
    const res = await fetch(url, { headers: { "User-Agent": "LessonsWithSophie/1.0" } });
    if (!res.ok) throw new Error(`calendar fetch failed: ${res.status}`);
    const text = await res.text();
    const { busy } = parseIcsBusyIntervals(text, horizonStartMs, horizonEndMs);
    await setSetting("calendar_busy_cache", JSON.stringify(busy));
    await setSetting("calendar_busy_cache_at", new Date().toISOString());
    return busy;
  } catch (e) {
    console.error("calendar fetch/parse failed:", (e as Error).message);
    return [];
  }
}

async function computeOpenSlots(): Promise<string[]> {
  const { data: windows } = await db.from("sls_windows").select("*").eq("active", true);
  if (!windows || !windows.length) return [];

  const now = Date.now();
  const horizonStartMs = now;
  const horizonEndMs = now + OPEN_SLOT_HORIZON_DAYS * 86400000;
  const minNoticeMs = now + MIN_NOTICE_HOURS * 3600000;

  const [{ data: sessions }, busy, { data: pendingRequests }] = await Promise.all([
    db.from("sls_sessions").select("starts_at,duration_minutes").eq("status", "scheduled"),
    getBusyIntervals(horizonStartMs, horizonEndMs),
    db.from("sls_requests").select("proposed_times,counter_time,status").in("status", ["pending", "countered"]),
  ]);

  const pendingTimes = new Set<string>();
  for (const r of pendingRequests ?? []) {
    for (const t of (r.proposed_times as string[]) ?? []) pendingTimes.add(new Date(t).toISOString());
    if (r.counter_time) pendingTimes.add(new Date(r.counter_time as string).toISOString());
  }

  const candidates: number[] = [];
  for (let dayOffset = 0; dayOffset <= OPEN_SLOT_HORIZON_DAYS; dayOffset++) {
    const dayMs = now + dayOffset * 86400000;
    const { y, mo, d } = pacificDateParts(dayMs);
    const { weekday } = pacificWeekdayAndTime(dayMs);
    for (const w of windows) {
      if (w.weekday !== weekday) continue;
      const [startH, startM] = String(w.start_time).slice(0, 5).split(":").map(Number);
      const [endH, endM] = String(w.end_time).slice(0, 5).split(":").map(Number);
      const windowStartMs = zonedWallClockToUtcMs(y, mo - 1, d, startH, startM);
      const windowEndMs = zonedWallClockToUtcMs(y, mo - 1, d, endH, endM);
      for (let t = windowStartMs; t + SLOT_DURATION_MIN * 60000 <= windowEndMs; t += SLOT_STEP_MIN * 60000) {
        candidates.push(t);
      }
    }
  }

  const openSlots: string[] = [];
  for (const t of candidates) {
    if (t < minNoticeMs) continue;
    const iso = new Date(t).toISOString();
    if (pendingTimes.has(iso)) continue;
    const clashesSession = (sessions ?? []).some((s: Record<string, unknown>) => overlaps(t, SLOT_DURATION_MIN, new Date(s.starts_at as string).getTime(), s.duration_minutes as number));
    if (clashesSession) continue;
    const clashesBusy = busy.some((b) => overlaps(t, SLOT_DURATION_MIN, b.start, (b.end - b.start) / 60000));
    if (clashesBusy) continue;
    openSlots.push(iso);
  }
  return openSlots.sort();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    // ============ PUBLIC ============
    if (action === "request_login" && req.method === "POST") {
      const b = await req.json().catch(() => ({}));
      const contact = String(b.contact || "").trim();
      if (!contact) return json({ ok: false, error: "enter your phone or email" }, 400);
      let client: { id: string; parent_name: string; parent_email: string } | null = null;
      if (isEmail(contact)) {
        const { data } = await db.from("sls_clients").select("id,parent_name,parent_email").ilike("parent_email", contact.trim()).maybeSingle();
        client = data;
      }
      if (!client) {
        const digits = normPhone(contact);
        if (digits.length >= 7) {
          const { data } = await db.from("sls_clients").select("id,parent_name,parent_email").not("parent_phone", "is", null);
          client = (data ?? []).find((c: Record<string, unknown>) => normPhone((c as { parent_phone?: string }).parent_phone) === digits) as unknown as { id: string; parent_name: string; parent_email: string } | undefined ?? null;
        }
      }
      if (!client) return json({ ok: true, found: false });
      const token = randomToken();
      await db.from("sls_tokens").insert({ token, purpose: "login", client_id: client.id, expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
      const link = `${SITE}/sophie/?login_token=${token}`;
      await sendMail(client.parent_email, "Book again with Sophie", emailShell(`
        <p style="margin:0 0 14px;">Hi ${escHtml((client.parent_name || "").split(" ")[0] || "there")},</p>
        <p style="margin:0 0 18px;">Tap below to book another lesson with Sophie. This link works for the next 10 minutes.</p>
        <p style="margin:0 0 18px;">${btn(link, "Book a Session")}</p>
        <p style="margin:0;color:#8a8378;font-size:13px;">If you didn't ask for this, you can ignore this email.</p>
      `));
      return json({ ok: true, found: true });
    }

    if (action === "login_verify" && (req.method === "GET" || req.method === "POST")) {
      const token = req.method === "GET" ? (url.searchParams.get("token") || "") : String((await req.json().catch(() => ({}))).token || "");
      const { data: t } = await db.from("sls_tokens").select("*").eq("token", token).eq("purpose", "login").maybeSingle();
      if (!t || t.used_at || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "This link has expired. Please request a new one." }, 410);
      const { data: client } = await db.from("sls_clients").select("id,parent_name,parent_phone,parent_email,athletes").eq("id", t.client_id).maybeSingle();
      if (!client) return json({ ok: false, error: "We couldn't find your account." }, 404);
      // Single-use: without this, a tapped magic link could be replayed
      // (scanners, multiple tabs/devices, a deliberate refetch) to mint an
      // unbounded number of persistent device_tokens from one email. The
      // matching submit_request path now authenticates the booking itself
      // with the device_token issued right below, not by resubmitting this
      // same login_token -- so marking it used here doesn't block finishing
      // the booking a legitimate tap started.
      await db.from("sls_tokens").update({ used_at: new Date().toISOString() }).eq("id", t.id);
      const device_token = await issueDeviceToken(client.id);
      return json({ ok: true, client, device_token });
    }

    if (action === "whoami" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const dev = await verifyDeviceToken(String(b.device_token || ""));
      if (!dev) return json({ ok: true, found: false });
      const { data: client } = await db.from("sls_clients").select("parent_name,athletes").eq("id", dev.client_id).maybeSingle();
      if (!client) return json({ ok: true, found: false });
      // Data minimization: no email/phone, ever — an unverified browser
      // holding a valid device token only learns a first name + athlete
      // names/ages, never enough to be useful if the token were stolen.
      const athletes = sanitizeAthletes(client.athletes);
      return json({ ok: true, found: true, parent_first_name: (client.parent_name || "").split(" ")[0] || "", athletes });
    }

    if (action === "device_revoke" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const d = await findDeviceByRawToken(String(b.device_token || ""));
      if (d) await db.from("sls_devices").update({ revoked: true }).eq("id", d.id);
      return json({ ok: true });
    }

    if (action === "submit_request" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const fromOpenSlot = b.from_open_slot === true;
      const proposed = Array.isArray(b.proposed_times) ? b.proposed_times.filter((t) => isFutureIso(t)) : [];
      const minTimes = fromOpenSlot ? 1 : 2;
      if (proposed.length < minTimes || proposed.length > 3) {
        return json({ ok: false, error: fromOpenSlot ? "That time is no longer valid — pick another." : "Please propose 2 or 3 times that work for you." }, 400);
      }

      const session_type = b.session_type === "small_group" ? "small_group" : "one_on_one";
      let athletesIn = sanitizeAthletes(b.athletes);
      if (!athletesIn.length && b.athlete_name) {
        // Legacy single-athlete shape, still accepted for back-compat.
        athletesIn = sanitizeAthletes([{ name: b.athlete_name, age: b.athlete_age }]);
      }
      if (!athletesIn.length) return json({ ok: false, error: "At least one athlete is required." }, 400);
      if (session_type === "one_on_one" && athletesIn.length !== 1) return json({ ok: false, error: "1-on-1 sessions need exactly one athlete." }, 400);
      if (session_type === "small_group" && (athletesIn.length < 2 || athletesIn.length > 4)) return json({ ok: false, error: "Small Group sessions need 2 to 4 athletes." }, 400);
      const athlete_name = athletesNamesJoined(athletesIn);
      const athlete_age = athletesIn[0].age;
      const focus_notes = String(b.focus_notes || "").trim().slice(0, 1000);

      let clientId: string; let parent_name: string; let parent_phone: string | null; let parent_email: string; let how_found: string | null; let isNew: boolean;
      let deviceTokenOut: string | null = null;
      let deviceLinkSent = false;

      if (b.mode === "returning") {
        const token = String(b.login_token || "");
        const { data: t } = await db.from("sls_tokens").select("*").eq("token", token).eq("purpose", "login").maybeSingle();
        if (!t || t.used_at || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "Your booking link expired. Please start again." }, 410);
        const { data: client } = await db.from("sls_clients").select("*").eq("id", t.client_id).maybeSingle();
        if (!client) return json({ ok: false, error: "Account not found." }, 404);
        await db.from("sls_tokens").update({ used_at: new Date().toISOString() }).eq("id", t.id);
        clientId = client.id; parent_name = client.parent_name; parent_phone = client.parent_phone; parent_email = client.parent_email; how_found = client.how_found; isNew = false;
        const { athletes: grown, changed } = growAthleteRoster(client.athletes, athletesIn);
        if (changed) await db.from("sls_clients").update({ athletes: grown, updated_at: new Date().toISOString() }).eq("id", clientId);
      } else if (typeof b.device_token === "string" && b.device_token) {
        const dev = await verifyDeviceToken(b.device_token);
        if (!dev) return json({ ok: false, error: "This device isn't recognized anymore. Please verify by email.", device_invalid: true }, 401);
        const { data: client } = await db.from("sls_clients").select("*").eq("id", dev.client_id).maybeSingle();
        if (!client) return json({ ok: false, error: "Account not found." }, 404);
        clientId = client.id; parent_name = client.parent_name; parent_phone = client.parent_phone; parent_email = client.parent_email; how_found = client.how_found; isNew = false;
        const { athletes: grown, changed } = growAthleteRoster(client.athletes, athletesIn);
        if (changed) await db.from("sls_clients").update({ athletes: grown, updated_at: new Date().toISOString() }).eq("id", clientId);
      } else {
        parent_name = String(b.parent_name || "").trim();
        parent_email = String(b.parent_email || "").trim();
        parent_phone = String(b.parent_phone || "").trim() || null;
        how_found = String(b.how_found || "").trim() || null;
        if (!parent_name || !isEmail(parent_email)) return json({ ok: false, error: "Parent name and a valid email are required." }, 400);
        // Trust-rule matching: an unrecognized device claiming an email OR
        // phone already on file does NOT get a device token — see the
        // header comment for the full rule.
        const { data: existingByEmail } = await db.from("sls_clients").select("*").ilike("parent_email", parent_email).maybeSingle();
        let existing = existingByEmail;
        if (!existing && parent_phone) {
          const digits = normPhone(parent_phone);
          if (digits.length >= 7) {
            const { data: withPhones } = await db.from("sls_clients").select("*").not("parent_phone", "is", null);
            existing = (withPhones ?? []).find((c: Record<string, unknown>) => normPhone((c as { parent_phone?: string }).parent_phone) === digits) as unknown as Record<string, unknown> | undefined ?? null;
          }
        }
        if (existing) {
          clientId = existing.id;
          const { athletes: grown } = growAthleteRoster(existing.athletes, athletesIn);
          await db.from("sls_clients").update({ parent_name, parent_phone: parent_phone || existing.parent_phone, how_found: how_found || existing.how_found, athletes: grown, updated_at: new Date().toISOString() }).eq("id", clientId);
          isNew = false;
          deviceLinkSent = true;
        } else {
          const { data: created, error } = await db.from("sls_clients").insert({ parent_name, parent_phone, parent_email, how_found, athletes: athletesIn }).select("id").single();
          if (error) return json({ ok: false, error: "Could not save your info." }, 500);
          clientId = created.id;
          isNew = true;
          deviceTokenOut = await issueDeviceToken(clientId);
        }
      }

      let rescheduleOf: string | null = null;
      if (b.reschedule_of_session_id) {
        const { data: sess } = await db.from("sls_sessions").select("id,client_id,status").eq("id", b.reschedule_of_session_id).maybeSingle();
        if (sess && sess.client_id === clientId && sess.status === "scheduled") rescheduleOf = sess.id;
      }

      // Duplicate-submit guard: a page reload/double-tap within the same
      // couple of minutes for the same client + athlete(s) + times should
      // not create a second pending request. Return the existing one instead.
      const recentCutoff = new Date(Date.now() - 3 * 60000).toISOString();
      const { data: recent } = await db.from("sls_requests").select("id,proposed_times")
        .eq("client_id", clientId).eq("athlete_name", athlete_name).eq("status", "pending").gte("created_at", recentCutoff);
      const dupe = (recent ?? []).find((r: Record<string, unknown>) => JSON.stringify(r.proposed_times) === JSON.stringify(proposed));
      if (dupe) return json({ ok: true, request_id: dupe.id, duplicate: true });

      const { data: reqRow, error: reqErr } = await db.from("sls_requests").insert({
        client_id: clientId,
        is_new_client: isNew,
        athlete_name, athlete_age,
        session_type, athletes: athletesIn,
        focus_notes,
        parent_name, parent_phone, parent_email, how_found,
        proposed_times: proposed,
        reschedule_of_session_id: rescheduleOf,
        source: fromOpenSlot ? "open_slot" : "manual",
      }).select("id").single();
      if (reqErr) return json({ ok: false, error: "Could not submit your request." }, 500);

      const typeLabel = sessionTypeLabel(session_type, athletesIn.length);
      const athleteLine = athletesLineHtml(athletesIn);
      await sendMail(parent_email, "Request sent to Sophie", emailShell(`
        <p style="margin:0 0 14px;">Hi ${escHtml(parent_name.split(" ")[0])},</p>
        <p style="margin:0 0 14px;">Your ${escHtml(typeLabel)} lesson request for <b>${athleteLine}</b> is in. Sophie will respond within 48 hours.</p>
        <p style="margin:0;color:#8a8378;font-size:13px;">Proposed times: ${proposed.map((t: string) => escHtml(fmtPacific(t))).join(" &middot; ")}</p>
      `));
      const alertTo = await sophieAlertEmail();
      await sendMail(alertTo, `New lesson request: ${athlete_name}`, emailShell(`
        <p style="margin:0 0 14px;"><b>${escHtml(isNew ? "New client" : "Returning client")}</b> ${escHtml(typeLabel)} request for <b>${athleteLine}</b>.</p>
        <p style="margin:0 0 14px;">From ${escHtml(parent_name)} (${escHtml(parent_email)}${parent_phone ? ", " + escHtml(parent_phone) : ""})</p>
        ${focus_notes ? `<p style="margin:0 0 14px;">"${escHtml(focus_notes)}"</p>` : ""}
        <p style="margin:0 0 14px;">Times: ${proposed.map((t: string) => escHtml(fmtPacific(t))).join(" &middot; ")}</p>
        <p style="margin:0;">${btn(`${SITE}/sophie/coach/`, "Open Coach's Hub")}</p>
      `), "Daniel.Grande@ymail.com");
      await notifyAdminPush({ title: "New lesson request", body: `${typeLabel} — ${athlete_name}, ${proposed.length} times proposed`, url: "/sophie/coach/", tag: "sls-new-request" });

      if (deviceLinkSent) await sendDeviceLinkEmail({ id: clientId, parent_name, parent_email });

      return json({
        ok: true, request_id: reqRow.id,
        ...(deviceTokenOut ? { device_token: deviceTokenOut } : {}),
        ...(deviceLinkSent ? { device_link_sent: true } : {}),
      });
    }

    if (action === "counter_info" && req.method === "GET") {
      const token = url.searchParams.get("token") || "";
      const { data: t } = await db.from("sls_tokens").select("*").eq("token", token).eq("purpose", "counter_accept").maybeSingle();
      if (!t || t.used_at || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "This offer has expired." }, 410);
      const { data: r } = await db.from("sls_requests").select("id,athlete_name,counter_time,status,counter_location_id").eq("id", t.request_id).maybeSingle();
      if (!r || r.status !== "countered") return json({ ok: false, error: "This offer is no longer available." }, 410);
      const { data: loc } = r.counter_location_id ? await db.from("sls_locations").select("name,address").eq("id", r.counter_location_id).maybeSingle() : { data: null };
      return json({ ok: true, request: { athlete_name: r.athlete_name, counter_time: r.counter_time, counter_time_display: fmtPacific(r.counter_time), location: loc } });
    }

    if (action === "counter_respond" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const token = String(b.token || "");
      const choice = String(b.choice || "");
      const { data: t } = await db.from("sls_tokens").select("*").eq("token", token).eq("purpose", "counter_accept").maybeSingle();
      if (!t || t.used_at || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "This offer has expired." }, 410);
      const { data: r } = await db.from("sls_requests").select("*").eq("id", t.request_id).maybeSingle();
      if (!r || r.status !== "countered") return json({ ok: false, error: "This offer is no longer available." }, 410);
      await db.from("sls_tokens").update({ used_at: new Date().toISOString() }).eq("id", t.id);

      if (choice === "decline") {
        await db.from("sls_requests").update({ status: "declined", decline_message: "Family could not make the countered time.", updated_at: new Date().toISOString() }).eq("id", r.id);
        await notifyAdminPush({ title: "Counter-offer declined", body: `${r.athlete_name}: the family could not make that time`, url: "/sophie/coach/", tag: "sls-counter-declined" });
        return json({ ok: true, result: "declined" });
      }

      // accept the countered time
      const { data: loc } = r.counter_location_id ? await db.from("sls_locations").select("id,name,address").eq("id", r.counter_location_id).maybeSingle() : { data: null };
      if (!loc) return json({ ok: false, error: "This offer is missing a location. Contact Sophie directly." }, 500);
      const startMs = new Date(r.counter_time).getTime();
      const { data: allSessions } = await db.from("sls_sessions").select("id,starts_at,duration_minutes").eq("status", "scheduled");
      const hasOverlap = (allSessions ?? []).some((s: Record<string, unknown>) => overlaps(startMs, DURATION_MIN, new Date(s.starts_at as string).getTime(), s.duration_minutes as number));
      if (hasOverlap) {
        await notifyAdminPush({ title: "Scheduling conflict", body: `${r.athlete_name} accepted a time that now conflicts with another session, please review`, url: "/sophie/coach/", tag: "sls-conflict" });
      }
      if (r.reschedule_of_session_id) await db.from("sls_sessions").update({ status: "cancelled", notes: "Rescheduled" }).eq("id", r.reschedule_of_session_id);
      const { data: session, error: sessErr } = await db.from("sls_sessions").insert({
        client_id: r.client_id, athlete_name: r.athlete_name, starts_at: r.counter_time, duration_minutes: DURATION_MIN,
        session_type: r.session_type, athletes: r.athletes,
        location_id: loc.id, source: "request", request_id: r.id, status: "scheduled",
      }).select("*").single();
      if (sessErr) return json({ ok: false, error: "Could not confirm the session." }, 500);
      await db.from("sls_requests").update({ status: "accepted", session_id: session.id, updated_at: new Date().toISOString() }).eq("id", r.id);
      await sendConfirmation(r, session, loc);
      return json({ ok: true, result: "accepted" });
    }

    if (action === "manage_info" && req.method === "GET") {
      const token = url.searchParams.get("token") || "";
      const { data: t } = await db.from("sls_tokens").select("*").eq("token", token).in("purpose", ["session_cancel", "session_reschedule"]).maybeSingle();
      if (!t || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "This link has expired." }, 410);
      const { data: s } = await db.from("sls_sessions").select("id,athlete_name,starts_at,duration_minutes,status,location_id").eq("id", t.session_id).maybeSingle();
      if (!s) return json({ ok: false, error: "Session not found." }, 404);
      const { data: loc } = s.location_id ? await db.from("sls_locations").select("name,address").eq("id", s.location_id).maybeSingle() : { data: null };
      return json({ ok: true, session: { ...s, starts_at_display: fmtPacific(s.starts_at), location: loc } });
    }

    if (action === "session_cancel" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const token = String(b.token || "");
      const { data: t } = await db.from("sls_tokens").select("*").in("purpose", ["session_cancel", "session_reschedule"]).eq("token", token).maybeSingle();
      if (!t || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "This link has expired." }, 410);
      const { data: s } = await db.from("sls_sessions").select("*").eq("id", t.session_id).maybeSingle();
      if (!s || s.status !== "scheduled") return json({ ok: false, error: "This session can't be cancelled." }, 400);
      await db.from("sls_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", s.id);
      await notifyAdminPush({ title: "Session cancelled", body: `${s.athlete_name} cancelled ${fmtPacific(s.starts_at)}`, url: "/sophie/coach/", tag: "sls-cancel" });
      return json({ ok: true });
    }

    if (action === "session_reschedule_start" && req.method === "POST") {
      const b = await req.json().catch(() => ({})) as Record<string, unknown>;
      const token = String(b.token || "");
      const { data: t } = await db.from("sls_tokens").select("*").in("purpose", ["session_cancel", "session_reschedule"]).eq("token", token).maybeSingle();
      if (!t || new Date(t.expires_at).getTime() < Date.now()) return json({ ok: false, error: "This link has expired." }, 410);
      const { data: s } = await db.from("sls_sessions").select("id,client_id,status").eq("id", t.session_id).maybeSingle();
      if (!s || s.status !== "scheduled") return json({ ok: false, error: "This session can't be rescheduled." }, 400);
      const loginToken = randomToken();
      await db.from("sls_tokens").insert({ token: loginToken, purpose: "login", client_id: s.client_id, expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
      return json({ ok: true, login_token: loginToken, session_id: s.id });
    }

    if (action === "ics_session" && req.method === "GET") {
      const id = url.searchParams.get("id") || "";
      const { data: s } = await db.from("sls_sessions").select("id,athlete_name,starts_at,duration_minutes,status,location_id").eq("id", id).eq("status", "scheduled").maybeSingle();
      if (!s) return new Response("Not found", { status: 404, headers: CORS });
      const { data: loc } = s.location_id ? await db.from("sls_locations").select("name,address").eq("id", s.location_id).maybeSingle() : { data: null };
      const body = icsForSession({ ...s, location_name: loc?.name, location_address: loc?.address });
      return new Response(body, { headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8" } });
    }

    if (action === "open_slots" && req.method === "GET") {
      const slots = await computeOpenSlots();
      return json({ ok: true, slots });
    }

    // ============ ADMIN ============
    if (action.startsWith("admin_")) {
      if (!(await requireAdminPin(req))) return json({ error: "unauthorized" }, 401);

      if (action === "admin_state" && req.method === "GET") {
        const { data: requests } = await db.from("sls_requests").select("*").in("status", ["pending", "countered"]).order("created_at", { ascending: true });
        const { data: sessions } = await db.from("sls_sessions").select("*").eq("status", "scheduled").order("starts_at", { ascending: true }).limit(200);
        const { data: locations } = await db.from("sls_locations").select("*").eq("active", true).order("name");
        const { data: recurring } = await db.from("sls_recurring").select("*").eq("active", true).order("created_at", { ascending: false });
        const { data: windows } = await db.from("sls_windows").select("*").order("weekday").order("start_time");
        const sessList = sessions ?? [];
        const reqList = requests ?? [];
        const timesFor = (r: Record<string, unknown>) => [...(r.proposed_times as string[]), ...(r.counter_time ? [r.counter_time as string] : [])];
        const withFlags = reqList.map((r: Record<string, unknown>) => {
          const times = timesFor(r);
          const flags: Record<string, boolean> = {};
          let flagged = false;
          for (const t of times) {
            const ms = new Date(t).getTime();
            const hitSession = sessList.some((s: Record<string, unknown>) => overlaps(ms, DURATION_MIN, new Date(s.starts_at as string).getTime(), s.duration_minutes as number));
            // Two different pending/countered requests proposing the exact
            // same slot should ALSO flag, so Sophie sees the collision
            // before she accepts one and creates a real session conflict.
            const hitOtherRequest = reqList.some((other) => other !== r && timesFor(other).some((ot) => overlaps(ms, DURATION_MIN, new Date(ot).getTime(), DURATION_MIN)));
            const hit = hitSession || hitOtherRequest;
            flags[t] = hit;
            if (hit) flagged = true;
          }
          return { ...r, overlap_flags: flags, flagged };
        });
        const alertEmail = await getSetting("sophie_alert_email");
        const calendarUrl = await getSetting("sophie_calendar_url");
        return json({
          ok: true, requests: withFlags, sessions: sessList, locations: locations ?? [], recurring: recurring ?? [],
          windows: windows ?? [], sophie_alert_email: alertEmail,
          calendar_connected: !!calendarUrl, calendar_masked: calendarUrl ? maskCalendarUrl(calendarUrl) : null,
        });
      }

      if (action === "admin_respond" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const { data: r } = await db.from("sls_requests").select("*").eq("id", b.request_id).maybeSingle();
        if (!r) return json({ ok: false, error: "Request not found." }, 404);
        if (!["pending", "countered"].includes(r.status)) return json({ ok: false, error: "This request has already been handled." }, 400);

        if (b.response === "decline") {
          await db.from("sls_requests").update({ status: "declined", decline_message: String(b.message || ""), updated_at: new Date().toISOString() }).eq("id", r.id);
          await sendMail(r.parent_email, "About your lesson request", emailShell(`
            <p style="margin:0 0 14px;">Hi ${escHtml(r.parent_name.split(" ")[0])},</p>
            <p style="margin:0 0 14px;">Sophie isn't able to make any of the proposed times work for ${escHtml(r.athlete_name)} this time.</p>
            ${b.message ? `<p style="margin:0 0 14px;">${escHtml(String(b.message))}</p>` : ""}
            <p style="margin:0;">${btn(`${SITE}/sophie/`, "Request a Different Time")}</p>
          `));
          return json({ ok: true, result: "declined" });
        }

        if (b.response === "counter") {
          const counter_time = String(b.counter_time || "");
          if (!isFutureIso(counter_time)) return json({ ok: false, error: "Pick a valid future time." }, 400);
          const loc = await resolveLocation(b, "location_id");
          if (!loc) return json({ ok: false, error: "Pick or add a location for the counter-offer." }, 400);
          const expires = new Date(Date.now() + 36 * 3600000).toISOString();
          await db.from("sls_requests").update({ status: "countered", counter_time, counter_location_id: loc.id, expires_at: expires, reminder_sent_at: null, updated_at: new Date().toISOString() }).eq("id", r.id);
          const acceptToken = randomToken();
          const declineToken = randomToken();
          await db.from("sls_tokens").insert([
            { token: acceptToken, purpose: "counter_accept", request_id: r.id, expires_at: expires },
            { token: declineToken, purpose: "counter_accept", request_id: r.id, expires_at: expires },
          ]);
          await sendMail(r.parent_email, "Sophie proposed a different time", emailShell(`
            <p style="margin:0 0 14px;">Hi ${escHtml(r.parent_name.split(" ")[0])},</p>
            <p style="margin:0 0 14px;">Sophie can't make the times you proposed for ${escHtml(r.athlete_name)}, but she can do:</p>
            <p style="margin:0 0 18px;font-size:18px;font-weight:600;color:#1b2a4a;">${escHtml(fmtPacific(counter_time))} at ${escHtml(loc.name)}</p>
            <p style="margin:0 0 10px;">${btn(`${SITE}/sophie/counter.html?token=${acceptToken}`, "Yes, that works!")}</p>
            <p style="margin:0;"><a href="${SITE}/sophie/counter.html?token=${declineToken}&choice=decline" style="color:#8a8378;font-size:13px;">That doesn't work for us</a></p>
            <p style="margin:18px 0 0;color:#8a8378;font-size:12.5px;">Respond within 36 hours or this offer will expire.</p>
          `));
          return json({ ok: true, result: "countered" });
        }

        if (b.response === "accept") {
          const chosen = String(b.chosen_time || "");
          const validTimes = [...(r.proposed_times as string[]), ...(r.counter_time ? [r.counter_time] : [])];
          if (!validTimes.includes(chosen)) return json({ ok: false, error: "Choose one of the proposed times." }, 400);
          const loc = await resolveLocation(b, "location_id");
          if (!loc) return json({ ok: false, error: "Pick or add a location." }, 400);
          const startMs = new Date(chosen).getTime();
          const { data: allSessions } = await db.from("sls_sessions").select("id,starts_at,duration_minutes").eq("status", "scheduled");
          const hasOverlap = (allSessions ?? []).some((s: Record<string, unknown>) => overlaps(startMs, DURATION_MIN, new Date(s.starts_at as string).getTime(), s.duration_minutes as number));
          if (hasOverlap && !b.force) return json({ ok: false, error: "overlap", overlap: true }, 409);
          if (r.reschedule_of_session_id) await db.from("sls_sessions").update({ status: "cancelled", notes: "Rescheduled" }).eq("id", r.reschedule_of_session_id);
          const { data: session, error: sessErr } = await db.from("sls_sessions").insert({
            client_id: r.client_id, athlete_name: r.athlete_name, starts_at: chosen, duration_minutes: DURATION_MIN,
            session_type: r.session_type, athletes: r.athletes,
            location_id: loc.id, source: "request", request_id: r.id, status: "scheduled",
          }).select("*").single();
          if (sessErr) return json({ ok: false, error: "Could not create the session." }, 500);
          await db.from("sls_requests").update({ status: "accepted", session_id: session.id, updated_at: new Date().toISOString() }).eq("id", r.id);
          await sendConfirmation(r, session, loc);
          return json({ ok: true, result: "accepted" });
        }

        return json({ ok: false, error: "Unknown response type." }, 400);
      }

      if (action === "admin_location" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const name = String(b.name || "").trim();
        if (!name) return json({ ok: false, error: "Name is required." }, 400);
        const { data, error } = await db.from("sls_locations").insert({ name, address: String(b.address || "").trim(), active: true }).select("*").single();
        if (error) return json({ ok: false, error: "Could not save location." }, 500);
        return json({ ok: true, location: data });
      }

      if (action === "admin_locations" && req.method === "GET") {
        const { data } = await db.from("sls_locations").select("*").order("name");
        return json({ ok: true, locations: data ?? [] });
      }

      if (action === "admin_clients" && req.method === "GET") {
        const { data } = await db.from("sls_clients").select("id,parent_name,parent_phone,parent_email,athletes").order("parent_name").limit(500);
        return json({ ok: true, clients: data ?? [] });
      }

      if (action === "admin_windows" && req.method === "GET") {
        const { data } = await db.from("sls_windows").select("*").order("weekday").order("start_time");
        return json({ ok: true, windows: data ?? [] });
      }

      if (action === "admin_window" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const weekday = Number(b.weekday);
        const start_time = String(b.start_time || "");
        const end_time = String(b.end_time || "");
        if (Number.isNaN(weekday) || weekday < 0 || weekday > 6 || !start_time || !end_time) {
          return json({ ok: false, error: "weekday, start_time, and end_time are required." }, 400);
        }
        if (start_time >= end_time) return json({ ok: false, error: "Start time must be before end time." }, 400);
        const row = { weekday, start_time, end_time, active: b.active !== false };
        if (b.id) {
          const { data, error } = await db.from("sls_windows").update(row).eq("id", b.id).select("*").single();
          if (error) return json({ ok: false, error: "Could not update window." }, 500);
          return json({ ok: true, window: data });
        }
        const { data, error } = await db.from("sls_windows").insert(row).select("*").single();
        if (error) return json({ ok: false, error: "Could not create window." }, 500);
        return json({ ok: true, window: data });
      }

      if (action === "admin_window_delete" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        if (!b.id) return json({ ok: false, error: "id required" }, 400);
        await db.from("sls_windows").delete().eq("id", b.id);
        return json({ ok: true });
      }

      if (action === "admin_calendar_set" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const normalized = normalizeCalendarUrl(String(b.url || ""));
        if (!normalized) return json({ ok: false, error: "Paste a valid webcal:// or https:// calendar link." }, 400);
        await setSetting("sophie_calendar_url", normalized);
        await setSetting("calendar_busy_cache", "");
        await setSetting("calendar_busy_cache_at", "");
        return json({ ok: true, masked: maskCalendarUrl(normalized) });
      }

      if (action === "admin_calendar_disconnect" && req.method === "POST") {
        await setSetting("sophie_calendar_url", "");
        await setSetting("calendar_busy_cache", "");
        await setSetting("calendar_busy_cache_at", "");
        return json({ ok: true });
      }

      if (action === "admin_direct_booking" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        let clientId = String(b.client_id || "");
        if (!clientId && b.new_client) {
          const nc = b.new_client as Record<string, unknown>;
          const parent_email = String(nc.parent_email || "").trim();
          if (!isEmail(parent_email)) return json({ ok: false, error: "Valid parent email required for a new client." }, 400);
          const { data: created, error } = await db.from("sls_clients").insert({
            parent_name: String(nc.parent_name || "").trim(),
            parent_phone: String(nc.parent_phone || "").trim() || null,
            parent_email,
            how_found: String(nc.how_found || "").trim() || null,
            athletes: [{ name: String(b.athlete_name || "").trim(), age: String(b.athlete_age || "") }],
          }).select("id").single();
          if (error) return json({ ok: false, error: "Could not create client." }, 500);
          clientId = created.id;
        }
        if (!clientId) return json({ ok: false, error: "Client required." }, 400);
        const starts_at = String(b.starts_at || "");
        if (!isFutureIso(starts_at, 0)) return json({ ok: false, error: "Pick a valid future time." }, 400);
        const loc = await resolveLocation(b, "location_id");
        const startMs = new Date(starts_at).getTime();
        const dur = Number(b.duration_minutes || DURATION_MIN);
        const { data: allSessions } = await db.from("sls_sessions").select("id,starts_at,duration_minutes").eq("status", "scheduled");
        const hasOverlap = (allSessions ?? []).some((s: Record<string, unknown>) => overlaps(startMs, dur, new Date(s.starts_at as string).getTime(), s.duration_minutes as number));
        if (hasOverlap && !b.force) return json({ ok: false, error: "overlap", overlap: true }, 409);
        const { data: session, error } = await db.from("sls_sessions").insert({
          client_id: clientId, athlete_name: String(b.athlete_name || "").trim(), starts_at, duration_minutes: dur,
          location_id: loc?.id ?? null, source: "direct", status: "scheduled", notes: String(b.notes || ""),
        }).select("*").single();
        if (error) return json({ ok: false, error: "Could not create session." }, 500);
        return json({ ok: true, session });
      }

      if (action === "admin_recurring_create" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const client_id = String(b.client_id || "");
        const weekday = Number(b.weekday);
        const start_time = String(b.start_time || "");
        if (!client_id || Number.isNaN(weekday) || !start_time) return json({ ok: false, error: "client, weekday, and start time are required." }, 400);
        const loc = await resolveLocation(b, "location_id");
        const starts_on = String(b.starts_on || new Date().toISOString().slice(0, 10));
        const ends_on = b.ends_on ? String(b.ends_on) : null;
        const dur = Number(b.duration_minutes || DURATION_MIN);
        const { data: rec, error } = await db.from("sls_recurring").insert({
          client_id, athlete_name: String(b.athlete_name || "").trim(), weekday, start_time, duration_minutes: dur,
          location_id: loc?.id ?? null, starts_on, ends_on, notes: String(b.notes || ""), active: true,
        }).select("*").single();
        if (error) return json({ ok: false, error: "Could not create recurring series." }, 500);
        const created = await materializeRecurring(rec, 8);
        return json({ ok: true, recurring: rec, sessions_created: created });
      }

      if (action === "admin_recurring_cancel" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        await db.from("sls_recurring").update({ active: false }).eq("id", b.recurring_id);
        await db.from("sls_sessions").update({ status: "cancelled" }).eq("recurring_id", b.recurring_id).eq("status", "scheduled").gt("starts_at", new Date().toISOString());
        return json({ ok: true });
      }

      if (action === "admin_session_cancel" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        await db.from("sls_sessions").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", b.session_id);
        return json({ ok: true });
      }

      if (action === "admin_push_subscribe" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const sub = b.subscription as Record<string, unknown>;
        if (!sub?.endpoint) return json({ ok: false, error: "bad subscription" }, 400);
        const keys = sub.keys as Record<string, unknown>;
        const { error } = await db.from("sls_push_subs").upsert({
          endpoint: sub.endpoint, p256dh: keys?.p256dh, auth: keys?.auth, active: true,
        }, { onConflict: "endpoint" });
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, key: VAPID_PUBLIC });
      }

      if (action === "admin_set_alert_email" && req.method === "POST") {
        const b = await req.json().catch(() => ({})) as Record<string, unknown>;
        const email = String(b.email || "").trim();
        if (!isEmail(email)) return json({ ok: false, error: "Valid email required." }, 400);
        await setSetting("sophie_alert_email", email);
        return json({ ok: true });
      }

      return json({ error: "unknown admin action" }, 404);
    }

    // ============ CRON ============
    if (action === "cron_tick") {
      if (!(await requireCron(req))) return json({ error: "unauthorized" }, 401);
      const now = Date.now();
      const results: Record<string, number> = { expired: 0, nudged: 0, session_reminders: 0, recurring_topped_up: 0 };

      // 1. Pre-expiry nudge to Sophie (12h before expiry, once).
      const { data: soon } = await db.from("sls_requests").select("*").in("status", ["pending", "countered"]).is("reminder_sent_at", null);
      for (const r of soon ?? []) {
        const hoursLeft = (new Date(r.expires_at).getTime() - now) / 3600000;
        if (hoursLeft <= 12 && hoursLeft > 0) {
          const alertTo = await sophieAlertEmail();
          await sendMail(alertTo, `Reminder: ${r.athlete_name}'s request expires soon`, emailShell(`
            <p style="margin:0 0 14px;">This request from ${escHtml(r.parent_name)} expires in under 12 hours.</p>
            <p style="margin:0;">${btn(`${SITE}/sophie/coach/`, "Open Coach's Hub")}</p>
          `), "Daniel.Grande@ymail.com");
          await db.from("sls_requests").update({ reminder_sent_at: new Date().toISOString() }).eq("id", r.id);
          results.nudged++;
        }
      }

      // 2. Expire stale requests.
      const { data: expired } = await db.from("sls_requests").update({ status: "expired", updated_at: new Date().toISOString() })
        .in("status", ["pending", "countered"]).lt("expires_at", new Date().toISOString()).select("id");
      results.expired = (expired ?? []).length;

      // 3. 24h-before session reminders to parents.
      const windowStart = new Date(now + 23 * 3600000).toISOString();
      const windowEnd = new Date(now + 25 * 3600000).toISOString();
      const { data: upcoming } = await db.from("sls_sessions").select("*").eq("status", "scheduled").is("reminder_sent_at", null).gte("starts_at", windowStart).lte("starts_at", windowEnd);
      for (const s of upcoming ?? []) {
        const { data: client } = await db.from("sls_clients").select("parent_name,parent_email").eq("id", s.client_id).maybeSingle();
        if (!client) continue;
        const { data: loc } = s.location_id ? await db.from("sls_locations").select("name,address").eq("id", s.location_id).maybeSingle() : { data: null };
        const reminderAthletes = athletesFromRow(s);
        await sendMail(client.parent_email, `Reminder: lesson tomorrow with Sophie`, emailShell(`
          <p style="margin:0 0 14px;">Hi ${escHtml((client.parent_name || "").split(" ")[0] || "there")},</p>
          <p style="margin:0 0 14px;">Reminder: ${athletesLineHtml(reminderAthletes)}'s ${escHtml(sessionTypeLabel(s.session_type, reminderAthletes.length))} lesson with Sophie is tomorrow:</p>
          <p style="margin:0 0 8px;font-weight:600;color:#1b2a4a;">${escHtml(fmtPacific(s.starts_at))}</p>
          ${loc ? `<p style="margin:0;color:#8a8378;">${escHtml(loc.name)}${loc.address ? ", " + escHtml(loc.address) : ""}</p>` : ""}
        `));
        await db.from("sls_sessions").update({ reminder_sent_at: new Date().toISOString() }).eq("id", s.id);
        results.session_reminders++;
      }

      // 4. Top up recurring series to a rolling 8-week horizon.
      const { data: recs } = await db.from("sls_recurring").select("*").eq("active", true);
      for (const rec of recs ?? []) {
        results.recurring_topped_up += await materializeRecurring(rec, 8);
      }

      return json({ ok: true, ...results });
    }

    return json({ error: "unknown action" }, 404);
  } catch (e) {
    return json({ error: (e as Error).message || "server error" }, 500);
  }
});

async function sendConfirmation(r: Record<string, unknown>, session: Record<string, unknown>, loc: { id: string; name: string; address: string }) {
  const ics = icsForSession({ id: session.id as string, athlete_name: r.athlete_name as string, starts_at: session.starts_at as string, duration_minutes: session.duration_minutes as number, location_name: loc.name, location_address: loc.address });
  const cancelToken = randomToken();
  await db.from("sls_tokens").insert({ token: cancelToken, purpose: "session_cancel", client_id: r.client_id, session_id: session.id, expires_at: new Date(Date.now() + 90 * 86400000).toISOString() });
  const manageUrl = `${SITE}/sophie/manage.html?token=${cancelToken}`;
  const icsUrl = `https://geigvuysptjvvqanumld.supabase.co/functions/v1/sls-gateway?action=ics_session&id=${session.id}`;
  const gcal = gcalLink({ athlete_name: r.athlete_name as string, starts_at: session.starts_at as string, duration_minutes: session.duration_minutes as number, location_name: loc.name, location_address: loc.address });
  const confirmedAthletes = athletesFromRow(session);
  const confirmedTypeLabel = sessionTypeLabel(session.session_type, confirmedAthletes.length);
  await sendMail(r.parent_email as string, "You're booked with Sophie!", emailShell(`
    <p style="margin:0 0 14px;">Hi ${escHtml((r.parent_name as string).split(" ")[0])},</p>
    <p style="margin:0 0 14px;">${athletesLineHtml(confirmedAthletes)}'s ${escHtml(confirmedTypeLabel)} lesson with Sophie is confirmed:</p>
    <p style="margin:0 0 6px;font-size:18px;font-weight:600;color:#1b2a4a;">${escHtml(fmtPacific(session.starts_at as string))}</p>
    <p style="margin:0 0 18px;color:#8a8378;">${escHtml(loc.name)}${loc.address ? ", " + escHtml(loc.address) : ""}</p>
    <p style="margin:0 0 10px;">${btn(gcal, "Add to Google Calendar")} &nbsp; ${btn(icsUrl, "Add to Apple Calendar", "#1b2a4a")}</p>
    <p style="margin:18px 0 0;"><a href="${manageUrl}" style="color:#8a8378;font-size:13px;">Need to cancel or reschedule?</a></p>
  `));
  await notifyAdminPush({ title: "Session confirmed", body: `${r.athlete_name}, ${fmtPacific(session.starts_at as string)}`, url: "/sophie/coach/", tag: "sls-confirmed" });
}

async function materializeRecurring(rec: Record<string, unknown>, weeksAhead: number): Promise<number> {
  const startsOn = new Date(rec.starts_on as string);
  const endsOn = rec.ends_on ? new Date(rec.ends_on as string) : null;
  const horizon = new Date(Date.now() + weeksAhead * 7 * 86400000);
  const [hh, mm] = String(rec.start_time).split(":").map(Number);
  let created = 0;
  // Walk forward from starts_on, finding each occurrence of the target weekday.
  const cursor = new Date(startsOn);
  const targetDow = Number(rec.weekday);
  while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
  while (cursor <= horizon) {
    if (!endsOn || cursor <= endsOn) {
      const occurrence = new Date(cursor);
      occurrence.setHours(hh, mm, 0, 0);
      if (occurrence.getTime() > Date.now()) {
        const isoStart = occurrence.toISOString();
        const { data: existing } = await db.from("sls_sessions").select("id").eq("recurring_id", rec.id).eq("starts_at", isoStart).maybeSingle();
        if (!existing) {
          const { error } = await db.from("sls_sessions").insert({
            client_id: rec.client_id, athlete_name: rec.athlete_name, starts_at: isoStart, duration_minutes: rec.duration_minutes,
            location_id: rec.location_id, source: "recurring", recurring_id: rec.id, status: "scheduled", notes: rec.notes,
          });
          if (!error) created++;
        }
      }
    }
    cursor.setDate(cursor.getDate() + 7);
  }
  return created;
}
