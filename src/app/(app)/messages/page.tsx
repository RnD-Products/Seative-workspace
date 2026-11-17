import { MessagesSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ChatList } from '@/components/chat/chat-list';
import { NewChatButton } from '@/components/chat/new-chat';
import { requireSession } from '@/lib/session';
import { loadChatSidebar } from '@/lib/chat-server';

export const metadata = { title: 'Messages' };

export default async function MessagesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const { chats, people, peopleMap, projects } = await loadChatSidebar();
  return (
    <div className="chat-frame grid gap-4 lg:grid-cols-[340px_1fr]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-2 border-b px-3.5 py-3">
          <h1 className="text-[15px] font-semibold">Messages</h1>
          <NewChatButton people={people.map((p) => ({ id: p.id, full_name: p.full_name, role: p.role }))} meId={session.userId} />
        </div>
        {sp.error && <p className="border-b bg-destructive-soft px-3.5 py-2 text-[12.5px] text-destructive">That chat could not be opened.</p>}
        <div className="min-h-0 flex-1 overflow-y-auto"><ChatList chats={chats} people={peopleMap} projects={projects} meId={session.userId} /></div>
      </Card>
      <Card className="hidden place-items-center lg:grid">
        <div className="max-w-sm px-6 text-center">
          <MessagesSquare className="mx-auto size-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-[14px] font-medium">Pick a conversation</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">One-to-one chats are private to the two of you. Each project also has a team chat for everyone on it. Messages can be edited, never deleted.</p>
        </div>
      </Card>
    </div>
  );
}
