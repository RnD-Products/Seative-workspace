'use client';
import { RelTime } from '@/components/rel-time';
import { useState, useTransition } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import type { Artifact } from '@/lib/types';
import type { ProgressSummary } from '@/lib/ai/schemas';
import { summarizeProject } from '@/app/actions/ai';
import { AiUnavailable } from './ai-unavailable';
import { CopyButton } from './copy-button';

const SECTIONS: [keyof ProgressSummary, string][] = [['completed', 'Completed'], ['next_steps', 'Next steps'], ['blockers', 'Blockers'], ['risks', 'Risks']];

export function summaryToText(s: ProgressSummary) {
  return [s.overview, ...SECTIONS.filter(([k]) => (s[k] as string[]).length).map(([k, label]) => `${label}:\n${(s[k] as string[]).map((x) => `- ${x}`).join('\n')}`)].join('\n\n');
}

export function ProgressSummaryCard({ projectId, latest, aiEnabled }: { projectId: string; latest: Artifact<ProgressSummary> | null; aiEnabled: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ content: ProgressSummary; created_at: string; insufficient?: boolean } | null>(latest ? { content: latest.content, created_at: latest.created_at } : null);

  const run = () => start(async () => {
    setError(null);
    const res = await summarizeProject(projectId);
    if (!res.ok) setError(res.error);
    else if (res.data) setSummary(res.data);
  });

  return (
    <Card className="border-ai/15">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="size-4 text-ai" aria-hidden /> Progress summary</CardTitle>
          <CardDescription>Drafted by AI from this project&apos;s tasks, updates and activity.</CardDescription>
        </div>
        {aiEnabled && (
          <Button variant="ai" size="sm" onClick={run} disabled={pending}>
            {pending ? <Spinner /> : summary ? <RefreshCw /> : <Sparkles />} {summary ? 'Regenerate' : 'Summarize progress'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        {!aiEnabled && <AiUnavailable />}
        {error && <Alert tone="error">{error}</Alert>}
        {pending && !summary && <p className="text-sm text-muted-foreground">Reading the project…</p>}
        {summary ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <AiLabel />
              <span className="text-xs text-muted-foreground"><RelTime iso={summary.created_at} prefix="Created " />{summary.insufficient ? ' · not saved' : ''}</span>
              {summary.content.data_sufficiency !== 'sufficient' && <span className="text-xs font-medium text-warning">Limited data — treat with care</span>}
              <span className="ml-auto"><CopyButton text={summaryToText(summary.content)} /></span>
            </div>
            <p className="leading-relaxed">{summary.content.overview}</p>
            {SECTIONS.map(([key, label]) => {
              const items = summary.content[key] as string[];
              if (!items.length) return null;
              return (
                <div key={key}>
                  <h3 className="text-[13px] font-medium text-muted-foreground">{label}</h3>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">AI can make mistakes. Progress figures elsewhere on this page are calculated from the database.</p>
          </div>
        ) : (
          !pending && aiEnabled && !error && <p className="text-sm text-muted-foreground">No summary yet. Generate one to get completed work, next steps, blockers and risks at a glance.</p>
        )}
      </CardContent>
    </Card>
  );
}
