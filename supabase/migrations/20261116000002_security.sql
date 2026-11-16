-- Seative Workspace: access control
--
-- Model
--   * Organization boundary: every row is visible only to profiles in the same organization.
--   * CEO      : sees and manages every project in their organization; assigns project managers.
--   * PM       : creates projects (as their manager) and manages projects they manage.
--   * Employee : sees projects they are a member of; may update status/description of tasks
--                assigned to them and comment on tasks in their projects.
--
-- Enforcement lives here (RLS + guard triggers), so it holds no matter which client calls
-- the database — the web UI, a hand-crafted request, or server code that feeds AI prompts.
-- Helper functions are SECURITY DEFINER so policies can look up membership without
-- recursing through RLS; each pins search_path to avoid hijacking.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
create or replace function public.current_org_id() returns uuid
language sql stable security definer set search_path = public as $$
  select organization_id from public.profiles where id = auth.uid()
$$;

create or replace function public.app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_ceo() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'ceo' from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_project_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = pid and profile_id = auth.uid())
$$;

create or replace function public.can_view_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid
      and p.organization_id = public.current_org_id()
      and (public.is_ceo() or p.manager_id = auth.uid() or public.is_project_member(p.id))
  )
$$;

create or replace function public.can_manage_project(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid
      and p.organization_id = public.current_org_id()
      and (public.is_ceo() or (p.manager_id = auth.uid() and public.app_role() in ('pm', 'ceo')))
  )
$$;

create or replace function public.can_view_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tasks t where t.id = tid and public.can_view_project(t.project_id))
$$;

-- ---------------------------------------------------------------------------
-- Guard triggers: server-assigned columns and per-role column restrictions.
-- auth.uid() is null for the service role (admin scripts), which is trusted.
-- ---------------------------------------------------------------------------

create or replace function public.guard_profiles() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if new.organization_id <> old.organization_id or new.email <> old.email or new.id <> old.id then
    raise exception 'Organization and email cannot be changed here' using errcode = '42501';
  end if;
  if new.role <> old.role then
    if not public.is_ceo() or old.organization_id <> public.current_org_id() then
      raise exception 'Only the CEO can change roles' using errcode = '42501';
    end if;
    if old.role = 'ceo' and not exists (
      select 1 from public.profiles where organization_id = old.organization_id and role = 'ceo' and id <> old.id
    ) then
      raise exception 'The organization must keep at least one CEO' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profiles();

