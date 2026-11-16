'use client';
import { RelTime } from '@/components/rel-time';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Check, ShieldAlert, Sparkles, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import { Badge } from '@/components/ui/badge';
import type { Artifact } from '@/lib/types';
import type { RiskFact } from '@/lib/ai/risk-facts';
import type { RiskSignalContent } from '@/lib/ai/schemas';
import { reviewSignal, scanRisks } from '@/app/actions/ai';

const sevTone = { low: 'gray', medium: 'amber', high: 'red' } as const;

export function RiskSignalsCard({ projectId, facts, signals, taskTitles, aiEnabled }: {
  projectId: string; facts: RiskFact[]; signals: Artifact<RiskSignalContent>[]; taskTitles: Record<string, string>; aiEnabled: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = signals.filter((s) => !hidden.has(s.id));

  const scan = () => start(async () => {
    setMsg(null);
    const res = await scanRisks(projectId);
    if (!res.ok) setMsg({ tone: 'error', text: res.error });
    else if (res.message) setMsg({ tone: 'info', text: res.message });
    else if (res.data && res.data.signals === 0) setMsg({ tone: 'info', text: 'The AI did not find any signal it could support with the observed facts.' });
  });
  const review = (id: string, status: 'reviewed' | 'dismissed') => start(async () => {
    const res = await reviewSignal(id, status);
    if (!res.ok) setMsg({ tone: 'error', text: res.error });
    else setHidden((h) => new Set(h).add(id));
  });

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="size-4 text-warning" aria-hidden /> Risk &amp; delay signals</CardTitle>
          <CardDescription>Facts come from the database. Interpretations are AI-generated.</CardDescription>
        </div>
        {aiEnabled && facts.length > 0 && (
          <Button variant="ai" size="sm" onClick={scan} disabled={pending}>{pending ? <Spinner /> : <Sparkles />} Interpret with AI</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <section aria-labelledby="facts-h">
          <h3 id="facts-h" className="text-[13px] font-medium text-muted-foreground">Observed facts ({facts.length})</h3>
          {facts.length === 0 ? (
            <p className="mt-1 text-sm text-muted-foreground">No overdue, stalled, or at-risk items found right now.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-sm">
              {facts.slice(0, 8).map((f) => (
                <li key={f.id} className="rounded-md bg-muted/60 px-3 py-2">
                  {f.taskIds[0] ? <Link href={`/tasks/${f.taskIds[0]}`} className="font-medium hover:underline">{f.label}</Link> : <span className="font-medium">{f.label}</span>}
                  <span className="block text-xs text-muted-foreground">{f.detail}</span>
                </li>
              ))}
              {facts.length > 8 && <li className="text-xs text-muted-foreground">+{facts.length - 8} more</li>}
            </ul>
          )}
        </section>

        {visible.length > 0 && (
          <section aria-labelledby="signals-h" className="space-y-2">
            <h3 id="signals-h" className="flex items-center gap-2 text-[13px] font-medium text-muted-foreground">AI interpretation <AiLabel className="normal-case tracking-normal" /></h3>
            {visible.map((s) => (
              <article key={s.id} className="rounded-lg border border-ai/15 bg-ai-soft/40 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <Badge tone={sevTone[s.content.severity]}>{s.content.severity}</Badge>
                  <h4 className="font-medium">{s.content.title}</h4>
                </div>
                <p className="mt-1.5 text-foreground/80">{s.content.interpretation}</p>
                {s.content.suggested_action && <p className="mt-1.5"><span className="font-medium">Suggested next step:</span> {s.content.suggested_action}</p>}
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Evidence ({s.content.evidence.length})</summary>
                  <ul className="mt-1.5 space-y-1">
                    {s.content.evidence.map((e) => (
                      <li key={e.id}>
                        {e.taskIds[0] && taskTitles[e.taskIds[0]] ? <Link href={`/tasks/${e.taskIds[0]}`} className="font-medium hover:underline">{e.label}</Link> : <span className="font-medium">{e.label}</span>} — {e.detail}
                      </li>
                    ))}
                  </ul>
                </details>
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground"><RelTime iso={s.created_at} prefix="Generated " /></span>
                  <Button size="sm" variant="outline" className="ml-auto" disabled={pending} onClick={() => review(s.id, 'reviewed')}><Check /> Mark reviewed</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => review(s.id, 'dismissed')}><X /> Dismiss</Button>
                </div>
              </article>
            ))}
          </section>
        )}
      </CardContent>
    </Card>
  );
}
