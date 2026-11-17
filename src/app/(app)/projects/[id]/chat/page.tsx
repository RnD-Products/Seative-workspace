import { notFound, redirect } from 'next/navigation';
import { db } from '@/lib/queries';

/** Stable link to a project's team chat (used by notifications). */
export default async function ProjectChatRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await db();
  const { data } = await supabase.from('conversations').select('id').eq('project_id', id).maybeSingle();
  if (!data) notFound();
  redirect(`/messages/${data.id}`);
}
