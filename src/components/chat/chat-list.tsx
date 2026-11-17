import Link from 'next/link';
import { Hash } from 'lucide-react';
import { Avatar } from '@/components/badges';
import { RelTime } from '@/components/rel-time';
import type { ChatSummary } from '@/lib/chat';
import { cn } from '@/lib/utils';

type Person = { id: string; full_name: string };

export function chatTitle(c: ChatSummary, people: Map<string, Person>, projects: Map<string, { name: string; color: string }>) {
  return c.kind === 'dm' ? people.get(c.other_id ?? '')?.full_name ?? 'Former member' : projects.get(c.project_id ?? '')?.name ?? 'Project chat';
}

export function ChatList({ chats, people, projects, activeId, meId }: {
  chats: ChatSummary[]; people: Map<string, Person>; projects: Map<string, { name: string; color: string }>; activeId?: string; meId: string;
}) {
  if (!chats.length) return <p className="px-4 py-6 text-[12.5px] text-muted-foreground">No conversations yet. Start one with “New message”, or open a project’s team chat.</p>;
  return (
    <ul className="divide-y">
      {chats.map((c) => {
        const title = chatTitle(c, people, projects);
        const proj = c.project_id ? projects.get(c.project_id) : null;
        const preview = c.last_body ? `${c.last_author === meId ? 'You: ' : c.kind === 'project' && c.last_author ? `${people.get(c.last_author)?.full_name.split(' ')[0] ?? 'Someone'}: ` : ''}${c.last_body}` : 'No messages yet';
        return (
          <li key={c.id}>
            <Link href={`/messages/${c.id}`} aria-current={activeId === c.id ? 'page' : undefined}
              className={cn('flex items-center gap-3 px-3.5 py-2.5 transition-colors hover:bg-foreground/[0.03]', activeId === c.id && 'bg-primary/[0.07]')}>
              {c.kind === 'dm'
                ? <Avatar person={people.get(c.other_id ?? '') ?? null} size="lg" />
                : <span className="grid size-9 shrink-0 place-items-center rounded-full text-white" style={{ background: proj?.color }}><Hash className="size-4" aria-hidden /></span>}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={cn('truncate text-[13.5px]', c.unread ? 'font-semibold' : 'font-medium')}>{title}</span>
                  {c.last_message_at && <span className="ml-auto shrink-0 text-[11px] text-muted-foreground"><RelTime iso={c.last_message_at} /></span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn('truncate text-[12.5px]', c.unread ? 'text-foreground/85' : 'text-muted-foreground')}>{preview}</span>
                  {c.unread > 0 && <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-primary-foreground">{c.unread}</span>}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
