-- BLS Website Build board: calmer still (Coach feedback 11/4, second pass). Idempotent: safe to re-run.
-- 1. Asks. "Know the 2027 sponsor prices?" comes off: 2027 prices are a board budget decision that will not happen before
--    the site launches (the page now labels its prices as 2026 prices). The uniform ask drops "2027" so it does not put next
--    season in front of people in November. Each page changes only while it still holds the 20261104170000 seed, so an
--    edit Daniel made in admin mode is never undone.
-- 2. Stopgap until the calmer board.js is pushed: the board.js on the live link lists every Waiting on info page that has no
--    ask under "Needs information" for everyone, with its open items labeled "Waiting on Daniel: ..." (board decisions
--    included). Volunteer Opportunities, Sponsorship Opportunities, Allstars and Schedules & Scores move to Building, which
--    is what they are: Daniel is still working on them. Only pages still in Waiting on info move. Each move gets an
--    admin-only state_changed event. Daniel can move any of them back under Manage.

update bls_board_pages p set asks = v.new_asks, updated_at = now()
  from (values
    ('sponsorship',
      '[{"text": "Know the 2027 sponsor prices?", "people": ["Ashley Gauthier"]}]'::jsonb,
      '[]'::jsonb),
    ('runbook',
      '[{"text": "Know the 2027 uniform sizing by division?", "people": ["Dena Berkey"]}]'::jsonb,
      '[{"text": "Know how uniform sizing works by division?", "people": ["Dena Berkey"]}]'::jsonb)
  ) as v(slug, old_asks, new_asks)
 where p.slug = v.slug and p.asks = v.old_asks;

with moved as (
  update bls_board_pages
     set state = 'building', ready_deadline = null, hold_remaining_ms = null, updated_at = now()
   where slug in ('volunteer', 'sponsorship', 'allstars', 'schedules') and state = 'waiting'
  returning slug, title
)
insert into bls_board_events (slug, kind, detail, actor)
select slug, 'state_changed',
       title || ' moved from Waiting on info to Building. Stopgap until the calmer board is live (the old screen listed this page''s open items for everyone).',
       'System'
  from moved;
