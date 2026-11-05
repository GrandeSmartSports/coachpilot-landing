-- BLS Website Build board: reviewers, asks and page updates (spec addendum 2026-11-04). Idempotent: safe to re-run.
-- reviewers: roster names (bls_board_people) who should look a page over. The function checks every name against the
--   active roster; the database only keeps the list sane.
-- asks: short questions for named board members, [{"text": "...", "people": ["Name", ...]}], at most 10 per page.
-- page_update: a public event Daniel posts (admin_update) with a short plain-words note about a real change to a page.
--   Public "What's new" shows only page_update and live events; every other event kind is admin only.

alter table bls_board_pages add column if not exists reviewers text[] not null default '{}';
alter table bls_board_pages add column if not exists asks jsonb not null default '[]'::jsonb;

alter table bls_board_pages drop constraint if exists bls_board_pages_reviewers_check;
alter table bls_board_pages add constraint bls_board_pages_reviewers_check
  check (cardinality(reviewers) <= 30 and array_position(reviewers, null) is null);
alter table bls_board_pages drop constraint if exists bls_board_pages_asks_check;
alter table bls_board_pages add constraint bls_board_pages_asks_check
  check (jsonb_typeof(asks) = 'array' and jsonb_array_length(asks) <= 10 and octet_length(asks::text) <= 20000);

alter table bls_board_events drop constraint if exists bls_board_events_page_update_check;
alter table bls_board_events add constraint bls_board_events_page_update_check
  check (kind <> 'page_update' or char_length(detail) between 3 and 280);
create index if not exists bls_board_events_kind_idx on bls_board_events (kind, created_at desc);

-- Reviewers (names exactly as in bls_board_people). Only fills pages that have none yet, so a re-run never undoes
-- Daniel's edits.
update bls_board_pages p set reviewers = v.names
  from (values
    ('home',         array['Melissa Olsen', 'Dena Berkey', 'Ramey Harguess']),
    ('registration', array['Ramey Harguess', 'Dan Swatman', 'Jeremy Olsen', 'Luke Kress', 'Jason Guertin']),
    ('volunteer',    array['Tawnie LaValley', 'Melissa Olsen', 'Ramey Harguess']),
    ('corpmatch',    array['Katie Sloan', 'Dan Swatman']),
    ('sponsorship',  array['Ashley Gauthier', 'Dan Swatman']),
    ('allstars',     array['Jason Guertin', 'Jeremy Olsen', 'Luke Kress']),
    ('fallball',     array['Jeremy Olsen', 'Luke Kress']),
    ('coaches',      array['Rod Vincent', 'Jeremy Olsen', 'Luke Kress', 'Daneen Galvez']),
    ('faq',          array['Ramey Harguess', 'Jeremy Olsen', 'Luke Kress', 'Jason Guertin']),
    ('health',       array['Daneen Galvez']),
    ('board',        array['Ramey Harguess', 'Tawnie LaValley']),
    ('calendar',     array['Ramey Harguess']),
    ('champions',    array['Jeremy Olsen', 'Luke Kress', 'Jason Guertin']),
    ('fields',       array['Daniel Lane', 'Greg Potts']),
    ('umpires',      array['Ramey Harguess', 'Dan Swatman']),
    ('runbook',      array['Rod Vincent', 'Jeremy Olsen', 'Luke Kress', 'Jason Guertin', 'Daneen Galvez', 'Dena Berkey']),
    ('schedules',    array['Jeremy Olsen', 'Luke Kress', 'Jason Guertin'])
  ) as v(slug, names)
 where p.slug = v.slug and p.reviewers = '{}'::text[];

-- Asks. Only fills pages that have none yet. Seed updated 11/4 (Coach feedback): only the three optional, gentle asks;
-- board decisions and anything that cannot happen before launch are not asks (20261104170000_bls_board_calm_asks).
update bls_board_pages p set asks = v.asks
  from (values
    ('sponsorship', '[{"text": "Know the 2027 sponsor prices?", "people": ["Ashley Gauthier"]}]'::jsonb),
    ('board', '[{"text": "OK to show the board list on the site?", "people": ["Ramey Harguess"]}]'::jsonb),
    ('runbook', '[{"text": "Know the 2027 uniform sizing by division?", "people": ["Dena Berkey"]}]'::jsonb)
  ) as v(slug, asks)
 where p.slug = v.slug and p.asks = '[]'::jsonb;

-- The first page updates for the public "What's new" (each written once).
insert into bls_board_events (slug, kind, detail, actor)
select v.slug, 'page_update', v.detail, 'Daniel (Website)'
  from (values
    (1, 'runbook',   'new page proposed to replace the Word document'),
    (2, 'schedules', 'new page proposed to replace Team Central''s schedule, score and standings pages'),
    (3, 'home',      'Facebook box removed (its feed was blank on phones)'),
    (4, 'board',     'Treasurer''s name corrected to Dan Swatman'),
    (5, 'champions', '2025 team photo approved for the page')
  ) as v(n, slug, detail)
 where not exists (select 1 from bls_board_events e where e.kind = 'page_update' and e.slug = v.slug and e.detail = v.detail)
 order by v.n;
