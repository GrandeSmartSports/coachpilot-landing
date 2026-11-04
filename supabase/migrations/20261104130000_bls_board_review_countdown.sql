-- BLS Website Build board: Board review is the 48 hour countdown (Coach 11/4). Idempotent: safe to re-run.
-- New states: building, waiting, review (Board review, the countdown), hold (a concern paused the clock),
-- scheduled (Scheduled for deployment, the clock ran out), live. The separate 'ready' (Ready to deploy) state is gone.
-- Clock columns: ready_deadline is the running Board review clock (state review only, and every review page has one);
-- hold_remaining_ms is a frozen clock (state hold only).
-- Data moves:
--   1. 'ready' pages become 'review' and keep their clock.
--   2. 'review' pages with no clock move to 'waiting' when their preview proposal (bls/preview/proposals/<slug>.json)
--      has a non-empty "required" list, otherwise to 'building'. The waiting list below is read from those files on
--      2026-11-04: volunteer (2), sponsorship (1), allstars (1), board (2), runbook (5), schedules (4).
--   Each moved page gets an event.

alter table bls_board_pages drop constraint if exists bls_board_pages_ready_clock;
alter table bls_board_pages drop constraint if exists bls_board_pages_review_clock;
alter table bls_board_pages drop constraint if exists bls_board_pages_state_check;

update bls_board_pages set state = 'review', updated_at = now() where state = 'ready';

with moved as (
  update bls_board_pages
     set state = case when slug in ('volunteer', 'sponsorship', 'allstars', 'board', 'runbook', 'schedules')
                      then 'waiting' else 'building' end,
         hold_remaining_ms = null,
         updated_at = now()
   where state = 'review' and ready_deadline is null
  returning slug, title, state
)
insert into bls_board_events (slug, kind, detail, actor)
select slug, 'state_changed',
       title || ' moved to ' || case when state = 'waiting' then 'Waiting on info' else 'Building' end
             || ': Board review now runs the 48 hour countdown.',
       'System'
  from moved;

-- A clock left on a page outside Board review or On hold would break the checks below.
update bls_board_pages set ready_deadline = null where state <> 'review' and ready_deadline is not null;

alter table bls_board_pages alter column state set default 'building';
alter table bls_board_pages add constraint bls_board_pages_state_check
  check (state in ('building', 'waiting', 'review', 'hold', 'scheduled', 'live'));
-- A running clock exists exactly when the page is in Board review; a frozen clock only on an On hold page.
alter table bls_board_pages add constraint bls_board_pages_review_clock
  check ((state = 'review') = (ready_deadline is not null));
-- bls_board_pages_hold_clock (hold_remaining_ms is null or state = 'hold') is unchanged.
