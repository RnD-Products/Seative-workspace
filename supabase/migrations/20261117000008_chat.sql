-- Phase 2C: chat. One-to-one (DM) chats and one team chat per project.
-- Messages can be edited by their author (every earlier version is kept) but never deleted.
-- DMs are private to the two people in them: the CEO cannot read other people's DMs.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('dm', 'project')),
  project_id uuid unique references public.projects (id) on delete cascade,
  dm_key text unique,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  check ((kind = 'project') = (project_id is not null)),
  check ((kind = 'dm') = (dm_key is not null))
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index if not exists conversation_members_profile_idx on public.conversation_members (profile_id);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  mentions uuid[] not null default '{}',
  edited_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at desc);

create table if not exists public.message_edits (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  previous_body text not null,
  edited_at timestamptz not null default now()
);
create index if not exists message_edits_message_idx on public.message_edits (message_id, edited_at);

-- Who can open a conversation.
create or replace function public.can_access_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.conversations c
    where c.id = cid and c.organization_id = public.current_org_id() and (
      (c.kind = 'dm' and exists (select 1 from public.conversation_members m where m.conversation_id = c.id and m.profile_id = auth.uid()))
      or (c.kind = 'project' and (public.can_view_project(c.project_id) or public.is_sales_owner(c.project_id)))
    )
  )
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_edits enable row level security;

drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated using (public.can_access_conversation(id));

drop policy if exists conv_members_select on public.conversation_members;
create policy conv_members_select on public.conversation_members for select to authenticated using (public.can_access_conversation(conversation_id));
drop policy if exists conv_members_update on public.conversation_members;
create policy conv_members_update on public.conversation_members for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated using (public.can_access_conversation(conversation_id));
drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages for insert to authenticated
  with check (author_id = auth.uid() and organization_id = public.current_org_id() and public.can_access_conversation(conversation_id));
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
-- No delete policy on purpose.

drop policy if exists message_edits_select on public.message_edits;
create policy message_edits_select on public.message_edits for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.can_access_conversation(m.conversation_id)));

-- Guards
create or replace function public.guard_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    -- Only allowed as part of deleting the whole project or organisation (cascade).
    if pg_trigger_depth() <= 1 then raise exception 'Messages cannot be deleted'; end if;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.organization_id := public.current_org_id();
    new.body := btrim(new.body);
    new.edited_at := null;
    new.created_at := now();
    return new;
  end if;
  -- UPDATE: only the text can change, only by the author.
  if old.author_id is distinct from auth.uid() then raise exception 'You can only edit your own messages'; end if;
  if new.conversation_id <> old.conversation_id or new.author_id <> old.author_id or new.created_at <> old.created_at
     or new.organization_id <> old.organization_id then
    raise exception 'Only the message text can be edited';
  end if;
  new.body := btrim(new.body);
  if new.body is distinct from old.body then
    insert into public.message_edits (message_id, previous_body) values (old.id, old.body);
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end $$;
drop trigger if exists guard_messages on public.messages;
create trigger guard_messages before insert or update or delete on public.messages for each row execute function public.guard_messages();

create or replace function public.guard_message_edits() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' and pg_trigger_depth() <= 1 then raise exception 'Edit history cannot be deleted'; end if;
  if tg_op = 'UPDATE' then raise exception 'Edit history cannot be changed'; end if;
  return coalesce(old, new);
end $$;
drop trigger if exists guard_message_edits on public.message_edits;
create trigger guard_message_edits before update or delete on public.message_edits for each row execute function public.guard_message_edits();

create or replace function public.guard_conv_members() returns trigger
language plpgsql as $$
begin
  if new.conversation_id <> old.conversation_id or new.profile_id <> old.profile_id then raise exception 'Not allowed'; end if;
  return new;
end $$;
drop trigger if exists guard_conv_members on public.conversation_members;
create trigger guard_conv_members before update on public.conversation_members for each row execute function public.guard_conv_members();

-- A team chat for every project, now and in future.
create or replace function public.create_project_chat() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.conversations (organization_id, kind, project_id) values (new.organization_id, 'project', new.id)
  on conflict (project_id) do nothing;
  return new;
end $$;
drop trigger if exists create_project_chat on public.projects;
create trigger create_project_chat after insert on public.projects for each row execute function public.create_project_chat();
insert into public.conversations (organization_id, kind, project_id)
  select organization_id, 'project', id from public.projects on conflict (project_id) do nothing;

