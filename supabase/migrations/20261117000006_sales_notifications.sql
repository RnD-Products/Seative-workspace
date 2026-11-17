-- Phase 2A: Sales role, sales info per project, Incoming projects, skill tags,
-- notifications and deadline reminders.

-- ---------------------------------------------------------------------------
-- People: skill tags and notification preferences
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists skills text[] not null default '{}';
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

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
  if new.skills is distinct from old.skills and not public.is_ceo() then
    raise exception 'Only the CEO can change skill tags' using errcode = '42501';
  end if;
  if new.notification_prefs is distinct from old.notification_prefs and new.id <> auth.uid() then
    raise exception 'People choose their own notifications' using errcode = '42501';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Sales info (one row per project). Separate table so money never reaches employees.
-- ---------------------------------------------------------------------------
create table if not exists public.project_sales (
  project_id uuid primary key references public.projects (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sales_owner_id uuid references public.profiles (id) on delete set null,
  client_name text not null check (char_length(client_name) between 1 and 200),
  client_contact_name text not null default '' check (char_length(client_contact_name) <= 200),
  client_email text not null default '' check (char_length(client_email) <= 200),
  client_phone text not null default '' check (char_length(client_phone) <= 50),
  deal_source text not null default 'direct' check (deal_source in ('direct', 'referral', 'upwork', 'fiverr', 'linkedin', 'other')),
  deal_date date,
  client_deadline date,
  budget numeric(14, 2) check (budget is null or budget >= 0),
  contract_amount numeric(14, 2) check (contract_amount is null or contract_amount >= 0),
  currency text not null default 'BDT' check (currency in ('BDT', 'USD')),
  advance_received numeric(14, 2) not null default 0 check (advance_received >= 0),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'advance_paid', 'partially_paid', 'fully_paid')),
  scope_summary text not null default '' check (char_length(scope_summary) <= 4000),
  team_requirements text not null default '' check (char_length(team_requirements) <= 2000),
  requirement_tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists project_sales_owner_idx on public.project_sales (sales_owner_id);
create trigger project_sales_touch before update on public.project_sales
  for each row execute function public.touch_updated_at();

create or replace function public.is_sales_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_sales where project_id = pid and sales_owner_id = auth.uid())
$$;

-- Who may read a project's money: the CEO, its salesperson, and PMs (projects they manage, and Incoming ones).
create or replace function public.can_view_sales(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = pid and p.organization_id = public.current_org_id()
      and (
        public.is_ceo()
        or public.is_sales_owner(p.id)
        or (public.app_role()::text = 'pm' and (p.manager_id = auth.uid() or (p.status::text = 'incoming' and p.manager_id is null)))
      )
  )
$$;

create or replace function public.guard_project_sales() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select organization_id into new.organization_id from public.projects where id = new.project_id;
  if new.organization_id is null then raise exception 'Project not found' using errcode = '23503'; end if;
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    if not public.is_ceo() or new.sales_owner_id is null then new.sales_owner_id := auth.uid(); end if;
  else
    if new.project_id <> old.project_id then raise exception 'Sales info cannot move between projects' using errcode = '42501'; end if;
    if new.sales_owner_id is distinct from old.sales_owner_id and not public.is_ceo() then
      raise exception 'Only the CEO can change the salesperson' using errcode = '42501';
    end if;
  end if;
  if new.sales_owner_id is not null and not exists (
    select 1 from public.profiles where id = new.sales_owner_id and organization_id = new.organization_id and role::text in ('sales', 'ceo')
  ) then
    raise exception 'The salesperson must have the Sales or CEO role' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger project_sales_guard before insert or update on public.project_sales
  for each row execute function public.guard_project_sales();