create or replace function public.assert_manager_valid(mid uuid, org uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if mid is not null and not exists (
    select 1 from public.profiles where id = mid and organization_id = org and role in ('pm', 'ceo')
  ) then
    raise exception 'Project manager must be a PM or CEO in this organization' using errcode = '42501';
  end if;
end $$;

create or replace function public.guard_projects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    perform public.assert_manager_valid(new.manager_id, new.organization_id);
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.organization_id := public.current_org_id();
    new.created_by := auth.uid();
    if public.app_role() = 'pm' then
      new.manager_id := auth.uid(); -- PMs always manage the projects they create
    end if;
  else
    if new.organization_id <> old.organization_id then
      raise exception 'Projects cannot move between organizations' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    if new.manager_id is distinct from old.manager_id and not public.is_ceo() then
      raise exception 'Only the CEO can change the project manager' using errcode = '42501';
    end if;
  end if;
  perform public.assert_manager_valid(new.manager_id, new.organization_id);
  return new;
end $$;
create trigger projects_guard before insert or update on public.projects
  for each row execute function public.guard_projects();

create or replace function public.guard_project_members() returns trigger
language plpgsql security definer set search_path = public as $$
declare proj_org uuid;
begin
  select organization_id into proj_org from public.projects where id = new.project_id;
  new.organization_id := proj_org;
  if not exists (select 1 from public.profiles where id = new.profile_id and organization_id = proj_org) then
    raise exception 'Member must belong to the same organization' using errcode = '42501';
  end if;
  if auth.uid() is not null then new.added_by := auth.uid(); end if;
  return new;
end $$;
create trigger project_members_guard before insert on public.project_members
  for each row execute function public.guard_project_members();

create or replace function public.guard_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  proj record;
  is_manager boolean;
begin
  select id, organization_id, manager_id into proj from public.projects where id = new.project_id;
  if proj.id is null then
    raise exception 'Project not found' using errcode = '23503';
  end if;

  if tg_op = 'INSERT' then
    new.organization_id := proj.organization_id;
    if auth.uid() is not null then new.created_by := auth.uid(); end if;
  else
    if new.organization_id <> old.organization_id then
      raise exception 'Tasks cannot move between organizations' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    if auth.uid() is not null then
      is_manager := public.can_manage_project(old.project_id)
        and (new.project_id = old.project_id or public.can_manage_project(new.project_id));
      if not is_manager then
        -- Assignees may only change status, ordering and description of their own task.
        if old.assignee_id is distinct from auth.uid()
           or new.project_id <> old.project_id
           or new.title <> old.title
           or new.priority <> old.priority
           or new.assignee_id is distinct from old.assignee_id
           or new.start_date is distinct from old.start_date
           or new.due_date is distinct from old.due_date then
          raise exception 'You can only update the status or description of tasks assigned to you'
            using errcode = '42501';
        end if;
      end if;
    end if;
  end if;

  -- Assignee must be on the project (member or its manager).
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id or new.project_id <> old.project_id)
     and new.assignee_id is distinct from proj.manager_id
     and not exists (select 1 from public.project_members where project_id = new.project_id and profile_id = new.assignee_id) then
    raise exception 'Assignee must be a member of the project' using errcode = '42501';
  end if;

  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then
    new.completed_at := now();
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$;
create trigger tasks_guard before insert or update on public.tasks
  for each row execute function public.guard_tasks();

create or replace function public.guard_comments() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select organization_id into new.organization_id from public.tasks where id = new.task_id;
  if auth.uid() is not null then new.author_id := auth.uid(); end if;
  return new;
end $$;
create trigger comments_guard before insert on public.comments
  for each row execute function public.guard_comments();

create or replace function public.guard_artifacts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.organization_id := public.current_org_id();
    new.created_by := auth.uid();
    new.status := 'open';
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    -- Generated content is immutable; only the review state may change.
    if new.content <> old.content or new.kind <> old.kind or new.project_id is distinct from old.project_id
       or new.organization_id <> old.organization_id or new.created_by is distinct from old.created_by then
      raise exception 'AI artifacts are read-only apart from review status' using errcode = '42501';
    end if;
    if new.status <> old.status then
      new.reviewed_by := auth.uid();
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end $$;
create trigger artifacts_guard before insert or update on public.ai_generated_artifacts
  for each row execute function public.guard_artifacts();

-- ---------------------------------------------------------------------------
-- Activity log: written by the database so it cannot be skipped or forged.
-- ---------------------------------------------------------------------------
create or replace function public.log_activity_row(
  org uuid, pid uuid, tid uuid, act text, det jsonb, ai boolean default false
) returns void
language sql security definer set search_path = public as $$
  insert into public.activity_log (organization_id, project_id, task_id, actor_id, action, details, ai_assisted)
  values (org, pid, tid, auth.uid(), act, coalesce(det, '{}'::jsonb), ai)
$$;
revoke execute on function public.log_activity_row(uuid, uuid, uuid, text, jsonb, boolean) from public, anon, authenticated;

