-- Task 1 fix round 1: scope staff visibility of people rows, and move birthdate to a private table.
drop policy if exists cp_people_team_staff on cp_people;
create policy cp_people_team_staff on cp_people for select to authenticated using (
  exists (select 1 from cp_memberships m where m.person_id = cp_people.id and m.team_id is not null and m.role in ('head_coach','assistant_coach') and cp_is_team_member(m.team_id, array['head_coach','assistant_coach']))
  or exists (select 1 from cp_guardians g where g.person_id = cp_people.id and cp_is_team_member(cp_player_team(g.player_id), array['head_coach']))
  or exists (select 1 from cp_memberships m where m.person_id = cp_people.id and m.league_id is not null and cp_is_league_member(m.league_id, array['league_admin']))
);

create table if not exists cp_player_private (
  player_id uuid primary key references cp_players(id) on delete cascade,
  birthdate date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table cp_player_private enable row level security;
create policy cp_player_private_coach on cp_player_private for all to authenticated
  using (cp_is_team_member(cp_player_team(player_id), array['head_coach']))
  with check (cp_is_team_member(cp_player_team(player_id), array['head_coach']));
create policy cp_player_private_guardian on cp_player_private for select to authenticated
  using (cp_is_guardian_of(player_id));

alter table cp_players drop column if exists birthdate;
