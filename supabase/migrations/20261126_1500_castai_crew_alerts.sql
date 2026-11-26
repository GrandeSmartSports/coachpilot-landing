-- Rig Card Crew, contract v2 and v2.1: alerts (texts and phone alerts, opt in,
-- quiet hours per person), catches as CastAI catches, and one lookup that says
-- which accounts an invite made.
-- Project: CoachPilot Supabase geigvuysptjvvqanumld (castai_ prefix, see BACKEND-CONTRACT.md).
-- Apply with Supabase MCP apply_migration, name castai_crew_alerts.
-- Safe to run more than once. It alters nothing that does not start with
-- castai_crew. CastAI's own catch log is pointed at by a link and is itself
-- left exactly as it is.
--
-- Reached ONLY through the castai-crew edge function with the service role,
-- the same shape as the other crew tables: RLS on with no policies, and anon
-- and authenticated hold no grants, so the publishable key reads nothing here.

-- ---- catches ---------------------------------------------------------------
-- A crew catch is now a row in CastAI's own catch log, owned by the person who
-- caught it, plus this link to the trip. The first shape of this table kept its
-- own copy of the fish and only ever held test rows, so it is replaced. The
-- old shape is known by its client_id column: the new one has none, so a
-- second run drops nothing.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'castai_crew_catches' and column_name = 'client_id'
  ) then
    drop table public.castai_crew_catches;
  end if;
end $$;

create table if not exists public.castai_crew_catches (
  catch_id uuid primary key references public.catch_logs (id) on delete cascade,
  trip_id uuid not null references public.castai_crew_trips (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists castai_crew_catches_trip_idx on public.castai_crew_catches (trip_id, created_at);

-- ---- alerts ----------------------------------------------------------------
-- What one person has switched on. No row means everything is off. Hours are
-- 0 to 23 in America/Los_Angeles; the same hour twice means no quiet hours.
-- texts_stopped is set when the carrier says they replied STOP.
create table if not exists public.castai_crew_notify_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  texts boolean not null default false,
  push boolean not null default false,
  ev_trips boolean not null default true,
  ev_status boolean not null default true,
  ev_notes boolean not null default true,
  ev_gear_catches boolean not null default true,
  quiet_from smallint not null default 21,
  quiet_to smallint not null default 6,
  texts_stopped boolean not null default false,
  first_text_at timestamptz null,
  updated_at timestamptz not null default now()
);

alter table public.castai_crew_notify_prefs drop constraint if exists castai_crew_notify_prefs_hours;
alter table public.castai_crew_notify_prefs add constraint castai_crew_notify_prefs_hours
  check (quiet_from between 0 and 23 and quiet_to between 0 and 23);

-- A phone or browser that asked for alerts. The address is the one its push
-- service handed out; the two keys seal what is sent to it.
create table if not exists public.castai_crew_push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ua text null,
  created_at timestamptz not null default now(),
  last_ok_at timestamptz null,
  fails integer not null default 0
);

create index if not exists castai_crew_push_subs_user_idx on public.castai_crew_push_subs (user_id);

-- Every alert, one row per person it is for. It goes at send_after: now, or the
-- end of that person's quiet hours. sent_at is when the sender picked it up.
create table if not exists public.castai_crew_outbox (
  id uuid primary key default gen_random_uuid(),
  crew_id uuid not null references public.castai_crew (id) on delete cascade,
  trip_id uuid null references public.castai_crew_trips (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  by_user uuid null,
  kind text not null check (kind in ('trip_new', 'trip_status', 'note', 'gear', 'catch', 'test')),
  title text not null,
  body text not null,
  url text not null,
  created_at timestamptz not null default now(),
  send_after timestamptz not null default now(),
  sent_at timestamptz null,
  channel text null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'skipped', 'failed')),
  error text null
);

create index if not exists castai_crew_outbox_person_idx on public.castai_crew_outbox (to_user, created_at desc);
create index if not exists castai_crew_outbox_due_idx on public.castai_crew_outbox (send_after) where status = 'queued';
create index if not exists castai_crew_outbox_trip_idx on public.castai_crew_outbox (trip_id) where trip_id is not null;

-- ---- which accounts the invite made, and which have a number ---------------
-- A join link signs a person in with no code, so it is only ever made for an
-- account the invite itself created (app_metadata.crew_invited is exactly
-- true, which only the service role can write). This answers that for a set
-- of accounts in one go, and whether each has a phone number, as yes or no.
-- The number itself is never handed back. Only the service role may run it.
create or replace function public.castai_crew_accounts(p_ids uuid[])
returns table (id uuid, invited boolean, has_phone boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         coalesce(u.raw_app_meta_data -> 'crew_invited' = 'true'::jsonb, false),
         (u.phone is not null and u.phone <> '')
  from auth.users u
  where u.id = any (p_ids)
$$;

revoke all on function public.castai_crew_accounts(uuid[]) from public;
revoke all on function public.castai_crew_accounts(uuid[]) from anon;
revoke all on function public.castai_crew_accounts(uuid[]) from authenticated;
grant execute on function public.castai_crew_accounts(uuid[]) to service_role;

-- ---- the lock on the new tables --------------------------------------------
alter table public.castai_crew_catches enable row level security;
alter table public.castai_crew_notify_prefs enable row level security;
alter table public.castai_crew_push_subs enable row level security;
alter table public.castai_crew_outbox enable row level security;

revoke all on public.castai_crew_catches from anon;
revoke all on public.castai_crew_catches from authenticated;
revoke all on public.castai_crew_notify_prefs from anon;
revoke all on public.castai_crew_notify_prefs from authenticated;
revoke all on public.castai_crew_push_subs from anon;
revoke all on public.castai_crew_push_subs from authenticated;
revoke all on public.castai_crew_outbox from anon;
revoke all on public.castai_crew_outbox from authenticated;

-- ---- sending what was held -------------------------------------------------
-- The key the cron job shows the function. Made at random here, in the
-- database, and never replaced by a later run. It is written nowhere else.
insert into public.castai_crew_settings (key, value)
values ('cron_key', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;

-- Every 5 minutes, send what quiet hours held back. It posts only when
-- something is due, so an idle crew costs nothing. Scheduling by name replaces
-- the job of that name, so a second run leaves one job, not two.
select cron.schedule('castai-crew-deliver', '*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/castai-crew',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.castai_crew_settings where key = 'cron_key')
    ),
    body := '{"action":"deliver"}'::jsonb,
    timeout_milliseconds := 60000
  )
  where exists (
    select 1 from public.castai_crew_outbox
    where status = 'queued' and send_after <= now()
  );
$cron$);