create or replace function public.profile_name(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select full_name from public.profiles where id = pid
$$;

create or replace function public.audit_projects() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.id, null, 'project_created',
      jsonb_build_object('name', new.name, 'manager', public.profile_name(new.manager_id)));
  else
    if new.status <> old.status then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_status_changed',
        jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.manager_id is distinct from old.manager_id then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_manager_changed',
        jsonb_build_object('to', public.profile_name(new.manager_id)));
    end if;
    if new.due_date is distinct from old.due_date then
      perform public.log_activity_row(new.organization_id, new.id, null, 'project_due_changed',
        jsonb_build_object('from', old.due_date, 'to', new.due_date));
    end if;
  end if;
  return null;
end $$;
create trigger projects_audit after insert or update on public.projects
  for each row execute function public.audit_projects();

create or replace function public.audit_project_members() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.project_id, null, 'member_added',
      jsonb_build_object('member', public.profile_name(new.profile_id)));
  elsif exists (select 1 from public.projects where id = old.project_id) then
    perform public.log_activity_row(old.organization_id, old.project_id, null, 'member_removed',
      jsonb_build_object('member', public.profile_name(old.profile_id)));
  end if;
  return null;
end $$;
create trigger project_members_audit after insert or delete on public.project_members
  for each row execute function public.audit_project_members();

create or replace function public.audit_tasks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_created',
      jsonb_build_object('title', new.title, 'assignee', public.profile_name(new.assignee_id)));
  elsif tg_op = 'UPDATE' then
    if new.assignee_id is distinct from old.assignee_id then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_assigned',
        jsonb_build_object('title', new.title, 'to', public.profile_name(new.assignee_id)));
    end if;
    if new.status <> old.status then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_status_changed',
        jsonb_build_object('title', new.title, 'from', old.status, 'to', new.status));
    end if;
    if new.due_date is distinct from old.due_date then
      perform public.log_activity_row(new.organization_id, new.project_id, new.id, 'task_due_changed',
        jsonb_build_object('title', new.title, 'from', old.due_date, 'to', new.due_date));
    end if;
  elsif exists (select 1 from public.projects where id = old.project_id) then
    perform public.log_activity_row(old.organization_id, old.project_id, null, 'task_deleted',
      jsonb_build_object('title', old.title));
  end if;
  return null;
end $$;
create trigger tasks_audit after insert or update or delete on public.tasks
  for each row execute function public.audit_tasks();

create or replace function public.audit_comments() returns trigger
language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select project_id, title into t from public.tasks where id = new.task_id;
  perform public.log_activity_row(new.organization_id, t.project_id, new.task_id,
    case when new.is_progress_update then 'progress_update_posted' else 'comment_added' end,
    jsonb_build_object('title', t.title), new.ai_assisted);
  return null;
end $$;
create trigger comments_audit after insert on public.comments
  for each row execute function public.audit_comments();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;
alter table public.comments enable row level security;
alter table public.activity_log enable row level security;
alter table public.ai_generated_artifacts enable row level security;

-- organizations
create policy org_select on public.organizations for select to authenticated
  using (id = public.current_org_id());
create policy org_update on public.organizations for update to authenticated
  using (id = public.current_org_id() and public.is_ceo())
  with check (id = public.current_org_id() and public.is_ceo());

-- profiles: coworkers are visible (names/roles needed for assignment). Inserts happen via
-- the setup RPC or the service role (CEO "add member" server action).
create policy profiles_select on public.profiles for select to authenticated
  using (organization_id = public.current_org_id());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or (public.is_ceo() and organization_id = public.current_org_id()))
  with check (organization_id = public.current_org_id());

-- projects (select uses row columns directly so INSERT ... RETURNING works)
create policy projects_select on public.projects for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (public.is_ceo() or manager_id = auth.uid() or public.is_project_member(id))
  );
create policy projects_insert on public.projects for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and public.app_role() in ('pm', 'ceo')
    and (public.is_ceo() or manager_id = auth.uid())
  );
create policy projects_update on public.projects for update to authenticated
  using (public.can_manage_project(id))
  with check (organization_id = public.current_org_id());
create policy projects_delete on public.projects for delete to authenticated
  using (public.can_manage_project(id));

