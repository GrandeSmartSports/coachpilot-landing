// Registration reminder mail for bls-gateway: the copy, the date switches, the send order and the bulk pacing.
// No Deno or database calls in here, so tests/bls-remind-mail.test.mjs runs it in Node.
// Send order (Coach 11/23): every reminder and sign-up confirmation goes out through the league's own Gmail as
// website@blslittleleague.org. The CoachPilot Resend sender is only a per-message backup when Gmail will not take
// that message. Each message logs the path it used ("[bls-mail] ... path=gmail|resend|none").

export const GW = "https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-gateway";
export const REGISTER_URL = "https://www.blslittleleague.org/Default.aspx?tabid=716844";
export const REG_INFO_URL = "https://www.blslittleleague.org/Default.aspx?tabid=716841";
export const LOGO_URL = "https://go.blslittleleague.org/bls/assets/bls-logo.png";
export const LEAGUE_ADDR = "website@blslittleleague.org";
export const LEAGUE_FROM = `BLS Little League <${LEAGUE_ADDR}>`;
export const OPEN_DAY = "Friday, November 27";

// Date switches, midnight Pacific written in UTC, so nothing has to be deployed on the night.
export const OPEN_AT = Date.parse("2026-11-27T08:00:00Z"); // registration opens
export const EARLY_AT = Date.parse("2026-11-30T08:00:00Z"); // Black Friday sale over, Early Bird starts
export const FULL_AT = Date.parse("2027-01-01T08:00:00Z"); // full price, no sale

// Bulk pacing: 3 messages at a time, at most one batch every 1.3 s (about 2.3 a second, under the Gmail API
// per-user send rate). 130 rows take about 57 s. No new batch starts after 90 s, so one run always ends inside the
// 150 s function limit; rows not reached keep reminder_sent_at empty and go out on the next call.
export const BATCH_SIZE = 3;
export const BATCH_MS = 1300;
export const BUDGET_MS = 90_000;
export const SEND_TIMEOUT_MS = 10_000;

export type Mail = { to: string[]; subject: string; text: string; html: string; headers: Record<string, string> };
export type SendResult = { ok: boolean; id?: string; status?: number };
export type Sender = (m: Mail) => Promise<SendResult>;
export type SendPath = "gmail" | "resend" | "none";

export function saleNow(now: number): string {
  if (now >= FULL_AT) return "";
  if (now >= EARLY_AT) return "Early Bird: $25 off per family through Dec 31.";
  return "Black Friday sale through Sun, Nov 29: $50 off per family.";
}

export const unsubUrl = (token: string) => `${GW}?action=remind_unsub&t=${encodeURIComponent(token)}`;

const F = "-apple-system,Helvetica,Arial,sans-serif";
const link = (href: string, text: string) => `<a href="${href}" style="color:#1452a0">${text}</a>`;
export function blsEmail(title: string, lead: string, ctaText: string, ctaUrl: string, foot: string, below = ""): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#eef2f6"><div style="max-width:560px;margin:0 auto;padding:16px">
<div style="background:#fff;border-radius:14px;border-top:5px solid #cd163f;padding:22px 22px 24px">
  <img src="${LOGO_URL}" width="64" height="64" border="0" alt="BLS Little League" style="display:block;width:64px;height:64px;margin:0 0 10px">
  <div style="font:700 11px/1.3 ${F};letter-spacing:.2em;text-transform:uppercase;color:#cd163f">Bonney Lake Sumner Little League</div>
  <div style="margin-top:6px;font:800 24px/1.15 ${F};color:#00013a">${title}</div>
  <p style="margin:12px 0 0;font:400 16px/1.5 ${F};color:#1f2326">${lead}</p>
  <p style="margin:20px 0 0"><a href="${ctaUrl}" style="display:inline-block;background:#cd163f;color:#fff;text-decoration:none;font:700 16px/1 ${F};padding:14px 22px;border-radius:999px">${ctaText}</a></p>
  ${below ? `<p style="margin:14px 0 0;font:600 15px/1.4 ${F}">${below}</p>` : ""}
  <p style="margin:22px 0 0;font:400 13px/1.5 ${F};color:#6b7279">${foot}</p>
