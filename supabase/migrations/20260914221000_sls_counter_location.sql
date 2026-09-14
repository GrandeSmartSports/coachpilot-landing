-- Sophie picks the location when she proposes a counter-time, so a parent's
-- one-tap accept from email finalizes the session without another admin step.
alter table sls_requests add column if not exists counter_location_id uuid references sls_locations(id);

insert into sls_settings (key, value) values ('sophie_alert_email', 'daniel.grande@ymail.com')
  on conflict (key) do nothing;
