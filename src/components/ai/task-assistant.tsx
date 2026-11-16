'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ListTree, MessageSquareQuote, Sparkles, SquareCheckBig } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import type { AssistDraft } from '@/lib/ai/schemas';
import { applyTaskDraft, assistTask } from '@/app/actions/ai';
import { CopyButton } from './copy-button';

type Mode = 'breakdown' | 'clarify' | 'acceptance';
const MODES: { mode: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { mode: 'breakdown', label: 'Break it down', icon: ListTree },
  { mode: 'clarify', label: 'Clarify description', icon: MessageSquareQuote },
  { mode: 'acceptance', label: 'Acceptance criteria', icon: SquareCheckBig },
];

function draftToText(mode: Mode, d: AssistDraft) {
  const q = d.questions.length ? `\n\nOpen questions:\n${d.questions.map((x) => `- ${x}`).join('\n')}` : '';
  if (mode === 'clarify') return d.description + q;
  if (mode === 'breakdown') return `Subtasks:\n${d.subtasks.map((s) => `- [ ] ${s.title}${s.detail ? ` — ${s.detail}` : ''}`).join('\n')}${q}`;
  return `Acceptance criteria:\n${d.acceptance_criteria.map((c) => `- [ ] ${c}`).join('\n')}${q}`;
}

export function TaskAssistant({ taskId, currentDescription, canEdit, aiEnabled }: { taskId: string; currentDescription: string; canEdit: boolean; aiEnabled: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();
  if (!aiEnabled) return null;

  const ask = (m: Mode) => startLoad(async () => {
    setMode(m); setError(null); setOk(null); setDraft('');
    const res = await assistTask(taskId, m);
    if (!res.ok) setError(res.error); else setDraft(draftToText(m, res.data as AssistDraft));
  });
  const next = mode === 'clarify' ? draft : [currentDescription.trim(), draft].filter(Boolean).join('\n\n');

  return (
    <section aria-labelledby="assist-h" className="rounded-lg border border-ai/15 bg-ai-soft/30 p-4">
      <h3 id="assist-h" className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-ai" aria-hidden /> AI task assistant</h3>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Get a draft. The task stays unchanged until you apply it.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {MODES.map(({ mode: m, label, icon: Icon }) => (
          <Button key={m} size="sm" variant={mode === m ? 'ai' : 'outline'} disabled={loading} onClick={() => ask(m)}>
            {loading && mode === m ? <Spinner /> : <Icon className="size-4" />} {label}
          </Button>
        ))}
      </div>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
      {ok && <Alert tone="success" className="mt-3">{ok}</Alert>}
      {draft && mode && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2"><AiLabel>AI draft</AiLabel><span className="text-xs text-muted-foreground">Edit before applying</span><span className="ml-auto"><CopyButton text={draft} /></span></div>
          <label htmlFor="assist-draft" className="sr-only">Draft</label>
          <Textarea id="assist-draft" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} className="bg-card text-[13px]" />
          <div className="flex flex-wrap items-center gap-2">
            {canEdit ? (
              <Button size="sm" disabled={saving || !draft.trim()} onClick={() => startSave(async () => {
                const res = await applyTaskDraft(taskId, mode, next);
                if (!res.ok) setError(res.error); else { setOk(mode === 'clarify' ? 'Description replaced.' : 'Added to the description.'); setDraft(''); router.refresh(); }
              })}>{saving && <Spinner />}{mode === 'clarify' ? 'Replace description' : 'Append to description'}</Button>
            ) : <p className="text-xs text-muted-foreground">Only the assignee or project manager can apply changes. You can copy the draft into a comment.</p>}
            <Button size="sm" variant="ghost" onClick={() => setDraft('')}>Discard</Button>
          </div>
        </div>
      )}
    </section>
  );
}