-- Audit: record which fields changed, never the amounts (the log is visible to the whole project team;
-- sales entries are additionally hidden from people who cannot see sales info, below).
create or replace function public.audit_project_sales() returns trigger
language plpgsql security definer set search_path = public as $$
declare changed text[] := '{}'; k text;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity_row(new.organization_id, new.project_id, null, 'sales_created', jsonb_build_object('client', new.client_name));
  else
    foreach k in array array['client_name','client_contact_name','client_email','client_phone','deal_source','deal_date','client_deadline','budget','contract_amount','currency','advance_received','payment_status','scope_summary','team_requirements','requirement_tags'] loop
      if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then changed := changed || k; end if;
    end loop;
    if array_length(changed, 1) > 0 then
      perform public.log_activity_row(new.organization_id, new.project_id, null, 'sales_updated',
        jsonb_build_object('fields', to_jsonb(changed),
          'payment_status', case when new.payment_status <> old.payment_status then jsonb_build_object('from', old.payment_status, 'to', new.payment_status) end));
    end if;
  end if;
  return null;
end $$;
create trigger project_sales_audit after insert or update on public.project_sales
  for each row execute function public.audit_project_sales();

alter table public.project_sales enable row level security;
create policy sales_select on public.project_sales for select to authenticated
  using (organization_id = public.current_org_id() and (sales_owner_id = auth.uid() or public.can_view_sales(project_id)));
create policy sales_insert on public.project_sales for insert to authenticated
  with check (
    public.is_ceo()
    or (public.app_role()::text = 'sales' and exists (select 1 from public.projects p where p.id = project_id and p.created_by = auth.uid()))
  );
create policy sales_update on public.project_sales for update to authenticated
  using (public.is_ceo() or sales_owner_id = auth.uid())
  with check (public.is_ceo() or sales_owner_id = auth.uid());
create policy sales_delete on public.project_sales for delete to authenticated using (public.is_ceo());
grant select, insert, update, delete on public.project_sales to authenticated;
revoke all on public.project_sales from anon;

-- ---------------------------------------------------------------------------
-- Projects: Sales creates Incoming projects; PMs see and take Incoming ones.
-- ---------------------------------------------------------------------------
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
    if public.app_role()::text = 'pm' then
      new.manager_id := auth.uid(); -- PMs always manage the projects they create
    elsif public.app_role()::text = 'sales' then
      new.manager_id := null;       -- a deal arrives without a PM
      new.status := 'incoming';
    end if;
  else
    if new.organization_id <> old.organization_id then
      raise exception 'Projects cannot move between organizations' using errcode = '42501';
    end if;
    new.created_by := old.created_by;
    if new.manager_id is distinct from old.manager_id and not public.is_ceo() then
      -- A PM may take an unassigned Incoming project for themselves, nothing else.
      if not (old.manager_id is null and old.status::text = 'incoming' and new.manager_id = auth.uid() and public.app_role()::text = 'pm') then
        raise exception 'Only the CEO can change the project manager' using errcode = '42501';
      end if;
    end if;
  end if;
  perform public.assert_manager_valid(new.manager_id, new.organization_id);
  return new;
end $$;

drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      public.is_ceo() or manager_id = auth.uid() or public.is_project_member(id)
      or public.is_sales_owner(id)
      or (status::text = 'incoming' and manager_id is null and public.app_role()::text = 'pm')
      or (created_by = auth.uid() and public.app_role()::text = 'sales')
    )
  );
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (
    organization_id = public.current_org_id()
    and (
      (public.app_role()::text in ('pm', 'ceo') and (public.is_ceo() or manager_id = auth.uid()))
      or (public.app_role()::text = 'sales' and manager_id is null and status::text = 'incoming')
    )
  );
create policy projects_claim on public.projects for update to authenticated
  using (organization_id = public.current_org_id() and status::text = 'incoming' and manager_id is null and public.app_role()::text = 'pm')
  with check (manager_id = auth.uid());

-- Salespeople see who is on their deals.
create policy pm_select_sales on public.project_members for select to authenticated
  using (public.is_sales_owner(project_id));

