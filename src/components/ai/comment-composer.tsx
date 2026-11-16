'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import { addComment } from '@/app/actions/tasks';
import { draftUpdate } from '@/app/actions/ai';

export function CommentComposer({ taskId, aiEnabled, defaultProgress }: { taskId: string; aiEnabled: boolean; defaultProgress: boolean }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [progress, setProgress] = useState(defaultProgress);
  const [aiUsed, setAiUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [posting, startPost] = useTransition();
  const [drafting, startDraft] = useTransition();

  return (
    <div className="space-y-2">
      <Label htmlFor="comment" className="sr-only">Add a comment or progress update</Label>
      <Textarea id="comment" rows={4} value={body} maxLength={5000}
        onChange={(e) => setBody(e.target.value)}
        placeholder={aiEnabled ? 'Write a comment — or jot rough notes and click “Draft update with AI”.' : 'Write a comment or progress update…'} />
      {aiUsed && <p className="flex items-center gap-2 text-xs text-muted-foreground"><AiLabel>AI draft</AiLabel> Review and edit before posting. It will be marked as AI-assisted.</p>}
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <Label htmlFor="is-progress" className="flex cursor-pointer items-center gap-2 font-normal">
          <Checkbox id="is-progress" checked={progress} onCheckedChange={(c) => setProgress(c === true)} /> Progress update
        </Label>
        <div className="ml-auto flex gap-2">
          {aiEnabled && (
            <Button variant="ai" size="sm" disabled={drafting || body.trim().length < 3} title="Turns your rough notes into a concise update"
              onClick={() => startDraft(async () => {
                setError(null);
                const res = await draftUpdate(taskId, body);
                if (!res.ok) setError(res.error); else { setBody(res.data!.update); setAiUsed(true); setProgress(true); }
              })}>{drafting ? <Spinner /> : <Sparkles />} Draft update with AI</Button>
          )}
          <Button size="sm" disabled={posting || !body.trim()} onClick={() => startPost(async () => {
            setError(null);
            const res = await addComment({ task_id: taskId, body, is_progress_update: progress, ai_assisted: aiUsed });
            if (!res.ok) setError(res.error); else { setBody(''); setAiUsed(false); router.refresh(); }
          })}>{posting && <Spinner />} Post</Button>
        </div>
      </div>
    </div>
  );
}
