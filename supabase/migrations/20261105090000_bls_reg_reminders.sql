-- BLS registration-day reminders: families leave an email on the Registration page and get one email the morning
-- Spring 2027 registration opens (Fri Nov 27, 2026). Written and read only by the bls-gateway function (service role).
create table if not exists public.bls_reg_reminders (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  email_key text not null unique,
  source text,
  ip_hash text,
  created_at timestamptz not null default now(),
  confirm_sent_at timestamptz,
  reminder_sent_at timestamptz,
  unsub_token text not null unique default md5(gen_random_uuid()::text || clock_timestamp()::text),
  unsubscribed_at timestamptz
);
create index if not exists bls_reg_reminders_ip_idx on public.bls_reg_reminders (ip_hash, created_at);
alter table public.bls_reg_reminders enable row level security;
-- no policies on purpose: the gateway is the only reader and writer

-- One send, 7:00 AM Pacific on Nov 27, 2026 (15:00 UTC, PST). The gateway only emails rows not yet sent, so a
-- repeat firing is harmless; unschedule after the season.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bls-reg-reminder-2026') then
    perform cron.unschedule('bls-reg-reminder-2026');
  end if;
end $$;

select cron.schedule(
  'bls-reg-reminder-2026',
  '0 15 27 11 *',
  $cmd$
  select net.http_post(
    url := 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-gateway?action=remind_send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.bls_board_settings where key = 'cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cmd$
);
