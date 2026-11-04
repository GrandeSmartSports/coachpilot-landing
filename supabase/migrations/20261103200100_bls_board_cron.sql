-- BLS Website Build board: pg_cron tick every 15 minutes (expires countdowns, sends the 6 PM Pacific digest).
-- Same pattern as flm-reminders-daily and sls-cron-hourly: pg_net POST with the cron key read from settings at run time.
-- Idempotent: drops and re-creates the job by name.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'bls-board-tick') then
    perform cron.unschedule('bls-board-tick');
  end if;
end $$;

select cron.schedule(
  'bls-board-tick',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := 'https://geigvuysptjvvqanumld.supabase.co/functions/v1/bls-board?action=tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-key', (select value from public.bls_board_settings where key = 'cron_key')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $cmd$
);
