// cp-auth-email v1. Supabase Auth "Send Email" hook. Receives { user, email_data } signed with the
// Standard Webhooks scheme (webhook-id, webhook-timestamp, webhook-signature; secret in AUTH_EMAIL_HOOK_SECRET
// as the raw base64 part after "v1,whsec_"). Sends the email with Resend from noreply@coachpilot.org.
// Header x-cp-dry-run: 1 renders without sending (for tests). Deployed with --no-verify-jwt (Auth calls it directly).
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const SECRET_B64 = (Deno.env.get("AUTH_EMAIL_HOOK_SECRET") || "").replace(/^v1,whsec_/, "");
const FROM = "CoachPilot <noreply@coachpilot.org>";

function b64ToBytes(b64: string): Uint8Array { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function verify(req: Request, raw: string): Promise<boolean> {
  const id = req.headers.get("webhook-id") || ""; const ts = req.headers.get("webhook-timestamp") || ""; const sigs = req.headers.get("webhook-signature") || "";
  if (!id || !ts || !sigs || !SECRET_B64) return false;
  const numTs = Number(ts);
  if (!Number.isFinite(numTs)) return false;
  if (Math.abs(Date.now() / 1000 - numTs) > 300) return false;
  const key = await crypto.subtle.importKey("raw", b64ToBytes(SECRET_B64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expectedBytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${raw}`)));
  return sigs.split(" ").some(s => {
    const part = s.split(",")[1];
    if (!part) return false;
    let candidateBytes: Uint8Array;
    try { candidateBytes = b64ToBytes(part); } catch { return false; }
    return timingSafeEqual(candidateBytes, expectedBytes);
  });
}
function render(type: string, token: string, link: string): { subject: string; html: string } {
  const code = `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;margin:12px 0">${token}</p>`;
  const wrap = (inner: string) => `<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;color:#222;max-width:520px">${inner}<p style="color:#666;font-size:13px">If you did not request this, ignore this email.</p></div>`;
  if (type === "magiclink" || type === "login" || type === "email") return { subject: "Your CoachPilot sign-in code", html: wrap(`<p>Your CoachPilot sign-in code is:</p>${code}<p>It expires in 10 minutes.</p>`) };
  if (type === "recovery") return { subject: "Your CoachPilot sign-in code", html: wrap(`<p>Use this code to get back into CoachPilot:</p>${code}`) };
  if (type === "email_change") return { subject: "Confirm your new CoachPilot email", html: wrap(`<p>Your confirmation code:</p>${code}`) };
  return { subject: "CoachPilot", html: wrap(`<p>Your code:</p>${code}${link ? `<p><a href="${link}">Continue</a></p>` : ""}`) };
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const raw = await req.text();
  if (!(await verify(req, raw))) return new Response(JSON.stringify({ error: "bad signature" }), { status: 401, headers: { "content-type": "application/json" } });
  let payload: any; try { payload = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
  const email = payload?.user?.email || ""; const d = payload?.email_data || {};
  const { subject, html } = render(String(d.email_action_type || ""), String(d.token || ""), String(d.confirmation_url || ""));
  if (req.headers.get("x-cp-dry-run") === "1") return new Response(JSON.stringify({ dry_run: true, to: email, subject, html }), { status: 200, headers: { "content-type": "application/json" } });
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "content-type": "application/json", Authorization: `Bearer ${RESEND_KEY}` }, body: JSON.stringify({ from: FROM, to: email, subject, html }) });
  if (!r.ok) return new Response(JSON.stringify({ error: { http_code: r.status, message: "email send failed" } }), { status: 500, headers: { "content-type": "application/json" } });
  return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
});
