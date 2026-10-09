-- Final review fixes: lock email once an auth account is linked; hide cp_settings except the kill switches.
create or replace function cp_people_guard_email() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email is distinct from old.email and old.auth_user_id is not null then
    raise exception 'email cannot be changed once the account is linked' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists cp_people_guard_email_trg on cp_people;
create trigger cp_people_guard_email_trg before update on cp_people for each row execute function cp_people_guard_email();

drop policy if exists cp_settings_read on cp_settings;
create policy cp_settings_read on cp_settings for select to authenticated
  using (key in ('email_enabled','push_enabled','self_create_teams'));
