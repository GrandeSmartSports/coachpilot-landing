-- BLS Softball Run Book working copy: Coach and the VP Softball edit division pages and leave notes, no sign-in.
-- Reached only through edge function bls-runbook with the working-link key (bls_board_settings.runbook_key).
create table if not exists public.bls_runbook_docs (
  id bigint generated always as identity primary key,
  book text not null,
  division text not null,
  html text not null,
  by_name text not null,
  created_at timestamptz not null default now()
);
create index if not exists bls_runbook_docs_latest on public.bls_runbook_docs (book, division, id desc);
create table if not exists public.bls_runbook_notes (
  id uuid primary key default gen_random_uuid(),
  book text not null,
  division text not null,
  section text not null default '',
  body text not null,
  by_name text not null,
  created_at timestamptz not null default now(),
  done_by text,
  done_at timestamptz
);
create index if not exists bls_runbook_notes_book on public.bls_runbook_notes (book, created_at);
alter table public.bls_runbook_docs enable row level security;
alter table public.bls_runbook_notes enable row level security;
revoke all on public.bls_runbook_docs, public.bls_runbook_notes from anon, authenticated;
