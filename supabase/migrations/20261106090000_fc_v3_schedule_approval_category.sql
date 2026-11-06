-- Fix: flm_requests_category_check never included 'schedule_approval', so
-- every over-guideline coach_confirm_schedule call (over:true) has been
-- failing with a 500 since the category was introduced in the gateway. The
-- live /fields/ hub never actually triggers this path (grep confirms no
-- `auto: true` call site), so it went unnoticed until the v3 coach app wired
-- it up and a live ZZTEST walkthrough hit the 500. Additive: widens an
-- existing CHECK, drops no data, changes no other behavior.
alter table flm_requests drop constraint flm_requests_category_check;
alter table flm_requests add constraint flm_requests_category_check
  check (category = any (array['gear','field_issue','practice_concern','volunteer_needed','general','schedule_approval']));
