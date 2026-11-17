/**
 * Authorization tests for the Supabase migrations.
 *
 * Runs the real migration files inside an embedded Postgres (PGlite) with a minimal stand-in
 * for Supabase's `auth` schema, then acts as each role and asserts what they can and cannot do.
 *
 *   npm run test:rls
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const db = new PGlite();
let passed = 0;
let failed = 0;

const U = {
  ceoA: '00000000-0000-0000-0000-00000000000a',
  pm1: '00000000-0000-0000-0000-000000000001',
  pm2: '00000000-0000-0000-0000-000000000002',
  emp1: '00000000-0000-0000-0000-000000000003',
  emp2: '00000000-0000-0000-0000-000000000004',
  ceoB: '00000000-0000-0000-0000-00000000000b',
  empB: '00000000-0000-0000-0000-00000000000c',
  sales1: '00000000-0000-0000-0000-000000000005',
};
const ORG_B = '11111111-1111-1111-1111-111111111111';

async function as<T = any>(user: keyof typeof U | 'service' | 'anon', sql: string, params: unknown[] = []) {
  if (user === 'service') {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  } else if (user === 'anon') {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  } else {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${U[user]}', false); set role authenticated;`);
  }
  try {
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec('reset role;');
  }
}

function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function expectOk(name: string, fn: () => Promise<unknown>) {
  try { await fn(); check(name, true); } catch (e: any) { check(name, false, e.message); }
}
async function expectDenied(name: string, fn: () => Promise<unknown>) {
  try {
    const r = await fn();
    // An UPDATE/DELETE filtered by RLS succeeds but touches 0 rows: that also counts as denied.
    if (Array.isArray(r) && r.length === 0) check(name, true);
    else check(name, false, 'operation was allowed');
  } catch { check(name, true); }
}

async function main() {
  // ---- Minimal Supabase environment ----
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema auth to anon, authenticated;
  `);
  for (const f of readdirSync('supabase/migrations').sort()) {
    await db.exec(readFileSync(join('supabase/migrations', f), 'utf8'));
  }
  await db.exec(`
    grant usage on schema public to anon, authenticated;
    grant select, insert, update, delete on all tables in schema public to anon, authenticated;
  `);
  const users = Object.entries(U).map(([k, id]) => `('${id}', '${k}@example.com')`).join(',');
  await db.exec(`insert into auth.users values ${users};`);

  console.log('\nFirst-run setup');
  check('setup is available on an empty database', (await as('anon', 'select public.setup_available() as v'))[0].v === true);
  await expectDenied('anonymous caller cannot create an organization', () => as('anon', `select public.create_organization('X', 'Y')`));
  await expectOk('first user creates the organization and becomes CEO', () => as('ceoA', `select public.create_organization('Org A', 'Ada CEO')`));
  check('setup is closed afterwards', (await as('anon', 'select public.setup_available() as v'))[0].v === false);
  await expectDenied('a second user cannot run setup again', () => as('ceoB', `select public.create_organization('Org B', 'Bea')`));

  // Remaining people are created by the service role (what the CEO "add member" action does).
  const orgA = (await as('ceoA', 'select public.current_org_id() as id'))[0].id;
  await as('service', `insert into public.organizations (id, name) values ('${ORG_B}', 'Org B')`);
  await as('service', `
    insert into public.profiles (id, organization_id, full_name, email, role) values
      ('${U.pm1}', '${orgA}', 'Pat PM', 'pm1@example.com', 'pm'),
      ('${U.pm2}', '${orgA}', 'Quinn PM', 'pm2@example.com', 'pm'),
      ('${U.emp1}', '${orgA}', 'Eli Employee', 'emp1@example.com', 'employee'),
      ('${U.emp2}', '${orgA}', 'Eve Employee', 'emp2@example.com', 'employee'),
      ('${U.sales1}', '${orgA}', 'Sam Sales', 'sales1@example.com', 'sales'),
      ('${U.ceoB}', '${ORG_B}', 'Bea CEO', 'ceoB@example.com', 'ceo'),
      ('${U.empB}', '${ORG_B}', 'Bo Employee', 'empB@example.com', 'employee')
  `);

  console.log('\nProjects');
  const [proj] = await as('pm1', `insert into public.projects (name, manager_id) values ('Website', '${U.pm2}') returning id, manager_id, organization_id`);
  check('PM creates a project and is forced to be its manager', proj?.manager_id === U.pm1);
  check('organization is assigned server-side', proj?.organization_id === orgA);
  const P = proj.id;
  await expectDenied('employee cannot create projects', () => as('emp1', `insert into public.projects (name) values ('Nope') returning id`));
  const [ceoProj] = await as('ceoA', `insert into public.projects (name, manager_id) values ('Ops', '${U.pm2}') returning id, manager_id`);
  check('CEO creates a project and assigns another PM', ceoProj?.manager_id === U.pm2);
  await expectDenied('CEO cannot make an employee the project manager', () => as('ceoA', `insert into public.projects (name, manager_id) values ('Bad', '${U.emp1}') returning id`));

  await expectOk('PM adds an employee to their project', () => as('pm1', `insert into public.project_members (project_id, profile_id) values ('${P}', '${U.emp1}')`));
  await expectDenied('PM cannot add a member from another organization', () => as('pm1', `insert into public.project_members (project_id, profile_id) values ('${P}', '${U.empB}')`));
  await expectDenied('employee cannot add members', () => as('emp1', `insert into public.project_members (project_id, profile_id) values ('${P}', '${U.emp2}')`));

  const visible = async (u: keyof typeof U) => (await as(u, `select id from public.projects where id = '${P}'`)).length === 1;
  check('member employee can see the project', await visible('emp1'));
  check('non-member employee cannot see the project', !(await visible('emp2')));
  check('another PM cannot see the project', !(await visible('pm2')));
  check('CEO can see every project in the org', await visible('ceoA'));
  check('CEO of another org cannot see it', !(await visible('ceoB')));
  check('employee of another org cannot see it', !(await visible('empB')));
  check('anonymous visitors see no projects', (await as('anon', 'select id from public.projects')).length === 0);

  await expectDenied('another PM cannot edit the project', () => as('pm2', `update public.projects set name = 'Hacked' where id = '${P}' returning id`));
  await expectDenied('PM cannot reassign the project manager', () => as('pm1', `update public.projects set manager_id = '${U.pm2}' where id = '${P}' returning id`));
  await expectOk('PM edits their own project', () => as('pm1', `update public.projects set status = 'active' where id = '${P}'`));
  await expectDenied('CEO of another org cannot edit it', () => as('ceoB', `update public.projects set name = 'x' where id = '${P}' returning id`));

  console.log('\nTasks');
  const [task] = await as('pm1', `insert into public.tasks (project_id, title, assignee_id) values ('${P}', 'Homepage', '${U.emp1}') returning id, created_by`);
  const T = task.id;
  check('PM creates and assigns a task; creator recorded', task.created_by === U.pm1);
  await expectDenied('cannot assign a task to a non-member', () => as('pm1', `insert into public.tasks (project_id, title, assignee_id) values ('${P}', 'X', '${U.emp2}') returning id`));
  await expectDenied('employee cannot create an unassigned task', () => as('emp1', `insert into public.tasks (project_id, title) values ('${P}', 'Mine') returning id`));
  await expectDenied('employee cannot create a task for someone else', () => as('emp1', `insert into public.tasks (project_id, title, assignee_id) values ('${P}', 'Yours', '${U.pm1}') returning id`));
  await expectDenied('non-member cannot add a task to the project', () => as('emp2', `insert into public.tasks (project_id, title, assignee_id) values ('${P}', 'Sneaky', '${U.emp2}') returning id`));
  const [own] = await as('emp1', `insert into public.tasks (project_id, title, assignee_id) values ('${P}', 'My own to-do', '${U.emp1}') returning id, created_by`);
  check('member can add a task assigned to themselves', !!own && own.created_by === U.emp1);
  await expectOk('member edits title, priority and dates of their own task', () => as('emp1', `update public.tasks set title = 'Renamed', priority = 'high', due_date = '2030-01-01' where id = '${own.id}' returning id`));
  await expectDenied('member cannot reassign their own task', () => as('emp1', `update public.tasks set assignee_id = '${U.pm1}' where id = '${own.id}' returning id`));
  await expectDenied('member cannot unassign their own task', () => as('emp1', `update public.tasks set assignee_id = null where id = '${own.id}' returning id`));
  await expectOk('PM can edit a member-created task', () => as('pm1', `update public.tasks set priority = 'low' where id = '${own.id}' returning id`));
  await expectOk('member deletes their own task', () => as('emp1', `delete from public.tasks where id = '${own.id}' returning id`));

  // Time tracking
  const [run] = await as('emp1', `insert into public.time_entries (project_id, task_id, started_at, profile_id) values ('${P}', '${T}', now() - interval '90 minutes', '${U.pm1}') returning id, profile_id, minutes`);
  check('member starts a timer; owner cannot be forged', run?.profile_id === U.emp1 && run.minutes === null);
  await expectDenied('only one running timer per person', () => as('emp1', `insert into public.time_entries (project_id, started_at) values ('${P}', now()) returning id`));
  const [stopped] = await as('emp1', `update public.time_entries set ended_at = now() where id = '${run.id}' returning minutes`);
  check('stopping a timer computes the minutes', stopped?.minutes >= 89 && stopped?.minutes <= 91, String(stopped?.minutes));
  const [manual] = await as('emp1', `insert into public.time_entries (project_id, minutes, entry_date, note) values ('${P}', 45, '2026-11-10', 'Design review') returning id`);
  check('member logs time manually', !!manual);
  await expectDenied('non-member cannot log time on the project', () => as('emp2', `insert into public.time_entries (project_id, minutes) values ('${P}', 30) returning id`));
  await expectDenied('time cannot point at a task from another project', () => as('pm2', `insert into public.time_entries (project_id, task_id, minutes) values ('${ceoProj.id}', '${T}', 30) returning id`));
  check('project manager sees the member\'s time', (await as('pm1', `select id from public.time_entries where project_id = '${P}'`)).length === 2);
  check('non-member sees no time', (await as('emp2', `select id from public.time_entries where project_id = '${P}'`)).length === 0);
  check('another organization sees no time', (await as('ceoB', `select id from public.time_entries`)).length === 0);
  await expectDenied('PM cannot edit someone else\'s time', () => as('pm1', `update public.time_entries set minutes = 999 where id = '${manual.id}' returning id`));
  await expectDenied('time cannot be moved to another person', () => as('emp1', `update public.time_entries set profile_id = '${U.pm1}' where id = '${manual.id}' returning id`));
  await expectOk('member edits their own entry', () => as('emp1', `update public.time_entries set note = 'Design review (client)' where id = '${manual.id}' returning id`));
  await expectOk('PM deletes an entry on their project', () => as('pm1', `delete from public.time_entries where id = '${manual.id}' returning id`));
  await expectDenied('non-member cannot delete time', () => as('emp2', `delete from public.time_entries where id = '${run.id}' returning id`));
  await expectOk('assignee updates task status', () => as('emp1', `update public.tasks set status = 'in_progress' where id = '${T}'`));
  await expectOk('assignee updates task description', () => as('emp1', `update public.tasks set description = 'notes' where id = '${T}'`));
  await expectDenied('assignee cannot change the due date', () => as('emp1', `update public.tasks set due_date = '2030-01-01' where id = '${T}' returning id`));
  await expectDenied('assignee cannot reassign the task', () => as('emp1', `update public.tasks set assignee_id = null where id = '${T}' returning id`));
  await expectDenied('non-member cannot update the task', () => as('emp2', `update public.tasks set status = 'done' where id = '${T}' returning id`));
  await expectDenied('employee cannot delete tasks', () => as('emp1', `delete from public.tasks where id = '${T}' returning id`));
  const [done] = await as('emp1', `update public.tasks set status = 'done' where id = '${T}' returning completed_at`);
  check('completing a task stamps completed_at', !!done?.completed_at);
  check('non-member cannot read the task', (await as('emp2', `select id from public.tasks where id = '${T}'`)).length === 0);
  await expectDenied('another org cannot insert into the project', () => as('ceoB', `insert into public.tasks (project_id, title) values ('${P}', 'x') returning id`));

  console.log('\nComments & activity');
  await expectOk('member comments on a task', () => as('emp1', `insert into public.comments (task_id, body, is_progress_update) values ('${T}', 'Done!', true)`));
  await expectDenied('non-member cannot comment', () => as('emp2', `insert into public.comments (task_id, body) values ('${T}', 'hi') returning id`));
  const [forged] = await as('emp1', `insert into public.comments (task_id, body, author_id) values ('${T}', 'as boss', '${U.pm1}') returning author_id`);
  check('comment author cannot be forged', forged?.author_id === U.emp1);
  const acts = await as('emp1', `select action, actor_id from public.activity_log where project_id = '${P}' order by created_at`);
  const actions = acts.map((a: any) => a.action);
  for (const a of ['project_created', 'member_added', 'task_created', 'task_status_changed', 'progress_update_posted']) {
    check(`activity records ${a}`, actions.includes(a));
  }
  check('activity records the actor', acts.some((a: any) => a.action === 'task_status_changed' && a.actor_id === U.emp1));
  check('non-member sees none of the activity', (await as('emp2', `select id from public.activity_log where project_id = '${P}'`)).length === 0);
  await expectDenied('activity cannot be forged with non-AI actions', () => as('emp1', `insert into public.activity_log (organization_id, project_id, actor_id, action, ai_assisted) values ('${orgA}', '${P}', '${U.emp1}', 'project_created', true) returning id`));
  await expectOk('AI-assistance can be logged on a visible project', () => as('emp1', `insert into public.activity_log (organization_id, project_id, actor_id, action, ai_assisted) values ('${orgA}', '${P}', '${U.emp1}', 'ai_update_drafted', true)`));
  await expectDenied('AI-assistance cannot be logged on an invisible project', () => as('emp2', `insert into public.activity_log (organization_id, project_id, actor_id, action, ai_assisted) values ('${orgA}', '${P}', '${U.emp2}', 'ai_x', true) returning id`));

  console.log('\nAI artifacts');
  await expectDenied('employee cannot save a project summary', () => as('emp1', `insert into public.ai_generated_artifacts (project_id, kind, content) values ('${P}', 'progress_summary', '{}') returning id`));
  const [art] = await as('pm1', `insert into public.ai_generated_artifacts (project_id, kind, content) values ('${P}', 'risk_signal', '{"title":"x"}') returning id, created_by`);
  check('PM saves a risk signal for their project', art?.created_by === U.pm1);
  check('employee cannot read risk signals', (await as('emp1', `select id from public.ai_generated_artifacts`)).length === 0);
  const [rev] = await as('pm1', `update public.ai_generated_artifacts set status = 'reviewed' where id = '${art.id}' returning reviewed_by`);
  check('PM marks a signal reviewed; reviewer recorded', rev?.reviewed_by === U.pm1);
  await expectDenied('AI content is immutable', () => as('pm1', `update public.ai_generated_artifacts set content = '{"title":"y"}' where id = '${art.id}' returning id`));
  await expectDenied('PM cannot save an org-wide summary', () => as('pm1', `insert into public.ai_generated_artifacts (kind, content) values ('org_summary', '{}') returning id`));
  await expectOk('CEO saves an org-wide summary', () => as('ceoA', `insert into public.ai_generated_artifacts (kind, content) values ('org_summary', '{}')`));

  console.log('\nSales, Incoming projects and notifications');
  const [deal] = await as('sales1', `insert into public.projects (name, manager_id, status) values ('Deal: Cafe app', '${U.pm1}', 'active') returning id, manager_id, status`);
  check('Sales creates a project: it arrives Incoming with no PM', deal?.manager_id === null && deal?.status === 'incoming');
  const D = deal.id;
  const [sale] = await as('sales1', `insert into public.project_sales (project_id, client_name, contract_amount, currency, sales_owner_id) values ('${D}', 'Cafe Co', 150000, 'BDT', '${U.ceoA}') returning sales_owner_id`);
  check('Sales adds sales info and owns it (owner cannot be forged)', sale?.sales_owner_id === U.sales1);
  await expectDenied('Sales cannot add sales info to a project they did not create', () => as('sales1', `insert into public.project_sales (project_id, client_name) values ('${P}', 'X') returning project_id`));
  await expectDenied('employee cannot create projects from a deal', () => as('emp1', `insert into public.projects (name, status) values ('Nope', 'incoming') returning id`));
  check('every PM sees Incoming projects', (await as('pm2', `select id from public.projects where id = '${D}'`)).length === 1);
  check('PM sees the sales info of an Incoming project', (await as('pm2', `select contract_amount from public.project_sales where project_id = '${D}'`)).length === 1);
  check('employees never see sales info', (await as('emp1', `select project_id from public.project_sales`)).length === 0);
  check('employees do not see Incoming projects', (await as('emp1', `select id from public.projects where id = '${D}'`)).length === 0);
  check('Sales does not see other projects', (await as('sales1', `select id from public.projects where id = '${P}'`)).length === 0);
  check('Sales cannot read tasks of their deal', (await as('sales1', `select id from public.tasks where project_id = '${D}'`)).length === 0);
  await expectDenied('PM cannot edit sales info', () => as('pm2', `update public.project_sales set contract_amount = 1 where project_id = '${D}' returning project_id`));
  await expectOk('Sales records a payment on their deal', () => as('sales1', `update public.project_sales set advance_received = 50000, payment_status = 'advance_paid' where project_id = '${D}' returning project_id`));
  check('PMs get a notification for the new Incoming project', (await as('pm2', `select id from public.notifications where kind = 'incoming_project'`)).length === 1);
  await expectDenied('a PM cannot assign the project to another PM', () => as('pm2', `update public.projects set manager_id = '${U.pm1}' where id = '${D}' returning id`));
  await expectOk('a PM takes the Incoming project', () => as('pm2', `update public.projects set manager_id = '${U.pm2}' where id = '${D}' returning id`));
  check('once taken, other PMs no longer see it', (await as('pm1', `select id from public.projects where id = '${D}'`)).length === 0);
  check('the other PM no longer sees its sales info', (await as('pm1', `select project_id from public.project_sales where project_id = '${D}'`)).length === 0);
  await expectOk('the new manager adds a designer', () => as('pm2', `insert into public.project_members (project_id, profile_id) values ('${D}', '${U.emp1}')`));
  await expectOk('the manager starts the project', () => as('pm2', `update public.projects set status = 'active' where id = '${D}' returning id`));
  check('the designer is notified they were added', (await as('emp1', `select id from public.notifications where kind = 'project_added' and project_id = '${D}'`)).length === 1);
  check('Sales is notified the team was assigned', (await as('sales1', `select id from public.notifications where kind = 'team_assigned'`)).length === 1);
  check('Sales sees who is on their deal', (await as('sales1', `select profile_id from public.project_members where project_id = '${D}'`)).length === 1);
  await as('pm2', `insert into public.tasks (project_id, title, status) values ('${D}', 'Wireframes', 'done'), ('${D}', 'UI', 'todo')`);
  check('Sales sees progress counts without task details', (await as('sales1', `select * from public.deal_task_rows()`)).length === 2);
  check('sales history is hidden from employees on the project', (await as('emp1', `select id from public.activity_log where project_id = '${D}' and action like 'sales%'`)).length === 0);
  check('sales history is visible to the manager', (await as('pm2', `select id from public.activity_log where project_id = '${D}' and action like 'sales%'`)).length >= 1);
  check('notifications are private to the recipient', (await as('pm1', `select id from public.notifications where recipient_id = '${U.emp1}'`)).length === 0);
  await expectDenied('a notification cannot be rewritten', () => as('emp1', `update public.notifications set title = 'x' where recipient_id = '${U.emp1}' returning id`));
  await expectOk('a notification can be marked read', () => as('emp1', `update public.notifications set read_at = now() where recipient_id = '${U.emp1}' returning id`));
  await expectDenied('employee cannot change skill tags', () => as('emp1', `update public.profiles set skills = '{Figma}' where id = '${U.emp1}' returning id`));
  await expectOk('CEO sets skill tags', () => as('ceoA', `update public.profiles set skills = '{UI/UX,Mobile}' where id = '${U.emp1}' returning id`));
  await expectDenied("cannot change someone else's notification settings", () => as('ceoA', `update public.profiles set notification_prefs = '{"task_assigned": false}' where id = '${U.emp1}' returning id`));
  // Deadline reminders: project due Sunday 22 Nov 2026 -> reminder on Wednesday 18 Nov (Fri/Sat skipped)
  await as('service', `update public.projects set due_date = '2026-11-22' where id = '${D}'`);
  await as('service', `select public.send_deadline_reminders('2026-11-17')`);
  check('no reminder 3 working days before', (await as('ceoA', `select id from public.notifications where kind = 'deadline_reminder'`)).length === 0);
  await as('service', `select public.send_deadline_reminders('2026-11-18')`);
  check('CEO gets a reminder 2 working days before', (await as('ceoA', `select id from public.notifications where kind = 'deadline_reminder'`)).length === 1);
  check('the project manager gets it too', (await as('pm2', `select id from public.notifications where kind = 'deadline_reminder'`)).length === 1);
  await as('service', `select public.send_deadline_reminders('2026-11-18')`);
  check('the reminder is not sent twice', (await as('ceoA', `select id from public.notifications where kind = 'deadline_reminder'`)).length === 1);
  check('employees do not get deadline reminders', (await as('emp1', `select id from public.notifications where kind = 'deadline_reminder'`)).length === 0);
  await as('service', `select public.send_deadline_reminders('2026-11-23')`);
  check('an overdue reminder follows a missed deadline', (await as('ceoA', `select title from public.notifications where kind = 'deadline_reminder' and title like '%missed%'`)).length === 1);

  console.log('\nProfiles & roles');
  await expectDenied('employee cannot promote themselves', () => as('emp1', `update public.profiles set role = 'ceo' where id = '${U.emp1}' returning id`));
  await expectOk('employee updates their own name', () => as('emp1', `update public.profiles set full_name = 'Eli E.' where id = '${U.emp1}'`));
  await expectDenied('employee cannot rename a coworker', () => as('emp1', `update public.profiles set full_name = 'x' where id = '${U.emp2}' returning id`));
  await expectOk('CEO changes an employee role', () => as('ceoA', `update public.profiles set role = 'pm' where id = '${U.emp2}'`));
  await expectDenied('the last CEO cannot demote themselves', () => as('ceoA', `update public.profiles set role = 'pm' where id = '${U.ceoA}' returning id`));
  await expectDenied('CEO of another org cannot change roles here', () => as('ceoB', `update public.profiles set role = 'ceo' where id = '${U.emp1}' returning id`));
  check('profiles are scoped to the organization', (await as('empB', `select id from public.profiles`)).length === 2);
  check('organization rows are scoped', (await as('empB', `select id from public.organizations`)).length === 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
