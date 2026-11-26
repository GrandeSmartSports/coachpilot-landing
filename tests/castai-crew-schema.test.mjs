// The crew tables are reached only through the castai-crew edge function with
// the service role, the same shape as the BLS board: RLS on, no policies, no
// grants to anon or authenticated. A policy here would hand a member's row to
// anyone holding the publishable key.
// Run: node tests/castai-crew-schema.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 200)); }
};
const read = (rel) => {
  const file = resolve(ROOT, rel);
  ok(existsSync(file), `${rel} exists`);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};
// Built from numbers so this file holds no long dash of its own.
const longDash = new RegExp("[" + String.fromCharCode(0x2014, 0x2013) + "]");
// The statements only, so a word in a comment can never pass or fail a check.
const code = (sql) => sql.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
// Every table a migration creates must be locked the same way.
const locked = (sql, t) => {
  ok(new RegExp("create table if not exists public\\." + t + " \\(", "i").test(sql), `${t} is created, idempotently`);
  ok(new RegExp("alter table public\\." + t + " enable row level security", "i").test(sql), `${t} has row level security on`);
  ok(new RegExp("revoke all on public\\." + t + " from anon", "i").test(sql), `${t} is closed to anon`);
  ok(new RegExp("revoke all on public\\." + t + " from authenticated", "i").test(sql), `${t} is closed to a signed-in browser`);
};
// The body of one create table statement.
const table = (sql, t) => {
  const m = sql.match(new RegExp("create table if not exists public\\." + t + " \\(([\\s\\S]*?)\\n\\);", "i"));
  return m ? m[1] : "";
};
const created = (sql) => [...sql.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1]);

// ---- piece 1: crews and members --------------------------------------------
const one = code(read("supabase/migrations/20261125_0900_castai_crew.sql"));
for (const t of ["castai_crew", "castai_crew_members"]) locked(one, t);
ok(!/create policy/i.test(one), "no policies: the edge function is the only way in");
ok(/primary key \(crew_id, user_id\)/i.test(one), "one person cannot be on the same crew twice");
ok(/references auth\.users ?\(id\) on delete cascade/i.test(one), "a deleted account takes its membership with it");
ok(/role text not null .*check \(role in \('owner', ?'member'\)\)/is.test(one), "role is owner or member, nothing else");
ok(/references public\.castai_crew ?\(id\) on delete cascade/i.test(one), "a deleted crew takes its members with it");

// ---- pieces 2 to 4: links, trips, going, notes, lists, catches -------------
const twoRaw = read("supabase/migrations/20261126_0900_castai_crew_trips.sql");
const two = code(twoRaw);
const TABLES = ["castai_crew_settings", "castai_crew_invites", "castai_crew_trips", "castai_crew_trip_going",
  "castai_crew_comments", "castai_crew_list_items", "castai_crew_catches"];
for (const t of TABLES) locked(two, t);
ok(JSON.stringify(created(two).sort()) === JSON.stringify([...TABLES].sort()), "the migration creates exactly the seven tables in the plan", created(two).join(","));
ok(created(two).every((t) => /^castai_crew_/.test(t)), "every table carries the castai_crew_ prefix");
ok(!/create policy/i.test(two), "no policies here either");
ok(!/grant [^;]* to (anon|authenticated|public)\b/i.test(two), "nothing is granted to a browser");
ok(!/\bdrop table\b|\btruncate\b|\bdelete from\b|\bdrop column\b/i.test(two), "additive: nothing is dropped, emptied or deleted");
const altered = [...two.matchAll(/alter table (?:if exists )?(?:only )?([\w.]+)/gi)].map((m) => m[1]);
ok(altered.length > 0 && altered.every((t) => /^public\.castai_crew_/.test(t)), "it alters only its own tables", altered.filter((t) => !/^public\.castai_crew_/.test(t)).join(","));
ok(twoRaw.length > 0 && !longDash.test(twoRaw), "no long dashes in the file, comments included");

// settings: the sms switch starts off, and running the file again never flips it back
const settings = table(two, "castai_crew_settings");
ok(/key text primary key/i.test(settings) && /value text not null/i.test(settings), "settings are a key and a value");
ok(/insert into public\.castai_crew_settings \(key, value\)\s+values \('sms', 'off'\)\s+on conflict \(key\) do nothing/i.test(two),
  "sms starts off, and a second run does not overwrite what is there");
ok(!/on conflict[^;]*do update/i.test(two), "no seed ever overwrites a value");

// invites: the token is never stored, only its hash
const invites = table(two, "castai_crew_invites");
ok(/token_hash text primary key/i.test(invites), "an invite is keyed by the hash of its token");
ok(!/\btoken text\b/i.test(invites), "the token itself has no column");
ok(/crew_id uuid not null references public\.castai_crew ?\(id\) on delete cascade/i.test(invites), "a deleted crew takes its links with it");
ok(/user_id uuid not null references auth\.users ?\(id\) on delete cascade/i.test(invites), "a deleted account takes its links with it");
ok(/created_by uuid null references auth\.users ?\(id\) on delete set null/i.test(invites), "a link outlives the person who made it");
ok(/expires_at timestamptz not null/i.test(invites) && /last_used_at timestamptz null/i.test(invites), "a link has an end date and a last-used time");
ok(/revoked boolean not null default false/i.test(invites), "a link can be revoked");

