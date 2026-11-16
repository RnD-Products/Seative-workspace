'use client';
import { RelTime } from '@/components/rel-time';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import type { Artifact } from '@/lib/types';
import type { OrgSummary } from '@/lib/ai/schemas';
import { summarizeOrganization } from '@/app/actions/ai';
import { CopyButton } from './copy-button';

export function OrgSummaryCard({ latest, aiEnabled }: { latest: Artifact | null; aiEnabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{ content: OrgSummary; created_at: string } | null>(latest ? { content: latest.content as OrgSummary, created_at: latest.created_at } : null);
  if (!aiEnabled && !data) return null;
  const c = data?.content;
  const text = c ? [c.overview, ...c.highlights.map((h) => `+ ${h}`), ...c.attention.map((a) => `! ${c.projects?.[a.project_ref]?.name ?? a.project_ref}: ${a.reason}`)].join('\n') : '';

  return (
    <Card className="border-ai/15">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-ai" aria-hidden /> Company briefing</CardTitle>
          <CardDescription>AI summary of per-project figures. Figures above are calculated directly from the database.</CardDescription>
        </div>
        {aiEnabled && (
          <Button variant="ai" size="sm" disabled={pending} onClick={() => start(async () => {
            setError(null);
            const res = await summarizeOrganization();
            if (!res.ok) setError(res.error); else if (res.data) setData(res.data);
          })}>{pending ? <Spinner /> : data ? <RefreshCw /> : <Sparkles />} {data ? 'Regenerate' : 'Summarize company progress'}</Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm" aria-live="polite">
        {error && <Alert tone="error">{error}</Alert>}
        {c ? (
          <>
            <div className="flex items-center gap-2"><AiLabel /><span className="text-xs text-muted-foreground"><RelTime iso={data!.created_at} prefix="Created " /></span><span className="ml-auto"><CopyButton text={text} /></span></div>
            <p className="leading-relaxed">{c.overview}</p>
            <div className="grid gap-4 md:grid-cols-3">
              {c.highlights.length > 0 && <div><h3 className="text-[13px] font-medium text-muted-foreground">Highlights</h3><ul className="mt-1 list-disc space-y-0.5 pl-5">{c.highlights.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
              {c.attention.length > 0 && (
                <div>
                  <h3 className="text-[13px] font-medium text-muted-foreground">Needs attention</h3>
                  <ul className="mt-1 space-y-1">
                    {c.attention.map((a, i) => {
                      const p = c.projects?.[a.project_ref];
                      return <li key={i}>{p ? <Link href={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link> : a.project_ref}: <span className="text-foreground/80">{a.reason}</span></li>;
                    })}
                  </ul>
                </div>
              )}
              {c.data_gaps.length > 0 && <div><h3 className="text-[13px] font-medium text-muted-foreground">Data gaps</h3><ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">{c.data_gaps.map((h, i) => <li key={i}>{h}</li>)}</ul></div>}
            </div>
          </>
        ) : (
          !pending && <p className="text-muted-foreground">Get a short briefing on overall progress and the projects that need attention.</p>
        )}
      </CardContent>
    </Card>
  );
}
