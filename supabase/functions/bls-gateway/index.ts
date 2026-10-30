// bls-gateway: BLS Little League board tools. Website review form: no sign-in, reviewer types a name and clicks Send.
// Table: bls_review_responses (CoachPilot project, bls_ prefix). Admin report behind the league PIN.
import { createClient } from "jsr:@supabase/supabase-js@2";

const ADMIN_PIN = "2575";
const REVIEWS: Record<string, { title: string; items: number }> = { "website-updates-2026": { title: "BLS Website Updates", items: 16 } };
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

async function emailCoach(review: string, name: string, data: any) {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) return;
  const meta = REVIEWS[review];
  const lines: string[] = [`${name} sent a review of ${meta.title}.`, ""];
  const approved = Object.values(data.items).filter((x: any) => x.d === "approve").length;
  const discuss = Object.values(data.items).filter((x: any) => x.d === "discuss").length;
  lines.push(`${approved} approved, ${discuss} need discussion, ${meta.items - approved - discuss} not marked.`, "");
  for (let i = 1; i <= meta.items; i++) {
    const it = data.items[String(i)]; if (!it) continue;
    const label = it.d === "approve" ? "Approved" : it.d === "discuss" ? "Needs discussion" : "No decision";
    lines.push(`Item ${i}: ${label}${it.note ? ". " + it.note : ""}`);
  }
  const acc = Object.entries(data.accounts || {});
  if (acc.length) lines.push("", "BLS accounts: " + acc.map(([a, u]) => `${a} ${u}`).join(", "));
  if (data.general) lines.push("", "General notes: " + data.general);
  lines.push("", "Admin view: https://coachpilot.org/bls/website-updates/?admin");
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "BLS Board Tools <noreply@coachpilot.org>", to: [NOTIFY_TO], subject: `BLS website review from ${name}`, text: lines.join("\n") }),
  }).catch(() => {});
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
      await emailCoach(review, name, data);
      return json({ ok: true });
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
