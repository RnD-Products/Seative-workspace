-- Phase 2 follow-ups:
-- 1. A due date (and short brief) per person on a project, set by the PM when picking the team.
-- 2. TESTING ONLY: reset_demo_data(), run when someone signs out in testing mode, so every visitor
--    sees the same demo state. Drop it (and turn testing mode off) before real use.

alter table public.project_members add column if not exists due_date date;
alter table public.project_members add column if not exists brief text not null default '';

drop policy if exists pm_update on public.project_members;
create policy pm_update on public.project_members for update to authenticated
  using (public.can_manage_project(project_id)) with check (public.can_manage_project(project_id));
grant update (due_date, brief) on public.project_members to authenticated;

create or replace function public.guard_project_member_update() returns trigger
language plpgsql as $$
begin
  if new.project_id <> old.project_id or new.profile_id <> old.profile_id or new.organization_id <> old.organization_id then
    raise exception 'Only the due date and brief can change' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists project_members_update_guard on public.project_members;
create trigger project_members_update_guard before update on public.project_members
  for each row execute function public.guard_project_member_update();

create or replace function public.audit_member_due() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.due_date is distinct from old.due_date then
    insert into public.activity_log (organization_id, project_id, actor_id, action, details)
    values (new.organization_id, new.project_id, auth.uid(), 'member_due_changed', jsonb_build_object(
      'person', public.profile_name(new.profile_id), 'from', old.due_date, 'to', new.due_date));
  end if;
  return new;
end $$;
drop trigger if exists project_members_due_audit on public.project_members;
create trigger project_members_due_audit after update on public.project_members
  for each row execute function public.audit_member_due();

-- ---------------------------------------------------------------- testing only
create or replace function public.reset_demo_data() returns void
language plpgsql security definer set search_path = public as $seed$
declare
  e_ceo   text := 'siddik@seative.digital';
  e_pm    text := 'pm.test@seative.digital';
  e_sales text := 'sales.test@seative.digital';
  e_emp1  text := 'junayed.seative@gmail.com';
  e_emp2  text := 'junayed@seative.digital';
  ceo uuid; pm uuid; sales uuid; emp1 uuid; emp2 uuid; org uuid;
  p_bloom uuid; p_nova uuid; p_atlas uuid; p_green uuid; p_medix uuid;
  t uuid; t_logo uuid; t_api uuid; t_home uuid; t_menu uuid; t_chart uuid;
  c uuid; d date := current_date;
  demo_names text[] := array['Bloom Cafe Mobile App', 'Nova Fintech Dashboard', 'Atlas Travel Website', 'Green Leaf Landing Page', 'Medix Clinic Branding'];
