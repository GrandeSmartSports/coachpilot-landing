// bls-gateway: BLS Little League board tools. Website review form: no sign-in, reviewer types a name and clicks Send.
// Table: bls_review_responses (CoachPilot project, bls_ prefix). Admin report behind the league PIN.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_PIN = "2575";
const REVIEWS: Record<string, { title: string; items: number; url: string; names: string[] }> = {
  "website-updates-2026": {
    title: "BLS Website Updates", items: 16, url: "https://coachpilot.org/bls/website-updates",
    names: ["Home page news", "Calendar", "Fan Store slide", "Sudden Cardiac Arrest menu", "Safety Plan menu link", "Sponsor logo links", "Social media icons", "Fall Ball page",
      "Between-season pages", "Cleared volunteer list", "Coaches Corner", "Health & Safety heading", "All-Stars page", "Forms", "Corporate Match page", "FAQ question"],
  },
};
const ACCT_KEYS = ["instagram", "youtube", "twitter", "flickr"];
const DECISIONS = ["", "approve", "discuss"];
const NOTIFY_TO = "Daniel.Grande@ymail.com";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-admin-pin",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
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
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return false;
  const meta = REVIEWS[review];
  const vals = Object.values(data.items) as any[];
  const approved = vals.filter((x) => x.d === "approve").length;
  const discuss = vals.filter((x) => x.d === "discuss").length;
  const unmarked = meta.items - approved - discuss;
  const summary = `${approved} approved, ${discuss} to discuss, ${unmarked} not marked`;
  const text: string[] = [`${name} reviewed ${meta.title}.`, summary, ""];
  const rows: string[] = [];
  const tag = (d: string) => d === "approve"
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#1f7a3f;color:#fff;font:700 12px/1.2 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.04em">APPROVED</span>`
    : d === "discuss"
    ? `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#b4590f;color:#fff;font:700 12px/1.2 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.04em">DISCUSS</span>`
    : `<span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#e2e5e8;color:#555;font:700 12px/1.2 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.04em">NOT MARKED</span>`;
  for (let i = 1; i <= meta.items; i++) {
    const it = data.items[String(i)] || { d: "", note: "" };
    const label = it.d === "approve" ? "Approved" : it.d === "discuss" ? "Discuss" : "Not marked";
    text.push(`${i}. ${meta.names[i - 1]}: ${label}${it.note ? ". " + it.note : ""}`);
    rows.push(`<tr><td style="padding:12px 0;border-top:1px solid #e2e5e8;vertical-align:top;width:28px;font:700 16px/1.3 -apple-system,Helvetica,Arial,sans-serif;color:#1f7a3f">${i}</td>
      <td style="padding:12px 0;border-top:1px solid #e2e5e8;vertical-align:top;font:600 16px/1.3 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${esc(meta.names[i - 1])}
      ${it.note ? `<div style="margin-top:4px;font:400 15px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#555">${esc(it.note)}</div>` : ""}</td>
      <td style="padding:12px 0 12px 8px;border-top:1px solid #e2e5e8;vertical-align:top;text-align:right;white-space:nowrap">${tag(it.d)}</td></tr>`);
  }
  const acc = Object.entries(data.accounts || {}) as [string, string][];
  const extra: string[] = [];
  if (acc.length) { text.push("", "BLS accounts: " + acc.map(([a, u]) => `${a} ${u}`).join(", ")); extra.push(`<p style="margin:18px 0 0;font:600 13px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7279">BLS accounts</p>` + acc.map(([a, u]) => `<p style="margin:6px 0 0;font:400 15px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${esc(a)}: ${esc(u)}</p>`).join("")); }
  if (data.general) { text.push("", "General notes: " + data.general); extra.push(`<p style="margin:18px 0 0;font:600 13px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#6b7279">General notes</p><p style="margin:6px 0 0;font:400 15px/1.45 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${esc(data.general)}</p>`); }
  text.push("", `Sent from ${meta.url}`);
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f2f3f4"><div style="max-width:600px;margin:0 auto;padding:16px">
<div style="background:#14263d;border-radius:14px 14px 0 0;padding:20px 22px">
  <div style="font:700 11px/1.3 -apple-system,Helvetica,Arial,sans-serif;letter-spacing:.25em;text-transform:uppercase;color:#9fd3b1">Bonney Lake Sumner Little League</div>
  <div style="margin-top:6px;font:800 26px/1.1 -apple-system,Helvetica,Arial,sans-serif;color:#fff">${esc(meta.title)}</div>
  <div style="margin-top:8px;font:400 15px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#c9d1dc">Review from <strong style="color:#fff">${esc(name)}</strong></div>
</div>
<div style="background:#fff;border-radius:0 0 14px 14px;padding:18px 22px 22px">
  <p style="margin:0 0 6px;font:600 16px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#1f2326">${summary}</p>
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${rows.join("")}</table>
  ${extra.join("")}
  <p style="margin:22px 0 0;font:400 13px/1.4 -apple-system,Helvetica,Arial,sans-serif;color:#6b7279">Sent from <a href="${meta.url}" style="color:#1f7a3f">${meta.url.replace("https://", "")}</a></p>
</div></div></body></html>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "BLS Board Tools <noreply@coachpilot.org>", to: [NOTIFY_TO], subject: `BLS website review from ${name}: ${summary}`, text: text.join("\n"), html }),
  }).catch(() => null);
  return !!(res && res.ok);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  try {
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
      if (pin !== ADMIN_PIN) return json({ error: "Wrong PIN" }, 401);
      const review = url.searchParams.get("review") || "website-updates-2026";
      const { data: rows } = await db.from("bls_review_responses").select("reviewer_name, data, updated_at").eq("review", review).order("updated_at", { ascending: false });
      return json({ review, responses: (rows || []).map((r) => ({ name: r.reviewer_name, data: r.data, updated_at: r.updated_at })) });
    }
    return json({ error: "Unknown action" }, 400);
  } catch (_e) {
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
