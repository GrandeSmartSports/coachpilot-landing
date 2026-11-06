-- Field Command v3: the coach app (preview at /fields/app/).
-- Additive only. Live /fields/ and every existing gateway action keep working
-- unchanged. See docs/field-command-v3-coach-app.md for the spec.

-- Field closures: league closes a field for a date (rain, maintenance).
-- Every practice slot booked on that field for that date gets marked skipped
-- (same mechanism as the coach's own slot_skip_date) and affected coaches get
-- a push + the closure shows in their Alerts.
create table if not exists flm_field_closures (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references flm_fields(id) on delete cascade,
  closure_date date not null,
  reason text not null default '',
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);
alter table flm_field_closures enable row level security;
create index if not exists flm_field_closures_field_date_idx on flm_field_closures (field_id, closure_date);

-- FMX cancel list: every released/closed field-date the league should cancel
-- with the district, tracked so the admin can check it off once it's done.
create table if not exists flm_fmx_cancellations (
  id uuid primary key default gen_random_uuid(),
  field_id uuid not null references flm_fields(id) on delete cascade,
  cancel_date date not null,
  done_at timestamptz,
  done_by text,
  created_at timestamptz not null default now(),
  unique (field_id, cancel_date)
);
alter table flm_fmx_cancellations enable row level security;

-- Optional hourly rate per field, used to estimate "$ saved" on the FMX cancel
-- list. Null = unknown; the admin list shows "?" instead of a dollar amount.
alter table flm_fields add column if not exists hourly_rate numeric;
