// Field Command gateway (v14). Deployed to the CoachPilot Supabase project
// (geigvuysptjvvqanumld) via Supabase MCP deploy_edge_function, verify_jwt off.
// This repo copy is the source of truth since Phase 3; keep it in sync with
// every deploy.
// v13 (2026-08-26): Coaches Hub — flm_coaches / flm_contacts / flm_requests.
// Per-coach email + PIN auth (mirrors umpires). Admin invites a coach by email
// → coach clicks emailed link → sets PIN → email_confirmed_at is stamped as
// proof they own the inbox. Every coach action carries coach_id + coach_pin
// and is logged to flm_activity so nothing is anonymous.
// v14 (2026-08-26): Coach-to-coach messaging — flm_messages. Bodies are
// private in normal operation; admin sees METADATA ONLY by default. A dispute
// pull (admin_message_body) reveals one body AND logs the pull to flm_activity
// so the audit works both ways. Every coach outbound email still uses Resend
// (planned Q3 cutover to a coachpilot.org sender; see reference-coachpilot-resend).
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin",
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

async function getPin(): Promise<string> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "admin_pin").single();
  return data?.value ?? "";
}

async function log(action: string, detail: string, actor = "") {
  await db.from("flm_activity").insert({ action, detail, actor });
}

const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat_9_11", "sat_11_1", "sat_1_3", "sat_3_5"];
const SEVERITIES = ["info", "warning", "urgent"];
const GAME_STATUSES = ["draft", "scheduled", "postponed", "cancelled", "completed"];
const UMP_ROLES = ["plate", "base"];
const UMP_DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const ADMIN_ALERT_EMAIL = "Daniel.Grande@ymail.com";
const PUBLIC_TEAM_COLS = "id,name,coach_name,coach_phone,division,is_active,created_at";
const PUBLIC_EXT_COLS = "id,league_name,team_name,division";

// Interlock game shape: opponent is away_team_id (our league) XOR ext_team_id
// (another league); venue is field_id (our field) XOR venue_text (their venue).
// Both rules are also enforced by DB check constraints.
function gameShapeError(g: Record<string, unknown>): string | null {
  const opp = [g.away_team_id, g.ext_team_id].filter((v) => v).length;
  if (opp !== 1) return "pick exactly one opponent: a league team or an external team";
  const ven = [g.field_id, g.venue_text].filter((v) => v).length;
  if (ven !== 1) return "pick exactly one venue: one of our fields or an external venue";
  return null;
}

async function gameNames(g: { home_team_id: string; away_team_id: string | null; ext_team_id: string | null; field_id: string | null; venue_text: string | null }): Promise<string> {
  const [h, a, x, f] = await Promise.all([
    db.from("flm_teams").select("name").eq("id", g.home_team_id).single(),
    g.away_team_id ? db.from("flm_teams").select("name").eq("id", g.away_team_id).single() : Promise.resolve({ data: null }),
    g.ext_team_id ? db.from("flm_ext_teams").select("team_name,league_name").eq("id", g.ext_team_id).single() : Promise.resolve({ data: null }),
    g.field_id ? db.from("flm_fields").select("name").eq("id", g.field_id).single() : Promise.resolve({ data: null }),
  ]);
  const opp = x.data ? `${x.data.team_name} (${x.data.league_name})` : (a.data?.name ?? "?");
  const where = f.data?.name ?? (g.venue_text ? `${g.venue_text}` : "?");
  return `${h.data?.name ?? "?"} vs ${opp} at ${where}`;
}

function escHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

function announcementEmailHtml(leagueName: string, a: { title: string; body: string; severity: string }): string {
  const sevColor = a.severity === "urgent" ? "#b3432b" : a.severity === "warning" ? "#a8571d" : "#2d6a4f";
  const sevLabel = a.severity === "urgent" ? "URGENT" : a.severity === "warning" ? "HEADS UP" : "LEAGUE NOTICE";
  const bodyHtml = escHtml(a.body).replace(/\n/g, "<br />");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)}</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <div style="display:inline-block;background:${sevColor};color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;border-radius:12px;padding:3px 12px;margin-bottom:12px;">${sevLabel}</div>
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">${escHtml(a.title)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#3c463f;">${bodyHtml}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">See the full field schedule any time at <a href="https://coachpilot.org/fields/" style="color:#2d6a4f;">coachpilot.org/fields</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command. Reply to this email to reach the league.</p>
</div>
</body></html>`;
}

// ---------- Phase 4: umpires ----------
// Privacy hard line: umpire emails and phones NEVER leave the gateway except
// to the admin console (PIN) and to Resend. Public reads get id + name only.
function pacificToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}
function tMin(t: unknown): number {
  const p = String(t ?? "").split(":");
  return (+p[0] || 0) * 60 + (+p[1] || 0);
}
function timesOverlap(a1: unknown, a2: unknown, b1: unknown, b2: unknown): boolean {
  return tMin(a1) < tMin(b2) && tMin(b1) < tMin(a2);
}
async function emailOn(): Promise<boolean> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "email_enabled").maybeSingle();
  return data?.value === "true";
}
async function umpDefaults(): Promise<Record<string, number>> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "ump_defaults").maybeSingle();
  try {
    const o = JSON.parse(data?.value ?? "{}");
    return o && typeof o === "object" && !Array.isArray(o) ? o : {};
  } catch (_e) {
    return {};
  }
}
function neededFor(game: { umps_needed?: number | null; division?: string }, defs: Record<string, number>): number {
  if (game.umps_needed !== null && game.umps_needed !== undefined) return game.umps_needed;
  const d = defs[game.division ?? ""];
  return typeof d === "number" ? d : 1;
}
// deno-lint-ignore no-explicit-any
async function umpAuth(b: Record<string, unknown>): Promise<any | null> {
  if (!b.ump_id || !b.ump_pin) return null;
  const { data } = await db.from("flm_umps").select("*").eq("id", b.ump_id).maybeSingle();
  if (!data || !data.active) return null;
  if (String(b.ump_pin) !== String(data.pin)) return null;
  return data;
}
function umpEmailHtml(leagueName: string, heading: string, lines: string[]): string {
  const body = lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.55;color:#3c463f;">${escHtml(l)}</p>`).join("");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)} Umpires</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">${escHtml(heading)}</h1>
    ${body}
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">Your games are always at <a href="https://coachpilot.org/fields/umpire.html" style="color:#2d6a4f;">coachpilot.org/fields/umpire.html</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command. Reply to this email to reach the league.</p>
</div>
</body></html>`;
}
async function resendSend(body: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> {
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  if (!RESEND_API_KEY) return { ok: false, error: "email is not configured" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 120)}` };
  try {
    return { ok: true, id: (await res.json()).id ?? "" };
  } catch (_e) {
    return { ok: true, id: "" };
  }
}
// The ONE send path for every umpire email. Parent cc for minors is enforced
// here, from the umpire record itself, so no caller can skip it.
// deno-lint-ignore no-explicit-any
async function sendUmpEmail(ump: any, subject: string, html: string, testTo = ""): Promise<{ ok: boolean; id?: string; cc?: string[]; error?: string }> {
  const to = (testTo || String(ump.email ?? "")).trim();
  if (!to.includes("@")) return { ok: false, error: `no email on file for ${ump.name}` };
  const cc = ump.is_minor && String(ump.parent_email ?? "").includes("@") ? [String(ump.parent_email).trim()] : [];
  const body: Record<string, unknown> = { from: "Field Command <noreply@coachpilot.org>", reply_to: ADMIN_ALERT_EMAIL, to: [to], subject, html };
  if (cc.length) body.cc = cc;
  const r = await resendSend(body);
  return { ...r, cc };
}
async function sendAdminEmail(subject: string, html: string): Promise<{ ok: boolean; id?: string; error?: string }> {
  return await resendSend({ from: "Field Command <noreply@coachpilot.org>", to: [ADMIN_ALERT_EMAIL], subject, html });
}
async function leagueName(): Promise<string> {
  const { data } = await db.from("flm_settings").select("value").eq("key", "league_name").maybeSingle();
  return data?.value || "Field Command";
}

// ---------- Coaches Hub (v13) ----------
// Head coaches with per-person email + PIN. Admin creates the coach with an
// email; invite token goes out via Resend; coach clicks the link, sets a PIN,
// and email_confirmed_at is stamped as proof they own the inbox. Every write
// requires coach_id + coach_pin in the body (mirrors umpAuth).
const REQUEST_CATEGORIES = ["gear", "field_issue", "practice_concern", "volunteer_needed", "general", "schedule_approval"];
const REQUEST_STATUSES = ["open", "in_progress", "resolved", "closed"];

function randomInviteToken(): string {
  // crypto.randomUUID gives 128 bits of entropy; strip dashes for a compact URL.
  return crypto.randomUUID().replace(/-/g, "");
}
function inviteExpiry(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 14);
  return d.toISOString();
}
// Expand common Little League division abbreviations to full readable names.
// BB = Baseball, SB = Softball. Falls through to the input if no rule matches.
function expandDivision(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const map: Record<string, string> = {
    "CP BB": "Coach Pitch Baseball",
    "CP SB": "Coach Pitch Softball",
    "CPBB": "Coach Pitch Baseball",
    "CPSB": "Coach Pitch Softball",
    "TBall": "T-Ball",
    "T Ball": "T-Ball",
    "TB": "T-Ball",
    "AA BB": "AA Baseball",
    "AA SB": "AA Softball",
    "AAA BB": "AAA Baseball",
    "AAA SB": "AAA Softball",
    "Majors BB": "Majors Baseball",
    "Majors SB": "Majors Softball",
    "MJBB": "Majors Baseball",
    "MJSB": "Majors Softball",
    "Minors BB": "Minors Baseball",
    "Minors SB": "Minors Softball",
    "Minors A BB": "Minors A Baseball",
    "Minors A SB": "Minors A Softball",
    "Minors B BB": "Minors B Baseball",
    "Minors B SB": "Minors B Softball",
    "MNBB": "Minors Baseball",
    "MNSB": "Minors Softball",
  };
  if (map[s]) return map[s];
  // Generic fallback: swap trailing BB / SB tokens for Baseball / Softball
  return s.replace(/\bBB\b/g, "Baseball").replace(/\bSB\b/g, "Softball").replace(/\s+/g, " ").trim();
}

// -------------- Web Push --------------
// VAPID keys live in Supabase secrets. Public key is also embedded in the
// frontend and service worker for subscribe(). Private key is used server-side
// to sign the JWT that authenticates each push to fcm/mozilla/apple push
// services.
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
  // VAPID private key is a raw 32-byte P-256 scalar. To use with WebCrypto we
  // build a JWK containing both d (private) and the derived x,y (from public).
  const priv = b64urlToBytes(privRaw);
  const pub = b64urlToBytes(VAPID_PUBLIC);
  // Public key: 0x04 || X (32) || Y (32)
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
// AES-128-GCM payload encryption per RFC 8291 (aes128gcm content-encoding).
async function encryptPushPayload(
  payload: Uint8Array,
  clientPubKeyB64: string,
  authSecretB64: string,
): Promise<Uint8Array> {
  const clientPub = b64urlToBytes(clientPubKeyB64);          // 65 bytes uncompressed
  const authSecret = b64urlToBytes(authSecretB64);           // 16 bytes
  // Ephemeral server keypair
  const serverKey = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const serverPubRaw = new Uint8Array(await crypto.subtle.exportKey("raw", serverKey.publicKey));
  // Import client public key
  const clientPubKey = await crypto.subtle.importKey(
    "raw",
    clientPub,
    { name: "ECDH", namedCurve: "P-256" },
    true,
    [],
  );
  // ECDH shared secret
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "ECDH", public: clientPubKey },
    serverKey.privateKey,
    256,
  ));
  // HKDF steps per RFC 8291
  async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
    const keyPrk = await crypto.subtle.importKey("raw", salt, "HKDF", false, ["deriveBits"]);
    return new Uint8Array(await crypto.subtle.deriveBits(
      { name: "HKDF", hash: "SHA-256", salt, info } as unknown as HkdfParams,
      keyPrk,
      len * 8,
    ));
  }
  // 1. IKM = HKDF(auth_secret, ecdh_secret, "WebPush: info\0" || client_pub || server_pub, 32)
  const infoPart1 = new TextEncoder().encode("WebPush: info\0");
  const info1 = new Uint8Array(infoPart1.length + clientPub.length + serverPubRaw.length);
  info1.set(infoPart1, 0);
  info1.set(clientPub, infoPart1.length);
  info1.set(serverPubRaw, infoPart1.length + clientPub.length);
  const ikm = await hkdf(authSecret, shared, info1, 32);
  // 2. Random 16-byte salt (also used in the header)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  // 3. CEK  = HKDF(salt, IKM, "Content-Encoding: aes128gcm\0", 16)
  const cek = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  // 4. Nonce = HKDF(salt, IKM, "Content-Encoding: nonce\0", 12)
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);
  // 5. Padding: pad with 0x02 delimiter + 0x00 bytes as needed (we use 0)
  const padded = new Uint8Array(payload.length + 1);
  padded.set(payload, 0);
  padded[payload.length] = 0x02;
  // 6. AES-GCM encrypt
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, padded));
  // 7. Assemble aes128gcm header: salt(16) || rs(4, big-endian, 4096) || idlen(1)=65 || keyid(65 = serverPubRaw)
  const rs = new Uint8Array([0, 0, 0x10, 0]); // 4096
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
async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string; id: string },
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<{ ok: boolean; status?: number }> {
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
    // Subscription is dead. Mark inactive so we don't try again.
    await db.from("flm_push_subscriptions").update({ active: false }).eq("id", sub.id);
  }
  return { ok: res.ok, status: res.status };
}
async function sendPushToCoach(coach_id: string, payload: { title: string; body: string; url?: string; tag?: string }): Promise<void> {
  try {
    const { data: subs } = await db.from("flm_push_subscriptions").select("id,endpoint,p256dh,auth").eq("coach_id", coach_id).eq("active", true);
    if (!subs || !subs.length) return;
    for (const s of subs) {
      await sendWebPush(s, payload).catch(() => {});
    }
  } catch (_e) {
    // never let a push failure break the caller
  }
}

function isEmail(s: unknown): boolean {
  return typeof s === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}
function isPin(s: unknown): boolean {
  return typeof s === "string" && /^\d{4}$/.test(s);
}
function inviteUrlFor(token: string): string {
  return `https://coachpilot.org/fields/coach-invite.html?token=${encodeURIComponent(token)}`;
}
// deno-lint-ignore no-explicit-any
async function coachAuth(b: Record<string, unknown>): Promise<any | null> {
  if (!b.coach_id || !b.coach_pin) return null;
  const { data } = await db.from("flm_coaches").select("*").eq("id", b.coach_id).maybeSingle();
  if (!data || !data.active) return null;
  if (!data.pin || String(b.coach_pin) !== String(data.pin)) return null;
  // A coach can run more than one team (e.g. one baseball + one softball).
  // Ownership = their anchor team_id plus any team stamped with their email.
  const ids = new Set<string>();
  if (data.team_id) ids.add(data.team_id);
  const { data: owned } = await db.from("flm_teams").select("id").ilike("coach_email", data.email).eq("is_active", true);
  for (const t of owned ?? []) ids.add(t.id);
  data.team_ids = Array.from(ids);
  return data;
}

