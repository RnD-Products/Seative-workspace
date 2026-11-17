import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectForm } from '@/components/forms/project-form';
import { DeleteProjectButton } from '@/components/delete-buttons';
import { requireSession } from '@/lib/session';
import { canManage, db, getProjectDetail, listProfiles } from '@/lib/queries';

export const metadata = { title: 'Edit project' };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const supabase = await db();
  const detail = await getProjectDetail(supabase, id);
  if (!detail) notFound();
  if (!canManage(detail.project, session.profile)) redirect(`/projects/${id}`);
  const people = await listProfiles(supabase);
  const p = detail.project;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit project" description={p.name} actions={<DeleteProjectButton id={p.id} name={p.name} />} />
      <Card>
        <CardContent className="pt-5">
          <ProjectForm
            projectId={p.id}
            people={people}
            me={session.profile}
            defaults={{
              name: p.name, description: p.description, status: p.status === 'incoming' ? 'planning' : p.status, priority: p.priority,
              start_date: p.start_date ?? '', due_date: p.due_date ?? '', manager_id: p.manager_id ?? '', member_ids: detail.memberIds,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
