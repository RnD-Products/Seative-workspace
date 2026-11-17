-- Time tracking per project.
-- A person logs time either with a running timer (started_at set, minutes null until stopped)
-- or manually (minutes + entry_date). Everyone on a project sees its time; each person only
-- creates and edits their own entries; the CEO and the project's PM may delete any entry.

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  entry_date date not null default (now() at time zone 'Asia/Dhaka')::date,
  started_at timestamptz,
  ended_at timestamptz,
  minutes integer check (minutes is null or (minutes between 1 and 20160)),
  note text not null default '' check (char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A finished entry always has minutes; a running one has a start and no end.
  constraint time_entry_shape check (
    (ended_at is null and started_at is not null and minutes is null)
    or (minutes is not null)
  )
);
create index time_entries_project_idx on public.time_entries (project_id, entry_date desc);
create index time_entries_profile_idx on public.time_entries (profile_id, entry_date desc);
-- At most one running timer per person.
create unique index time_entries_one_running on public.time_entries (profile_id) where ended_at is null and minutes is null;

create trigger time_entries_touch before update on public.time_entries
  for each row execute function public.touch_updated_at();

create or replace function public.guard_time_entries() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  proj record;
begin
  select id, organization_id into proj from public.projects where id = new.project_id;
  if proj.id is null then
    raise exception 'Project not found' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    new.organization_id := proj.organization_id;
    if auth.uid() is not null then new.profile_id := auth.uid(); end if;
  else
    if new.project_id <> old.project_id or new.profile_id <> old.profile_id or new.organization_id <> old.organization_id then
      raise exception 'Time entries cannot move between projects or people' using errcode = '42501';
    end if;
  end if;

  -- The task, if any, must belong to the same project.
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'That task is not in this project' using errcode = '42501';
  end if;

  -- Stopping a timer: the duration is worked out here, from the database clock.
  if new.started_at is not null and new.ended_at is not null and new.minutes is null then
    if new.ended_at < new.started_at then new.ended_at := new.started_at; end if;
    new.minutes := least(20160, greatest(1, ceil(extract(epoch from (new.ended_at - new.started_at)) / 60.0)::int));
  end if;
  return new;
end $$;
create trigger time_entries_guard before insert or update on public.time_entries
  for each row execute function public.guard_time_entries();

alter table public.time_entries enable row level security;

create policy time_select on public.time_entries for select to authenticated
  using (organization_id = public.current_org_id() and public.can_view_project(project_id));
create policy time_insert on public.time_entries for insert to authenticated
  with check (profile_id = auth.uid() and public.can_view_project(project_id));
create policy time_update on public.time_entries for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy time_delete on public.time_entries for delete to authenticated
  using (profile_id = auth.uid() or public.can_manage_project(project_id));

grant select, insert, update, delete on public.time_entries to authenticated;
revoke all on public.time_entries from anon;