function coachInviteEmailHtml(leagueName: string, coachName: string, inviteUrl: string): string {
  const first = coachName.split(" ")[0] || coachName;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)} Coaches Hub</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">Hi ${escHtml(first)},</h1>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:#3c463f;">You have been set up as a coach on the ${escHtml(leagueName)} Coaches Hub. This is where you see the full practice schedule, reserve open field time for your team, and move or cancel your own practices. You also get league announcements, board contacts, and a direct line to other coaches.</p>
    <p style="margin:0 0 18px;font-size:15px;line-height:1.55;color:#3c463f;">Click the button below to set your 4 digit PIN. This link is good for 14 days and can only be used once.</p>
    <p style="text-align:center;margin:0 0 18px;"><a href="${escHtml(inviteUrl)}" style="background:#0e3b2e;color:#f4f1e8;text-decoration:none;font-weight:bold;letter-spacing:1px;padding:12px 22px;border-radius:10px;text-transform:uppercase;display:inline-block;">Set my PIN</a></p>
    <p style="margin:0;font-size:13px;color:#6d7a72;">If the button does not open, paste this into your browser:<br /><span style="word-break:break-all;">${escHtml(inviteUrl)}</span></p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command. Reply to this email to reach the league.</p>
</div>
</body></html>`;
}

function coachRequestEmailHtml(leagueName: string, r: { category: string; subject: string; details: string; submitted_by_coach_name: string }, coachEmail: string): string {
  const catLabel: Record<string, string> = {
    gear: "Gear / Equipment",
    field_issue: "Field Issue",
    practice_concern: "Practice Concern",
    volunteer_needed: "Volunteer Needed",
    general: "General",
  };
  const label = catLabel[r.category] || "Request";
  const body = escHtml(r.details).replace(/\n/g, "<br />");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)} Coaches Hub</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <div style="display:inline-block;background:#c96f2f;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;border-radius:12px;padding:3px 12px;margin-bottom:12px;">NEW ${escHtml(label.toUpperCase())} REQUEST</div>
    <h1 style="margin:0 0 4px;font-size:20px;color:#1c2420;">${escHtml(r.subject)}</h1>
    <p style="margin:0 0 14px;font-size:13px;color:#6d7a72;">from ${escHtml(r.submitted_by_coach_name)} &middot; <a href="mailto:${escHtml(coachEmail)}" style="color:#2d6a4f;">${escHtml(coachEmail)}</a></p>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#3c463f;">${body}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">Manage requests in the Coaches inbox at <a href="https://coachpilot.org/fields/admin.html" style="color:#2d6a4f;">coachpilot.org/fields/admin.html</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command Coaches Hub.</p>
</div>
</body></html>`;
}

function coachMessageEmailHtml(leagueName: string, fromName: string, fromEmail: string, subject: string, body: string): string {
  const bodyHtml = escHtml(body).replace(/\n/g, "<br />");
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)} Coaches Hub</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <div style="display:inline-block;background:#2d6a4f;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;border-radius:12px;padding:3px 12px;margin-bottom:12px;">MESSAGE FROM COACH ${escHtml(fromName.toUpperCase())}</div>
    <h1 style="margin:0 0 4px;font-size:20px;color:#1c2420;">${escHtml(subject)}</h1>
    <p style="margin:0 0 14px;font-size:13px;color:#6d7a72;">Reply to this email to reach <a href="mailto:${escHtml(fromEmail)}" style="color:#2d6a4f;">${escHtml(fromName)}</a> directly.</p>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#3c463f;">${bodyHtml}</p>
    <p style="margin:18px 0 0;font-size:12.5px;color:#6d7a72;">Sent through the ${escHtml(leagueName)} Coaches Hub so nothing gets lost in a text thread.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command Coaches Hub.</p>
