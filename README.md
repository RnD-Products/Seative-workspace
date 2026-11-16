# Seative Workspace

A team project-management web app. Employees track their own work, project managers plan and assign it, and the CEO sees progress across the company. AI helpers (powered by Claude) draft plans, summaries and updates. A person always reviews an AI draft before anything is saved.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · shadcn/ui-style components on Radix · Supabase (Postgres, Auth, RLS) · Zod · React Hook Form · Recharts · Anthropic SDK · Vercel

---

## What's included

| Area | Details |
|---|---|
| Sign-in & workspace | Email/password sign-in and sign-out. The user's name, role and organization are shown in the sidebar. A first-run `/setup` flow creates the organization and the first CEO. |
| Role-aware overview | **Employee:** open, due-soon and overdue tasks plus recent updates. **PM:** health of their projects, overdue work and team workload. **CEO:** company-wide status, task completion, overdue work, workload and an AI briefing. |
| Projects | List, search and filter projects; create and edit them; set members and manager. The detail page has a summary, members, progress, a task list or board, and activity. |
| Tasks | Create, edit, assign and delete tasks (subject to role). List and Kanban views, with drag and drop plus a keyboard-friendly status menu. Filter by project, assignee, status, priority and due date. Filters are kept in the URL. |
| My Work | All tasks assigned to me, grouped by due date. Quick status changes and progress updates. |
| Team | Workload per person, scoped to what each role may see. Listed alphabetically, never ranked. |
| Activity | Written by database triggers: project created, members added or removed, task created, assigned, status changed and due date changed, comments, and AI-assisted actions. Each entry shows who and when. |
| Settings | Your own profile and password. The CEO can also add members, change roles and rename the organization. |
| Desktop install | The app ships a web manifest, so Chrome or Edge on Windows and macOS can install it as a desktop app. |

### AI features (all optional)

| | Feature | Who | Safeguards |
|---|---|---|---|
| A | **Project brief → draft plan** | PM (own projects), CEO | Suggests milestones and tasks with dates and a suggested *role*, never a person. You edit, untick and choose what to add. Tasks are created unassigned. |
| B | **Summarize progress** | PM, CEO | Labelled AI-generated, with timestamp, regenerate and copy. If the project has too little data, the app says so without calling the model. |
| C | **Risk & delay signals** | PM, CEO | *Observed facts* (overdue, due soon but not started, stalled, unassigned, comments reporting a blocker, deadline pressure) are calculated from the database. The AI only interprets them, and any signal that cites no real fact is thrown away. You can mark signals reviewed or dismiss them. |
| D | **Task assistant** | Anyone who can view the task | Break down a task, clarify it, or write acceptance criteria. The task is unchanged until the assignee or manager applies the draft. |
| E | **Draft a personal update** | Anyone who can comment | Turns rough notes into an update you can edit. It is never posted automatically and is marked "AI-assisted" when posted. |
| F | **Ask about work** | Everyone | Answers using only records fetched with the user's own permissions. Sources link to the projects and tasks used. Questions about data outside the user's access are flagged as such. |

---

## Security model

Permissions are enforced **in the database** (Row Level Security plus guard triggers), and server code checks them again. Hiding a button is never the only protection.

* **Organization boundary.** Every table has `organization_id`. Policies only return rows from the caller's organization, and the server sets the organization itself rather than trusting the request.
* **CEO:** can see and manage every project in the organization, assign project managers, change roles and add members.
* **PM:** can create projects (always as their manager) and manage the projects they manage. A PM can't reassign the manager.
* **Employee:** can see projects they're a member of. On tasks assigned to them they can change only the **status and description**. They can comment on tasks in their projects.
* Assignees must be members of the project. Comment authors and task creators are set by the database, so they can't be faked.
* AI artifacts are read-only apart from their review status. Activity entries can't be forged; users can only add `ai_*` assistance records about projects they can see.
* The service-role key is used in one place only: creating a member's login, *after* the caller is confirmed as CEO.

See `supabase/migrations/20261116000002_security.sql`. Every policy is commented.

### AI privacy

* Claude is called only from server actions, using the official Anthropic SDK. `ANTHROPIC_API_KEY` is never sent to the browser.
* Each request sends the minimum it needs, fetched through the signed-in user's RLS-scoped client:
  * Project features get only that project's data.
  * The CEO briefing gets per-project totals only.
  * "Ask about work" gets only the user's visible records, using short reference ids.
