/**
 * OPTIONAL demo data — for previewing the interface only.
 *
 *   npm run seed:demo
 *
 * Creates an organization called "Demo Company (sample data)" with one CEO, one PM and two
 * employees (password: demo-password-123), two projects and a handful of tasks.
 * Everything is clearly labelled as sample data. Requires SUPABASE_SERVICE_ROLE_KEY in .env.local.
 * Do not run against a production workspace.
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.');
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false } });
const PASSWORD = 'demo-password-123';
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(error.message);
  return data;
}

async function user(email: string, full_name: string) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name } });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

async function main() {
  const org = await must(admin.from('organizations').insert({ name: 'Demo Company (sample data)' }).select('id').single());
  const people = [
    ['demo-ceo@example.com', 'Demo CEO', 'ceo', 'Chief Executive'],
    ['demo-pm@example.com', 'Demo Project Manager', 'pm', 'Project Manager'],
    ['demo-designer@example.com', 'Demo Designer', 'employee', 'UI Designer'],
    ['demo-developer@example.com', 'Demo Developer', 'employee', 'Frontend Developer'],
  ] as const;
  const ids: Record<string, string> = {};
  for (const [email, name, role, title] of people) {
    const id = await user(email, name);
    ids[role === 'employee' ? title : role] = id;
    await must(admin.from('profiles').insert({ id, organization_id: org.id, full_name: name, email, role, job_title: title }));
  }

  const projects = await must(admin.from('projects').insert([
    { organization_id: org.id, name: '[Sample] Website redesign', description: 'Sample project for previewing the app.', status: 'active', priority: 'high', start_date: day(-20), due_date: day(15), manager_id: ids.pm, created_by: ids.ceo },
    { organization_id: org.id, name: '[Sample] Mobile app MVP', description: 'Sample project for previewing the app.', status: 'planning', priority: 'medium', start_date: day(5), due_date: day(60), manager_id: ids.pm, created_by: ids.ceo },
  ]).select('id'));
  const [web, app] = projects.map((p) => p.id);
  await must(admin.from('project_members').insert([
    { project_id: web, profile_id: ids['UI Designer'], organization_id: org.id },
    { project_id: web, profile_id: ids['Frontend Developer'], organization_id: org.id },
    { project_id: app, profile_id: ids['UI Designer'], organization_id: org.id },
  ]));
  await must(admin.from('tasks').insert([
    { organization_id: org.id, project_id: web, title: 'Homepage design', status: 'done', priority: 'high', assignee_id: ids['UI Designer'], start_date: day(-20), due_date: day(-12), created_by: ids.pm },
    { organization_id: org.id, project_id: web, title: 'Product page design', status: 'in_review', priority: 'high', assignee_id: ids['UI Designer'], start_date: day(-12), due_date: day(-2), created_by: ids.pm },
    { organization_id: org.id, project_id: web, title: 'Build homepage', status: 'in_progress', priority: 'medium', assignee_id: ids['Frontend Developer'], start_date: day(-8), due_date: day(4), created_by: ids.pm },
    { organization_id: org.id, project_id: web, title: 'Set up analytics', status: 'todo', priority: 'low', assignee_id: null, start_date: day(2), due_date: day(10), created_by: ids.pm },
    { organization_id: org.id, project_id: app, title: 'User interviews', status: 'todo', priority: 'medium', assignee_id: ids['UI Designer'], start_date: day(5), due_date: day(14), created_by: ids.pm },
  ]));
  console.log(`Demo workspace created. Sign in as demo-ceo@example.com / demo-pm@example.com / demo-designer@example.com / demo-developer@example.com with password "${PASSWORD}".`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
