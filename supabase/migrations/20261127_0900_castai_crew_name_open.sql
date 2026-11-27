-- Rig Card Crew: whoever joins names the crew.
-- Project: CoachPilot Supabase geigvuysptjvvqanumld (castai_ prefix, see BACKEND-CONTRACT.md).
-- Apply with Supabase MCP apply_migration, name castai_crew_name_open.
-- Additive and safe to run more than once. It touches castai_crew only, and
-- nothing of CastAI's own.
--
-- name_open: while it is true, anyone on the crew may name it, once. The
-- first name saved sets it back to false, and from then on only the owner
-- renames the crew. The castai-crew function is the only thing that reads or
-- writes it.
--
-- Crews that are already there keep their name as it is: adding the column
-- fills every existing row with false. Only after that does the default turn
-- to true, so a crew made from now on starts with its name open.

alter table public.castai_crew add column if not exists name_open boolean not null default false;
alter table public.castai_crew alter column name_open set default true;