// trips
const trips = table(two, "castai_crew_trips");
ok(/id uuid primary key default gen_random_uuid\(\)/i.test(trips), "a trip has its own id");
ok(/crew_id uuid not null references public\.castai_crew ?\(id\) on delete cascade/i.test(trips), "a deleted crew takes its trips with it");
ok(/created_by uuid null references auth\.users ?\(id\) on delete set null/i.test(trips), "a trip outlives the account that made it");
for (const col of ["plan_id text not null", "spot_id text not null", "species text not null", "title text not null", "trip_date date not null",
  "from_hour numeric null", "to_hour numeric null", "note text null"]) {
  ok(new RegExp(col, "i").test(trips), `trips has ${col}`);
}
ok(/status text not null default 'idea' check \(status in \('idea', ?'planned', ?'done'\)\)/i.test(trips), "a trip is an idea, planned or done, and starts as an idea");
ok(/created_at timestamptz not null default now\(\)/i.test(trips) && /updated_at timestamptz not null default now\(\)/i.test(trips), "a trip knows when it was made and last changed");
ok(/from_hour is null or from_hour between 0 and 24/i.test(two) && /to_hour is null or to_hour between 0 and 24/i.test(two), "hours stay between 0 and 24");
ok(/from_hour is null or to_hour is null or to_hour > from_hour/i.test(two), "the end of a window comes after its start");
ok(/length\(note\) <= 280/i.test(two), "a trip note stops at 280");

// going
const going = table(two, "castai_crew_trip_going");
ok(/trip_id uuid not null references public\.castai_crew_trips ?\(id\) on delete cascade/i.test(going), "a deleted trip takes its answers with it");
ok(/user_id uuid not null references auth\.users ?\(id\) on delete cascade/i.test(going), "a deleted account takes its answers with it");
ok(/answer text not null check \(answer in \('going', ?'maybe', ?'out'\)\)/i.test(going), "the answer is going, maybe or out");
ok(/primary key \(trip_id, user_id\)/i.test(going), "one answer per person per trip");

// comments, list items, catches: all hang off a trip, all safe to send twice
const comments = table(two, "castai_crew_comments");
ok(/trip_id uuid not null references public\.castai_crew_trips ?\(id\) on delete cascade/i.test(comments), "a deleted trip takes its notes with it");
ok(/user_id uuid null references auth\.users ?\(id\) on delete set null/i.test(comments), "a note outlives the account that wrote it");
ok(/section text null check \(section in \('plan', ?'what', ?'gear', ?'bait', ?'how', ?'wx', ?'river', ?'spot', ?'expect', ?'rules'\)\)/i.test(comments),
  "a note pins to one of the ten run card sections, or to none");
ok(/body text not null/i.test(comments) && /length\(btrim\(body\)\) between 1 and 1000/i.test(two), "a note is 1 to 1000 characters");
ok(/hidden boolean not null default false/i.test(comments), "a deleted note is hidden, not destroyed");

const items = table(two, "castai_crew_list_items");
ok(/trip_id uuid not null references public\.castai_crew_trips ?\(id\) on delete cascade/i.test(items), "a deleted trip takes its list with it");
ok(/label text not null/i.test(items) && /length\(btrim\(label\)\) between 1 and 120/i.test(two), "a list line is 1 to 120 characters");
ok(/assigned_to uuid null references auth\.users ?\(id\) on delete set null/i.test(items), "a list line outlives whoever had it");
ok(/done boolean not null default false/i.test(items) && /sort integer not null default 0/i.test(items), "a list line can be ticked and ordered");
ok(/created_by uuid null references auth\.users ?\(id\) on delete set null/i.test(items), "a list line outlives whoever added it");

const catches = table(two, "castai_crew_catches");
ok(/trip_id uuid not null references public\.castai_crew_trips ?\(id\) on delete cascade/i.test(catches), "a deleted trip takes its catches with it");
ok(/user_id uuid null references auth\.users ?\(id\) on delete set null/i.test(catches), "a catch outlives the account that logged it");
ok(/species text not null/i.test(catches) && /length\(btrim\(species\)\) between 1 and 40/i.test(two), "the fish is 1 to 40 characters");
ok(/length_in numeric null/i.test(catches) && /weight_lb numeric null/i.test(catches) && /lure text null/i.test(catches) && /notes text null/i.test(catches), "length, weight, lure and notes are optional");
ok(!/catch_logs/i.test(two), "CastAI's own catch_logs is left alone");

for (const t of ["castai_crew_comments", "castai_crew_list_items", "castai_crew_catches"]) {
  ok(/client_id uuid null/i.test(table(two, t)), `${t} carries the sender's own id for a write`);
  ok(new RegExp("create unique index if not exists \\w+ on public\\." + t + " \\(trip_id, client_id\\)\\s+where client_id is not null", "i").test(two),
    `${t}: the same write sent twice lands once`);
}
ok(/create unique index if not exists \w+ on public\.castai_crew_trips \(crew_id, client_id\)\s+where client_id is not null/i.test(two), "a trip sent twice lands once");

// finding an account by phone: a function only the service role may call
ok(/create or replace function public\.castai_crew_user_by_phone\(\w+ text\)\s+returns uuid/i.test(two), "an account is found by phone with one exact lookup");
ok(/security definer/i.test(two) && /set search_path = ''/i.test(two), "it runs with a pinned search path");
for (const who of ["public", "anon", "authenticated"]) {
  ok(new RegExp("revoke all on function public\\.castai_crew_user_by_phone\\(text\\) from " + who, "i").test(two), `the lookup is closed to ${who}`);
}
ok(/grant execute on function public\.castai_crew_user_by_phone\(text\) to service_role/i.test(two), "only the service role may run it");
const fns = [...two.matchAll(/create (?:or replace )?function public\.(\w+)/gi)].map((m) => m[1]);
ok(fns.every((f) => /^castai_crew_/.test(f)), "every function carries the prefix too", fns.join(","));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
