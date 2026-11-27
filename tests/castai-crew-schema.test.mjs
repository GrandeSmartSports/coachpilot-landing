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

// ---- contract v2: alerts, and catches as CastAI catches --------------------
const threeRaw = read("supabase/migrations/20261126_1500_castai_crew_alerts.sql");
const three = code(threeRaw);
const NEW_TABLES = ["castai_crew_catches", "castai_crew_notify_prefs", "castai_crew_push_subs", "castai_crew_outbox"];
for (const t of NEW_TABLES) locked(three, t);
ok(JSON.stringify(created(three).sort()) === JSON.stringify([...NEW_TABLES].sort()), "the alerts migration creates exactly its four tables", created(three).join(","));
ok(!/create policy/i.test(three), "no policies on the alert tables either");
ok(!/grant [^;]* to (anon|authenticated|public)\b/i.test(three), "nothing is granted to a browser");
ok(threeRaw.length > 0 && !longDash.test(threeRaw), "no long dashes in the alerts file, comments included");
const altered3 = [...three.matchAll(/alter table (?:if exists )?(?:only )?([\w.]+)/gi)].map((m) => m[1]);
ok(altered3.length > 0 && altered3.every((t) => /^public\.castai_crew_/.test(t)), "it alters only its own tables", altered3.filter((t) => !/^public\.castai_crew_/.test(t)).join(","));
ok(!/on conflict[^;]*do update/i.test(three), "no seed ever overwrites a value");

// catches: a link to CastAI's own catch log, which is never changed
const dropped = [...three.matchAll(/\bdrop table\s+(?:if exists\s+)?([\w.]+)/gi)].map((m) => m[1]);
ok(JSON.stringify(dropped) === JSON.stringify(["public.castai_crew_catches"]), "the only table dropped is the first shape of crew catches, which held test rows", dropped.join(","));
ok(/if exists \(\s*select 1 from information_schema\.columns\s+where table_schema = 'public' and table_name = 'castai_crew_catches' and column_name = 'client_id'\s*\) then\s+drop table public\.castai_crew_catches;/i.test(three),
  "and only while it still has the old shape, so a second run drops nothing");
ok(!/\btruncate\b|\bdelete from\b|\bdrop column\b/i.test(three), "nothing else is emptied, deleted or dropped");
const link = table(three, "castai_crew_catches");
ok(/catch_id uuid primary key references public\.catch_logs ?\(id\) on delete cascade/i.test(link), "a crew catch is keyed by its CastAI catch, and goes when that catch is deleted");
ok(/trip_id uuid not null references public\.castai_crew_trips ?\(id\) on delete cascade/i.test(link), "a deleted trip takes its catch links with it");
ok(/created_at timestamptz not null default now\(\)/i.test(link), "a link knows when it was made");
ok(!/species|length_in|weight_lb|lure|notes|user_id|client_id/i.test(link), "the link holds no copy of the fish: there is one catch, in CastAI's own log");
ok(!/(alter table|insert into|update|drop table|create (unique )?index[^;]* on|create trigger[^;]* on|create policy[^;]* on|grant [^;]* on|revoke [^;]* on)\s+(?:only\s+)?public\.catch_logs/i.test(three),
  "catch_logs itself is never altered, written, indexed, or given a trigger, policy or grant");
ok((three.match(/catch_logs/g) || []).length === 1, "catch_logs appears once, as the thing a link points at", (three.match(/catch_logs/g) || []).length);

// what a person has switched on
const prefs = table(three, "castai_crew_notify_prefs");
ok(/user_id uuid primary key references auth\.users ?\(id\) on delete cascade/i.test(prefs), "one row of prefs per account, gone with the account");
ok(/texts boolean not null default false/i.test(prefs) && /push boolean not null default false/i.test(prefs), "both channels start off");
for (const col of ["ev_trips", "ev_status", "ev_notes", "ev_gear_catches"]) {
  ok(new RegExp(col + " boolean not null default true", "i").test(prefs), `${col} is ready once a channel is on`);
}
ok(/quiet_from smallint not null default 21/i.test(prefs) && /quiet_to smallint not null default 6/i.test(prefs), "quiet from 9 at night to 6 unless changed");
ok(/quiet_from between 0 and 23/i.test(three) && /quiet_to between 0 and 23/i.test(three), "quiet hours stay between 0 and 23");
ok(/texts_stopped boolean not null default false/i.test(prefs) && /first_text_at timestamptz null/i.test(prefs), "it remembers a STOP, and when the first text went");
ok(/updated_at timestamptz not null default now\(\)/i.test(prefs), "and when it last changed");

// phones that want alerts
const subs = table(three, "castai_crew_push_subs");
ok(/id uuid primary key default gen_random_uuid\(\)/i.test(subs), "a subscription has its own id");
ok(/user_id uuid not null references auth\.users ?\(id\) on delete cascade/i.test(subs), "a deleted account takes its phones with it");
ok(/endpoint text not null unique/i.test(subs), "one row per phone: the address is unique");
ok(/p256dh text not null/i.test(subs) && /auth text not null/i.test(subs) && /ua text null/i.test(subs), "the two keys are needed, the phone's name is optional");
ok(/last_ok_at timestamptz null/i.test(subs) && /fails integer not null default 0/i.test(subs), "it counts failures and remembers the last alert that landed");