-- Activity: sales entries only for people who may see sales info.
drop policy if exists activity_select on public.activity_log;
create policy activity_select on public.activity_log for select to authenticated
  using (
    organization_id = public.current_org_id()
    and (
      (project_id is not null and public.can_view_project(project_id) and (action not like 'sales\_%' or public.can_view_sales(project_id)))
      or (project_id is not null and action like 'sales\_%' and public.can_view_sales(project_id))
      or (project_id is null and (public.is_ceo() or actor_id = auth.uid()))
    )
  );

-- Progress for salespeople, who cannot read tasks: counts only.
create or replace function public.deal_task_rows()
returns table (project_id uuid, status public.task_status, due_date date)
language sql stable security definer set search_path = public as $$
  select t.project_id, t.status, t.due_date from public.tasks t
  join public.project_sales s on s.project_id = t.project_id
  where s.sales_owner_id = auth.uid() and t.organization_id = public.current_org_id()
$$;
revoke execute on function public.deal_task_rows() from anon;
grant execute on function public.deal_task_rows() to authenticated;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null default '',
  link text not null default '',
  project_id uuid references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create unique index if not exists notifications_dedupe on public.notifications (recipient_id, dedupe_key) where dedupe_key is not null;

alter table public.notifications enable row level security;
create policy notif_select on public.notifications for select to authenticated using (recipient_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (recipient_id = auth.uid());
grant select, update, delete on public.notifications to authenticated;
revoke all on public.notifications from anon;

-- Only read_at may change from the app.
create or replace function public.guard_notifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.recipient_id <> old.recipient_id or new.kind <> old.kind or new.title <> old.title or new.body <> old.body or new.link <> old.link) then
    raise exception 'Only the read state of a notification can change' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger notifications_guard before update on public.notifications
  for each row execute function public.guard_notifications();

-- Send one notification, respecting the recipient's preferences; never to the person who caused it.
create or replace function public.notify(rid uuid, k text, ttl text, bdy text, lnk text, pid uuid, dkey text default null)
returns void language plpgsql security definer set search_path = public as $$
declare prefs jsonb; org uuid;
begin
  if rid is null or rid = auth.uid() then return; end if;
  select notification_prefs, organization_id into prefs, org from public.profiles where id = rid;
  if org is null or coalesce((prefs ->> k)::boolean, true) = false then return; end if;
  insert into public.notifications (organization_id, recipient_id, kind, title, body, link, project_id, actor_id, dedupe_key)
  values (org, rid, k, ttl, coalesce(bdy, ''), coalesce(lnk, ''), pid, auth.uid(), dkey)
  on conflict do nothing;
end $$;
revoke execute on function public.notify(uuid, text, text, text, text, uuid, text) from public, anon, authenticated;

-- Events
create or replace function public.notify_task_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text := coalesce(public.profile_name(auth.uid()), 'Someone');
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform public.notify(new.assignee_id, 'task_assigned', who || ' assigned you a task', new.title, '/tasks/' || new.id, new.project_id);
  end if;
  return null;
end $$;
create trigger tasks_notify after insert or update of assignee_id on public.tasks
  for each row execute function public.notify_task_events();

create or replace function public.notify_member_added() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select name into pname from public.projects where id = new.project_id;
  perform public.notify(new.profile_id, 'project_added', 'You were added to ' || pname,
    coalesce(public.profile_name(auth.uid()), 'Your project manager') || ' added you to the team.', '/projects/' || new.project_id, new.project_id);
  return null;
end $$;
create trigger project_members_notify after insert on public.project_members
  for each row execute function public.notify_member_added();

