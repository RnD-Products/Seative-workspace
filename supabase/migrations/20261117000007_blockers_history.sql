-- Phase 2B: blockers ("whose side is it on?") and fuller before -> after project history.

create table if not exists public.blockers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  title text not null check (char_length(title) between 2 and 200),
  details text not null default '' check (char_length(details) <= 2000),
  side text not null check (side in ('client', 'internal', 'third_party')),
  responsible_id uuid references public.profiles (id) on delete set null,
  raised_by uuid references public.profiles (id) on delete set null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_note text not null default '' check (char_length(resolved_note) <= 1000),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint blocker_internal_needs_person check (side <> 'internal' or responsible_id is not null)
);
create index if not exists blockers_project_idx on public.blockers (project_id, status);
create index if not exists blockers_open_idx on public.blockers (organization_id, status, created_at);
create trigger blockers_touch before update on public.blockers for each row execute function public.touch_updated_at();

create or replace function public.guard_blockers() returns trigger
language plpgsql security definer set search_path = public as $$
declare manager boolean;
begin
  select organization_id into new.organization_id from public.projects where id = new.project_id;
  if new.organization_id is null then raise exception 'Project not found' using errcode = '23503'; end if;
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'That task is not in this project' using errcode = '42501';
  end if;
  if new.side <> 'internal' then new.responsible_id := null; end if;
  if new.responsible_id is not null and not exists (select 1 from public.profiles where id = new.responsible_id and organization_id = new.organization_id) then
    raise exception 'The responsible person must be in this organization' using errcode = '42501';
  end if;
  if auth.uid() is null then return new; end if;
  manager := public.can_manage_project(new.project_id);
  if tg_op = 'INSERT' then
    new.raised_by := auth.uid();
    new.status := 'open'; new.resolved_by := null; new.resolved_at := null; new.resolved_note := '';
    -- A salesperson who is not on the team can only flag client-side blockers on their deals.
    if public.app_role()::text = 'sales' and not public.can_view_project(new.project_id) and new.side <> 'client' then
      raise exception 'Sales can raise client-side blockers' using errcode = '42501';
    end if;
  else
    if new.project_id <> old.project_id or new.raised_by is distinct from old.raised_by then
      raise exception 'Blockers cannot move' using errcode = '42501';
    end if;
    if new.status <> old.status then
      if not (manager or coalesce(old.responsible_id = auth.uid(), false)) then
        raise exception 'Only the person responsible, the project manager or the CEO can resolve a blocker' using errcode = '42501';
      end if;
      if new.status = 'resolved' then new.resolved_by := auth.uid(); new.resolved_at := now();
      else new.resolved_by := null; new.resolved_at := null; new.resolved_note := ''; end if;
    elsif not manager and (new.side <> old.side or new.responsible_id is distinct from old.responsible_id) and old.raised_by is distinct from auth.uid() then
      raise exception 'Only the project manager or the person who raised it can reassign a blocker' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger blockers_guard before insert or update on public.blockers for each row execute function public.guard_blockers();

alter table public.blockers enable row level security;
create policy blockers_select on public.blockers for select to authenticated
  using (organization_id = public.current_org_id() and (public.can_view_project(project_id) or public.is_sales_owner(project_id)));
create policy blockers_insert on public.blockers for insert to authenticated
  with check (raised_by = auth.uid() and (public.can_view_project(project_id) or public.is_sales_owner(project_id)));
create policy blockers_update on public.blockers for update to authenticated
  using (public.can_manage_project(project_id) or responsible_id = auth.uid() or raised_by = auth.uid())
  with check (public.can_view_project(project_id) or public.is_sales_owner(project_id));
grant select, insert, update on public.blockers to authenticated;
revoke all on public.blockers from anon;
-- No delete policy: blockers stay in the history.

create or replace function public.blocker_side_label(s text) returns text language sql immutable as $$
  select case s when 'client' then 'Client side' when 'internal' then 'Our side' else 'Third party' end
$$;

