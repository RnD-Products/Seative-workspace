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
