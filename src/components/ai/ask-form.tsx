'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FolderKanban, ListChecks, Lock, Send, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import { askAboutWork, type AskAnswer } from '@/app/actions/ai';
import { CopyButton } from './copy-button';

const EXAMPLES = ['What is overdue this week?', 'Which projects need attention?', 'What should I work on next?', 'What is still unassigned?'];

export function AskForm() {
  const [question, setQuestion] = useState('');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<{ q: string; a: AskAnswer; at: string }[]>([]);

  const submit = (q: string) => {
    if (q.trim().length < 3) return;
    start(async () => {
      setError(null);
      const res = await askAboutWork(q);
      if (!res.ok) setError(res.error);
      else { setHistory((h) => [{ q, a: res.data!, at: new Date().toLocaleTimeString() }, ...h]); setQuestion(''); }
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <form onSubmit={(e) => { e.preventDefault(); submit(question); }} className="space-y-3">
            <label htmlFor="question" className="text-sm font-medium">Your question</label>
            <Textarea id="question" rows={3} maxLength={500} value={question} onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(question); } }}
              placeholder="e.g. What's due on the website project this week?" />
            <div className="flex flex-wrap items-center gap-2">
              {EXAMPLES.map((ex) => <Button key={ex} type="button" size="sm" variant="secondary" onClick={() => { setQuestion(ex); submit(ex); }} disabled={pending}>{ex}</Button>)}
              <Button type="submit" variant="ai" className="ml-auto" disabled={pending || question.trim().length < 3}>{pending ? <Spinner /> : <Send />} Ask</Button>
            </div>
          </form>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3" aria-hidden /> Answers use only the projects and tasks you already have access to.</p>
        </CardContent>
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      {pending && <p className="text-sm text-muted-foreground" aria-live="polite">Looking through your work…</p>}
      <div className="space-y-4" aria-live="polite">
        {history.map((h, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 pt-5">
              <p className="text-sm font-medium">{h.q}</p>
              <div className="flex items-center gap-2"><AiLabel /><span className="text-xs text-muted-foreground">{h.at} · based on {h.a.scope.projects} projects and {h.a.scope.tasks} tasks you can see</span><span className="ml-auto"><CopyButton text={h.a.answer} /></span></div>
              {h.a.outsideAccess && <Alert tone="warning">Part of this question is about information outside your access, so it wasn&apos;t used.</Alert>}
              <p className="whitespace-pre-line text-sm leading-relaxed">{h.a.answer}</p>
              {h.a.references.length > 0 && (
                <div>
                  <p className="text-[13px] font-medium text-muted-foreground">Sources</p>
                  <ul className="mt-1.5 flex flex-wrap gap-2">
                    {h.a.references.map((r) => (
                      <li key={r.id}>
                        <Link href={r.type === 'project' ? `/projects/${r.id}` : `/tasks/${r.id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs hover:bg-muted">
                          {r.type === 'project' ? <FolderKanban className="size-3" aria-hidden /> : <ListChecks className="size-3" aria-hidden />}{r.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {!history.length && !pending && (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Sparkles className="size-5 text-ai" aria-hidden />Ask anything about your projects, tasks and deadlines.
          </div>
        )}
      </div>
    </div>
  );
}