</div></div></body></html>`;
}

// Sign-up confirmation. Before registration opens: the registration day wording. From OPEN_AT: the family is on
// the list for future BLS league reminders (the list is reused, so nothing here says it is a single email).
export function confirmMsg(to: string, token: string, now = Date.now()): Mail {
  const u = unsubUrl(token);
  const headers = { "List-Unsubscribe": `<${u}>` };
  const foot = `Didn't sign up for this? Ignore it, or ${link(u, "remove your email")}.`;
  if (now < OPEN_AT) {
    return {
      to: [to], subject: "You're on the list for BLS registration day", headers,
      text: `Spring 2027 registration opens ${OPEN_DAY}. We'll email you that morning.\n\nBlack Friday sale Nov 27 to 29: $50 off per family. Early Bird Nov 30 to Dec 31: $25 off per family.\n\nRegistration info: ${REG_INFO_URL}\n\nDidn't sign up for this? Ignore it, or remove your email here: ${u}`,
      html: blsEmail("You're on the list", `Spring 2027 registration opens <b>${OPEN_DAY}</b>. We'll email you that morning.<br><br>Black Friday sale Nov 27 to 29: $50 off per family. Early Bird Nov 30 to Dec 31: $25 off per family.`,
        "Registration info", REG_INFO_URL, foot),
    };
  }
  const sale = saleNow(now);
  return {
    to: [to], subject: "You're on the list for BLS league reminders", headers,
    text: `You're on the list for future BLS league reminders.\n\nSpring 2027 registration is open now.${sale ? "\n" + sale : ""}\n\nRegister now: ${REGISTER_URL}\nRegistration info: ${REG_INFO_URL}\n\nDidn't sign up for this? Ignore it, or remove your email here: ${u}`,
    html: blsEmail("You're on the list", `You're on the list for future BLS league reminders.<br><br>Spring 2027 registration is open now.${sale ? `<br><b>${sale}</b>` : ""}`,
      "Register now", REGISTER_URL, foot, link(REG_INFO_URL, "Registration info")),
  };
}

// The Nov 27 email (pg_cron job bls-reg-reminder-2026 calls remind_send at 7:00 AM Pacific).
export function reminderMsg(to: string, token: string): Mail {
  const u = unsubUrl(token);
  return {
    to: [to], subject: "BLS registration is open today", headers: { "List-Unsubscribe": `<${u}>` },
    text: `Spring 2027 registration is open now.\n\nBlack Friday sale through Sun, Nov 29: $50 off per family.\nThen Early Bird: $25 off per family Nov 30 to Dec 31.\n\nRegister now: ${REGISTER_URL}\nRegistration info: ${REG_INFO_URL}\n\nYou asked for this reminder. Remove your email: ${u}`,
    html: blsEmail("Registration is open", `Spring 2027 registration is open now.<br><br><b>Black Friday sale through Sun, Nov 29: $50 off per family.</b><br>Then Early Bird: $25 off per family Nov 30 to Dec 31.`,
      "Register now", REGISTER_URL, `You asked for this reminder. ${link(u, "Remove your email")}`, link(REG_INFO_URL, "Registration info")),
  };
}

const wait = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));
const retryable = (s?: number) => s === 429 || (typeof s === "number" && s >= 500);
async function tryTwice(send: Sender, m: Mail, sleep: (ms: number) => Promise<void>): Promise<SendResult> {
  const first = await send(m).catch((): SendResult => ({ ok: false }));
  if (first.ok || !retryable(first.status)) return first;
  await sleep(1000); // rate limit or server hiccup: one more try on the same path
  return await send(m).catch((): SendResult => ({ ok: false }));
}

// League Gmail first; Resend only for this one message if Gmail did not take it. Logs the path, never the address.
export async function sendLeagueFirst(m: Mail, gmail: Sender, resend: Sender,
  opts: { tag?: string; log?: (line: string) => void; sleep?: (ms: number) => Promise<void> } = {}): Promise<SendResult & { path: SendPath }> {
  const log = opts.log || ((line: string) => console.log(line)), sleep = opts.sleep || wait, tag = opts.tag ? ` ${opts.tag}` : "";
  const g = await tryTwice(gmail, m, sleep);
  if (g.ok) { log(`[bls-mail]${tag} path=gmail`); return { ...g, path: "gmail" }; }
  const r = await tryTwice(resend, m, sleep);
  const path: SendPath = r.ok ? "resend" : "none";
  log(`[bls-mail]${tag} path=${path} gmail_status=${g.status ?? "no-token"}${r.ok ? "" : ` resend_status=${r.status ?? "no-key"}`}`);
  return { ...r, path };
}

// Bulk send in small parallel batches. markSent runs once per batch with the rows that went out.
export async function sendInBatches<T>(rows: T[], sendOne: (row: T) => Promise<boolean>, markSent: (sent: T[]) => Promise<void>,
  o: { size?: number; minBatchMs?: number; budgetMs?: number; now?: () => number; sleep?: (ms: number) => Promise<void> } = {}) {
  const size = o.size ?? BATCH_SIZE, minMs = o.minBatchMs ?? BATCH_MS, budget = o.budgetMs ?? BUDGET_MS;
  const now = o.now || (() => Date.now()), sleep = o.sleep || wait;
  const start = now();
  let sent = 0, failed = 0, i = 0;
  while (i < rows.length && now() - start < budget) {
    const t0 = now();
    const batch = rows.slice(i, i + size);
    i += batch.length;
    const res = await Promise.all(batch.map((r) => sendOne(r).catch(() => false)));
    const went = batch.filter((_, k) => res[k]);
    sent += went.length; failed += batch.length - went.length;
    if (went.length) await markSent(went).catch(() => {});
    const left = minMs - (now() - t0);
    if (i < rows.length && left > 0) await sleep(left);
  }
  return { sent, failed, not_tried: rows.length - i, ms: now() - start };
}
