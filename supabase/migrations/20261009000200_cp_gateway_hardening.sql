-- Task 4 fix round 1: look up existing auth users by email (service role only), one primary guardian per kid, no duplicate memberships.
create or replace function cp_auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function cp_auth_user_id_by_email(text) from public, anon, authenticated;

create unique index if not exists cp_guardians_one_primary on cp_guardians(player_id) where is_primary and status = 'approved';
create unique index if not exists cp_memberships_unique_team on cp_memberships(person_id, team_id, role) where team_id is not null;
create unique index if not exists cp_memberships_unique_league on cp_memberships(person_id, league_id, role) where league_id is not null;
create unique index if not exists cp_memberships_unique_platform on cp_memberships(person_id) where role = 'platform_admin';
