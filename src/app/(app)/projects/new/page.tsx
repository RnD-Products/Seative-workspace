import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { ProjectForm } from '@/components/forms/project-form';
import { requireSession, canCreateProjects } from '@/lib/session';
import { db, listProfiles } from '@/lib/queries';

export const metadata = { title: 'New project' };

export default async function NewProjectPage() {
  const session = await requireSession();
  if (!canCreateProjects(session)) redirect('/projects');
  const people = await listProfiles(await db());
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New project" description="You can draft tasks with AI after the project is created." />
      <Card><CardContent className="pt-5"><ProjectForm people={people} me={session.profile} /></CardContent></Card>
    </div>
  );
}