</div>
</body></html>`;
}

function coachRequestResolvedEmailHtml(leagueName: string, r: { subject: string; response: string | null; status: string }): string {
  const body = r.response ? escHtml(r.response).replace(/\n/g, "<br />") : "This request has been marked as resolved by the league.";
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f4f1e8;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:18px 12px;">
  <div style="background:#0e3b2e;border-radius:12px 12px 0 0;padding:18px 22px;">
    <div style="color:#f4f1e8;font-size:22px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;">Field Command</div>
    <div style="color:#b7cfc2;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:2px;">${escHtml(leagueName)} Coaches Hub</div>
  </div>
  <div style="height:5px;background:repeating-linear-gradient(90deg,#c96f2f 0 40px,#f4f1e8 40px 50px);"></div>
  <div style="background:#ffffff;border:1px solid #dcd8ca;border-top:none;border-radius:0 0 12px 12px;padding:22px;">
    <div style="display:inline-block;background:#2d6a4f;color:#ffffff;font-size:11px;font-weight:bold;letter-spacing:1px;border-radius:12px;padding:3px 12px;margin-bottom:12px;">REQUEST ${escHtml(r.status.toUpperCase())}</div>
    <h1 style="margin:0 0 10px;font-size:20px;color:#1c2420;">${escHtml(r.subject)}</h1>
    <p style="margin:0;font-size:15px;line-height:1.55;color:#3c463f;">${body}</p>
    <p style="margin:18px 0 0;font-size:13px;color:#6d7a72;">See all your requests at <a href="https://coachpilot.org/fields/" style="color:#2d6a4f;">coachpilot.org/fields</a>.</p>
  </div>
  <p style="text-align:center;font-size:11px;color:#6d7a72;margin-top:14px;">Sent by ${escHtml(leagueName)} Field Command Coaches Hub.</p>
</div>
</body></html>`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "";

  try {
    // ---------- public ----------
    if (action === "state") {
      // Draft games are admin-only: parents and coaches never see a half-built
      // schedule. A valid PIN header on state includes drafts for the admin console.
      const pinHdr = req.headers.get("x-admin-pin") ?? "";
      const showDrafts = pinHdr.length > 0 && pinHdr === (await getPin());
      let gamesQ = db.from("flm_games").select("*").order("game_date").order("start_time");
      if (!showDrafts) gamesQ = gamesQ.neq("status", "draft");
      const [settings, seasons, fields, teams, slots, announcements, games, extTeams] = await Promise.all([
        db.from("flm_settings").select("key,value"),
        db.from("flm_seasons").select("*").order("sort"),
        db.from("flm_fields").select("*").order("sort"),
        // Admin console gets full team rows (coach_email for the edit modal);
        // the public portal keeps the trimmed column list.
        db.from("flm_teams").select(showDrafts ? "*" : PUBLIC_TEAM_COLS).order("name"),
        db.from("flm_slots").select("*"),
        db.from("flm_announcements").select("id,created_at,title,body,severity").eq("active", true).order("created_at", { ascending: false }).limit(10),
        gamesQ,
        db.from("flm_ext_teams").select(showDrafts ? "*" : PUBLIC_EXT_COLS).order("league_name").order("team_name"),
      ]);
      const s: Record<string, string> = {};
      (settings.data ?? []).forEach((r: { key: string; value: string }) => {
        if (r.key !== "admin_pin" && r.key !== "cron_key") s[r.key] = r.value;
      });
      // Phase 5: archived seasons (and their games and practice slots) drop out
      // of the public portal and stay reachable only in the admin console.
      let seasonRows = seasons.data ?? [];
      let gameRows = games.data ?? [];
      let slotRows = slots.data ?? [];
      if (!showDrafts) {
        const archived = new Set(seasonRows.filter((x: { archived?: boolean }) => x.archived).map((x: { id: string }) => x.id));
        seasonRows = seasonRows.filter((x: { archived?: boolean }) => !x.archived);
        gameRows = gameRows.filter((g: { season_id: string }) => !archived.has(g.season_id));
        slotRows = slotRows.filter((sl: { season_id: string }) => !archived.has(sl.season_id));
      }
      const out: Record<string, unknown> = { ok: true, settings: s, seasons: seasonRows, fields: fields.data, teams: teams.data, slots: slotRows, announcements: announcements.data, games: gameRows, ext_teams: extTeams.data };
      // Umpire roster + assignments ride on state ONLY for the admin console.
      // The public portal never receives an umps key at all.
      if (showDrafts) {
        const [umps, assigns] = await Promise.all([
          db.from("flm_umps").select("*").order("name"),
          db.from("flm_ump_assignments").select("*").order("created_at"),
        ]);
        out.umps = umps.data;
        out.ump_assignments = assigns.data;
      }
      return json(out);
    }

    if (action === "claim" && req.method === "POST") {
      const b = await req.json();
      // Locked down 8/31: claiming requires a signed-in coach and the team
      // must be one of theirs. The pre-accounts anonymous claim path is gone.
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "sign in on the Coaches Hub to claim field time" }, 401);
      const { season_id, day_key, field_id, team_id } = b;
      if (!season_id || !day_key || !field_id || !team_id || !DAY_KEYS.includes(day_key)) {
        return json({ ok: false, error: "missing or invalid fields" }, 400);
      }
      if (!(coach.team_ids || []).includes(String(team_id))) {
        return json({ ok: false, error: "you can only claim time for your own team" }, 403);
      }
      const { data: season } = await db.from("flm_seasons").select("label,locked").eq("id", season_id).single();
      if (!season) return json({ ok: false, error: "unknown season" }, 400);
      if (season.locked) return json({ ok: false, error: "This schedule window is locked by the league." }, 403);
      const { data: existing } = await db.from("flm_slots").select("id,team_id,label").eq("season_id", season_id).eq("day_key", day_key).eq("field_id", field_id);
      if ((existing ?? []).some((s: { team_id: string | null }) => s.team_id === team_id)) {
        return json({ ok: false, error: "Your team already holds this slot." }, 409);
      }
      if ((existing ?? []).length > 0 && !b.allow_share) {
        return json({ ok: false, error: "taken", taken: true, existing }, 409);
      }
      const { data: team } = await db.from("flm_teams").select("name").eq("id", team_id).single();
      if (!team) return json({ ok: false, error: "unknown team" }, 400);
      const note = String(b.note ?? "").slice(0, 200);
      const { data: slot, error } = await db.from("flm_slots").insert({
        season_id, day_key, field_id, team_id,
        label: team.name, note, claimed_by: "coach",
      }).select().single();
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("claim", `${team.name} claimed ${day_key} (season ${season.label})${note ? " — " + note : ""}`, team.name);
      return json({ ok: true, slot });
    }

    if (action === "release" && req.method === "POST") {
      const b = await req.json();
      // Locked down 8/31: releasing requires the signed-in coach who owns the slot's team.
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "sign in on the Coaches Hub to manage your practices" }, 401);
      const { slot_id } = b;
      if (!slot_id) return json({ ok: false, error: "missing fields" }, 400);
      const { data: slot } = await db.from("flm_slots").select("id,team_id,label,day_key,season_id").eq("id", slot_id).single();
      if (!slot) return json({ ok: false, error: "not found" }, 404);
      if (!(coach.team_ids || []).includes(String(slot.team_id))) return json({ ok: false, error: "Only the coach holding a slot can release it." }, 403);
      const { data: season } = await db.from("flm_seasons").select("locked").eq("id", slot.season_id).single();
      if (season?.locked) return json({ ok: false, error: "This schedule window is locked by the league." }, 403);
      await db.from("flm_slots").delete().eq("id", slot_id);
      await log("release", `${slot.label} released ${slot.day_key}`, slot.label);
      return json({ ok: true });
    }

    // ---------- umpires (per-ump PIN, never the admin PIN) ----------
    if (action === "ump_list") {
      // Login picker only: names, no contact info, ever.
      const { data } = await db.from("flm_umps").select("id,name").eq("active", true).order("name");
      return json({ ok: true, umps: data });
    }

    if (action === "ump_state" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const [mineQ, allQ] = await Promise.all([
        db.from("flm_ump_assignments").select("*").eq("ump_id", ump.id).order("created_at"),
        db.from("flm_ump_assignments").select("game_id,status"),
      ]);
      // Per-game fill counts (numbers only, no other umpire names or ids).
      const fill: Record<string, { accepted: number; offered: number }> = {};
      for (const a of (allQ.data ?? [])) {
        const f = (fill[a.game_id] = fill[a.game_id] ?? { accepted: 0, offered: 0 });
        if (a.status === "accepted") f.accepted++;
        if (a.status === "offered") f.offered++;
      }
      const myAcc = (mineQ.data ?? []).filter((a: { status: string }) => a.status === "accepted");
      let tally = 0;
      if (myAcc.length) {
        const { data: gs } = await db.from("flm_games").select("id,game_date,status").in("id", myAcc.map((a: { game_id: string }) => a.game_id));
        const today = pacificToday();
        tally = (gs ?? []).filter((g: { status: string; game_date: string }) => g.status === "completed" || (g.status !== "cancelled" && g.game_date < today)).length;
      }
      return json({
        ok: true,
        ump: { id: ump.id, name: ump.name, levels: ump.levels, is_minor: ump.is_minor, availability: ump.availability },
        assignments: mineQ.data, fill, tally,
      });
    }

    if (action === "ump_claim" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const { data: game } = await db.from("flm_games").select("*").eq("id", b.game_id).maybeSingle();
      if (!game) return json({ ok: false, error: "game not found" }, 404);
      if (game.status !== "scheduled") return json({ ok: false, error: "Only published, scheduled games can be taken." }, 400);
      const today = pacificToday();
      if (game.game_date < today) return json({ ok: false, error: "That game is in the past." }, 400);
      if (!(ump.levels ?? []).includes(game.division)) return json({ ok: false, error: "That game is not in one of your levels." }, 403);
      const av = ump.availability ?? {};
      const dow = UMP_DOW[new Date(game.game_date + "T12:00:00Z").getUTCDay()];
      if ((av.days ?? {})[dow] === false || (av.blocked ?? []).includes(game.game_date)) {
        return json({ ok: false, error: "You are marked unavailable that day. Update your availability first." }, 409);
      }
      const { data: myActive } = await db.from("flm_ump_assignments").select("game_id,status").eq("ump_id", ump.id).in("status", ["offered", "accepted"]);
      const activeIds = (myActive ?? []).map((a: { game_id: string }) => a.game_id);
      if (activeIds.includes(game.id)) return json({ ok: false, error: "You already have this game." }, 409);
      if (activeIds.length) {
        const { data: myGames } = await db.from("flm_games").select("id,game_date,start_time,end_time").in("id", activeIds);
        const clash = (myGames ?? []).find((g: { game_date: string; start_time: string; end_time: string }) =>
          g.game_date === game.game_date && timesOverlap(g.start_time, g.end_time, game.start_time, game.end_time));
        if (clash) return json({ ok: false, error: "You already have a game at that time that day." }, 409);
      }
      const { data: gameA } = await db.from("flm_ump_assignments").select("status,role").eq("game_id", game.id);
      const accepted = (gameA ?? []).filter((a: { status: string }) => a.status === "accepted");
      const needed = neededFor(game, await umpDefaults());
      if (accepted.length >= needed) return json({ ok: false, error: "This game already has its umpires. Thank you anyway!" }, 409);
      const role = accepted.some((a: { role: string }) => a.role === "plate") ? "base" : "plate";
      // Self-claim is volunteer-friendly: it lands as accepted right away.
      const ins = await db.from("flm_ump_assignments").insert({
        game_id: game.id, ump_id: ump.id, role, status: "accepted", responded_at: new Date().toISOString(),
      }).select().single();
      if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
      await log("ump", `${ump.name} took the ${role} umpire spot for ${await gameNames(game)} on ${game.game_date}`, ump.name);
      return json({ ok: true, assignment: ins.data });
    }

    if (action === "ump_respond" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const { data: a } = await db.from("flm_ump_assignments").select("*").eq("id", b.assignment_id).maybeSingle();
      if (!a || a.ump_id !== ump.id) return json({ ok: false, error: "assignment not found" }, 404);
      // Offer state machine: offered -> accepted | declined; accepted -> turned_back.
      const moves: Record<string, [string, string]> = {
        accept: ["offered", "accepted"], decline: ["offered", "declined"], turn_back: ["accepted", "turned_back"],
      };
      const mv = moves[String(b.response)];
      if (!mv) return json({ ok: false, error: "response must be accept, decline, or turn_back" }, 400);
      if (a.status !== mv[0]) return json({ ok: false, error: `That game is ${a.status}, so this response does not apply anymore.` }, 409);
      const upd = await db.from("flm_ump_assignments").update({ status: mv[1], responded_at: new Date().toISOString() }).eq("id", a.id).select().single();
      if (upd.error) return json({ ok: false, error: upd.error.message }, 500);
      const { data: game } = await db.from("flm_games").select("*").eq("id", a.game_id).maybeSingle();
      const gname = game ? `${await gameNames(game)} on ${game.game_date}` : "a game";
      const words: Record<string, string> = { accept: "accepted the offer to work", decline: "declined the offer to work", turn_back: "turned back" };
      const reopened = mv[1] === "declined" || mv[1] === "turned_back";
      await log("ump", `${ump.name} ${words[String(b.response)]} ${gname}.${reopened ? " The spot is open again." : ""}`, ump.name);
      if (reopened) {
        // Declines and turn-backs flag the league right away (kill-switched).
        const line = `${ump.name} ${mv[1] === "declined" ? "declined the offer for" : "turned back"} ${gname}. The spot is open on the umpire page again.`;
        if (await emailOn()) {
          const r = await sendAdminEmail(`${await leagueName()}: umpire spot open again`, umpEmailHtml(await leagueName(), "An umpire spot opened up", [line]));
          await log("ump_email", r.ok ? `Alert emailed to the league: ${line}` : `Alert email failed (${r.error}): ${line}`, "system");
        } else {
          await log("ump_email", `Email is off. Would have alerted the league: ${line}`, "system");
        }
      }
      return json({ ok: true, assignment: upd.data });
    }

    if (action === "ump_availability" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const av = b.availability;
      if (!av || typeof av !== "object" || Array.isArray(av)) return json({ ok: false, error: "availability must be an object" }, 400);
      const days: Record<string, boolean> = {};
      for (const k of UMP_DOW) days[k] = ((av.days ?? {})[k]) !== false;
      const blocked = Array.isArray(av.blocked)
        ? av.blocked.map((d: unknown) => String(d)).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60)
        : [];
      const upd = await db.from("flm_umps").update({ availability: { days, blocked } }).eq("id", ump.id).select("availability").single();
      if (upd.error) return json({ ok: false, error: upd.error.message }, 500);
      await log("ump", `${ump.name} updated their availability`, ump.name);
      return json({ ok: true, availability: upd.data.availability });
    }

    if (action === "ump_change_pin" && req.method === "POST") {
      const b = await req.json();
      const ump = await umpAuth(b);
      if (!ump) return json({ ok: false, error: "That name and PIN did not match." }, 401);
      const np = String(b.new_pin ?? "");
      if (!/^\d{4}$/.test(np)) return json({ ok: false, error: "The new PIN must be exactly 4 digits." }, 400);
      await db.from("flm_umps").update({ pin: np }).eq("id", ump.id);
      await log("ump", `${ump.name} changed their PIN`, ump.name);
      return json({ ok: true });
    }

    // ==================== Coaches Hub — public actions (v13) ====================
    // These live BEFORE the admin PIN gate on purpose: coach_login and the
    // invite flow must be reachable without an admin PIN. Each still requires
    // POST + its own body read; auth is enforced per action via coachAuth().

    if (action === "coach_verify_invite" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const token = String(b.token ?? "").trim();
      if (!token) return json({ ok: false, error: "invite link is missing" }, 400);
      const { data } = await db.from("flm_coaches").select("id,name,email,invite_expires_at,active").eq("invite_token", token).maybeSingle();
      if (!data) return json({ ok: false, error: "this invite link is not valid — the league may have reset it" }, 404);
      if (!data.active) return json({ ok: false, error: "this coach is no longer active — ask the league" }, 403);
      if (data.invite_expires_at && new Date(data.invite_expires_at).getTime() < Date.now()) {
        return json({ ok: false, error: "this invite link has expired — ask the league to resend it" }, 410);
      }
      return json({ ok: true, coach: { name: data.name, email: data.email } });
    }

    if (action === "coach_set_pin" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const token = String(b.token ?? "").trim();
      const pin = String(b.new_pin ?? "").trim();
      if (!token) return json({ ok: false, error: "invite link is missing" }, 400);
      if (!isPin(pin)) return json({ ok: false, error: "PIN must be exactly 4 digits" }, 400);
      const { data: found } = await db.from("flm_coaches").select("id,name,email,invite_expires_at,active").eq("invite_token", token).maybeSingle();
      if (!found) return json({ ok: false, error: "this invite link is not valid — the league may have reset it" }, 404);
      if (!found.active) return json({ ok: false, error: "this coach is no longer active — ask the league" }, 403);
      if (found.invite_expires_at && new Date(found.invite_expires_at).getTime() < Date.now()) {
        return json({ ok: false, error: "this invite link has expired — ask the league to resend it" }, 410);
      }
      const { error } = await db.from("flm_coaches").update({
        pin,
        invite_token: null,
        invite_expires_at: null,
        email_confirmed_at: new Date().toISOString(),
      }).eq("id", found.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("coach_set_pin", `${found.name} set their PIN (email ${found.email})`, "coach");
      return json({ ok: true, coach: { id: found.id, name: found.name, email: found.email } });
    }

    if (action === "coach_request_access" && req.method === "POST") {
      // Self-serve entry: coach types their email on the hub. If it's on the
      // coach list, we either tell the UI to show the PIN box (already set up)
      // or auto-email a magic set-your-PIN link (first time / reset).
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const email = String(b.email ?? "").trim().toLowerCase();
      const wantReset = Boolean(b.reset);
      if (!isEmail(email)) return json({ ok: false, error: "enter a valid email address" }, 400);
      const { data: coach } = await db.from("flm_coaches").select("id,name,email,pin,email_confirmed_at,active").ilike("email", email).maybeSingle();
      if (!coach || !coach.active) {
        return json({ ok: true, found: false });
      }
      const hasPin = Boolean(coach.pin && coach.email_confirmed_at);
      if (hasPin && !wantReset) {
        // Already set up — UI shows the PIN box. No email needed.
        return json({ ok: true, found: true, has_pin: true });
      }
      // First-time setup or a PIN reset: issue a fresh magic link.
      const token = randomInviteToken();
      const expires = inviteExpiry();
      const { error } = await db.from("flm_coaches").update({ invite_token: token, invite_expires_at: expires }).eq("id", coach.id);
      if (error) return json({ ok: false, error: "could not create your link — tap Support" }, 500);
      const league = await leagueName();
      const send = await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        to: [coach.email],
        subject: wantReset ? `Reset your PIN — ${league} Coaches Hub` : `Set your PIN — ${league} Coaches Hub`,
        html: coachInviteEmailHtml(league, coach.name, inviteUrlFor(token)),
      }).catch(() => ({ ok: false } as { ok: boolean }));
      await log("coach_request_access", `${coach.name} requested ${wantReset ? "a PIN reset" : "access"} (${coach.email})`, "coach");
      return json({ ok: true, found: true, has_pin: false, sent: send?.ok !== false });
    }

    if (action === "support_request" && req.method === "POST") {
      // Site support goes straight to Daniel. No auth required — a coach who
      // can't sign in is exactly who needs this.
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const name = String(b.name ?? "").trim().slice(0, 120);
      const email = String(b.email ?? "").trim().slice(0, 200);
      const message = String(b.message ?? "").trim().slice(0, 3000);
      if (!name || !message) return json({ ok: false, error: "add your name and what's going on" }, 400);
      const league = await leagueName();
      const html = `<div style="font-family:sans-serif"><h2>Field Command support request</h2><p><b>From:</b> ${escHtml(name)}${email ? ` &lt;${escHtml(email)}&gt;` : ""}</p><p><b>League:</b> ${escHtml(league)}</p><blockquote style="border-left:3px solid #c96f2f;padding:8px 12px;background:#f7f5ee;white-space:pre-wrap;">${escHtml(message)}</blockquote></div>`;
      const send = await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        reply_to: isEmail(email) ? email : undefined,
        to: [Deno.env.get("ADMIN_ALERT_EMAIL") || "daniel.grande@ymail.com"],
        subject: `[Field Command SUPPORT] ${name}: ${message.replace(/\s+/g, " ").slice(0, 60)}`,
        html,
      }).catch(() => ({ ok: false } as { ok: boolean }));
      await log("support_request", `support from ${name}${email ? " (" + email + ")" : ""}`, "public");
      return json({ ok: true, sent: send?.ok !== false });
    }

    if (action === "coach_login" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const email = String(b.email ?? "").trim().toLowerCase();
      const pin = String(b.pin ?? "").trim();
      if (!email || !isPin(pin)) return json({ ok: false, error: "enter your email and 4 digit PIN" }, 400);
      const { data } = await db.from("flm_coaches").select("id,name,email,active,pin,email_confirmed_at").ilike("email", email).maybeSingle();
      if (!data || !data.active) return json({ ok: false, error: "no coach on file with that email — ask the league to add you" }, 404);
      if (!data.email_confirmed_at || !data.pin) return json({ ok: false, error: "check your email for the invite and set your PIN first" }, 403);
      if (String(pin) !== String(data.pin)) return json({ ok: false, error: "that PIN did not work — try again or ask the league to reset it" }, 401);
      return json({ ok: true, coach: { id: data.id, name: data.name, email: data.email } });
    }

    if (action === "coach_state" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      // Pull the full coach row + their team row so the hub can show a proper profile
      // (division, team name, phone) instead of just name + email.
      const [full, team, settings, announcements, contacts, myRequests, myMessages, picker, joinsIn, joinsOut] = await Promise.all([
        db.from("flm_coaches").select("id,name,email,phone,team_id,schedule_confirmed_at").eq("id", coach.id).single(),
        coach.team_id ? db.from("flm_teams").select("id,name,division,coach_name,coach_phone,nickname").eq("id", coach.team_id).single() : Promise.resolve({ data: null }),
        db.from("flm_settings").select("key,value").in("key", ["league_name"]),
        db.from("flm_announcements").select("*").order("created_at", { ascending: false }).limit(50),
        db.from("flm_contacts").select("id,name,role,email,phone,notes,sort_order").eq("active", true).order("sort_order").order("name"),
        db.from("flm_requests").select("id,category,subject,details,status,response,created_at,resolved_at,assigned_contact_id").eq("submitted_by_coach_id", coach.id).order("created_at", { ascending: false }).limit(50),
        // Full content of my own conversations (sent + received). Bodies here are OK: this is
        // the coach reading their own correspondence.
        db.from("flm_messages").select("id,from_coach_id,to_coach_id,from_name,to_name,subject,body,read_at,created_at").or("from_coach_id.eq." + coach.id + ",to_coach_id.eq." + coach.id).order("created_at", { ascending: false }).limit(100),
        // Picker list for the "reach out to another coach" modal — id + name + team_id only,
        // never emails or phones (those stay server-side).
        db.from("flm_coaches").select("id,name,team_id").eq("active", true).neq("id", coach.id).order("name"),
        // Join requests aimed AT me (host action needed)
        db.from("flm_slot_joins").select("id,slot_id,from_coach_id,from_team_id,from_name,note,status,response_note,created_at,resolved_at").eq("to_coach_id", coach.id).order("created_at", { ascending: false }).limit(50),
        // Join requests I sent (status feedback)
        db.from("flm_slot_joins").select("id,slot_id,to_coach_id,to_team_id,to_name,note,status,response_note,created_at,resolved_at").eq("from_coach_id", coach.id).order("created_at", { ascending: false }).limit(50),
      ]);
      const settingsMap: Record<string, string> = {};
      (settings.data || []).forEach((r: { key: string; value: string }) => { settingsMap[r.key] = r.value; });
      const c = full.data || coach;
      // Coach's phone can live on either the coach row or the team row (spreadsheet imports
      // land it on the team). Fall back to team row if the coach row is empty.
      const phone = c.phone || (team.data ? team.data.coach_phone : null) || null;
      const profileMissing: string[] = [];
      if (!c.email) profileMissing.push("email");
      if (!phone) profileMissing.push("phone");
      return json({
        ok: true,
        league_name: settingsMap.league_name || "Field Command",
        coach: {
          id: c.id,
          name: c.name,
          email: c.email,
          phone,
          team_id: c.team_id,
          team_ids: coach.team_ids || (c.team_id ? [c.team_id] : []),
          team_name: team.data ? team.data.name : null,
          division: team.data ? team.data.division : null,
          // null = never asked (show the name-your-team nudge); '' = coach said
          // they have no team name yet; text = the name, already in flm_teams.name.
          team_nickname: team.data ? team.data.nickname : undefined,
        },
        profile_missing: profileMissing,
        announcements: announcements.data || [],
        contacts: contacts.data || [],
        my_requests: myRequests.data || [],
        messages: myMessages.data || [],
        coach_picker: picker.data || [],
        joins_to_me: joinsIn.data || [],
        joins_from_me: joinsOut.data || [],
        schedule_confirmed_at: c.schedule_confirmed_at ?? null,
        schedule_approval: (() => {
          // Latest schedule-approval item drives the hub banner:
          // open = pending with the board, resolved = approved,
          // closed = denied (response says what to fix).
          const sa = (myRequests.data || []).find((r: any) => r.category === "schedule_approval");
          return sa ? { status: sa.status, response: sa.response ?? null, created_at: sa.created_at } : null;
        })(),
      });
    }

    if (action === "coach_confirm_schedule" && req.method === "POST") {
      // First-load confirmation. Compliant schedules auto-approve; over-guideline
      // ones (coach clicked "yes I have approval") open a schedule_approval
      // request that Matt + Ramey work INSIDE the admin console like any other
      // request. Email is only the doorbell.
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const over = b.over === true;
      const summary = String(b.summary ?? "").trim().slice(0, 2000);
      const now = new Date().toISOString();
      await db.from("flm_coaches").update({ schedule_confirmed_at: now }).eq("id", coach.id);
      if (!over) {
        await log("coach_confirm_schedule", `${coach.name} confirmed schedule (within guidelines)`, "coach");
        return json({ ok: true, approved: true });
      }
      // Over guidelines: open the approval item, assigned to the CP PA (Matt).
      const { data: mattContact } = await db.from("flm_contacts").select("id").ilike("email", "cppa@blslittleleague.org").maybeSingle();
      const { data: teamRow } = coach.team_id ? await db.from("flm_teams").select("name,division").eq("id", coach.team_id).single() : { data: null };
      const teamName = teamRow?.name ?? coach.name;
      const { data: created, error } = await db.from("flm_requests").insert({
        category: "schedule_approval",
        subject: `Schedule approval: ${teamName}`,
        details: summary || "Coach confirmed an over-guideline schedule and says the league approved it.",
        submitted_by_coach_id: coach.id,
        submitted_by_coach_name: coach.name,
        submitted_by_team_id: coach.team_id,
        assigned_contact_id: mattContact?.id ?? null,
        status: "open",
      }).select("*").single();
      if (error || !created) return json({ ok: false, error: error?.message ?? "could not open the approval" }, 500);
      await log("coach_confirm_schedule", `${coach.name} confirmed OVER-guideline schedule → approval opened`, "coach");
      const league = await leagueName();
      const html = `<div style="font-family:sans-serif"><h2>Schedule approval needed</h2><p><b>${escHtml(coach.name)}</b> (${escHtml(teamName)}${teamRow?.division ? ", " + escHtml(teamRow.division) : ""}) confirmed a practice schedule that is outside the league guideline and says it was approved.</p><blockquote style="border-left:3px solid #c96f2f;padding:8px 12px;background:#f7f5ee;white-space:pre-wrap;">${escHtml(summary)}</blockquote><p>Approve or deny it in the admin console (Coaches Hub &rarr; Requests inbox):<br><a href="https://coachpilot.org/fields/admin.html#hub">coachpilot.org/fields/admin.html</a></p></div>`;
      await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        reply_to: coach.email,
        to: ["cppa@blslittleleague.org", "vpbb@blslittleleague.org"],
        bcc: [ADMIN_ALERT_EMAIL],
        subject: `[${league}] Schedule approval needed: ${teamName}`,
        html,
      }).catch(() => ({ ok: false }));
      return json({ ok: true, approved: false, request: { id: created.id } });
    }

    if (action === "coach_set_team_name" && req.method === "POST") {
      // Hub nudge: teams are listed "Division Sport Coach" until the coach adds
      // their team name here, which appends it (MinorsA SB Grande -> ... Grande
      // Cougars). Saving empty records '' = "no team name yet" so the nudge
      // clears on every device and never asks again. One-shot: once a nickname
      // exists, changes go through Support so names can't drift.
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      if (!coach.team_id) return json({ ok: false, error: "no team on file — contact support" }, 400);
      const nickname = String(b.team_name ?? "").trim().replace(/\s+/g, " ").replace(/[^\w .'&-]/g, "").slice(0, 40);
      const { data: teamRow } = await db.from("flm_teams").select("id,name,nickname").eq("id", coach.team_id).single();
      if (!teamRow) return json({ ok: false, error: "team not found" }, 404);
      if (teamRow.nickname) return json({ ok: true, team_name: teamRow.name, nickname: teamRow.nickname });
      const update: Record<string, unknown> = { nickname };
      if (nickname) update.name = `${teamRow.name} ${nickname}`;
      const { error } = await db.from("flm_teams").update(update).eq("id", teamRow.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("coach_set_team_name", nickname ? `${coach.name} named their team: ${nickname}` : `${coach.name} confirmed no team name yet`, "coach");
      return json({ ok: true, team_name: nickname ? `${teamRow.name} ${nickname}` : teamRow.name, nickname });
    }

    if (action === "coach_submit_request" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const category = String(b.category ?? "").trim();
      const subject = String(b.subject ?? "").trim().slice(0, 160);
      const details = String(b.details ?? "").trim().slice(0, 4000);
      const assigned_contact_id = b.assigned_contact_id ? String(b.assigned_contact_id) : null;
      if (!REQUEST_CATEGORIES.includes(category)) return json({ ok: false, error: "pick a valid category" }, 400);
      if (!subject) return json({ ok: false, error: "add a short subject" }, 400);
      if (!details) return json({ ok: false, error: "add some details" }, 400);
      const insert = {
        category,
        subject,
        details,
        submitted_by_coach_id: coach.id,
        submitted_by_coach_name: coach.name,
        submitted_by_team_id: coach.team_id,
        assigned_contact_id,
        status: "open",
      };
      // Board routing (Matt Kriesel, 8/30): every request goes to the
      // submitting coach's DIVISION Player Agent first; the PA escalates if
      // they can't resolve it. Majors BB has no PA seated, so it falls to the
      // League Player Agent, as does anything without a division match.
      const DIVISION_PA: Record<string, string> = {
        "Minors Baseball": "minorsbbpa@blslittleleague.org",
        "AA Baseball": "doubleapa@blslittleleague.org",
        "Coach Pitch Baseball": "cppa@blslittleleague.org",
        "T-Ball": "tbpa@blslittleleague.org",
        "Majors Softball": "sbmajorspa@blslittleleague.org",
        "Minors A Softball": "minorssbpa@blslittleleague.org",
        "Minors B Softball": "minorssbpa@blslittleleague.org",
      };
      const LEAGUE_PA = "pa@blslittleleague.org";

      let routedEmail = "";
      let routedContactId = assigned_contact_id;
      if (assigned_contact_id) {
        const { data: c } = await db.from("flm_contacts").select("email").eq("id", assigned_contact_id).maybeSingle();
        routedEmail = String(c?.email ?? "").trim();
      } else {
        let division = "";
        if (coach.team_id) {
          const { data: t } = await db.from("flm_teams").select("division").eq("id", coach.team_id).single();
          division = String(t?.division ?? "");
        }
        routedEmail = DIVISION_PA[division] ?? LEAGUE_PA;
        const { data: paContact } = await db.from("flm_contacts").select("id").ilike("email", routedEmail).maybeSingle();
        if (paContact) routedContactId = paContact.id;
      }

      insert.assigned_contact_id = routedContactId;
      const { data: created, error } = await db.from("flm_requests").insert(insert).select("*").single();
      if (error || !created) return json({ ok: false, error: error?.message ?? "insert failed" }, 500);

      // Category CCs (Coach, 8/31): the division PA always owns the request,
      // but the board member who owns that category rides along on CC so the
      // fix can start before the PA even forwards it. Gear splits by ball.
      let division = "";
      if (coach.team_id) {
        const { data: tDiv } = await db.from("flm_teams").select("division").eq("id", coach.team_id).single();
        division = String(tDiv?.division ?? "");
      }
      const isSoftball = /softball/i.test(division);
      const CATEGORY_CC: Record<string, string[]> = {
        field_issue: ["fields@blslittleleague.org"],
        gear: [isSoftball ? "sbequipment@blslittleleague.org" : "bbequipment@blslittleleague.org"],
      };
      const ccList = (CATEGORY_CC[category] ?? []).filter((e) => e && e.toLowerCase() !== routedEmail.toLowerCase());

      await log("coach_submit_request", `${coach.name}: ${category} — ${subject} → ${routedEmail}${ccList.length ? " cc " + ccList.join(",") : ""}`, "coach");
      const league = await leagueName();
      const html = coachRequestEmailHtml(league, created, coach.email);
      const to = routedEmail && routedEmail.includes("@") ? routedEmail : ADMIN_ALERT_EMAIL;
      await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        reply_to: coach.email,
        to: [to],
        ...(ccList.length ? { cc: ccList } : {}),
        // Keep Daniel in the loop while the league beta-tests routing.
        bcc: [ADMIN_ALERT_EMAIL],
        subject: `[${league}] ${subject}`,
        html,
      }).catch(() => ({ ok: false }));
      return json({ ok: true, request: created });
    }

    // Coach-to-coach message. Recipient email is looked up server-side — the
    // client only knows recipient IDs, never emails. Best-effort Resend send;
    // if it fails, the row still exists so the league has the record.
    if (action === "coach_send_message" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const to_coach_id = String(b.to_coach_id ?? "").trim();
      const subject = String(b.subject ?? "").trim().slice(0, 160);
      const body = String(b.body ?? "").trim().slice(0, 4000);
      if (!to_coach_id) return json({ ok: false, error: "pick a coach to message" }, 400);
      if (to_coach_id === coach.id) return json({ ok: false, error: "you can not message yourself" }, 400);
      if (!subject) return json({ ok: false, error: "add a subject" }, 400);
      if (!body) return json({ ok: false, error: "add a message" }, 400);
      const { data: to } = await db.from("flm_coaches").select("id,name,email,active").eq("id", to_coach_id).maybeSingle();
      if (!to || !to.active) return json({ ok: false, error: "that coach is no longer active" }, 404);
      const insert = {
        from_coach_id: coach.id, to_coach_id: to.id,
        from_name: coach.name, to_name: to.name,
        subject, body,
      };
      const { data: created, error } = await db.from("flm_messages").insert(insert).select("*").single();
      if (error || !created) return json({ ok: false, error: error?.message ?? "insert failed" }, 500);
      // Metadata-only activity line — no body, keeps the audit log privacy-safe.
      await log("coach_msg", `${coach.name} → ${to.name}: ${subject}`, "coach");
      const league = await leagueName();
      const html = coachMessageEmailHtml(league, coach.name, coach.email, subject, body);
      const send = await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        reply_to: coach.email,
        to: [to.email],
        subject: `[${league}] From Coach ${coach.name}: ${subject}`,
        html,
      }).catch(() => ({ ok: false } as { ok: boolean; id?: string; error?: string }));
      if (send.ok && send.id) {
        await db.from("flm_messages").update({ resend_id: send.id }).eq("id", created.id);
      }
      // Push notification (in addition to the email). Fire-and-forget.
      await sendPushToCoach(to.id, {
        title: `Message from Coach ${coach.name}`,
        body: subject.length > 100 ? subject.slice(0, 97) + "..." : subject,
        url: "/fields/",
        tag: `flm-msg-${created.id}`,
      }).catch(() => {});
      return json({ ok: true, message: { id: created.id, subject: created.subject, to_name: to.name } });
    }

    // Recipient marks a message as read — clears the unread badge in the hub.
    if (action === "coach_read_message" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const id = String(b.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { data: msg } = await db.from("flm_messages").select("id,to_coach_id,read_at").eq("id", id).maybeSingle();
      if (!msg || msg.to_coach_id !== coach.id) return json({ ok: false, error: "not found" }, 404);
      if (!msg.read_at) {
        await db.from("flm_messages").update({ read_at: new Date().toISOString() }).eq("id", id);
      }
      return json({ ok: true });
    }

    if (action === "coach_change_pin" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const np = String(b.new_pin ?? "").trim();
      if (!isPin(np)) return json({ ok: false, error: "PIN must be exactly 4 digits" }, 400);
      const { error } = await db.from("flm_coaches").update({ pin: np }).eq("id", coach.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("coach_change_pin", `${coach.name} changed their PIN`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_edit_slot" && req.method === "POST") {
      // Coach can move (change day_key and/or field_id) or update the note on
      // a slot that belongs to their team. Season lock still applies.
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach || !(coach.team_ids || []).length) return json({ ok: false, error: "not signed in with a team" }, 401);
      const slot_id = String(b.slot_id ?? "");
      if (!slot_id) return json({ ok: false, error: "slot_id required" }, 400);
      const { data: slot } = await db.from("flm_slots").select("id,team_id,season_id,day_key,field_id,label").eq("id", slot_id).single();
      if (!slot) return json({ ok: false, error: "slot not found" }, 404);
      if (!(coach.team_ids || []).includes(slot.team_id)) return json({ ok: false, error: "You can only edit practices for your own team." }, 403);
      const { data: season } = await db.from("flm_seasons").select("locked,label").eq("id", slot.season_id).single();
      if (season?.locked) return json({ ok: false, error: "This schedule window is locked by the league." }, 403);
      const patch: Record<string, string | null> = {};
      if (b.day_key !== undefined && b.day_key !== null) {
        const dk = String(b.day_key);
        if (!DAY_KEYS.includes(dk)) return json({ ok: false, error: "invalid day/time slot" }, 400);
        patch.day_key = dk;
      }
      if (b.field_id !== undefined && b.field_id !== null) patch.field_id = String(b.field_id);
      if (b.note !== undefined) patch.note = String(b.note ?? "").slice(0, 200);
      if (!Object.keys(patch).length) return json({ ok: false, error: "nothing to update" }, 400);
      // If they're changing time or field, check the new spot for conflicts.
      if (patch.day_key || patch.field_id) {
        const newDay = patch.day_key ?? slot.day_key;
        const newField = patch.field_id ?? slot.field_id;
        const { data: clash } = await db.from("flm_slots").select("id,team_id").eq("season_id", slot.season_id).eq("day_key", newDay).eq("field_id", newField).neq("id", slot_id);
        if ((clash ?? []).length && !b.allow_share) return json({ ok: false, error: "That day + field is already taken. Ask the other coach if they want to share.", taken: true }, 409);
      }
      const { error } = await db.from("flm_slots").update(patch).eq("id", slot_id);
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("coach_edit_slot", `${coach.name} edited ${slot.label} (${Object.keys(patch).join(", ")})`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_cancel_slot" && req.method === "POST") {
      // Soft-cancel: sets cancelled_at + reason. Slot stays visible so other
      // coaches see the cancellation and can free field time. Coach can undo.
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach || !(coach.team_ids || []).length) return json({ ok: false, error: "not signed in with a team" }, 401);
      const slot_id = String(b.slot_id ?? "");
      if (!slot_id) return json({ ok: false, error: "slot_id required" }, 400);
      const { data: slot } = await db.from("flm_slots").select("id,team_id,season_id,label,day_key").eq("id", slot_id).single();
      if (!slot) return json({ ok: false, error: "slot not found" }, 404);
      if (!(coach.team_ids || []).includes(slot.team_id)) return json({ ok: false, error: "You can only cancel your own team's practices." }, 403);
      const reason = String(b.reason ?? "").trim().slice(0, 200);
      const { error } = await db.from("flm_slots").update({ cancelled_at: new Date().toISOString(), cancel_reason: reason || "Cancelled" }).eq("id", slot_id);
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("coach_cancel_slot", `${coach.name} cancelled ${slot.label} on ${slot.day_key}${reason ? " — " + reason : ""}`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_uncancel_slot" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach || !(coach.team_ids || []).length) return json({ ok: false, error: "not signed in with a team" }, 401);
      const slot_id = String(b.slot_id ?? "");
      if (!slot_id) return json({ ok: false, error: "slot_id required" }, 400);
      const { data: slot } = await db.from("flm_slots").select("id,team_id,label,day_key").eq("id", slot_id).single();
      if (!slot) return json({ ok: false, error: "slot not found" }, 404);
      if (!(coach.team_ids || []).includes(slot.team_id)) return json({ ok: false, error: "You can only restore your own team's practices." }, 403);
      const { error } = await db.from("flm_slots").update({ cancelled_at: null, cancel_reason: null }).eq("id", slot_id);
      if (error) return json({ ok: false, error: error.message }, 500);
      await log("coach_uncancel_slot", `${coach.name} restored ${slot.label} on ${slot.day_key}`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_push_subscribe" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const sub = b.subscription as { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
      if (!sub || !sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return json({ ok: false, error: "bad subscription" }, 400);
      const ua = String(b.user_agent ?? "").slice(0, 400);
      // Upsert by endpoint (same device re-subscribing shouldn't create a dup)
      const { error } = await db.from("flm_push_subscriptions").upsert({
        coach_id: coach.id,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        user_agent: ua,
        active: true,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) return json({ ok: false, error: error.message }, 500);
      // Immediate confirmation push so the coach sees it work
      await sendPushToCoach(coach.id, { title: "Notifications on", body: "You'll get a ping for messages and join requests.", url: "/fields/", tag: "flm-welcome" });
      await log("coach_push_subscribe", `${coach.name} enabled notifications`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_push_unsubscribe" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const endpoint = String(b.endpoint ?? "");
      if (endpoint) {
        await db.from("flm_push_subscriptions").update({ active: false }).eq("endpoint", endpoint).eq("coach_id", coach.id);
      } else {
        // Kill all subs for this coach
        await db.from("flm_push_subscriptions").update({ active: false }).eq("coach_id", coach.id);
      }
      await log("coach_push_unsubscribe", `${coach.name} disabled notifications`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_vapid_public" && req.method === "GET") {
      return json({ ok: true, key: VAPID_PUBLIC });
    }

    if (action === "coach_request_join" && req.method === "POST") {
      // Formal request to join another team's practice. Creates a flm_slot_joins
      // row and emails the host. Host can Approve (which duplicates the slot for
      // the requester's team) or Deny (which records the decision + response note).
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const slot_id = String(b.slot_id ?? "");
      const note = String(b.note ?? "").trim().slice(0, 1000);
      if (!slot_id) return json({ ok: false, error: "slot_id required" }, 400);
      const { data: slot } = await db.from("flm_slots").select("id,team_id,day_key,field_id,label,season_id").eq("id", slot_id).single();
      if (!slot) return json({ ok: false, error: "practice not found" }, 404);
      if (!slot.team_id) return json({ ok: false, error: "this slot has no team on it" }, 400);
      if (slot.team_id === coach.team_id) return json({ ok: false, error: "that is your own practice" }, 400);
      const { data: host } = await db.from("flm_coaches").select("id,name,email").eq("team_id", slot.team_id).eq("active", true).limit(1).maybeSingle();
      if (!host) return json({ ok: false, error: "the host team does not have a signed-up coach yet" }, 404);
      const { data: field } = await db.from("flm_fields").select("name").eq("id", slot.field_id).single();
      // Only one pending request per pair per slot
      const { data: dup } = await db.from("flm_slot_joins").select("id").eq("slot_id", slot_id).eq("from_coach_id", coach.id).eq("status", "pending").maybeSingle();
      if (dup) return json({ ok: false, error: "you already have a pending request for this practice" }, 409);
      const { data: created, error } = await db.from("flm_slot_joins").insert({
        slot_id, from_coach_id: coach.id, from_team_id: coach.team_id,
        from_name: coach.name, to_coach_id: host.id, to_team_id: slot.team_id, to_name: host.name,
        note, status: "pending",
      }).select("*").single();
      if (error || !created) return json({ ok: false, error: error?.message ?? "insert failed" }, 500);
      const league = await leagueName();
      const slotDesc = `${slot.day_key} at ${field?.name ?? "the field"}`;
      const html = `<div style="font-family:sans-serif"><h2>Practice join request</h2><p><b>${coach.name}</b> would like to join your practice on <b>${slotDesc}</b>.</p>${note ? `<blockquote style="border-left:3px solid #c96f2f;padding:8px 12px;background:#f7f5ee;">${escHtml(note)}</blockquote>` : ""}<p>Sign in to the Coaches Hub to approve or deny: <a href="https://coachpilot.org/fields/">coachpilot.org/fields</a></p></div>`;
      await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        reply_to: coach.email,
        to: [host.email],
        subject: `[${league}] Join request from Coach ${coach.name}: ${slotDesc}`,
        html,
      });
      await sendPushToCoach(host.id, {
        title: `${coach.name} wants to join your practice`,
        body: `${slotDesc}${note ? " — " + note.slice(0, 100) : ""}`,
        url: "/fields/",
      }).catch(() => {});
      await log("coach_request_join", `${coach.name} → ${host.name}: ${slotDesc}`, "coach");
      return json({ ok: true, request: created });
    }

    if (action === "coach_respond_join" && req.method === "POST") {
      // Host approves or denies. On approve, we duplicate the slot for the
      // requester's team so the schedule shows both teams sharing the field.
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const request_id = String(b.request_id ?? "");
      const decision = String(b.decision ?? "");
      const responseNote = String(b.response_note ?? "").trim().slice(0, 400);
      if (!request_id || !["approved", "denied"].includes(decision)) return json({ ok: false, error: "request_id + decision required" }, 400);
      const { data: r } = await db.from("flm_slot_joins").select("*").eq("id", request_id).single();
      if (!r) return json({ ok: false, error: "request not found" }, 404);
      if (r.to_coach_id !== coach.id) return json({ ok: false, error: "only the host coach can respond" }, 403);
      if (r.status !== "pending") return json({ ok: false, error: "already answered" }, 409);
      // If approved, create a mirrored slot for the requester's team.
      if (decision === "approved" && r.from_team_id) {
        const { data: slot } = await db.from("flm_slots").select("season_id,day_key,field_id,note").eq("id", r.slot_id).single();
        if (slot) {
          const { data: team } = await db.from("flm_teams").select("name").eq("id", r.from_team_id).single();
          await db.from("flm_slots").insert({
            season_id: slot.season_id, day_key: slot.day_key, field_id: slot.field_id,
            team_id: r.from_team_id, label: team?.name || r.from_name,
            note: `Sharing with ${r.to_name}`, claimed_by: "join",
          });
        }
      }
      await db.from("flm_slot_joins").update({ status: decision, response_note: responseNote, resolved_at: new Date().toISOString() }).eq("id", request_id);
      // Notify requester
      const { data: requester } = await db.from("flm_coaches").select("email,name").eq("id", r.from_coach_id).single();
      if (requester) {
        const league = await leagueName();
        const verdict = decision === "approved" ? "APPROVED" : "DENIED";
        const html = `<div style="font-family:sans-serif"><h2>Join request ${verdict.toLowerCase()}</h2><p>Coach ${coach.name} ${verdict === "APPROVED" ? "approved your request to join their practice." : "denied your join request."}</p>${responseNote ? `<blockquote style="border-left:3px solid #c96f2f;padding:8px 12px;background:#f7f5ee;">${escHtml(responseNote)}</blockquote>` : ""}<p><a href="https://coachpilot.org/fields/">Open the Coaches Hub</a></p></div>`;
        await resendSend({
          from: "Field Command <noreply@coachpilot.org>",
          reply_to: coach.email || undefined,
          to: [requester.email],
          subject: `[${league}] Your join request was ${decision}`,
          html,
        });
        await sendPushToCoach(r.from_coach_id, {
          title: `Join request ${decision}`,
          body: `${coach.name} ${decision} your request${responseNote ? ": " + responseNote.slice(0, 100) : ""}`,
          url: "/fields/",
        }).catch(() => {});
      }
      await log("coach_respond_join", `${coach.name} ${decision} join from ${r.from_name}`, "coach");
      return json({ ok: true });
    }

    if (action === "coach_update_profile" && req.method === "POST") {
      const b = await req.json().catch(() => ({} as Record<string, unknown>));
      const coach = await coachAuth(b);
      if (!coach) return json({ ok: false, error: "not signed in" }, 401);
      const patch: Record<string, string> = {};
      if (b.phone !== undefined) patch.phone = String(b.phone ?? "").trim().slice(0, 40);
      // Name edits are allowed (in case the imported spreadsheet had "J. Doe" and the
      // coach wants their full name). Email is intentionally NOT editable here — it's
      // the login credential; a change has to go through the league admin.
      if (b.name !== undefined) {
        const nm = String(b.name ?? "").trim().slice(0, 120);
        if (nm) patch.name = nm;
      }
      if (!Object.keys(patch).length) return json({ ok: false, error: "nothing to update" }, 400);
      const { error } = await db.from("flm_coaches").update(patch).eq("id", coach.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      // Mirror phone onto the team row too so anyone browsing the team directory sees
      // the same number.
      if (patch.phone && coach.team_id) {
        await db.from("flm_teams").update({ coach_phone: patch.phone }).eq("id", coach.team_id);
      }
      await log("coach_update_profile", `${coach.name} updated ${Object.keys(patch).join(", ")}`, "coach");
      return json({ ok: true });
    }

    // ---------- admin ----------
    const pin = req.headers.get("x-admin-pin") ?? "";
    const adminOk = pin.length > 0 && pin === (await getPin());
    if (!adminOk) return json({ ok: false, error: "unauthorized" }, 401);

    if (action === "activity") {
      const { data } = await db.from("flm_activity").select("*").order("created_at", { ascending: false }).limit(150);
      return json({ ok: true, activity: data });
    }

    if (action === "admin_teams") {
      const { data } = await db.from("flm_teams").select("id,name,coach_name,coach_email,division,is_active").order("name");
      return json({ ok: true, teams: data });
    }

    if (action === "admin_umps") {
      // Admin console only: the one read that includes umpire contact info.
      const { data } = await db.from("flm_umps").select("*").order("name");
      return json({ ok: true, umps: data });
    }

    if (action === "admin_announcements") {
      const { data } = await db.from("flm_announcements").select("*").order("created_at", { ascending: false }).limit(30);
      return json({ ok: true, announcements: data });
    }

    if (action === "events_summary") {
      const since = new Date(Date.now() - 7 * 86400000).toISOString();
      const base = () => db.from("flm_events").select("*", { count: "exact", head: true });
      const counts = await Promise.all([
        base().eq("event", "page_view"),
        base().eq("event", "page_view").gte("created_at", since),
        base().eq("event", "page_view").eq("page", "fields").gte("created_at", since),
        base().eq("event", "page_view").eq("page", "fields-admin").gte("created_at", since),
        base().eq("event", "js_error"),
        base().eq("event", "js_error").gte("created_at", since),
      ]).then((rs) => rs.map((r) => r.count ?? 0));
      return json({
        ok: true,
        views_total: counts[0], views_7d: counts[1],
        views_7d_public: counts[2], views_7d_admin: counts[3],
        errors_total: counts[4], errors_7d: counts[5],
      });
    }

    if (req.method !== "POST") return json({ ok: false, error: "POST required" }, 405);
    const b = await req.json();

    if (action === "admin_ump") {
      if (b.delete_id) {
        const { data: u } = await db.from("flm_umps").select("name").eq("id", b.delete_id).maybeSingle();
        await db.from("flm_umps").delete().eq("id", b.delete_id);
        await log("ump_admin", `Removed umpire ${u?.name ?? b.delete_id}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      for (const k of ["name", "email", "phone", "parent_email", "notes"]) {
        if (b[k] !== undefined) row[k] = String(b[k]).trim().slice(0, 160);
      }
      if (b.pin !== undefined) {
        if (!/^\d{4}$/.test(String(b.pin))) return json({ ok: false, error: "PIN must be exactly 4 digits" }, 400);
        row.pin = String(b.pin);
      }
      if (b.levels !== undefined) {
        if (!Array.isArray(b.levels)) return json({ ok: false, error: "levels must be a list of divisions" }, 400);
        row.levels = b.levels.map((d: unknown) => String(d).trim()).filter((d: string) => d).slice(0, 20);
      }
      if (b.is_minor !== undefined) row.is_minor = !!b.is_minor;
      if (b.active !== undefined) row.active = !!b.active;
      let res;
      if (b.id) {
        const { data: cur } = await db.from("flm_umps").select("*").eq("id", b.id).maybeSingle();
        if (!cur) return json({ ok: false, error: "not found" }, 404);
        const merged = { ...cur, ...row };
        if (merged.is_minor && !String(merged.parent_email ?? "").includes("@")) {
          return json({ ok: false, error: "A minor umpire needs a parent email on file. Every email to them cc's the parent." }, 400);
        }
        res = await db.from("flm_umps").update(row).eq("id", b.id).select().single();
      } else {
        if (!row.name) return json({ ok: false, error: "name required" }, 400);
        if (!row.pin) row.pin = String(Math.floor(1000 + Math.random() * 9000));
        if (row.is_minor === true && !String(row.parent_email ?? "").includes("@")) {
          return json({ ok: false, error: "A minor umpire needs a parent email on file. Every email to them cc's the parent." }, 400);
        }
        res = await db.from("flm_umps").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("ump_admin", `${b.id ? "Updated" : "Added"} umpire ${res.data?.name}`, "admin");
      return json({ ok: true, ump: res.data });
    }

    if (action === "admin_ump_assign") {
      if (b.delete_id) {
        const { data: a } = await db.from("flm_ump_assignments").select("*").eq("id", b.delete_id).maybeSingle();
        if (!a) return json({ ok: false, error: "not found" }, 404);
        const [{ data: u }, { data: g }] = await Promise.all([
          db.from("flm_umps").select("name").eq("id", a.ump_id).maybeSingle(),
          db.from("flm_games").select("*").eq("id", a.game_id).maybeSingle(),
        ]);
        await db.from("flm_ump_assignments").delete().eq("id", b.delete_id);
        await log("ump_admin", `Withdrew ${u?.name ?? "an umpire"} from ${g ? `${await gameNames(g)} on ${g.game_date}` : "a game"}`, "admin");
        return json({ ok: true });
      }
      const { game_id, ump_id } = b;
      if (!game_id || !ump_id) return json({ ok: false, error: "game_id and ump_id required" }, 400);
      const role = UMP_ROLES.includes(b.role) ? b.role : "plate";
      const [{ data: game }, { data: ump }] = await Promise.all([
        db.from("flm_games").select("*").eq("id", game_id).maybeSingle(),
        db.from("flm_umps").select("*").eq("id", ump_id).maybeSingle(),
      ]);
      if (!game) return json({ ok: false, error: "game not found" }, 404);
      if (!ump || !ump.active) return json({ ok: false, error: "unknown or inactive umpire" }, 400);
      const { data: existingA } = await db.from("flm_ump_assignments").select("id,status").eq("game_id", game_id).eq("ump_id", ump_id).in("status", ["offered", "accepted"]);
      const dup = (existingA ?? [])[0];
      if (dup) return json({ ok: false, error: `${ump.name} already has this game (${dup.status}).` }, 409);
      // Admin assignment starts as an OFFER: the ump accepts or declines on their page.
      const ins = await db.from("flm_ump_assignments").insert({ game_id, ump_id, role, status: "offered" }).select().single();
      if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
      const gname = `${await gameNames(game)} on ${game.game_date}`;
      await log("ump_admin", `Offered ${ump.name} the ${role} umpire spot for ${gname}`, "admin");
      let email: Record<string, unknown> = { skipped: true };
      const line = `You are offered the ${role} umpire spot for ${gname}, ${String(game.start_time).slice(0, 5)} to ${String(game.end_time).slice(0, 5)}. Open the umpire page to accept or decline.`;
      if (await emailOn()) {
        const ln = await leagueName();
        const r = await sendUmpEmail(ump, `${ln}: game offer for ${game.game_date}`, umpEmailHtml(ln, "You have a game offer", [line]), typeof b.test_to === "string" ? b.test_to.trim() : "");
        email = r;
        await log("ump_email", r.ok ? `Offer email sent to ${ump.name}${(r.cc ?? []).length ? " (parent cc'd)" : ""} for ${gname}` : `Offer email to ${ump.name} failed: ${r.error}`, "system");
      } else {
        await log("ump_email", `Email is off. Would have emailed ${ump.name} the offer for ${gname}.`, "system");
      }
      return json({ ok: true, assignment: ins.data, email });
    }

    if (action === "admin_settings") {
      if (typeof b.email_enabled === "string") {
        if (b.email_enabled !== "true" && b.email_enabled !== "false") {
          return json({ ok: false, error: "email_enabled must be true or false" }, 400);
        }
        await db.from("flm_settings").upsert({ key: "email_enabled", value: b.email_enabled }, { onConflict: "key" });
        await log("settings", b.email_enabled === "true" ? "Email sending turned ON" : "Email sending turned OFF. Reminders and offers are logged, not sent.", "admin");
      }
      if (typeof b.ump_defaults === "string") {
        try {
          const o = JSON.parse(b.ump_defaults);
          if (!o || typeof o !== "object" || Array.isArray(o) || Object.values(o).some((v) => typeof v !== "number" || v < 0 || v > 6)) {
            return json({ ok: false, error: "ump_defaults must map divisions to a number of umpires (0 to 6)" }, 400);
          }
        } catch (_e) {
          return json({ ok: false, error: "ump_defaults must be valid JSON" }, 400);
        }
        await db.from("flm_settings").upsert({ key: "ump_defaults", value: b.ump_defaults }, { onConflict: "key" });
      }
      // Phase 5 keys: standings_divisions = per-division standings settings
      // ({ "Majors BB": { "show": true, "count_interlock": true } });
      // sg_unplaced = the last generation's unplaced matchups, persisted so the
      // review list survives a reload.
      if (typeof b.standings_divisions === "string") {
        try {
          const o = JSON.parse(b.standings_divisions);
          if (!o || typeof o !== "object" || Array.isArray(o) || Object.values(o).some((v) => !v || typeof v !== "object" || Array.isArray(v))) {
            return json({ ok: false, error: "standings_divisions must map divisions to settings objects" }, 400);
          }
        } catch (_e) {
          return json({ ok: false, error: "standings_divisions must be valid JSON" }, 400);
        }
        await db.from("flm_settings").upsert({ key: "standings_divisions", value: b.standings_divisions }, { onConflict: "key" });
      }
      if (typeof b.sg_unplaced === "string") {
        try {
          const a = JSON.parse(b.sg_unplaced);
          if (!Array.isArray(a) || a.length > 100) return json({ ok: false, error: "sg_unplaced must be a list of at most 100 items" }, 400);
        } catch (_e) {
          return json({ ok: false, error: "sg_unplaced must be valid JSON" }, 400);
        }
        await db.from("flm_settings").upsert({ key: "sg_unplaced", value: b.sg_unplaced }, { onConflict: "key" });
      }
      for (const key of ["league_name", "rules", "practice_rules", "season_gen_config"]) {
        if (typeof b[key] === "string") {
          if (key === "practice_rules") {
            try {
              const r = JSON.parse(b[key]);
              if (typeof r.max_weekdays !== "number" || typeof r.max_weekend !== "number" || !Array.isArray(r.alternatives ?? [])) {
                return json({ ok: false, error: "practice_rules must include numeric max_weekdays and max_weekend" }, 400);
              }
            } catch (_e) {
              return json({ ok: false, error: "practice_rules must be valid JSON" }, 400);
            }
          }
          if (key === "season_gen_config") {
            try {
              const c = JSON.parse(b[key]);
              if (!c || typeof c !== "object" || Array.isArray(c)) {
                return json({ ok: false, error: "season_gen_config must be a JSON object" }, 400);
              }
            } catch (_e) {
              return json({ ok: false, error: "season_gen_config must be valid JSON" }, 400);
            }
          }
          await db.from("flm_settings").upsert({ key, value: b[key] }, { onConflict: "key" });
        }
      }
      await log("settings", "League settings updated", "admin");
      return json({ ok: true });
    }

    if (action === "admin_announcement") {
      if (b.delete_id) {
        const { data: a } = await db.from("flm_announcements").select("title").eq("id", b.delete_id).single();
        await db.from("flm_announcements").delete().eq("id", b.delete_id);
        await log("announce", `Deleted announcement ${a?.title ?? b.delete_id}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      if (b.title !== undefined) row.title = String(b.title).trim().slice(0, 160);
      if (b.body !== undefined) row.body = String(b.body).trim().slice(0, 2000);
      if (b.severity !== undefined) {
        if (!SEVERITIES.includes(b.severity)) return json({ ok: false, error: "severity must be info, warning, or urgent" }, 400);
        row.severity = b.severity;
      }
      if (b.active !== undefined) row.active = !!b.active;
      let res;
      if (b.id) res = await db.from("flm_announcements").update(row).eq("id", b.id).select().single();
      else {
        if (!row.title) return json({ ok: false, error: "title required" }, 400);
        res = await db.from("flm_announcements").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("announce", `${b.id ? "Updated" : "Posted"} announcement ${res.data?.title}${b.id && b.active === false ? " (deactivated)" : ""}`, "admin");
      return json({ ok: true, announcement: res.data });
    }

    if (action === "admin_announcement_email") {
      if (!b.id) return json({ ok: false, error: "announcement id required" }, 400);
      const { data: a } = await db.from("flm_announcements").select("*").eq("id", b.id).single();
      if (!a) return json({ ok: false, error: "announcement not found" }, 404);
      const { data: teams } = await db.from("flm_teams").select("coach_name,coach_email").eq("is_active", true);
      const seen = new Set<string>();
      const coachEmails: string[] = [];
      for (const t of (teams ?? [])) {
        const e = String(t.coach_email ?? "").trim().toLowerCase();
        if (e && e.includes("@") && !seen.has(e)) { seen.add(e); coachEmails.push(e); }
      }
      if (b.preview) return json({ ok: true, recipients: coachEmails.length });

      const testTo = typeof b.test_to === "string" && b.test_to.includes("@") ? b.test_to.trim() : "";
      const recipients = testTo ? [testTo] : coachEmails;
      if (recipients.length === 0) return json({ ok: false, error: "No coach emails on file yet. Add emails to teams first." }, 400);
      if (recipients.length > 100) return json({ ok: false, error: "recipient list too large" }, 400);

      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
      if (!RESEND_API_KEY) return json({ ok: false, error: "email is not configured" }, 500);
      const { data: lg } = await db.from("flm_settings").select("value").eq("key", "league_name").maybeSingle();
      const leagueName = lg?.value || "Field Command";
      const html = announcementEmailHtml(leagueName, a);
      const subject = `${leagueName}: ${a.title}`;
      const sent: string[] = [];
      const ids: string[] = [];
      const failed: Array<{ to: string; error: string }> = [];
      for (const to of recipients) {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: "Field Command <noreply@coachpilot.org>", reply_to: "Daniel.Grande@ymail.com", to: [to], subject, html }),
        });
        if (res.ok) {
          sent.push(to);
          try { ids.push((await res.json()).id ?? ""); } catch (_e) { ids.push(""); }
        } else {
          failed.push({ to, error: `${res.status} ${(await res.text()).slice(0, 120)}` });
        }
        if (recipients.length > 1) await new Promise((r) => setTimeout(r, 550));
      }
      if (sent.length > 0) {
        await db.from("flm_announcements").update({ emailed_at: new Date().toISOString() }).eq("id", b.id);
      }
      await log("announce_email", testTo ? `Test email of "${a.title}" sent to ${testTo}` : `Announcement "${a.title}" emailed to ${sent.length} coaches${failed.length ? `, ${failed.length} failed` : ""}`, "admin");
      return json({ ok: true, sent_count: sent.length, failed, resend_ids: ids, test: !!testTo });
    }

    if (action === "admin_upsert_field") {
      const row: Record<string, unknown> = { name: String(b.name ?? "").trim() };
      if (!row.name) return json({ ok: false, error: "name required" }, 400);
      if (b.sort !== undefined) row.sort = b.sort;
      if (b.is_active !== undefined) row.is_active = !!b.is_active;
      if (b.notes !== undefined) row.notes = String(b.notes).slice(0, 300);
      if (b.divisions !== undefined) {
        if (!Array.isArray(b.divisions)) return json({ ok: false, error: "divisions must be a list" }, 400);
        row.divisions = b.divisions.map((d: unknown) => String(d).trim()).filter((d: string) => d).slice(0, 20);
      }
      let res;
      if (b.id) res = await db.from("flm_fields").update(row).eq("id", b.id).select().single();
      else res = await db.from("flm_fields").insert(row).select().single();
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("field", `${b.id ? "Updated" : "Added"} field ${row.name}`, "admin");
      return json({ ok: true, field: res.data });
    }

    if (action === "admin_delete_field") {
      const { data: f } = await db.from("flm_fields").select("name").eq("id", b.id).single();
      await db.from("flm_fields").delete().eq("id", b.id);
      await log("field", `Deleted field ${f?.name ?? b.id}`, "admin");
      return json({ ok: true });
    }

    if (action === "admin_upsert_team") {
      const row: Record<string, unknown> = {};
      for (const k of ["name", "coach_name", "coach_phone", "coach_email", "division"]) {
        if (b[k] !== undefined) row[k] = String(b[k]).trim().slice(0, 120);
      }
      if (b.is_active !== undefined) row.is_active = !!b.is_active;
      let res;
      if (b.id) res = await db.from("flm_teams").update(row).eq("id", b.id).select().single();
      else {
        if (!row.name) return json({ ok: false, error: "name required" }, 400);
        res = await db.from("flm_teams").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("team", `${b.id ? "Updated" : "Added"} team ${res.data?.name}`, "admin");
      return json({ ok: true, team: res.data });
    }

    if (action === "admin_delete_team") {
      const { data: t } = await db.from("flm_teams").select("name").eq("id", b.id).single();
      await db.from("flm_teams").delete().eq("id", b.id);
      await log("team", `Deleted team ${t?.name ?? b.id}`, "admin");
      return json({ ok: true });
    }

    // External teams: opponents from OTHER leagues (Auburn LL, Kent LL...).
    // They live in flm_ext_teams and never mix into flm_teams, so they can
    // never claim practice slots or show up in coach pickers or compliance.
    if (action === "admin_ext_team") {
      if (b.delete_id) {
        const { data: x } = await db.from("flm_ext_teams").select("team_name,league_name").eq("id", b.delete_id).single();
        const del = await db.from("flm_ext_teams").delete().eq("id", b.delete_id);
        if (del.error) {
          const msg = del.error.message.includes("violates foreign key")
            ? "That team still has games on the schedule. Delete or reassign its games first."
            : del.error.message;
          return json({ ok: false, error: msg }, 409);
        }
        await log("ext_team", `Deleted external team ${x ? `${x.team_name} (${x.league_name})` : b.delete_id}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      for (const k of ["league_name", "team_name", "division"]) {
        if (b[k] !== undefined) row[k] = String(b[k]).trim().slice(0, 120);
      }
      if (b.notes !== undefined) row.notes = String(b.notes).trim().slice(0, 300);
      let res;
      if (b.id) res = await db.from("flm_ext_teams").update(row).eq("id", b.id).select().single();
      else {
        if (!row.league_name || !row.team_name) return json({ ok: false, error: "league name and team name are both required" }, 400);
        res = await db.from("flm_ext_teams").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("ext_team", `${b.id ? "Updated" : "Added"} external team ${res.data?.team_name} (${res.data?.league_name})`, "admin");
      return json({ ok: true, ext_team: res.data });
    }

    if (action === "admin_upsert_season") {
      const row: Record<string, unknown> = {};
      if (b.label !== undefined) row.label = String(b.label).trim().slice(0, 80);
      if (b.start_date !== undefined) row.start_date = b.start_date || null;
      if (b.end_date !== undefined) row.end_date = b.end_date || null;
      if (b.sort !== undefined) row.sort = b.sort;
      if (b.locked !== undefined) row.locked = !!b.locked;
      if (b.is_active !== undefined) row.is_active = !!b.is_active;
      if (b.archived !== undefined) row.archived = !!b.archived;
      let res;
      if (b.id) res = await db.from("flm_seasons").update(row).eq("id", b.id).select().single();
      else {
        if (!row.label) return json({ ok: false, error: "label required" }, 400);
        res = await db.from("flm_seasons").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("season", `${b.id ? "Updated" : "Added"} window ${res.data?.label}`, "admin");
      return json({ ok: true, season: res.data });
    }

    if (action === "admin_delete_season") {
      const { data: s } = await db.from("flm_seasons").select("label").eq("id", b.id).single();
      await db.from("flm_seasons").delete().eq("id", b.id);
      await log("season", `Deleted window ${s?.label ?? b.id} (and its slots)`, "admin");
      return json({ ok: true });
    }

    // Phase 5: "Start next season". One confirmed action: create the new
    // window, archive every window that is live today (their games and
    // standings stay viewable in admin, but coaches, parents, and calendar
    // feeds only see the new season), optionally copy one old window's
    // practice grid, and point the saved season generator setup at the new
    // window. Fields and teams are league-wide and stay as they are.
    if (action === "admin_season_clone") {
      const label = String(b.label ?? "").trim().slice(0, 80);
      if (!label) return json({ ok: false, error: "Give the new season a name first." }, 400);
      const { data: allSeasons } = await db.from("flm_seasons").select("id,label,archived,sort").order("sort");
      const live = (allSeasons ?? []).filter((x: { archived: boolean }) => !x.archived);
      const maxSort = (allSeasons ?? []).reduce((m: number, x: { sort: number }) => Math.max(m, x.sort ?? 0), 0);
      const ins = await db.from("flm_seasons").insert({
        label,
        start_date: b.start_date || null,
        end_date: b.end_date || null,
        sort: maxSort + 1,
      }).select().single();
      if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
      const season = ins.data;
      if (live.length) {
        await db.from("flm_seasons").update({ archived: true, locked: true }).in("id", live.map((x: { id: string }) => x.id));
      }
      let copied = 0;
      if (b.copy_slots_from) {
        const { data: slots } = await db.from("flm_slots").select("day_key,field_id,team_id,label,note").eq("season_id", b.copy_slots_from);
        if ((slots ?? []).length) {
          const rows = (slots ?? []).map((sl: Record<string, unknown>) => ({ ...sl, season_id: season.id, claimed_by: "admin" }));
          const cp = await db.from("flm_slots").insert(rows).select("id");
          copied = (cp.data ?? []).length;
        }
      }
      // Carry the season generator setup over: same divisions, days, and
      // fields, pointed at the new window with its new date range.
      const { data: cfgRow } = await db.from("flm_settings").select("value").eq("key", "season_gen_config").maybeSingle();
      if (cfgRow?.value) {
        try {
          const cfg = JSON.parse(cfgRow.value);
          cfg.season_id = season.id;
          cfg.start_date = b.start_date || "";
          cfg.end_date = b.end_date || "";
          await db.from("flm_settings").upsert({ key: "season_gen_config", value: JSON.stringify(cfg) }, { onConflict: "key" });
        } catch (_e) { /* an unreadable config is left alone */ }
      }
      const archivedLabels = live.map((x: { label: string }) => x.label);
      await log("season", `Started next season "${label}". Archived ${archivedLabels.length ? archivedLabels.join(", ") : "no old windows"}${copied ? `, copied ${copied} practice slots over` : ""}. The old schedule stays viewable in admin.`, "admin");
      return json({ ok: true, season, copied_slots: copied, archived: archivedLabels });
    }

    if (action === "admin_slot") {
      if (b.delete_id) {
        const { data: s } = await db.from("flm_slots").select("label,day_key").eq("id", b.delete_id).single();
        await db.from("flm_slots").delete().eq("id", b.delete_id);
        await log("slot", `Admin removed ${s?.label ?? "slot"} from ${s?.day_key ?? "?"}`, "admin");
        return json({ ok: true });
      }
      if (b.id) {
        const row: Record<string, unknown> = {};
        if (b.team_id !== undefined) row.team_id = b.team_id || null;
        if (b.label !== undefined) row.label = String(b.label).slice(0, 160);
        if (b.note !== undefined) row.note = String(b.note).slice(0, 200);
        const res = await db.from("flm_slots").update(row).eq("id", b.id).select().single();
        if (res.error) return json({ ok: false, error: res.error.message }, 500);
        await log("slot", `Admin updated slot ${res.data?.label}`, "admin");
        return json({ ok: true, slot: res.data });
      }
      const { season_id, day_key, field_id } = b;
      if (!season_id || !day_key || !field_id || !DAY_KEYS.includes(day_key)) return json({ ok: false, error: "missing fields" }, 400);
      let label = String(b.label ?? "").slice(0, 160);
      if (!label && b.team_id) {
        const { data: t } = await db.from("flm_teams").select("name").eq("id", b.team_id).single();
        label = t?.name ?? "";
      }
      const res = await db.from("flm_slots").insert({ season_id, day_key, field_id, team_id: b.team_id || null, label, note: String(b.note ?? "").slice(0, 200), claimed_by: "admin" }).select().single();
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      await log("slot", `Admin placed ${label} on ${day_key}`, "admin");
      return json({ ok: true, slot: res.data });
    }

    if (action === "admin_game") {
      if (b.delete_id) {
        const { data: g } = await db.from("flm_games").select("*").eq("id", b.delete_id).single();
        if (!g) return json({ ok: false, error: "not found" }, 404);
        await db.from("flm_games").delete().eq("id", b.delete_id);
        await log("game", `Deleted game ${await gameNames(g)} on ${g.game_date}`, "admin");
        return json({ ok: true });
      }
      const row: Record<string, unknown> = {};
      for (const k of ["season_id", "home_team_id", "away_team_id", "ext_team_id", "field_id", "game_date", "start_time", "end_time"]) {
        if (b[k] !== undefined) row[k] = b[k] || null;
      }
      if (b.venue_text !== undefined) row.venue_text = b.venue_text ? String(b.venue_text).trim().slice(0, 160) || null : null;
      if (b.division !== undefined) row.division = String(b.division).trim().slice(0, 60);
      if (b.notes !== undefined) row.notes = b.notes === null ? null : String(b.notes).slice(0, 300);
      if (b.status !== undefined) {
        if (!GAME_STATUSES.includes(b.status)) return json({ ok: false, error: "status must be draft, scheduled, postponed, cancelled, or completed" }, 400);
        row.status = b.status;
      }
      if (b.umps_needed !== undefined) {
        if (b.umps_needed === null || b.umps_needed === "") row.umps_needed = null;
        else {
          const n = +b.umps_needed;
          if (!Number.isInteger(n) || n < 0 || n > 6) return json({ ok: false, error: "umpires needed must be a number from 0 to 6" }, 400);
          row.umps_needed = n;
        }
      }
      // Phase 5: final scores. Entering both scores normally rides along with
      // status "completed"; scores stay editable afterward.
      for (const k of ["home_score", "away_score"]) {
        if (b[k] !== undefined) {
          if (b[k] === null || b[k] === "") row[k] = null;
          else {
            const n = +b[k];
            if (!Number.isInteger(n) || n < 0 || n > 200) return json({ ok: false, error: "scores must be whole numbers from 0 to 200" }, 400);
            row[k] = n;
          }
        }
      }
      if (row.home_team_id && row.home_team_id === row.away_team_id) return json({ ok: false, error: "home and away must be different teams" }, 400);
      if (row.start_time && row.end_time && String(row.end_time) <= String(row.start_time)) return json({ ok: false, error: "end time must be after start time" }, 400);
      let res;
      if (b.id) {
        res = await db.from("flm_games").update(row).eq("id", b.id).select().single();
      } else {
        for (const k of ["season_id", "home_team_id", "game_date", "start_time", "end_time"]) {
          if (!row[k]) return json({ ok: false, error: `${k} required` }, 400);
        }
        const shapeErr = gameShapeError(row);
        if (shapeErr) return json({ ok: false, error: shapeErr }, 400);
        res = await db.from("flm_games").insert(row).select().single();
      }
      if (res.error) return json({ ok: false, error: res.error.message }, 500);
      const g = res.data;
      // Phase 3: moves, rainouts, and makeups pass a plain-words activity_note
      // ("Moved X from A to B") so the activity log reads like a story.
      const note = typeof b.activity_note === "string" && b.activity_note.trim() ? b.activity_note.trim().slice(0, 300) : "";
      await log("game", note || `${b.id ? "Updated" : "Scheduled"} game ${await gameNames(g)} on ${g.game_date} (${g.status})`, "admin");
      return json({ ok: true, game: g });
    }

    if (action === "admin_games_bulk") {
      // Season generator + Phase 3 season management.
      // op: insert (default, drafts only) | publish | discard | rainout.
      const op = String(b.op ?? "insert");

      if (op === "publish") {
        let q = db.from("flm_games").update({ status: "scheduled" }).eq("status", "draft");
        if (b.season_id) q = q.eq("season_id", b.season_id);
        const { data, error } = await q.select("id");
        if (error) return json({ ok: false, error: error.message }, 500);
        const n = (data ?? []).length;
        await log("games_bulk", `Published ${n} draft games to the live schedule`, "admin");
        return json({ ok: true, published: n });
      }

      if (op === "discard") {
        let q = db.from("flm_games").delete().eq("status", "draft");
        if (b.season_id) q = q.eq("season_id", b.season_id);
        const { data, error } = await q.select("id");
        if (error) return json({ ok: false, error: error.message }, 500);
        const n = (data ?? []).length;
        await log("games_bulk", `Discarded ${n} draft games`, "admin");
        return json({ ok: true, discarded: n });
      }

      if (op === "rainout") {
        // Classic rainy Saturday: postpone every SCHEDULED game on one date in
        // one confirmed action. Drafts, cancelled, completed, and already
        // postponed games are untouched.
        if (!b.date) return json({ ok: false, error: "date required" }, 400);
        let q = db.from("flm_games").update({ status: "postponed" }).eq("game_date", b.date).eq("status", "scheduled");
        if (b.season_id) q = q.eq("season_id", b.season_id);
        const { data, error } = await q.select("id");
        if (error) return json({ ok: false, error: error.message }, 500);
        const n = (data ?? []).length;
        await log("games_bulk", `Rained out ${n} games on ${b.date}. They are in the makeup tray.`, "admin");
        return json({ ok: true, postponed: n });
      }

      if (op !== "insert") return json({ ok: false, error: "op must be insert, publish, discard, or rainout" }, 400);
      const games = Array.isArray(b.games) ? b.games : [];
      if (games.length === 0 || games.length > 200) return json({ ok: false, error: "games must be a list of 1 to 200" }, 400);
      const rows: Record<string, unknown>[] = [];
      for (const g of games) {
        for (const k of ["season_id", "home_team_id", "game_date", "start_time", "end_time"]) {
          if (!g[k]) return json({ ok: false, error: `${k} required on every game` }, 400);
        }
        const shapeErr = gameShapeError(g);
        if (shapeErr) return json({ ok: false, error: `${shapeErr} (every game)` }, 400);
        if (g.home_team_id === g.away_team_id) return json({ ok: false, error: "home and away must be different teams" }, 400);
        if (String(g.end_time) <= String(g.start_time)) return json({ ok: false, error: "end time must be after start time" }, 400);
        rows.push({
          season_id: g.season_id,
          division: String(g.division ?? "").trim().slice(0, 60),
          home_team_id: g.home_team_id,
          away_team_id: g.away_team_id || null,
          ext_team_id: g.ext_team_id || null,
          field_id: g.field_id || null,
          venue_text: g.venue_text ? String(g.venue_text).trim().slice(0, 160) || null : null,
          game_date: g.game_date,
          start_time: g.start_time,
          end_time: g.end_time,
          status: "draft",
          notes: g.notes ? String(g.notes).slice(0, 300) : null,
        });
      }
      const { data, error } = await db.from("flm_games").insert(rows).select("id");
      if (error) return json({ ok: false, error: error.message }, 500);
      // One summary row for the whole generation: the client sends summary text
      // on the last chunk only, so chunked inserts do not spam the activity log.
      if (typeof b.summary === "string" && b.summary.trim()) {
        await log("games_bulk", b.summary.trim().slice(0, 300), "admin");
      }
      return json({ ok: true, inserted: (data ?? []).length });
    }

    if (action === "admin_import") {
      const summary = { fields_created: 0, teams_created: 0, teams_updated: 0, slots_created: 0, slots_removed: 0 };

      for (const t of (b.teams ?? [])) {
        const name = String(t.name ?? "").trim();
        const coach = String(t.coach_name ?? "").trim();
        const division = expandDivision(t.division);
        if (!name && !coach) continue;
        // Match an existing team: exact team name, else same coach in the same division
        // (a coach can legitimately run one baseball and one softball team).
        let existing = name
          ? (await db.from("flm_teams").select("id").ilike("name", name).maybeSingle()).data
          : null;
        if (!existing && coach) {
          const { data: byCoach } = await db.from("flm_teams").select("id,division").ilike("coach_name", coach);
          const pool = byCoach ?? [];
          existing = pool.find((r: { division: string }) => r.division === division) ?? (pool.length === 1 ? pool[0] : null);
        }
        const row: Record<string, string> = { coach_name: coach, coach_phone: String(t.coach_phone ?? "").trim(), division };
        if (t.coach_email !== undefined) row.coach_email = String(t.coach_email ?? "").trim().slice(0, 120);
        if (existing) {
          await db.from("flm_teams").update(row).eq("id", existing.id);
          summary.teams_updated++;
        } else {
          await db.from("flm_teams").insert({ name: name || coach, ...row });
          summary.teams_created++;
        }
      }

      if (!b.contacts_only && b.season && Array.isArray(b.slots)) {
        const label = String(b.season.label ?? "").trim();
        if (!label) return json({ ok: false, error: "season label required" }, 400);
        let { data: season } = await db.from("flm_seasons").select("id").eq("label", label).maybeSingle();
        if (!season) {
          const { data: maxSort } = await db.from("flm_seasons").select("sort").order("sort", { ascending: false }).limit(1).maybeSingle();
          const ins = await db.from("flm_seasons").insert({ label, start_date: b.season.start_date || null, end_date: b.season.end_date || null, sort: (maxSort?.sort ?? 0) + 1 }).select("id").single();
          if (ins.error) return json({ ok: false, error: ins.error.message }, 500);
          season = ins.data;
        }

        if (b.mode === "replace") {
          const del = await db.from("flm_slots").delete().eq("season_id", season.id).select("id");
          summary.slots_removed = (del.data ?? []).length;
        }

        const { data: allFields } = await db.from("flm_fields").select("id,name");
        const fieldMap = new Map((allFields ?? []).map((f: { id: string; name: string }) => [f.name.trim().toLowerCase(), f.id]));
        let sortBase = (allFields ?? []).length;
        for (const fname of (b.fields ?? [])) {
          const key = String(fname).trim().toLowerCase();
          if (key && !fieldMap.has(key)) {
            const ins = await db.from("flm_fields").insert({ name: String(fname).trim(), sort: sortBase++ }).select("id,name").single();
            if (ins.data) { fieldMap.set(key, ins.data.id); summary.fields_created++; }
          }
        }

        const { data: allTeams } = await db.from("flm_teams").select("id,name");
        const teamMap = new Map((allTeams ?? []).map((t: { id: string; name: string }) => [t.name.trim().toLowerCase(), t.id]));

        for (const s of (b.slots ?? [])) {
          if (!DAY_KEYS.includes(s.day_key)) continue;
          const fid = fieldMap.get(String(s.field_name ?? "").trim().toLowerCase());
          if (!fid) continue;
          const tkey = String(s.team_name ?? "").trim().toLowerCase();
          const tid = tkey ? (teamMap.get(tkey) ?? null) : null;
          const { error } = await db.from("flm_slots").insert({ season_id: season.id, day_key: s.day_key, field_id: fid, team_id: tid, label: String(s.label ?? s.team_name ?? "").slice(0, 160), claimed_by: "import" });
          if (!error) summary.slots_created++;
        }
      }

      await log("import", `Excel import: +${summary.slots_created} slots (${summary.slots_removed} replaced), +${summary.fields_created} fields, +${summary.teams_created} new / ${summary.teams_updated} updated teams`, "admin");
      return json({ ok: true, summary });
    }

    // ==================== Coaches Hub — admin actions (v13) ====================
    // These run inside the admin section (the outer PIN gate on line ~529
    // already verified the header) and use `b` (the body pre-parsed on line ~572).
    // The coach_* public actions live earlier in the file, above the admin gate.

    if (action === "admin_coaches") {
      const { data } = await db.from("flm_coaches").select("id,name,email,phone,team_id,active,email_confirmed_at,invite_expires_at,created_at,updated_at").order("name");
      return json({ ok: true, coaches: data || [] });
    }
    if (action === "admin_coach") {
      const op = String(b.op ?? "upsert");
      const league = await leagueName();
      if (op === "delete") {
        const id = String(b.id ?? "");
        if (!id) return json({ ok: false, error: "id required" }, 400);
        // flm_requests holds a RESTRICT FK to flm_coaches on purpose (audit
        // trail must not disappear). Prefer soft-delete via active=false.
        const { count } = await db.from("flm_requests").select("id", { count: "exact", head: true }).eq("submitted_by_coach_id", id);
        if ((count ?? 0) > 0) return json({ ok: false, error: "this coach has requests on file — set them to inactive instead" }, 409);
        await db.from("flm_coaches").delete().eq("id", id);
        await log("admin_coach", `deleted coach ${id}`, "admin");
        return json({ ok: true });
      }
      if (op === "resend_invite" || op === "reset_pin") {
        const id = String(b.id ?? "");
        if (!id) return json({ ok: false, error: "id required" }, 400);
        const token = randomInviteToken();
        const expires = inviteExpiry();
        const patch: Record<string, unknown> = { invite_token: token, invite_expires_at: expires };
        if (op === "reset_pin") { patch.pin = null; patch.email_confirmed_at = null; }
        const { data: updated, error } = await db.from("flm_coaches").update(patch).eq("id", id).select("*").single();
        if (error || !updated) return json({ ok: false, error: error?.message ?? "update failed" }, 500);
        const send = await resendSend({
          from: "Field Command <noreply@coachpilot.org>",
          to: [updated.email],
          subject: op === "reset_pin" ? `Set a new PIN — ${league} Coaches Hub` : `Set your PIN — ${league} Coaches Hub`,
          html: coachInviteEmailHtml(league, updated.name, inviteUrlFor(token)),
        });
        await log("admin_coach", `${op === "reset_pin" ? "reset PIN for" : "resent invite to"} ${updated.name} (${updated.email})`, "admin");
        return json({ ok: true, coach: updated, email: send });
      }
      // upsert (create or update)
      const id = b.id ? String(b.id) : null;
      const name = String(b.name ?? "").trim().slice(0, 120);
      const email = String(b.email ?? "").trim();
      const phone = b.phone ? String(b.phone).trim().slice(0, 40) : null;
      const team_id = b.team_id ? String(b.team_id) : null;
      const active = b.active === undefined ? true : Boolean(b.active);
      if (!name) return json({ ok: false, error: "name required" }, 400);
      if (!isEmail(email)) return json({ ok: false, error: "valid email required" }, 400);
      if (id) {
        const patch: Record<string, unknown> = { name, email, phone, team_id, active };
        const { data: updated, error } = await db.from("flm_coaches").update(patch).eq("id", id).select("*").single();
        if (error || !updated) return json({ ok: false, error: error?.message ?? "update failed" }, 500);
        await log("admin_coach", `updated coach ${updated.name}`, "admin");
        return json({ ok: true, coach: updated });
      }
      // create + auto-send invite
      const token = randomInviteToken();
      const expires = inviteExpiry();
      const { data: created, error } = await db.from("flm_coaches").insert({
        name, email, phone, team_id, active, invite_token: token, invite_expires_at: expires,
      }).select("*").single();
      if (error || !created) {
        if (String(error?.message ?? "").toLowerCase().includes("flm_coaches_email_lower_uk")) {
          return json({ ok: false, error: "a coach with that email already exists" }, 409);
        }
        return json({ ok: false, error: error?.message ?? "insert failed" }, 500);
      }
      const send = await resendSend({
        from: "Field Command <noreply@coachpilot.org>",
        to: [created.email],
        subject: `Set your PIN — ${league} Coaches Hub`,
        html: coachInviteEmailHtml(league, created.name, inviteUrlFor(token)),
      });
      await log("admin_coach", `added coach ${created.name} (${created.email})`, "admin");
      return json({ ok: true, coach: created, email: send });
    }

    if (action === "admin_coaches_bulk") {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const sendInvites = b.send_invites !== false;
      const league = String(b.league_name ?? "the league");
      const summary = { created: 0, skipped: 0, invited: 0, teams_created: 0, errors: [] as string[] };
      for (const raw of rows) {
        const name = String(raw.name ?? "").trim().slice(0, 120);
        const email = String(raw.email ?? "").trim().toLowerCase().slice(0, 200);
        const teamName = String(raw.team ?? raw.team_name ?? "").trim().slice(0, 120);
        const division = expandDivision(raw.division).slice(0, 60);
        const phone = raw.phone ? String(raw.phone).trim().slice(0, 40) : null;
        if (!name || !isEmail(email)) { summary.skipped++; summary.errors.push(`${name || email || "row"}: name + valid email required`); continue; }
        let team_id: string | null = null;
        if (teamName) {
          // Match on name + division so same team name across divisions stays separate.
          let q = db.from("flm_teams").select("id,division").ilike("name", teamName);
          if (division) q = q.ilike("division", division);
          const { data: matches } = await q;
          const pool = matches ?? [];
          const existing = division
            ? pool.find((r: { division: string }) => (r.division || "").toLowerCase() === division.toLowerCase())
            : (pool.length === 1 ? pool[0] : null);
          if (existing) { team_id = existing.id; }
          else {
            const ins = await db.from("flm_teams").insert({ name: teamName, division: division || "", coach_name: name, coach_email: email, coach_phone: phone }).select("id").single();
            if (ins.data) { team_id = ins.data.id; summary.teams_created++; }
          }
        }
        const token = randomInviteToken();
        const expires = inviteExpiry();
        const { data: created, error } = await db.from("flm_coaches").insert({
          name, email, phone, team_id, active: true, invite_token: token, invite_expires_at: expires,
        }).select("*").single();
        if (error || !created) {
          summary.skipped++;
          const msg = String(error?.message ?? "insert failed");
          summary.errors.push(`${email}: ${msg.includes("flm_coaches_email_lower_uk") ? "already exists" : msg}`);
          continue;
        }
        summary.created++;
        if (sendInvites) {
          const r = await resendSend({
            from: "Field Command <noreply@coachpilot.org>",
            to: [created.email],
            subject: `Set your PIN — ${league} Coaches Hub`,
            html: coachInviteEmailHtml(league, created.name, inviteUrlFor(token)),
          });
          if (r?.id) summary.invited++;
        }
      }
      await log("admin_coach", `bulk imported ${summary.created} coaches (${summary.invited} invited, ${summary.teams_created} teams created, ${summary.skipped} skipped)`, "admin");
      return json({ ok: true, summary });
    }

    if (action === "admin_resend_domains") {
      // PIN-gated Resend domain management for the coachpilot.org cutover.
      // op: "list" | "create" | "verify" | "get"
      const rk = Deno.env.get("RESEND_API_KEY") || "";
      if (!rk) return json({ ok: false, error: "no resend key" }, 500);
      const op = String(b.op ?? "list");
      const hdrs = { "Authorization": `Bearer ${rk}`, "Content-Type": "application/json" };
      let res: Response;
      if (op === "create") {
        res = await fetch("https://api.resend.com/domains", { method: "POST", headers: hdrs, body: JSON.stringify({ name: String(b.name ?? "coachpilot.org") }) });
      } else if (op === "verify") {
        res = await fetch(`https://api.resend.com/domains/${String(b.id ?? "")}/verify`, { method: "POST", headers: hdrs });
      } else if (op === "get") {
        res = await fetch(`https://api.resend.com/domains/${String(b.id ?? "")}`, { headers: hdrs });
      } else {
        res = await fetch("https://api.resend.com/domains", { headers: hdrs });
      }
      const data = await res.json().catch(() => null);
      return json({ ok: res.ok, status: res.status, data });
    }

    if (action === "admin_resend_email_status") {
      // PIN-gated deliverability debugging: what did Resend do with a send?
      const rk = Deno.env.get("RESEND_API_KEY") || "";
      const id = String(b.id ?? "");
      if (!rk || !id) return json({ ok: false, error: "id required" }, 400);
      const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { "Authorization": `Bearer ${rk}` } });
      const data = await res.json().catch(() => null);
      return json({ ok: res.ok, data });
    }

    if (action === "admin_send_email") {
      // PIN-gated generic send for league correspondence (Coach-authored,
      // approved before send). Uses the same Resend sender as everything else.
      const to = String(b.to ?? "").trim();
      const subject = String(b.subject ?? "").trim().slice(0, 200);
      const html = String(b.html ?? "");
      const text = String(b.text ?? "");
      if (!isEmail(to) || !subject || (!html && !text)) return json({ ok: false, error: "to, subject, and body required" }, 400);
      const send = await resendSend({
        from: String(b.from ?? "Daniel Grande <noreply@coachpilot.org>"),
        reply_to: String(b.reply_to ?? "daniel.grande@ymail.com"),
        to: [to],
        subject,
        html: html || `<pre style="font-family:Arial;white-space:pre-wrap;">${escHtml(text)}</pre>`,
      });
      await log("admin_send_email", `email to ${to}: ${subject}`, "admin");
      return json({ ok: send?.ok !== false, id: send?.id ?? null, error: send?.error ?? null });
    }

    // -------- Admin: Board Contacts --------
    if (action === "admin_contacts") {
      const { data } = await db.from("flm_contacts").select("*").order("sort_order").order("name");
      return json({ ok: true, contacts: data || [] });
    }
    if (action === "admin_contact") {
      const op = String(b.op ?? "upsert");
      if (op === "delete") {
        const id = String(b.id ?? "");
        if (!id) return json({ ok: false, error: "id required" }, 400);
        await db.from("flm_contacts").delete().eq("id", id);
        await log("admin_contact", `deleted contact ${id}`, "admin");
        return json({ ok: true });
      }
      const id = b.id ? String(b.id) : null;
      const name = String(b.name ?? "").trim().slice(0, 120);
      const role = String(b.role ?? "").trim().slice(0, 120);
      const email = b.email ? String(b.email).trim() : null;
      const phone = b.phone ? String(b.phone).trim().slice(0, 40) : null;
      const notes = b.notes ? String(b.notes).trim().slice(0, 400) : null;
      const sort_order = Number(b.sort_order ?? 100) || 100;
      const active = b.active === undefined ? true : Boolean(b.active);
      if (!name || !role) return json({ ok: false, error: "name and role required" }, 400);
      if (email && !isEmail(email)) return json({ ok: false, error: "email is not valid" }, 400);
      const rec = { name, role, email, phone, notes, sort_order, active };
      const { data, error } = id
        ? await db.from("flm_contacts").update(rec).eq("id", id).select("*").single()
        : await db.from("flm_contacts").insert(rec).select("*").single();
      if (error || !data) return json({ ok: false, error: error?.message ?? "save failed" }, 500);
      await log("admin_contact", `${id ? "updated" : "added"} contact ${data.name}`, "admin");
      return json({ ok: true, contact: data });
    }

    if (action === "admin_contacts_bulk") {
      const rows = Array.isArray(b.rows) ? b.rows : [];
      const summary = { created: 0, skipped: 0, errors: [] as string[] };
      let sort = Number(b.sort_start ?? 100) || 100;
      for (const raw of rows) {
        const name = String(raw.name ?? "").trim().slice(0, 120);
        const role = String(raw.role ?? "").trim().slice(0, 120);
        const email = raw.email ? String(raw.email).trim().slice(0, 200) : null;
        const phone = raw.phone ? String(raw.phone).trim().slice(0, 40) : null;
        const notes = raw.notes ? String(raw.notes).trim().slice(0, 400) : null;
        if (!name || !role) { summary.skipped++; summary.errors.push(`${name || "row"}: name + role required`); continue; }
        if (email && !isEmail(email)) { summary.skipped++; summary.errors.push(`${name}: email is not valid`); continue; }
        const rec = { name, role, email, phone, notes, sort_order: sort, active: true };
        const { error } = await db.from("flm_contacts").insert(rec);
        if (error) { summary.skipped++; summary.errors.push(`${name}: ${error.message}`); continue; }
        summary.created++;
        sort += 10;
      }
      await log("admin_contact", `bulk imported ${summary.created} contacts (${summary.skipped} skipped)`, "admin");
      return json({ ok: true, summary });
    }

    // -------- Admin: Requests inbox --------
    // -------- Admin: Coach Messages (metadata only in the list; pull one body on demand) --------
    if (action === "admin_messages") {
      // Metadata only — never the body. Bodies are private in normal operation;
      // admin pulls one at a time via admin_message_body when a dispute needs
      // the record, and that pull is logged.
      let q = db.from("flm_messages").select("id,from_coach_id,to_coach_id,from_name,to_name,subject,read_at,created_at,resend_id").order("created_at", { ascending: false }).limit(300);
      if (b.from_coach_id) q = q.eq("from_coach_id", String(b.from_coach_id));
      if (b.to_coach_id) q = q.eq("to_coach_id", String(b.to_coach_id));
      const { data } = await q;
      return json({ ok: true, messages: data || [] });
    }
    if (action === "admin_message_body") {
      const id = String(b.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const { data: msg } = await db.from("flm_messages").select("*").eq("id", id).maybeSingle();
      if (!msg) return json({ ok: false, error: "not found" }, 404);
      // The pull is logged BOTH ways so coaches can trust the trail: metadata says
      // "an admin looked at this message" without exposing the body in the log itself.
      await log("admin_msg_pull", `Admin pulled message ${id} — ${msg.from_name} → ${msg.to_name}: ${msg.subject}`, "admin");
      return json({ ok: true, message: msg });
    }

    if (action === "admin_requests") {
      const status = b.status ? String(b.status) : null;
      let q = db.from("flm_requests").select("*").order("created_at", { ascending: false }).limit(300);
      if (status && REQUEST_STATUSES.includes(status)) q = q.eq("status", status);
      const { data } = await q;
      return json({ ok: true, requests: data || [] });
    }
    if (action === "admin_request") {
      const id = String(b.id ?? "");
      if (!id) return json({ ok: false, error: "id required" }, 400);
      const patch: Record<string, unknown> = {};
      if (b.status !== undefined) {
        const s = String(b.status);
        if (!REQUEST_STATUSES.includes(s)) return json({ ok: false, error: "bad status" }, 400);
        patch.status = s;
        patch.resolved_at = (s === "resolved" || s === "closed") ? new Date().toISOString() : null;
      }
      if (b.response !== undefined) patch.response = String(b.response ?? "").trim().slice(0, 4000) || null;
      if (b.assigned_contact_id !== undefined) patch.assigned_contact_id = b.assigned_contact_id ? String(b.assigned_contact_id) : null;
      if (!Object.keys(patch).length) return json({ ok: false, error: "nothing to update" }, 400);
      const { data: updated, error } = await db.from("flm_requests").update(patch).eq("id", id).select("*").single();
      if (error || !updated) return json({ ok: false, error: error?.message ?? "update failed" }, 500);
      if (patch.status === "resolved" || patch.status === "closed") {
        const { data: coach } = await db.from("flm_coaches").select("email,name").eq("id", updated.submitted_by_coach_id).maybeSingle();
        if (coach?.email && String(coach.email).includes("@")) {
          const league = await leagueName();
          await resendSend({
            from: "Field Command <noreply@coachpilot.org>",
            to: [coach.email],
            subject: `[${league}] ${updated.status === "resolved" ? "Resolved" : "Closed"}: ${updated.subject}`,
            html: coachRequestResolvedEmailHtml(league, updated),
          }).catch(() => ({ ok: false }));
        }
      }
      await log("admin_request", `request ${id} → ${JSON.stringify(patch).slice(0, 120)}`, "admin");
      return json({ ok: true, request: updated });
    }

    return json({ ok: false, error: "unknown action" }, 404);
  } catch (e) {
    return json({ ok: false, error: String(e).slice(0, 300) }, 500);
  }
});
