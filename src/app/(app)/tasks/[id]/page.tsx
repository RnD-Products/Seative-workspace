import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, TaskStatusBadge } from '@/components/badges';
import { ActivityFeed } from '@/components/work-items';
import { DescriptionEditor, EditTaskDialog, StatusControl, TaskProperties, TitleEditor } from '@/components/tasks/task-detail-controls';
import { isOwnTask } from '@/components/tasks/types';
import { DeleteTaskButton } from '@/components/delete-buttons';
import { TaskAssistant } from '@/components/ai/task-assistant';
import { CommentComposer } from '@/components/ai/comment-composer';
import { requireSession } from '@/lib/session';
import { byId, canManage, db, getTaskDetail, listProfiles } from '@/lib/queries';
import { dueLabel, fmtDate, fmtRelative, isOverdue } from '@/lib/domain';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data } = await (await db()).from('tasks').select('title').eq('id', id).maybeSingle();
  return { title: data?.title ?? 'Task' };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, requireSession()]);
  const supabase = await db();
  const detail = await getTaskDetail(supabase, id);
  if (!detail) notFound();
  const { task, project, comments, activity } = detail;
  const [people, { data: members }] = await Promise.all([
    listProfiles(supabase),
    supabase.from('project_members').select('profile_id').eq('project_id', project.id),
  ]);
  const peopleMap = byId(people);
  const manages = canManage(project, session.profile);
  const isAssignee = task.assignee_id === session.userId;
  const canEditStatus = manages || isAssignee;
  const canEditAll = manages || isOwnTask(task, session.profile);
  const creator = task.created_by ? peopleMap.get(task.created_by) : null;
  const ref = { id: project.id, name: project.name, manager_id: project.manager_id, memberIds: (members ?? []).map((m) => m.profile_id as string) };
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeader
        back={<Link href={`/projects/${project.id}`} className="text-sm text-muted-foreground hover:text-foreground">← {project.name}</Link>}
        title={<TitleEditor taskId={task.id} title={task.title} canEdit={canEditAll} />}
        actions={canEditAll && (
          <>
            <EditTaskDialog taskId={task.id} projects={[ref]} people={people} me={session.profile} defaults={{
              project_id: task.project_id, title: task.title, description: task.description, status: task.status, priority: task.priority,
              assignee_id: task.assignee_id ?? '', start_date: task.start_date ?? '', due_date: task.due_date ?? '',
            }} />
            <DeleteTaskButton id={task.id} projectId={project.id} />
          </>
        )}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Description</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <DescriptionEditor taskId={task.id} description={task.description} canEdit={canEditStatus} />
              <TaskAssistant taskId={task.id} currentDescription={task.description} canEdit={canEditStatus} aiEnabled={aiEnabled} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Comments &amp; progress updates</CardTitle><span className="text-xs text-muted-foreground">{comments.length}</span></CardHeader>
            <CardContent className="space-y-5">
              {comments.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Share progress, questions or blockers here.</p>}
              <ol className="space-y-4">
                {comments.map((c) => {
                  const author = c.author_id ? peopleMap.get(c.author_id) : null;
                  return (
                    <li key={c.id} className="flex gap-3">
                      <Avatar person={author ?? null} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm">
                          <span className="font-medium">{author?.full_name ?? 'Former member'}</span>
                          <time className="text-xs text-muted-foreground" dateTime={c.created_at} title={new Date(c.created_at).toLocaleString()}>{fmtRelative(c.created_at)}</time>
                          {c.is_progress_update && <span className="rounded bg-info-soft px-1.5 text-xs font-medium text-info">Progress update</span>}
                          {c.ai_assisted && <span className="inline-flex items-center gap-0.5 text-xs text-ai"><Sparkles className="size-3" aria-hidden /> AI-assisted</span>}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground/85">{c.body}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="border-t pt-4"><CommentComposer taskId={task.id} aiEnabled={aiEnabled} defaultProgress={isAssignee} /></div>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardContent className="space-y-4 pt-5 text-sm">
              {canEditStatus ? <StatusControl taskId={task.id} status={task.status} /> : <div><p className="text-xs text-muted-foreground">Status</p><div className="mt-1"><TaskStatusBadge status={task.status} /></div></div>}
              <TaskProperties
                task={{ id: task.id, priority: task.priority, assignee_id: task.assignee_id, due_date: task.due_date, start_date: task.start_date }}
                people={people.filter((p) => ref.memberIds.includes(p.id) || p.id === project.manager_id || p.id === task.assignee_id)}
                canEditFields={canEditAll}
                canAssign={manages}
              />
              {isOverdue(task) && <p className="rounded-md bg-destructive-soft px-2.5 py-1.5 text-[12.5px] font-medium text-destructive">{dueLabel(task)}</p>}
              <dl className="space-y-3 border-t pt-4">
                <div><dt className="text-xs text-muted-foreground">Created by</dt><dd className="mt-1">{creator?.full_name ?? '—'} · {fmtDate(task.created_at.slice(0, 10))}</dd></div>
                {task.completed_at && <div><dt className="text-xs text-muted-foreground">Completed</dt><dd className="mt-1">{fmtDate(task.completed_at.slice(0, 10))}</dd></div>}
              </dl>
              {!canEditStatus && <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">Only the assignee and the project manager can change this task. You can still comment.</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>History</CardTitle></CardHeader>
            <CardContent><ActivityFeed items={activity} people={peopleMap} emptyText="No changes yet." /></CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}
