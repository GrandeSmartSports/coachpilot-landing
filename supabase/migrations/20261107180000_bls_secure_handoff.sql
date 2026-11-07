-- One-time secure handoff of a league login (e.g. Little League Data Center) from a board member to the website seat.
-- Secrets are AES-GCM encrypted in the edge function with BLS_HANDOFF_KEY; rows are deleted after being moved to the vault.
create table if not exists public.bls_secure_handoff (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  from_name text,
  login text,
  secret_iv text not null,
  secret_ct text not null,
  ip_hash text,
  created_at timestamptz not null default now()
);
alter table public.bls_secure_handoff enable row level security;