-- project members
create policy pm_select on public.project_members for select to authenticated
  using (public.can_view_project(project_id));
create policy pm_insert on public.project_members for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy pm_delete on public.project_members for delete to authenticated
  using (public.can_manage_project(project_id));

-- tasks
create policy tasks_select on public.tasks for select to authenticated
  using (organization_id = public.current_org_id() and public.can_view_project(project_id));
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.can_manage_project(project_id));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_manage_project(project_id) or assignee_id = auth.uid())
  with check (public.can_manage_project(project_id) or assignee_id = auth.uid());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.can_manage_project(project_id));

-- comments
create policy comments_select on public.comments for select to authenticated
  using (organization_id = public.current_org_id() and public.can_view_task(task_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.can_view_task(task_id));
create policy comments_delete on public.comments for delete to authenticated
  using (author_id = auth.uid());

-- activity log: readable per project access; org-level entries for the CEO or their own actor.
-- Direct inserts are limited to AI-assistance records about things the user can see.
create policy activity_select on public.activity_log for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      (project_id is not null and public.can_view_project(project_id))
      or (project_id is null and (public.is_ceo() or actor_id = auth.uid()))
    )
  );
create policy activity_insert_ai on public.activity_log for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and actor_id = auth.uid()
    and ai_assisted = true
    and action like 'ai\_%'
    and ((project_id is null and public.is_ceo()) or public.can_view_project(project_id))
  );

-- AI artifacts: project-level artifacts for people who manage the project; org summaries for the CEO.
create policy artifacts_select on public.ai_generated_artifacts for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      (kind = 'org_summary' and public.is_ceo())
      or (project_id is not null and kind <> 'org_summary' and public.can_manage_project(project_id))
    )
  );
create policy artifacts_insert on public.ai_generated_artifacts for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and (
      (kind = 'org_summary' and project_id is null and public.is_ceo())
      or (project_id is not null and kind <> 'org_summary' and public.can_manage_project(project_id))
    )
  );
create policy artifacts_update on public.ai_generated_artifacts for update to authenticated
  using (
    organization_id = public.current_org_id()
    and ((kind = 'org_summary' and public.is_ceo()) or (project_id is not null and public.can_manage_project(project_id)))
  )
  with check (organization_id = public.current_org_id());

-- ---------------------------------------------------------------------------
-- First-run setup
-- ---------------------------------------------------------------------------
create or replace function public.setup_available() returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.organizations)
$$;

-- Creates the organization and makes the signed-in caller its CEO.
-- Only works while no organization exists, so it cannot be used to take over a workspace.
create or replace function public.create_organization(org_name text, ceo_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  new_org uuid;
  user_email text;
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  -- Serialize concurrent setup attempts.
  lock table public.organizations in exclusive mode;
  if exists (select 1 from public.organizations) then
    raise exception 'Setup has already been completed' using errcode = '42501';
  end if;
  if exists (select 1 from public.profiles where id = uid) then
    raise exception 'This account already belongs to an organization' using errcode = '42501';
  end if;
  if char_length(trim(org_name)) = 0 or char_length(trim(ceo_name)) = 0 then
    raise exception 'Organization and name are required' using errcode = '22023';
  end if;
  select email into user_email from auth.users where id = uid;
  insert into public.organizations (name) values (trim(org_name)) returning id into new_org;
  insert into public.profiles (id, organization_id, full_name, email, role)
    values (uid, new_org, trim(ceo_name), coalesce(user_email, ''), 'ceo');
  return new_org;
end $$;

revoke execute on function public.create_organization(text, text) from public, anon;
grant execute on function public.create_organization(text, text) to authenticated;
grant execute on function public.setup_available() to anon, authenticated;

-- Anonymous visitors may only check whether first-run setup is available.
revoke execute on all functions in schema public from anon;
grant execute on function public.setup_available() to anon;