begin
  select id, organization_id into ceo, org from public.profiles where email = e_ceo;
  select id into pm from public.profiles where email = e_pm;
  select id into sales from public.profiles where email = e_sales;
  select id into emp1 from public.profiles where email = e_emp1;
  select id into emp2 from public.profiles where email = e_emp2;
  if ceo is null or pm is null or sales is null or emp1 is null then
    raise exception 'Missing people. Click "Sign in as Project Manager" and "Sign in as Sales" on the login screen once, then run again.';
  end if;
  emp2 := coalesce(emp2, emp1);

  -- Start clean: remove earlier demo projects. Messages are protected from deletion, so the
  -- guard is paused just for this cleanup.
  alter table public.messages disable trigger guard_messages;
  alter table public.message_edits disable trigger guard_message_edits;
  delete from public.messages where conversation_id in (select id from public.conversations where kind = 'dm' and dm_key in (
    least(pm::text, emp1::text) || ':' || greatest(pm::text, emp1::text),
    least(pm::text, sales::text) || ':' || greatest(pm::text, sales::text),
    least(ceo::text, pm::text) || ':' || greatest(ceo::text, pm::text)));
  delete from public.notifications where project_id in (select id from public.projects where organization_id = org and name = any(demo_names));
  delete from public.projects where organization_id = org and name = any(demo_names);

  -- Anything the PM and Sales test accounts created while exploring, and their private chats.
  delete from public.notifications where project_id in (select id from public.projects where organization_id = org and created_by in (pm, sales));
  delete from public.projects where organization_id = org and created_by in (pm, sales) and not (name = any(demo_names));
  delete from public.messages where conversation_id in (select conversation_id from public.conversation_members where profile_id in (pm, sales))
    and conversation_id in (select id from public.conversations where kind = 'dm');
  delete from public.conversations where kind = 'dm' and id in (select conversation_id from public.conversation_members where profile_id in (pm, sales));
  delete from public.notifications where recipient_id in (pm, sales);
  update public.profiles set notification_prefs = '{}'::jsonb where id in (pm, sales, emp1, emp2, ceo);

  -- Skills for the team picker
  update public.profiles set skills = array['UI/UX', 'Mobile app', 'Figma'], job_title = coalesce(job_title, 'UI/UX Designer') where id = emp1;
  update public.profiles set skills = array['Frontend', 'Webflow', 'Dashboard'], job_title = coalesce(job_title, 'Frontend Developer') where id = emp2 and emp2 <> emp1;

  -- ===== 1. Bloom Cafe Mobile App: active, on track-ish, client blocker =====
  perform set_config('request.jwt.claim.sub', pm::text, true);
  insert into public.projects (organization_id, name, description, status, priority, start_date, due_date, manager_id, created_by)
  values (org, 'Bloom Cafe Mobile App', 'Customer ordering app for iOS and Android, plus a staff dashboard for orders and menu updates.', 'active', 'high', d - 20, d + 18, pm, pm)
  returning id into p_bloom;
  insert into public.project_members (project_id, profile_id, organization_id, added_by) values (p_bloom, emp1, org, pm) on conflict do nothing;
  insert into public.project_members (project_id, profile_id, organization_id, added_by) values (p_bloom, emp2, org, pm) on conflict do nothing;
  insert into public.tasks (organization_id, project_id, title, description, status, priority, assignee_id, due_date, created_by, position) values
    (org, p_bloom, 'User research summary', 'Interview notes from 6 cafe customers, key pain points and jobs to be done.', 'done', 'medium', emp1, d - 12, pm, 1),
    (org, p_bloom, 'App sitemap and user flows', 'Ordering, pickup, loyalty points and account flows.', 'done', 'high', emp1, d - 8, pm, 2),
    (org, p_bloom, 'Home and menu screens (hi-fi)', 'Light and dark versions in Figma, using the new brand colours.', 'in_review', 'high', emp1, d - 1, pm, 3),
    (org, p_bloom, 'Checkout and payment flow', 'bKash, card and cash on pickup. Include error and empty states.', 'in_progress', 'urgent', emp1, d + 2, pm, 4),
    (org, p_bloom, 'Loyalty points screen', 'Points balance, rewards list and redeem flow.', 'todo', 'medium', emp1, d + 6, pm, 5),
    (org, p_bloom, 'Staff dashboard: order queue', 'Live order list with status changes for the cafe staff.', 'todo', 'high', emp2, d + 9, pm, 6),
    (org, p_bloom, 'Clickable prototype for client review', 'Figma prototype covering ordering and checkout.', 'todo', 'medium', emp1, d + 12, pm, 7);
  select id into t_home from public.tasks where project_id = p_bloom and title like 'Home and menu%';
  select id into t_menu from public.tasks where project_id = p_bloom and title like 'Checkout%';
  update public.tasks set completed_at = now() - interval '9 days' where project_id = p_bloom and status = 'done';

  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.project_sales (project_id, organization_id, sales_owner_id, client_name, client_contact_name, client_email, client_phone, deal_source, deal_date, client_deadline, budget, contract_amount, currency, advance_received, payment_status, scope_summary, team_requirements, requirement_tags)
  values (p_bloom, org, sales, 'Bloom Cafe Ltd', 'Nusrat Jahan', 'nusrat@bloomcafe.example', '+880 1711-000000', 'referral', d - 24, d + 18, 300000, 250000, 'BDT', 100000, 'advance_paid',
          'Customer ordering app (iOS + Android) and a staff order dashboard.', '1 UI/UX designer, 1 frontend developer, Figma prototype', array['UI/UX', 'Mobile app', 'Figma']);
  insert into public.blockers (organization_id, project_id, task_id, title, details, side, raised_by, created_at)
  values (org, p_bloom, t_home, 'Waiting for the client''s final logo and menu photos', 'Asked on Sunday; Nusrat said the photographer delivers this week.', 'client', emp1, now() - interval '4 days');

  -- ===== 2. Nova Fintech Dashboard: active, at risk, overdue + internal blocker =====
  perform set_config('request.jwt.claim.sub', pm::text, true);
  insert into public.projects (organization_id, name, description, status, priority, start_date, due_date, manager_id, created_by)
  values (org, 'Nova Fintech Dashboard', 'Investor dashboard web app: portfolio overview, transactions and monthly reports.', 'active', 'urgent', d - 30, d + 4, pm, pm)
  returning id into p_nova;
  insert into public.project_members (project_id, profile_id, organization_id, added_by) values (p_nova, emp2, org, pm), (p_nova, emp1, org, pm) on conflict do nothing;
  insert into public.tasks (organization_id, project_id, title, description, status, priority, assignee_id, due_date, created_by, position) values
    (org, p_nova, 'Design system tokens', 'Colours, type scale, spacing, chart palette.', 'done', 'high', emp1, d - 18, pm, 1),
    (org, p_nova, 'Portfolio overview page', 'Balance, allocation and recent activity.', 'done', 'high', emp1, d - 10, pm, 2),
    (org, p_nova, 'Transactions table with filters', 'Sort, filter by date and type, CSV export.', 'in_progress', 'high', emp2, d - 2, pm, 3),
    (org, p_nova, 'Charts: monthly performance', 'Line and bar charts, responsive.', 'in_progress', 'urgent', emp2, d - 3, pm, 4),
    (org, p_nova, 'Connect to client API', 'Waiting on API keys from the client''s vendor.', 'todo', 'urgent', emp2, d + 1, pm, 5),
    (org, p_nova, 'QA and handover', 'Cross-browser QA and handover notes.', 'todo', 'medium', emp1, d + 4, pm, 6);
  select id into t_api from public.tasks where project_id = p_nova and title like 'Connect to client API';
  select id into t_chart from public.tasks where project_id = p_nova and title like 'Charts%';
  update public.tasks set completed_at = now() - interval '12 days' where project_id = p_nova and status = 'done';

  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.project_sales (project_id, organization_id, sales_owner_id, client_name, client_contact_name, client_email, deal_source, deal_date, client_deadline, budget, contract_amount, currency, advance_received, payment_status, scope_summary, team_requirements, requirement_tags)
  values (p_nova, org, sales, 'Nova Capital', 'Daniel Reed', 'daniel@novacapital.example', 'upwork', d - 35, d + 4, 6000, 4800, 'USD', 2400, 'partially_paid',
          'Responsive investor dashboard with charts and reports.', 'Dashboard designer + frontend developer', array['Dashboard', 'Frontend', 'UI/UX']);
  insert into public.blockers (organization_id, project_id, task_id, title, details, side, raised_by, created_at)
  values (org, p_nova, t_api, 'API keys not received from the client''s payment vendor', 'Vendor support ticket #4821 is open.', 'third_party', emp2, now() - interval '8 days');
  insert into public.blockers (organization_id, project_id, task_id, title, side, responsible_id, raised_by, created_at)
  values (org, p_nova, t_chart, 'Chart colours need sign-off from design', 'internal', emp1, pm, now() - interval '1 day');
  insert into public.blockers (organization_id, project_id, title, side, raised_by, status, resolved_by, resolved_note, resolved_at, created_at)
  values (org, p_nova, 'Client feedback on overview page', 'client', pm, 'resolved', pm, 'Feedback received in call, changes done.', now() - interval '6 days', now() - interval '9 days');

  -- ===== 3. Atlas Travel Website: planning =====
  perform set_config('request.jwt.claim.sub', pm::text, true);
  insert into public.projects (organization_id, name, description, status, priority, start_date, due_date, manager_id, created_by)
  values (org, 'Atlas Travel Website', 'Marketing website with tour packages, booking enquiry form and blog.', 'planning', 'medium', d + 3, d + 40, pm, pm)
  returning id into p_atlas;
  insert into public.project_members (project_id, profile_id, organization_id, added_by) values (p_atlas, emp1, org, pm) on conflict do nothing;
  insert into public.tasks (organization_id, project_id, title, description, status, priority, assignee_id, due_date, created_by, position) values
    (org, p_atlas, 'Moodboard and style direction', '', 'todo', 'medium', emp1, d + 7, pm, 1),
    (org, p_atlas, 'Homepage wireframe', '', 'todo', 'medium', emp1, d + 10, pm, 2),
    (org, p_atlas, 'Package detail page', '', 'todo', 'low', null, d + 16, pm, 3);
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.project_sales (project_id, organization_id, sales_owner_id, client_name, deal_source, deal_date, client_deadline, budget, contract_amount, currency, advance_received, payment_status, scope_summary, requirement_tags)
  values (p_atlas, org, sales, 'Atlas Tours & Travels', 'linkedin', d - 5, d + 40, 180000, 150000, 'BDT', 0, 'unpaid', 'Website with 8 pages, CMS blog, enquiry form.', array['UI/UX', 'Webflow']);

  -- ===== 4. Green Leaf Landing Page: incoming deal from Sales, no PM yet =====
  perform set_config('request.jwt.claim.sub', sales::text, true);
  insert into public.projects (organization_id, name, description, status, priority, due_date, created_by)
  values (org, 'Green Leaf Landing Page', 'Product launch landing page for an organic tea brand.', 'incoming', 'medium', d + 21, sales)
  returning id into p_green;
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.project_sales (project_id, organization_id, sales_owner_id, client_name, client_contact_name, client_email, deal_source, deal_date, client_deadline, budget, contract_amount, currency, advance_received, payment_status, scope_summary, team_requirements, requirement_tags)
  values (p_green, org, sales, 'Green Leaf Tea Co.', 'Arif Hossain', 'arif@greenleaf.example', 'direct', d - 1, d + 21, 90000, 75000, 'BDT', 30000, 'advance_paid',
          'One-page launch site with product story, ingredients, reviews and pre-order form. Bangla + English.', '1 UI/UX designer, Webflow build', array['UI/UX', 'Webflow', 'Landing page']);

  -- ===== 5. Medix Clinic Branding: completed =====
  perform set_config('request.jwt.claim.sub', pm::text, true);
  insert into public.projects (organization_id, name, description, status, priority, start_date, due_date, manager_id, created_by)
  values (org, 'Medix Clinic Branding', 'Logo, colours and social media kit for a dental clinic.', 'completed', 'low', d - 45, d - 10, pm, pm)
  returning id into p_medix;
  insert into public.project_members (project_id, profile_id, organization_id, added_by) values (p_medix, emp1, org, pm) on conflict do nothing;
  insert into public.tasks (organization_id, project_id, title, description, status, priority, assignee_id, due_date, created_by, position, completed_at) values
    (org, p_medix, 'Logo concepts', '', 'done', 'medium', emp1, d - 35, pm, 1, now() - interval '36 days'),
    (org, p_medix, 'Brand guideline PDF', '', 'done', 'medium', emp1, d - 20, pm, 2, now() - interval '21 days'),
    (org, p_medix, 'Social media templates', '', 'done', 'low', emp1, d - 12, pm, 3, now() - interval '13 days');
  perform set_config('request.jwt.claim.sub', '', true);
  insert into public.project_sales (project_id, organization_id, sales_owner_id, client_name, deal_source, deal_date, client_deadline, budget, contract_amount, currency, advance_received, payment_status, scope_summary, requirement_tags)
  values (p_medix, org, sales, 'Medix Dental Clinic', 'fiverr', d - 50, d - 10, 900, 850, 'USD', 850, 'fully_paid', 'Brand identity and social kit.', array['Branding']);

  -- ===== Comments and progress updates =====
  insert into public.comments (organization_id, task_id, author_id, body, is_progress_update, created_at) values
    (org, t_home, emp1, 'Home and menu screens are ready for review. Dark mode included. Waiting on final photos to replace placeholders.', true, now() - interval '1 day'),
    (org, t_home, pm, 'Looks great. Please increase the size of the "Order again" button and we can send it to the client.', false, now() - interval '20 hours'),
    (org, t_menu, emp1, 'Payment options screen done; working on error states now.', true, now() - interval '3 hours'),
    (org, t_api, emp2, 'Still no keys from the vendor. I built the screens with mock data so we are not blocked on UI.', true, now() - interval '2 days');

  -- ===== Time entries (this month and last month, for reports) =====
  insert into public.time_entries (organization_id, project_id, task_id, profile_id, entry_date, minutes, note)
  select org, x.project_id, x.task_id, x.profile_id, x.day, x.minutes, x.note
  from (values
    (p_bloom, t_home, emp1, d - 1, 300, 'Hi-fi home screen'),
    (p_bloom, t_home, emp1, d - 2, 240, 'Menu screens'),
    (p_bloom, t_menu, emp1, d, 150, 'Checkout flow'),
    (p_bloom, null::uuid, emp1, d - 7, 360, 'User flows'),
    (p_bloom, null::uuid, emp2, d - 3, 120, 'Order queue research'),
    (p_bloom, null::uuid, pm, d - 2, 90, 'Client call + planning'),
    (p_nova, t_chart, emp2, d - 1, 330, 'Monthly performance charts'),
    (p_nova, t_chart, emp2, d - 2, 280, 'Chart library setup'),
    (p_nova, null::uuid, emp2, d - 4, 300, 'Transactions table'),
    (p_nova, null::uuid, emp1, d - 9, 420, 'Overview page'),
    (p_nova, null::uuid, pm, d - 1, 60, 'Vendor follow-up'),
    (p_atlas, null::uuid, emp1, d - 1, 45, 'Kick-off notes'),
    (p_medix, null::uuid, emp1, (date_trunc('month', d) - interval '10 days')::date, 480, 'Brand guideline'),
    (p_medix, null::uuid, emp1, (date_trunc('month', d) - interval '18 days')::date, 360, 'Logo concepts'),
    (p_nova, null::uuid, emp1, (date_trunc('month', d) - interval '5 days')::date, 300, 'Design tokens')
  ) as x(project_id, task_id, profile_id, day, minutes, note);

  -- ===== Chat: project team chats and private messages =====
  alter table public.messages disable trigger guard_messages;
  select id into c from public.conversations where project_id = p_bloom;
  insert into public.messages (conversation_id, organization_id, author_id, body, created_at) values
    (c, org, pm, 'Morning team! Client call went well, they loved the user flows.', now() - interval '2 days 3 hours'),
    (c, org, emp1, 'Great! I''ll finish the home and menu screens today.', now() - interval '2 days 2 hours'),
    (c, org, emp2, 'I''ll start research for the staff order queue.', now() - interval '2 days 1 hour'),
    (c, org, emp1, 'Home and menu screens are in review now. Still waiting for the real photos from the client.', now() - interval '1 day'),
    (c, org, sales, 'I reminded Nusrat about the photos. She says Thursday at the latest.', now() - interval '20 hours'),
    (c, org, pm, 'Thanks! Let''s keep placeholders until then.', now() - interval '19 hours');
  insert into public.messages (conversation_id, organization_id, author_id, body, mentions, created_at)
    select c, org, pm, '@' || full_name || ' please share the checkout flow before tomorrow''s client call.', array[emp1], now() - interval '2 hours' from public.profiles where id = emp1;

  select id into c from public.conversations where project_id = p_nova;
  insert into public.messages (conversation_id, organization_id, author_id, body, created_at) values
    (c, org, emp2, 'Charts are 70% done. API keys still missing, so I''m using mock data.', now() - interval '1 day 4 hours'),
    (c, org, pm, 'OK. I raised it as a third-party blocker and emailed the vendor again.', now() - interval '1 day 3 hours'),
    (c, org, ceo, 'This one is due soon. Let me know if we need to talk to the client about the date.', now() - interval '5 hours');

  -- Private chats (open_dm logic, done directly here)
  insert into public.conversations (organization_id, kind, dm_key) values
    (org, 'dm', least(pm::text, emp1::text) || ':' || greatest(pm::text, emp1::text)),
    (org, 'dm', least(pm::text, sales::text) || ':' || greatest(pm::text, sales::text)),
    (org, 'dm', least(ceo::text, pm::text) || ':' || greatest(ceo::text, pm::text))
  on conflict (dm_key) do nothing;
  select id into c from public.conversations where dm_key = least(pm::text, emp1::text) || ':' || greatest(pm::text, emp1::text);
  insert into public.conversation_members (conversation_id, profile_id) values (c, pm), (c, emp1) on conflict do nothing;
  insert into public.messages (conversation_id, organization_id, author_id, body, created_at) values
    (c, org, pm, 'Hi! Can you take the Atlas moodboard next week as well?', now() - interval '6 hours'),
    (c, org, emp1, 'Sure, after Bloom checkout is done. Wednesday okay?', now() - interval '5 hours 40 minutes'),
    (c, org, pm, 'Perfect, thanks.', now() - interval '5 hours 30 minutes');
  select id into c from public.conversations where dm_key = least(pm::text, sales::text) || ':' || greatest(pm::text, sales::text);
  insert into public.conversation_members (conversation_id, profile_id) values (c, pm), (c, sales) on conflict do nothing;
  insert into public.messages (conversation_id, organization_id, author_id, body, created_at) values
    (c, org, sales, 'New deal in Incoming: Green Leaf landing page, Bangla + English. Can you take it?', now() - interval '3 hours'),
    (c, org, sales, 'Advance is already paid, so they want to start this week.', now() - interval '2 hours 50 minutes');
  select id into c from public.conversations where dm_key = least(ceo::text, pm::text) || ':' || greatest(ceo::text, pm::text);
  insert into public.conversation_members (conversation_id, profile_id) values (c, ceo), (c, pm) on conflict do nothing;
  insert into public.messages (conversation_id, organization_id, author_id, body, created_at) values
    (c, org, ceo, 'How is Nova looking for the deadline?', now() - interval '4 hours'),
    (c, org, pm, 'Tight. Everything except the API part will be ready; I''ll update you after the vendor replies.', now() - interval '3 hours 30 minutes');
  alter table public.messages enable trigger guard_messages;
  alter table public.message_edits enable trigger guard_message_edits;

  -- ===== Notifications so every bell has something =====
  insert into public.notifications (organization_id, recipient_id, kind, title, body, link, project_id, actor_id, created_at) values
    (org, ceo, 'deadline_reminder', 'Nova Fintech Dashboard is due ' || to_char(d + 4, 'Dy DD Mon'), '33% done · 4 open tasks · 1 open blocker (third party)', '/projects/' || p_nova, p_nova, null, now() - interval '7 hours'),
    (org, pm, 'deadline_reminder', 'Nova Fintech Dashboard is due ' || to_char(d + 4, 'Dy DD Mon'), '33% done · 4 open tasks · 1 open blocker (third party)', '/projects/' || p_nova, p_nova, null, now() - interval '7 hours'),
    (org, sales, 'team_assigned', 'Team assigned to Bloom Cafe Mobile App', 'Test PM started the project with 2 people.', '/projects/' || p_bloom, p_bloom, pm, now() - interval '18 days');

  perform set_config('request.jwt.claim.sub', '', true);
end
$seed$;
revoke execute on function public.reset_demo_data() from public, anon, authenticated;
grant execute on function public.reset_demo_data() to service_role;
