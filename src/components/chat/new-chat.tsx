'use client';

import { useMemo, useState, useTransition } from 'react';
import { MessageSquarePlus, Search } from 'lucide-react';
import { Avatar } from '@/components/badges';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/misc';
import { openDm } from '@/app/actions/chat';
import { ROLE_LABEL } from '@/lib/domain';
import type { Role } from '@/lib/types';

export function NewChatButton({ people, meId }: { people: { id: string; full_name: string; role: Role }[]; meId: string }) {
  const [q, setQ] = useState('');
  const [pending, start] = useTransition();
  const [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => people.filter((p) => p.id !== meId && p.full_name.toLowerCase().includes(q.trim().toLowerCase())), [people, meId, q]);
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm"><MessageSquarePlus /> New message</Button></DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>New message</DialogTitle><DialogDescription>A private chat between you and one person. Nobody else can read it, including the CEO.</DialogDescription></DialogHeader>
        <label className="flex items-center gap-2 rounded-md border border-input px-2.5">
          <Search className="size-4 text-muted-foreground" aria-hidden />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="h-9 flex-1 bg-transparent text-[13.5px] outline-none" />
        </label>
        <ul className="-mx-2 max-h-72 overflow-y-auto">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={pending} onClick={() => { setPicked(p.id); start(() => openDm(p.id)); }}
                className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13.5px] hover:bg-muted disabled:opacity-60">
                <Avatar person={p} size="md" /><span className="flex-1">{p.full_name}</span>
                {pending && picked === p.id ? <Spinner /> : <span className="text-[11.5px] text-muted-foreground">{ROLE_LABEL[p.role]}</span>}
              </button>
            </li>
          ))}
          {!list.length && <li className="px-2 py-3 text-[13px] text-muted-foreground">No one matches “{q}”.</li>}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
