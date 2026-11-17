import 'server-only';
import { db, listProfiles } from '@/lib/queries';
import { projectColor } from '@/lib/colors';
import type { ChatSummary } from '@/lib/chat';

export async function loadChatSidebar() {
  const supabase = await db();
  const [{ data: chats }, people, { data: projects }] = await Promise.all([
    supabase.rpc('my_chats'),
    listProfiles(supabase),
    supabase.from('projects').select('id, name, manager_id'),
  ]);
  return {
    supabase,
    chats: (chats ?? []) as ChatSummary[],
    people,
    peopleMap: new Map(people.map((p) => [p.id, p])),
    projectRows: projects ?? [],
    projects: new Map((projects ?? []).map((p) => [p.id, { name: p.name, color: projectColor(p.id) }])),
  };
}
