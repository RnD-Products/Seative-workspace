-- Members may add their own tasks.
-- A project member can create a task in that project only when it is assigned to
-- themselves. They can then edit (except project/assignee) and delete it.
-- Assigning work to others, and every other task, stays with the CEO and the project's PM.

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
      if not is_manager and old.created_by = auth.uid() and old.assignee_id = auth.uid() then
        -- A member's own task (created by and assigned to them): every field is
        -- editable except the project and the assignee.
        if new.project_id <> old.project_id or new.assignee_id is distinct from old.assignee_id then
          raise exception 'You cannot move or reassign your own task; ask the project manager'
            using errcode = '42501';
        end if;
      elsif not is_manager then
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

drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (
    public.can_manage_project(project_id)
    or (public.is_project_member(project_id) and assignee_id = auth.uid())
  );

drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (
    public.can_manage_project(project_id)
    or (created_by = auth.uid() and assignee_id = auth.uid())
  );