// the outbox
const outbox = table(three, "castai_crew_outbox");
ok(/crew_id uuid not null references public\.castai_crew ?\(id\) on delete cascade/i.test(outbox), "a deleted crew takes its outbox with it");
ok(/trip_id uuid null references public\.castai_crew_trips ?\(id\) on delete cascade/i.test(outbox), "a deleted trip takes the alerts still waiting about it");
ok(/to_user uuid not null references auth\.users ?\(id\) on delete cascade/i.test(outbox), "a deleted account takes its alerts with it");
ok(/by_user uuid null,/i.test(outbox), "who did it is kept as a plain id");
ok(/kind text not null check \(kind in \('trip_new', ?'trip_status', ?'note', ?'gear', ?'catch', ?'test'\)\)/i.test(outbox), "the six kinds of alert, nothing else");
ok(/title text not null/i.test(outbox) && /body text not null/i.test(outbox) && /url text not null/i.test(outbox), "every alert has a title, a body and a link");
ok(/send_after timestamptz not null default now\(\)/i.test(outbox) && /sent_at timestamptz null/i.test(outbox), "it goes now unless held, and records when it went");
ok(/status text not null default 'queued' check \(status in \('queued', ?'sent', ?'skipped', ?'failed'\)\)/i.test(outbox), "queued, sent, skipped or failed");
ok(/channel text null/i.test(outbox) && /error text null/i.test(outbox), "which channel carried it, or why it did not go");
ok(!/phone|email/i.test(outbox + subs + prefs), "no table here holds a phone number or an address");

// the cron key, and the job that sends what was held
ok(/insert into public\.castai_crew_settings \(key, value\)\s+values \('cron_key', encode\(extensions\.gen_random_bytes\(24\), 'hex'\)\)\s+on conflict \(key\) do nothing/i.test(three),
  "the cron key is made at random in the database, and a second run never replaces it");
ok(!/'sms'/i.test(three), "the texting switch is left as it is");
ok(!/[0-9a-f]{32,}/i.test(three), "no key is written into the file");
ok(/select cron\.schedule\(\s*'castai-crew-deliver',\s*'\*\/5 \* \* \* \*'/i.test(three), "castai-crew-deliver runs every 5 minutes");
const job = (three.match(/cron\.schedule\(\s*'castai-crew-deliver'[\s\S]*?\$cron\$([\s\S]*?)\$cron\$/i) || [])[1] || "";
ok(/net\.http_post\(/i.test(job) && job.includes("https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-crew"), "it posts to the crew function");
ok(/'x-cron-key', \(select value from public\.castai_crew_settings where key = 'cron_key'\)/i.test(job), "with the key read from the settings table at run time");
ok(job.includes(`'{"action":"deliver"}'::jsonb`), "and asks it to deliver");
ok(/where exists \(\s*select 1 from public\.castai_crew_outbox\s+where status = 'queued' and send_after <= now\(\)\s*\)/i.test(job), "only when something is due, so an idle crew costs nothing");
ok((three.match(/cron\.schedule\(/g) || []).length === 1 && !/cron\.unschedule|cron\.alter_job/i.test(three), "it schedules that one job and touches no other");

// which accounts the invite made, and which have a number: one lookup, service role only
ok(/create or replace function public\.castai_crew_accounts\(\w+ uuid\[\]\)\s+returns table \(id uuid, invited boolean, has_phone boolean\)/i.test(three),
  "one lookup says which accounts the invite made and which have a phone");
ok(/security definer/i.test(three) && /set search_path = ''/i.test(three), "it runs with a pinned search path");
ok(/raw_app_meta_data -> 'crew_invited' = 'true'::jsonb/i.test(three), "the mark must be exactly true, the same as in the function's own rule");
ok(!/returns[^;]*\b(phone|email)\b text/i.test(three) && !/select[^;]*\bu\.email\b/i.test(three), "it never hands back a number or an address, only yes or no");
for (const who of ["public", "anon", "authenticated"]) {
  ok(new RegExp("revoke all on function public\\.castai_crew_accounts\\(uuid\\[\\]\\) from " + who, "i").test(three), `the accounts lookup is closed to ${who}`);
}
ok(/grant execute on function public\.castai_crew_accounts\(uuid\[\]\) to service_role/i.test(three), "only the service role may run it");
const fns3 = [...three.matchAll(/create (?:or replace )?function public\.(\w+)/gi)].map((m) => m[1]);
ok(fns3.length === 1 && fns3.every((f) => /^castai_crew_/.test(f)), "every function carries the prefix too", fns3.join(","));

// ---- naming the crew: whoever joins names it, once -------------------------
const nameRaw = read("supabase/migrations/20261127_0900_castai_crew_name_open.sql");
const nameSql = code(nameRaw);
ok(/alter table public\.castai_crew add column if not exists name_open boolean not null default false;/i.test(nameSql),
  "name_open is added once, and every crew already there gets false: Coach's own crew is not opened by the migration");
ok(/alter table public\.castai_crew alter column name_open set default true;/i.test(nameSql), "a crew made from now on starts with its name open");
ok(nameSql.indexOf("default false") >= 0 && nameSql.indexOf("default false") < nameSql.indexOf("set default true"), "the old rows are filled before the default turns to true");
const nameAltered = [...nameSql.matchAll(/alter table (?:if exists )?(?:only )?([\w.]+)/gi)].map((m) => m[1]);
ok(nameAltered.length === 2 && nameAltered.every((t) => t === "public.castai_crew"), "it alters castai_crew and nothing else", nameAltered.join(","));
ok(!/\bdrop\b|\btruncate\b|\bdelete\b|\bupdate\b|\binsert\b|create policy|\bgrant\b/i.test(nameSql), "additive: no row is changed by hand, nothing is dropped, nothing is granted");
ok(nameRaw.length > 0 && !longDash.test(nameRaw), "no long dashes in the file, comments included");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
