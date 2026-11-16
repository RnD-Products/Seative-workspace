import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { PlanDrafter } from '@/components/ai/plan-drafter';
import { AiUnavailable } from '@/components/ai/ai-unavailable';
import { requireSession } from '@/lib/session';
import { canManage, db, getProject } from '@/lib/queries';

export const metadata = { title: 'Draft tasks with AI' };

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const project = await getProject(await db(), id);
  if (!project) notFound();
  if (!canManage(project, session.profile)) redirect(`/projects/${id}`);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={<Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← {project.name}</Link>}
        title="Draft tasks with AI"
        description="Nothing is saved until you choose which tasks to add."
      />
      {process.env.ANTHROPIC_API_KEY ? (
        <PlanDrafter projectId={id} projectName={project.name} defaultGoal={project.name} defaultDescription={project.description} defaultDate={project.due_date ?? ''} />
      ) : <AiUnavailable />}
    </div>
  );
}
