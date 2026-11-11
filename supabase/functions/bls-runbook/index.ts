// bls-runbook: working copy of the BLS Softball Run Book. No sign-in: the working link carries a key, people type a name.
// Tables bls_runbook_docs (append-only saves, newest row per division is current) and bls_runbook_notes. CoachPilot project, bls_ prefix.
// The key lives in the database (bls_board_settings.runbook_key), never in this public repo.
import { createClient } from "jsr:@supabase/supabase-js@2";

const BOOKS: Record<string, string[]> = { softball: ["minor-b", "aa", "minor-a", "majors", "juniors"] };
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-runbook-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");
const cleanName = (v: unknown) => clip(v, 60).replace(/[<>]/g, "").replace(/\s+/g, " ").trim();

let keyCache = { v: "", at: 0 };
async function bookKey(): Promise<string> {
  if (keyCache.v && Date.now() - keyCache.at < 30000) return keyCache.v;
  const { data } = await db.from("bls_board_settings").select("value").eq("key", "runbook_key").maybeSingle();
  keyCache = { v: String(data?.value ?? ""), at: Date.now() };
  return keyCache.v;
}
function same(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const misses = new Map<string, { n: number; at: number }>();
const BAD_HTML = /<\s*\/?\s*(script|iframe|object|embed|link|meta|style|img|svg|math|form|input|button|textarea|select|a|base|video|audio|source)\b|\son[a-z]+\s*=|javascript:|data:text|url\s*\(|expression\s*\(|@import/i;

async function state(book: string) {
  const docs: Record<string, unknown> = {};
  for (const d of BOOKS[book]) {
    const { data } = await db.from("bls_runbook_docs").select("id, html, by_name, created_at").eq("book", book).eq("division", d).order("id", { ascending: false }).limit(1);
    if (data?.[0]) docs[d] = { version: data[0].id, html: data[0].html, by: data[0].by_name, at: data[0].created_at };
  }
  const { data: notes } = await db.from("bls_runbook_notes").select("id, division, section, body, by_name, created_at, done_by, done_at").eq("book", book).order("created_at", { ascending: true }).limit(1000);
  return { ok: true, docs, notes: notes || [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const book = url.searchParams.get("book") || "softball";
  try {
    if (!BOOKS[book]) return json({ error: "Unknown book." }, 400);
    const ip = req.headers.get("cf-connecting-ip") || "x";
    const m = misses.get(ip);
    if (m && m.n >= 10 && Date.now() - m.at < 15 * 60000) return json({ error: "Too many tries. Wait 15 minutes." }, 429);
    const sent = req.headers.get("x-runbook-key") || "";
    if (!same(sent, await bookKey())) {
      misses.set(ip, { n: (m && Date.now() - m.at < 15 * 60000 ? m.n : 0) + 1, at: Date.now() });
      return json({ error: "This working link is not valid." }, 401);
    }
    if (action === "state" && req.method === "GET") return json(await state(book));
    if (req.method !== "POST") return json({ error: "Not found." }, 404);
    if (Number(req.headers.get("content-length") || 0) > 300000) return json({ error: "Too large." }, 413);
    const b = await req.json().catch(() => ({}));
    const name = cleanName(b.name);
    if (!name) return json({ error: "Add your name first." }, 400);
    const division = String(b.division || "");
    if (!BOOKS[book].includes(division)) return json({ error: "Unknown division." }, 400);

    if (action === "save") {
      const html = typeof b.html === "string" ? b.html : "";
      if (html.length < 200 || html.length > 200000) return json({ error: "That page could not be saved." }, 400);
      if (BAD_HTML.test(html)) return json({ error: "That page has something that can't be saved. Remove pasted links or images and try again." }, 400);
      const { data: cur } = await db.from("bls_runbook_docs").select("id, by_name").eq("book", book).eq("division", division).order("id", { ascending: false }).limit(1);
      const live = cur?.[0]?.id ?? null;
      const base = b.base_version == null ? null : Number(b.base_version);
      if (live !== base) return json({ error: "conflict", by: cur?.[0]?.by_name || "Someone" }, 409);
      const { data, error } = await db.from("bls_runbook_docs").insert({ book, division, html, by_name: name }).select("id, created_at").single();
      if (error) throw error;
      return json({ ok: true, version: data.id, at: data.created_at, by: name });
    }
    if (action === "note") {
      const body = clip(b.body, 2000).trim();
      if (!body) return json({ error: "Write the note first." }, 400);
      const { error } = await db.from("bls_runbook_notes").insert({ book, division, section: clip(b.section, 120).trim(), body, by_name: name });
      if (error) throw error;
      return json(await state(book));
    }
    if (action === "note_done") {
      const done = b.done !== false;
      const { error } = await db.from("bls_runbook_notes").update({ done_by: done ? name : null, done_at: done ? new Date().toISOString() : null }).eq("id", String(b.id || "")).eq("book", book);
      if (error) throw error;
      return json(await state(book));
    }
    return json({ error: "Not found." }, 404);
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