create or replace function public.audit_blockers() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text; mgr uuid;
begin
  select name, manager_id into pname, mgr from public.projects where id = new.project_id;
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.project_id, new.task_id, 'blocker_raised',
      jsonb_build_object('title', new.title, 'side', new.side, 'responsible', public.profile_name(new.responsible_id)));
    perform public.notify(mgr, 'blocker', 'Blocker on ' || pname || ' (' || public.blocker_side_label(new.side) || ')', new.title, '/projects/' || new.project_id || '#blockers', new.project_id);
    if new.responsible_id is distinct from mgr then
      perform public.notify(new.responsible_id, 'blocker', 'A blocker on ' || pname || ' is waiting on you', new.title, '/projects/' || new.project_id || '#blockers', new.project_id);
    end if;
  elsif new.status <> old.status then
    perform public.log_activity_row(new.organization_id, new.project_id, new.task_id,
      case when new.status = 'resolved' then 'blocker_resolved' else 'blocker_reopened' end,
      jsonb_build_object('title', new.title, 'side', new.side, 'days', greatest(0, extract(day from now() - new.created_at)::int), 'note', nullif(new.resolved_note, '')));
    if new.status = 'resolved' then
      perform public.notify(new.raised_by, 'blocker', 'Blocker resolved on ' || pname, new.title, '/projects/' || new.project_id || '#blockers', new.project_id);
    end if;
  elsif new.side <> old.side or new.responsible_id is distinct from old.responsible_id then
    perform public.log_activity_row(new.organization_id, new.project_id, new.task_id, 'blocker_reassigned',
      jsonb_build_object('title', new.title, 'from', public.blocker_side_label(old.side) || coalesce(' · ' || public.profile_name(old.responsible_id), ''),
        'to', public.blocker_side_label(new.side) || coalesce(' · ' || public.profile_name(new.responsible_id), '')));
    if new.responsible_id is not null and new.responsible_id is distinct from old.responsible_id then
      perform public.notify(new.responsible_id, 'blocker', 'A blocker on ' || pname || ' is waiting on you', new.title, '/projects/' || new.project_id || '#blockers', new.project_id);
    end if;
  end if;
  return null;
end $$;
create trigger blockers_audit after insert or update on public.blockers for each row execute function public.audit_blockers();

-- ---------------------------------------------------------------------------
-- History: record before -> after for every meaningful change.
-- ---------------------------------------------------------------------------
create or replace function public.audit_projects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.id, null, 'project_created',
      jsonb_build_object('name', new.name, 'manager', public.profile_name(new.manager_id)));
  else
    if new.status <> old.status then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_status_changed', jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.manager_id is distinct from old.manager_id then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_manager_changed',
        jsonb_build_object('from', public.profile_name(old.manager_id), 'to', public.profile_name(new.manager_id)));
    end if;
    if new.due_date is distinct from old.due_date then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_due_changed', jsonb_build_object('from', old.due_date, 'to', new.due_date));
    end if;
    if new.start_date is distinct from old.start_date then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_start_changed', jsonb_build_object('from', old.start_date, 'to', new.start_date));
    end if;
    if new.name <> old.name then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_renamed', jsonb_build_object('from', old.name, 'to', new.name));
    end if;
    if new.priority <> old.priority then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_priority_changed', jsonb_build_object('from', old.priority, 'to', new.priority));
    end if;
    if new.description is distinct from old.description then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_description_changed', '{}'::jsonb);
    end if;
  end if;
  return null;
end $$;

create or replace function public.audit_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_created',
      jsonb_build_object('title', new.title, 'assignee', public.profile_name(new.assignee_id)));
  elsif tg_op = 'UPDATE' then
    if new.assignee_id is distinct from old.assignee_id then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_assigned',
        jsonb_build_object('title', new.title, 'from', public.profile_name(old.assignee_id), 'to', public.profile_name(new.assignee_id)));
    end if;
    if new.status <> old.status then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_status_changed', jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
    end if;
    if new.due_date is distinct from old.due_date then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_due_changed', jsonb_build_object('title', new.title, 'from', old.due_date, 'to', new.due_date));
    end if;
    if new.priority <> old.priority then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_priority_changed', jsonb_build_object('title', new.title, 'from', old.priority, 'to', new.priority));
    end if;
    if new.title <> old.title then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_renamed', jsonb_build_object('from', old.title, 'to', new.title));
    end if;
  elsif exists (select 1 from public.projects where id = old.project_id) then
    perform public.log_activity_row(old.organization_id, old.project_id, null, 'task_deleted', jsonb_build_object('title', old.title));
  end if;
  return null;
end $$;

-- Time: logged (timer stopped or manual entry) and deleted.
create or replace function public.audit_time_entries() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.projects where id = old.project_id) and old.minutes is not null then
      perform public.log_activity_row(old.organization_id, old.project_id, old.task_id, 'time_deleted',
        jsonb_build_object('minutes', old.minutes, 'person', public.profile_name(old.profile_id), 'date', old.entry_date));
    end if;
  elsif new.minutes is not null and (tg_op = 'INSERT' or old.minutes is null) then
    perform public.log_activity_row(new.organization_id, new.project_id, new.task_id, 'time_logged',
      jsonb_build_object('minutes', new.minutes, 'date', new.entry_date, 'timer', new.started_at is not null));
  end if;
  return null;
end $$;
create trigger time_entries_audit after insert or update or delete on public.time_entries
  for each row execute function public.audit_time_entries();
