-- BLS Website Build board, review fixes (2026-11-04). Idempotent: safe to re-run.
-- pin_w: screen width (px) when a spot pin was dropped, so a pin only draws for viewers in the same width class
--        (phone under 700px, computer 700px and up). Null on older pins (drawn for everyone).
-- emailed_at: when Daniel got the instant email for this item. Null means no instant email went out (too many in one
--        hour, or the send failed); the 6 PM digest lists those so nothing is missed.
-- Settings key pin_fail ("<window start ms>:<failed tries>") backs the global wrong-PIN lockout.
alter table bls_board_items add column if not exists pin_w int null;
alter table bls_board_items add column if not exists emailed_at timestamptz null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bls_board_items_pin_w_range') then
    alter table bls_board_items add constraint bls_board_items_pin_w_range
      check (pin_w is null or (pin_w between 200 and 10000 and pin_x is not null));
  end if;
end $$;
create index if not exists bls_board_items_emailed_idx on bls_board_items (emailed_at) where emailed_at is not null;
insert into bls_board_settings (key, value) values ('pin_fail', '') on conflict (key) do nothing;
