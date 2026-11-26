// The crew tables are reached only through the castai-crew edge function with
// the service role, the same shape as the BLS board: RLS on, no policies, no
// grants to anon or authenticated. A policy here would hand a member's row to
// anyone holding the publishable key.
// Run: node tests/castai-crew-schema.test.mjs
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILE = resolve(ROOT, "supabase/migrations/20261125_0900_castai_crew.sql");
let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log("ok  ", m); }
  else { fail++; console.log("FAIL", m, extra === undefined ? "" : String(extra).slice(0, 200)); }
};

ok(existsSync(FILE), "the migration exists");
const sql = existsSync(FILE) ? readFileSync(FILE, "utf8") : "";

for (const t of ["castai_crew", "castai_crew_members"]) {
  ok(new RegExp("create table if not exists public\\." + t, "i").test(sql), `${t} is created, idempotently`);
  ok(new RegExp("alter table public\\." + t + " enable row level security", "i").test(sql), `${t} has row level security on`);
  ok(new RegExp("revoke all on public\\." + t + " from anon", "i").test(sql), `${t} is closed to anon`);
  ok(new RegExp("revoke all on public\\." + t + " from authenticated", "i").test(sql), `${t} is closed to a signed-in browser`);
}
ok(!/create policy/i.test(sql), "no policies: the edge function is the only way in");
ok(/primary key \(crew_id, user_id\)/i.test(sql), "one person cannot be on the same crew twice");
ok(/references auth\.users ?\(id\) on delete cascade/i.test(sql), "a deleted account takes its membership with it");
ok(/role text not null .*check \(role in \('owner', ?'member'\)\)/is.test(sql), "role is owner or member, nothing else");
ok(/references public\.castai_crew ?\(id\) on delete cascade/i.test(sql), "a deleted crew takes its members with it");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
