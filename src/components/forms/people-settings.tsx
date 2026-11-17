'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { TagInput } from '@/components/sales/sales-form';
import { updateSkills } from '@/app/actions/sales';
import { updateNotificationPrefs } from '@/app/actions/notifications';
import type { Role } from '@/lib/types';

export function SkillsEditor({ profileId, name, skills }: { profileId: string; name: string; skills: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(skills);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) setValue(skills); }}>
      <DialogTrigger asChild>
        <button className="flex min-h-6 flex-wrap items-center gap-1 rounded-md px-1 py-0.5 text-left hover:bg-foreground/[0.05]" title="Edit skills">
          {skills.length ? skills.map((s) => <span key={s} className="rounded-[4px] border border-border-strong px-1.5 text-[11px] text-muted-foreground">{s}</span>)
            : <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground"><Tags className="size-3" /> Add skills</span>}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Skills for {name}</DialogTitle><DialogDescription>PMs see these when picking a team for a new deal.</DialogDescription></DialogHeader>
        <TagInput value={value} onChange={setValue} placeholder="e.g. UI/UX, Branding" />
        <div className="flex justify-end">
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await updateSkills(profileId, value);
            if (!r.ok) { toast.error(r.error); return; }
            toast('Skills saved'); setOpen(false); router.refresh();
          })}>{pending && <Spinner />} Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const ALL: { key: string; label: string; roles?: Role[] }[] = [
  { key: 'task_assigned', label: 'A task is assigned to me' },
  { key: 'project_added', label: 'I am added to a project' },
  { key: 'incoming_project', label: 'A new deal arrives from Sales', roles: ['pm', 'ceo'] },
  { key: 'team_assigned', label: 'A team is assigned to my deal', roles: ['sales', 'ceo'] },
  { key: 'deadline_reminder', label: 'Project deadline reminders', roles: ['pm', 'ceo'] },
  { key: 'chat_message', label: 'Someone sends me a private message' },
  { key: 'chat_mention', label: 'Someone @mentions me in a project chat' },
];

export function NotificationPrefs({ role, prefs }: { role: Role; prefs: Record<string, boolean> }) {
  const [value, setValue] = useState(prefs);
  const [pending, start] = useTransition();
  const items = ALL.filter((i) => !i.roles || i.roles.includes(role));
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((i) => {
        const on = value[i.key] !== false;
        return (
          <li key={i.key} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[13px]">
            <span>{i.label}</span>
            <button role="switch" aria-checked={on} aria-label={i.label} disabled={pending}
              onClick={() => {
                const next = { ...value, [i.key]: !on };
                setValue(next);
                start(async () => { const r = await updateNotificationPrefs(next); if (!r.ok) { setValue(value); toast.error(r.error); } else toast(on ? 'Turned off' : 'Turned on'); });
              }}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-primary shadow-[0_0_10px_-2px_var(--primary)]' : 'bg-foreground/15'}`}>
              <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