create or replace function public.notify_project_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; owner uuid;
begin
  if tg_op = 'INSERT' and new.status::text = 'incoming' then
    for r in select id from public.profiles where organization_id = new.organization_id and role::text in ('pm', 'ceo') loop
      perform public.notify(r.id, 'incoming_project', 'New incoming project: ' || new.name,
        coalesce(public.profile_name(auth.uid()), 'Sales') || ' added a new deal. Pick a PM and team.', '/incoming', new.id);
    end loop;
  elsif tg_op = 'UPDATE' then
    select sales_owner_id into owner from public.project_sales where project_id = new.id;
    if new.manager_id is distinct from old.manager_id and new.manager_id is not null then
      perform public.notify(new.manager_id, 'project_added', 'You are now managing ' || new.name, 'Pick the team and start the project.', '/projects/' || new.id || '/start', new.id);
    end if;
    if old.status::text = 'incoming' and new.status::text <> 'incoming' then
      perform public.notify(owner, 'team_assigned', 'Team assigned to ' || new.name,
        coalesce(public.profile_name(new.manager_id), 'A PM') || ' started the project.', '/projects/' || new.id, new.id);
    end if;
  end if;
  return null;
end $$;
create trigger projects_notify after insert or update on public.projects
  for each row execute function public.notify_project_events();

-- ---------------------------------------------------------------------------
-- Deadline reminders: 2 working days before a project's due date (Fri/Sat are off),
-- and the day after a missed deadline. To the CEO(s) and the project's PM.
-- ---------------------------------------------------------------------------
create or replace function public.minus_working_days(d date, n int) returns date
language plpgsql immutable as $$
declare r date := d; remaining int := n;
begin
  while remaining > 0 loop
    r := r - 1;
    if extract(isodow from r) not in (5, 6) then remaining := remaining - 1; end if; -- 5 = Fri, 6 = Sat
  end loop;
  return r;
end $$;

create or replace function public.send_deadline_reminders(today date default (now() at time zone 'Asia/Dhaka')::date)
returns integer language plpgsql security definer set search_path = public as $$
declare p record; r record; total int; done int; open_tasks int; pct int; sent int := 0; msg text; before_count int;
begin
  for p in
    select * from public.projects
    where status::text not in ('completed') and due_date is not null
      and (public.minus_working_days(due_date, 2) = today or due_date = today - 1)
  loop
    select count(*), count(*) filter (where status = 'done') into total, done from public.tasks where project_id = p.id;
    open_tasks := total - done;
    pct := case when total > 0 then round(done * 100.0 / total) else 0 end;
    msg := pct || '% done · ' || open_tasks || ' open ' || case when open_tasks = 1 then 'task' else 'tasks' end;
    for r in
      select id from public.profiles where organization_id = p.organization_id and (role::text = 'ceo' or id = p.manager_id)
    loop
      select count(*) into before_count from public.notifications where recipient_id = r.id;
      if p.due_date = today - 1 then
        perform public.notify(r.id, 'deadline_reminder', p.name || ' missed its deadline (' || to_char(p.due_date, 'Dy DD Mon') || ')', msg, '/projects/' || p.id, p.id, 'overdue:' || p.id || ':' || p.due_date);
      else
        perform public.notify(r.id, 'deadline_reminder', p.name || ' is due ' || to_char(p.due_date, 'Dy DD Mon'), msg, '/projects/' || p.id, p.id, 'deadline:' || p.id || ':' || p.due_date);
      end if;
      if (select count(*) from public.notifications where recipient_id = r.id) > before_count then sent := sent + 1; end if;
    end loop;
  end loop;
  return sent;
end $$;
revoke execute on function public.send_deadline_reminders(date) from public, anon, authenticated;

-- Run it every day at 09:00 Dhaka (03:00 UTC) where pg_cron is available (Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.unschedule(jobid) from cron.job where jobname = 'deadline-reminders';
      perform cron.schedule('deadline-reminders', '0 3 * * *', 'select public.send_deadline_reminders()');
    exception when others then
      raise notice 'pg_cron not available (%): schedule send_deadline_reminders() another way', sqlerrm;
    end;
  end if;
end $$;
