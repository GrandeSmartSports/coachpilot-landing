-- Lessons with Sophie: optional posted-availability layer. Windows are just
-- a hint for which slots to SHOW on the public page; every booking (open-slot
-- or manually proposed) still lands in sls_requests as pending and requires
-- Sophie's approval — this is intentional (Coach: "gives Sophie grace if she
-- forgets to take something off").
create table if not exists sls_windows (
  id uuid primary key default gen_random_uuid(),
  weekday int not null check (weekday between 0 and 6), -- 0=Sunday, Pacific
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table sls_windows enable row level security;

-- Tags whether a request came from tapping a posted open slot vs the
-- propose-your-own-times flow. Cosmetic (drives a queue badge only).
alter table sls_requests add column if not exists source text not null default 'manual' check (source in ('manual','open_slot'));

-- sls_settings gains (via upsert at runtime, no migration needed for the
-- values themselves): sophie_calendar_url (raw iCloud webcal/https URL,
-- gateway-only, NEVER returned in any response), calendar_busy_cache
-- (JSON busy-interval array), calendar_busy_cache_at (ISO timestamp) — a
-- ~15 min cache so the public page never triggers a live ICS fetch per view.