* Prompts never include auth tokens, emails or secrets.
* User content is wrapped in `<data>` blocks. The system prompt tells Claude to treat that content as untrusted and ignore any instructions inside it. Claude has no tools, so it can't read or change anything itself.
* Claude's structured output is constrained with a JSON schema, then checked again with strict Zod schemas covering lengths, enums, dates and allowed ids. Anything invalid is discarded with a clear message.
* Missing keys, rate limits, timeouts and provider errors produce friendly messages, and the rest of the app keeps working. Each user is limited to 20 AI requests per 10 minutes (configurable with `AI_RATE_LIMIT`).
* Metrics such as progress, health and counts are always calculated from database records, never from AI output.

---

## Setup

### 1. Requirements
Node.js 20 or later and a Supabase project (the free tier is fine).

### 2. Install
```bash
npm install
cp .env.example .env.local
```

### 3. Configure Supabase
1. In Supabase, open **Project Settings → API** and copy into `.env.local`:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY` (server only; needed for "Add member")
2. **Run the migrations.** Either
   * paste each file in `supabase/migrations/` into the **SQL Editor** and run them in order, or
   * with the Supabase CLI: `supabase link --project-ref <ref>` then `supabase db push`.
3. **Authentication → Providers → Email:** keep Email enabled. For the smoothest first run you can turn off **Confirm email**. If you keep it on, the CEO confirms by email and then finishes setup after signing in.
4. Optional but recommended: **Authentication → Sign In / Providers**, turn off "Allow new users to sign up" *after* setup. Members are created by the CEO, so public sign-up isn't needed.

### 4. Create the organization and first CEO account
```bash
npm run dev
```
Open http://localhost:3000/setup and enter the organization name, your name, email and password. This page only works while **no organization exists**, and the database enforces that, so it can't be used to take over a workspace later.

Then go to **Settings → Members → Add member** to create logins for PMs and employees. Each gets a temporary password that you share with them privately; they can change it in Settings.

### 5. Turn on AI (optional)
Add to `.env.local` (or to your Vercel project's environment variables):
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5-5   # optional
```
Restart the server. Without a key, AI buttons are replaced by a short "AI is not configured" note.

### 6. Demo data (optional, preview only)
```bash
npm run seed:demo
```
This creates a separate organization, "Demo Company (sample data)", with sample users (`demo-ceo@example.com`, `demo-pm@example.com`, … password `demo-password-123`) and projects prefixed `[Sample]`. Don't run it against production.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (Next.js rules) |
| `npm run typecheck` | TypeScript |
| `npm run test:rls` | **Authorization tests:** runs the real migrations in an embedded Postgres (PGlite) and checks 64 allow/deny cases for employee, PM, CEO, another organization and anonymous visitors. No Supabase needed. |
| `npm run seed:demo` | Optional sample data |

## Deploying to Vercel
1. Push the repo to GitHub and import it in Vercel.
2. Add the same environment variables. Keep `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` as server-only; don't prefix them with `NEXT_PUBLIC_`.
3. In Supabase **Authentication → URL Configuration**, set the Site URL to your Vercel domain.

## Project structure
```
src/
  app/
    (app)/            signed-in pages: overview, my-work, projects, tasks, team, settings, ask
    actions/          server actions (auth, projects, tasks, members, ai) — all validated with Zod
    login/ setup/     public pages
  components/         UI kit (components/ui), task views, AI cards, forms
  lib/
    ai/               Claude client, schemas, rate limit, risk facts (deterministic)
    supabase/         server / browser / admin clients
    domain.ts         labels, health and progress calculations
    queries.ts        RLS-scoped reads
    validation.ts     shared Zod schemas
supabase/migrations/  schema + security (RLS, triggers, setup RPC)
scripts/              RLS tests, demo seed
```

## Known limitations of this first release
* The AI rate limit is per server instance, so on serverless hosting it's approximate. Use Redis or Upstash for a global limit.
* There are no file attachments, notifications or real-time updates yet. Supabase Storage and Realtime are the natural next steps.
* Members are created by the CEO with a temporary password. Email invitations need SMTP configured in Supabase.
