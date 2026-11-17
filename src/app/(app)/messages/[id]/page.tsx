import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Hash, Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/badges';
import { ChatList, chatTitle } from '@/components/chat/chat-list';
import { ChatRoom } from '@/components/chat/chat-room';
import { NewChatButton } from '@/components/chat/new-chat';
import { requireSession } from '@/lib/session';
import { loadChatSidebar } from '@/lib/chat-server';
import { CHAT_PAGE, type Message } from '@/lib/chat';
import { ROLE_LABEL } from '@/lib/domain';

export const metadata = { title: 'Messages' };

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, requireSession()]);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { supabase, chats, people, peopleMap, projects, projectRows } = await loadChatSidebar();
  const { data: conv } = await supabase.from('conversations').select('id, kind, project_id').eq('id', id).maybeSingle();
  if (!conv) notFound();
  const [{ data: rows }, { data: members }] = await Promise.all([
    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(CHAT_PAGE),
    supabase.from('conversation_members').select('profile_id').eq('conversation_id', id),
  ]);
  const initial = ((rows ?? []) as Message[]).reverse();
  const summary = chats.find((c) => c.id === id) ?? { id, kind: conv.kind, project_id: conv.project_id, other_id: (members ?? []).map((m) => m.profile_id).find((p) => p !== session.userId) ?? null, last_message_at: null, unread: 0, last_body: null, last_author: null };
  const title = chatTitle(summary, peopleMap, projects);
  const other = summary.other_id ? peopleMap.get(summary.other_id) : null;

  // Who can be @mentioned in a project chat: the team, the PM, the CEO and the deal's Sales owner.
  let mentionable: { id: string; full_name: string }[] = [];
  let subtitle: React.ReactNode = null;
  if (conv.kind === 'project' && conv.project_id) {
    const project = projectRows.find((p) => p.id === conv.project_id);
    const [{ data: team }, { data: sales }] = await Promise.all([
      supabase.from('project_members').select('profile_id').eq('project_id', conv.project_id),
      supabase.from('project_sales').select('sales_owner_id').eq('project_id', conv.project_id).maybeSingle(),
    ]);
    const ids = new Set<string>([...(team ?? []).map((t) => t.profile_id), ...(project?.manager_id ? [project.manager_id] : []), ...(sales?.sales_owner_id ? [sales.sales_owner_id] : [])]);
    people.filter((p) => p.role === 'ceo').forEach((p) => ids.add(p.id));
    mentionable = people.filter((p) => ids.has(p.id)).map((p) => ({ id: p.id, full_name: p.full_name }));
    subtitle = <>Team chat · {mentionable.length} people · <Link href={`/projects/${conv.project_id}`} className="hover:underline">Open project</Link></>;
  } else if (other) {
    subtitle = <span className="inline-flex items-center gap-1"><Lock className="size-3" aria-hidden />{ROLE_LABEL[other.role]} · private between the two of you</span>;
  }

  return (
    <div className="chat-frame grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="hidden min-h-0 flex-col overflow-hidden lg:flex">
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-3">
          <h1 className="text-[15px] font-semibold">Messages</h1>
          <NewChatButton people={people.map((p) => ({ id: p.id, full_name: p.full_name, role: p.role }))} meId={session.userId} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto"><ChatList chats={chats} people={peopleMap} projects={projects} activeId={id} meId={session.userId} /></div>
      </Card>
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <Link href="/messages" className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted lg:hidden" aria-label="All conversations"><ArrowLeft className="size-4" /></Link>
          {conv.kind === 'dm'
            ? <Avatar person={other ?? null} size="lg" />
            : <span className="grid size-9 place-items-center rounded-full text-white" style={{ background: projects.get(conv.project_id ?? '')?.color }}><Hash className="size-4" aria-hidden /></span>}
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold">{title}</h2>
            {subtitle && <p className="text-[12px] text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <ChatRoom
          key={id}
          conversationId={id}
          initial={initial}
          people={people.map((p) => ({ id: p.id, full_name: p.full_name }))}
          meId={session.userId}
          mentionable={mentionable}
          placeholder={conv.kind === 'dm' ? `Message ${other?.full_name.split(' ')[0] ?? ''}` : `Message the ${title} team`}
          emptyHint={conv.kind === 'dm' ? `This is the start of your private chat with ${other?.full_name ?? 'this person'}.` : 'No messages yet. Say hello to the team, or type @ to mention someone.'}
        />
      </Card>
    </div>
  );
}
