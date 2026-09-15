-- Feature A: session types (1-on-1 vs Small Group 2-4) + explicit multi-
-- athlete list. athlete_name/athlete_age stay as back-compat display
-- columns (joined name label / first athlete's age); `athletes` jsonb is
-- the source of truth for new rows going forward. Old rows keep
-- athletes = '[]' and every reader falls back to athlete_name/athlete_age
-- when athletes is empty, so nothing pre-existing breaks.
alter table sls_requests add column if not exists session_type text not null default 'one_on_one' check (session_type in ('one_on_one','small_group'));
alter table sls_requests add column if not exists athletes jsonb not null default '[]'::jsonb; -- [{name, age}]
alter table sls_sessions add column if not exists session_type text not null default 'one_on_one' check (session_type in ('one_on_one','small_group'));
alter table sls_sessions add column if not exists athletes jsonb not null default '[]'::jsonb;

-- Feature B: device recognition. A trusted booking (brand-new client, or a
-- tapped magic link) issues a long-lived device token so a returning
-- family can skip the email-link step next time. The raw token lives ONLY
-- in the browser's localStorage; the DB only ever sees its SHA-256 hash,
-- same shape as every other sls_ token table but hashed since this one is
-- long-lived and reusable rather than single-use.
create table if not exists sls_devices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references sls_clients(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '365 days'),
  revoked boolean not null default false
);
alter table sls_devices enable row level security;
create index if not exists sls_devices_token_hash_idx on sls_devices (token_hash);
create index if not exists sls_devices_client_idx on sls_devices (client_id);
