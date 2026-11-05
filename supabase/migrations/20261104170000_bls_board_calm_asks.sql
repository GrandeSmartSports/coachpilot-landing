-- BLS Website Build board: calmer asks (Coach feedback 11/4). Idempotent: safe to re-run.
-- The board is there to invite input, not to hand out work. Asks that are board decisions, or that cannot happen before the
-- site launches (spring dates, sign-up switches, scores and standings, the cleared-volunteer plan, the Nov 1 seat names),
-- come off. The three that stay are optional and reworded as gentle prompts.
-- Each page changes only while it still holds the original seed, so an edit Daniel made in admin mode is never undone.
-- Columns (reviewers, asks) stay as they are.

update bls_board_pages p set asks = v.new_asks, updated_at = now()
  from (values
    ('volunteer',
      '[{"text": "Turn on the Spring 2027 volunteer sign-up", "people": ["Ramey Harguess", "Melissa Olsen"]},
        {"text": "Approve the cleared-volunteer plan and name who sends the weekly cleared email", "people": ["Ramey Harguess"]}]'::jsonb,
      '[]'::jsonb),
    ('schedules',
      '[{"text": "Where scores and standings live for spring 2027", "people": ["Ramey Harguess", "Jeremy Olsen", "Luke Kress"]}]'::jsonb,
      '[]'::jsonb),
    ('sponsorship',
      '[{"text": "2027 sponsor prices", "people": ["Ashley Gauthier"]}]'::jsonb,
      '[{"text": "Know the 2027 sponsor prices?", "people": ["Ashley Gauthier"]}]'::jsonb),
    ('board',
      '[{"text": "Names for the seats filled Nov 1 (from the Nov 1 minutes)", "people": ["Tawnie LaValley"]},
        {"text": "OK to show the board list on the site", "people": ["Ramey Harguess"]}]'::jsonb,
      '[{"text": "OK to show the board list on the site?", "people": ["Ramey Harguess"]}]'::jsonb),
    ('runbook',
      '[{"text": "2027 evaluation, draft, meeting, gear pickup and Opening Day dates", "people": ["Ramey Harguess", "Jeremy Olsen", "Luke Kress"]},
        {"text": "Turn on spring 2027 coach and volunteer sign-up", "people": ["Tawnie LaValley", "Melissa Olsen"]},
        {"text": "Confirm 2027 uniform sizing by division", "people": ["Dena Berkey"]}]'::jsonb,
      '[{"text": "Know the 2027 uniform sizing by division?", "people": ["Dena Berkey"]}]'::jsonb)
  ) as v(slug, old_asks, new_asks)
 where p.slug = v.slug and p.asks = v.old_asks;
