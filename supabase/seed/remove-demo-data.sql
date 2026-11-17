-- Removes everything created by demo-data.sql (the 5 demo projects with their tasks, deals,
-- blockers, time, comments, chats and notifications, plus the demo private chats).
do $$
declare org uuid; pm uuid; sales uuid; emp1 uuid; ceo uuid;
begin
  select id, organization_id into ceo, org from public.profiles where email = 'siddik@seative.digital';
  select id into pm from public.profiles where email = 'pm.test@seative.digital';
  select id into sales from public.profiles where email = 'sales.test@seative.digital';
  select id into emp1 from public.profiles where email = 'junayed.seative@gmail.com';
  alter table public.messages disable trigger guard_messages;
  alter table public.message_edits disable trigger guard_message_edits;
  delete from public.conversations where kind = 'dm' and dm_key in (
    least(pm::text, emp1::text) || ':' || greatest(pm::text, emp1::text),
    least(pm::text, sales::text) || ':' || greatest(pm::text, sales::text),
    least(ceo::text, pm::text) || ':' || greatest(ceo::text, pm::text));
  delete from public.notifications where project_id in (select id from public.projects where organization_id = org and name = any(array['Bloom Cafe Mobile App', 'Nova Fintech Dashboard', 'Atlas Travel Website', 'Green Leaf Landing Page', 'Medix Clinic Branding']));
  delete from public.projects where organization_id = org and name = any(array['Bloom Cafe Mobile App', 'Nova Fintech Dashboard', 'Atlas Travel Website', 'Green Leaf Landing Page', 'Medix Clinic Branding']);
  alter table public.messages enable trigger guard_messages;
  alter table public.message_edits enable trigger guard_message_edits;
end $$;