-- Open (or create) the DM with someone in the same company.
create or replace function public.open_dm(other uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); org uuid := public.current_org_id(); k text; cid uuid;
begin
  if me is null or other is null or other = me then raise exception 'Pick someone else to chat with'; end if;
  if not exists (select 1 from public.profiles where id = other and organization_id = org) then raise exception 'Person not found'; end if;
  k := least(me::text, other::text) || ':' || greatest(me::text, other::text);
  select id into cid from public.conversations where dm_key = k;
  if cid is null then
    insert into public.conversations (organization_id, kind, dm_key) values (org, 'dm', k)
    on conflict (dm_key) do update set dm_key = excluded.dm_key returning id into cid;
    insert into public.conversation_members (conversation_id, profile_id) values (cid, me), (cid, other) on conflict do nothing;
  end if;
  return cid;
end $$;
revoke execute on function public.open_dm(uuid) from public, anon;
grant execute on function public.open_dm(uuid) to authenticated;

-- Mark a conversation read (creates the read marker for project chats on first visit).
create or replace function public.mark_chat_read(cid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.can_access_conversation(cid) then raise exception 'Not allowed'; end if;
  insert into public.conversation_members (conversation_id, profile_id, last_read_at) values (cid, auth.uid(), now())
  on conflict (conversation_id, profile_id) do update set last_read_at = now();
end $$;
revoke execute on function public.mark_chat_read(uuid) from public, anon;
grant execute on function public.mark_chat_read(uuid) to authenticated;

-- My conversations with unread counts. Project chats only appear once they have a message
-- (or the person has opened them).
create or replace function public.my_chats()
returns table (id uuid, kind text, project_id uuid, other_id uuid, last_message_at timestamptz, unread int, last_body text, last_author uuid)
language sql stable security definer set search_path = public as $$
  with mine as (
    select c.*, m.last_read_at
    from public.conversations c
    left join public.conversation_members m on m.conversation_id = c.id and m.profile_id = auth.uid()
    where c.organization_id = public.current_org_id() and public.can_access_conversation(c.id)
      and (c.last_message_at is not null or m.profile_id is not null)
  )
  select mine.id, mine.kind, mine.project_id,
    (select cm.profile_id from public.conversation_members cm where cm.conversation_id = mine.id and cm.profile_id <> auth.uid() and mine.kind = 'dm' limit 1),
    mine.last_message_at,
    (select count(*)::int from public.messages x where x.conversation_id = mine.id and x.author_id <> auth.uid()
       and x.created_at > coalesce(mine.last_read_at, '-infinity'::timestamptz)),
    l.body, l.author_id
  from mine
  left join lateral (select body, author_id from public.messages x where x.conversation_id = mine.id order by created_at desc limit 1) l on true
  order by mine.last_message_at desc nulls last
$$;
revoke execute on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;

-- After a message: bump the conversation, notify the other DM person and anyone @mentioned.
create or replace function public.after_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.conversations; who text := coalesce(public.profile_name(new.author_id), 'Someone');
        pname text; r uuid; lr timestamptz; snippet text := left(new.body, 140);
begin
  select * into c from public.conversations where id = new.conversation_id;
  update public.conversations set last_message_at = new.created_at where id = c.id;
  -- The author has read their own conversation.
  insert into public.conversation_members (conversation_id, profile_id, last_read_at) values (c.id, new.author_id, new.created_at)
  on conflict (conversation_id, profile_id) do update set last_read_at = excluded.last_read_at;
  if c.kind = 'dm' then
    for r, lr in select profile_id, last_read_at from public.conversation_members where conversation_id = c.id and profile_id <> new.author_id loop
      -- One notification per unread stretch, not one per message.
      perform public.notify(r, 'chat_message', 'New message from ' || who, snippet, '/messages/' || c.id, null,
        'dm:' || c.id || ':' || extract(epoch from lr)::bigint);
    end loop;
  else
    select name into pname from public.projects where id = c.project_id;
    foreach r in array new.mentions loop
      if r <> new.author_id and exists (
        select 1 from public.profiles p where p.id = r and p.organization_id = c.organization_id and (
          p.role = 'ceo'
          or exists (select 1 from public.projects pr where pr.id = c.project_id and pr.manager_id = r)
          or exists (select 1 from public.project_members pm where pm.project_id = c.project_id and pm.profile_id = r)
          or exists (select 1 from public.project_sales ps where ps.project_id = c.project_id and ps.sales_owner_id = r))
      ) then
        perform public.notify(r, 'chat_mention', who || ' mentioned you in ' || coalesce(pname, 'a project'), snippet,
          '/projects/' || c.project_id || '/chat', c.project_id, 'mention:' || new.id || ':' || r);
      end if;
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists after_message on public.messages;
create trigger after_message after insert on public.messages for each row execute function public.after_message();

grant select, insert, update on public.messages to authenticated;
grant select on public.conversations, public.message_edits to authenticated;
grant select, update on public.conversation_members to authenticated;

-- Live updates (Supabase Realtime respects the select policies above).
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when others then null;
end $$;
