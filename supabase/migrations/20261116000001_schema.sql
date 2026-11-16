-- Seative Workspace: core schema
-- Every business table carries organization_id so data is partitioned per organization.


create type public.app_role as enum ('employee', 'pm', 'ceo');
create type public.project_status as enum ('planning', 'active', 'on_hold', 'completed');
create type public.priority as enum ('low', 'medium', 'high', 'urgent');
create type public.task_status as enum ('todo', 'in_progress', 'in_review', 'done');
create type public.artifact_kind as enum ('project_plan', 'progress_summary', 'risk_signal', 'org_summary');
create type public.artifact_status as enum ('open', 'reviewed', 'dismissed');

-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

-- One profile per Supabase Auth user. A user belongs to exactly one organization.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 120),
  email text not null,
  role public.app_role not null default 'employee',
  job_title text,
  created_at timestamptz not null default now()
);
create index profiles_org_idx on public.profiles (organization_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  description text not null default '' check (char_length(description) <= 5000),
  status public.project_status not null default 'planning',
  priority public.priority not null default 'medium',
  start_date date,
  due_date date,
  manager_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_dates check (start_date is null or due_date is null or due_date >= start_date)
);
create index projects_org_idx on public.projects (organization_id);
create index projects_manager_idx on public.projects (manager_id);
create index projects_status_idx on public.projects (organization_id, status);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, profile_id)
);
create index project_members_profile_idx on public.project_members (profile_id);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 10000),
  status public.task_status not null default 'todo',
  priority public.priority not null default 'medium',
  assignee_id uuid references public.profiles (id) on delete set null,
  start_date date,
  due_date date,
  position double precision not null default extract(epoch from now()),
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint task_dates check (start_date is null or due_date is null or due_date >= start_date)
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_org_status_idx on public.tasks (organization_id, status);
create index tasks_due_idx on public.tasks (organization_id, due_date);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 5000),
  is_progress_update boolean not null default false,
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_task_idx on public.comments (task_id, created_at desc);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  ai_assisted boolean not null default false,
  created_at timestamptz not null default now()
);
create index activity_org_idx on public.activity_log (organization_id, created_at desc);
create index activity_project_idx on public.activity_log (project_id, created_at desc);

create table public.ai_generated_artifacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  kind public.artifact_kind not null,
  content jsonb not null,
  model text,
  status public.artifact_status not null default 'open',
  created_by uuid references public.profiles (id) on delete set null,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index artifacts_project_idx on public.ai_generated_artifacts (project_id, kind, created_at desc);
create index artifacts_org_idx on public.ai_generated_artifacts (organization_id, kind, created_at desc);

-- updated_at maintenance
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
