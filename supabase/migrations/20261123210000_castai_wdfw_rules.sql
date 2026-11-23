-- WDFW emergency fishing rules, read from the WDFW RSS by the castai-rules
-- edge function. Public data, but service-role only: the function is the
-- only reader and writer.
create table if not exists public.castai_wdfw_rules (
  link text primary key,
  title text not null,
  published timestamptz,
  effective text,
  body text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now()
);
create index if not exists castai_wdfw_rules_published on public.castai_wdfw_rules (published desc);

create table if not exists public.castai_wdfw_rules_sync (
  id int primary key default 1 check (id = 1),
  last_run timestamptz,
  last_ok timestamptz,
  last_error text
);

alter table public.castai_wdfw_rules enable row level security;
alter table public.castai_wdfw_rules_sync enable row level security;
revoke all on public.castai_wdfw_rules from anon, authenticated;
revoke all on public.castai_wdfw_rules_sync from anon, authenticated;

-- Every 6 hours, so the rules are fresh even when nobody opens the page.
select cron.schedule('castai-rules-sync', '7 */6 * * *',
  $$ select net.http_get(url := 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-rules?sync=1') $$);
