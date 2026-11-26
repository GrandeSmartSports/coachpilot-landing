-- Rig Card Crew: a small, invite-only group that sees the same week.
-- Project: CoachPilot Supabase geigvuysptjvvqanumld (castai_ prefix, see BACKEND-CONTRACT.md).
-- Apply with Supabase MCP apply_migration, name castai_crew.
-- Additive and idempotent: safe to run more than once.
--
-- Reached ONLY through the castai-crew edge function with the service role,
-- the same shape as bls_board_*. RLS is on with no policies, and anon and
-- authenticated hold no grants, so the publishable key cannot read a member.
-- Accounts themselves live in auth.users and are shared with CastAI; nothing
-- here duplicates them.

create table if not exists public.castai_crew (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.castai_crew_members (
  crew_id uuid not null references public.castai_crew (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  display_name text not null,
  invited_by uuid null references auth.users (id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (crew_id, user_id)
);

create index if not exists castai_crew_members_user_idx on public.castai_crew_members (user_id);

alter table public.castai_crew drop constraint if exists castai_crew_name_length;
alter table public.castai_crew add constraint castai_crew_name_length
  check (length(btrim(name)) between 1 and 60);

alter table public.castai_crew_members drop constraint if exists castai_crew_members_name_length;
alter table public.castai_crew_members add constraint castai_crew_members_name_length
  check (length(btrim(display_name)) between 1 and 60);

alter table public.castai_crew enable row level security;
alter table public.castai_crew_members enable row level security;

revoke all on public.castai_crew from anon;
revoke all on public.castai_crew from authenticated;
revoke all on public.castai_crew_members from anon;
revoke all on public.castai_crew_members from authenticated;
