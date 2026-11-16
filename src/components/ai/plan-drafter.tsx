'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FormField, Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, Spinner } from '@/components/ui/misc';
import { AiLabel } from '@/components/badges';
import { PRIORITIES, PRIORITY_LABEL } from '@/lib/domain';
import type { Plan } from '@/lib/ai/schemas';
import type { Priority } from '@/lib/types';
import { applyPlan, draftPlan } from '@/app/actions/ai';

interface DraftTask {
  key: string; milestone: string; selected: boolean; title: string; description: string;
  priority: Priority; start_date: string; due_date: string; role: string;
}

export function PlanDrafter({ projectId, projectName, defaultGoal, defaultDescription, defaultDate }: {
  projectId: string; projectName: string; defaultGoal: string; defaultDescription: string; defaultDate: string;
}) {
  const router = useRouter();
  const [goal, setGoal] = useState(defaultGoal);
  const [description, setDescription] = useState(defaultDescription);
  const [targetDate, setTargetDate] = useState(defaultDate);
  const [drafting, startDraft] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [tasks, setTasks] = useState<DraftTask[] | null>(null);

  const generate = () => startDraft(async () => {
    setError(null);
    const res = await draftPlan({ projectId, goal, description, targetDate });
    if (!res.ok) { setError(res.error); return; }
    const plan = res.data as Plan;
    setAssumptions(plan.assumptions);
    setTasks(plan.milestones.flatMap((m, mi) => m.tasks.map((t, ti) => ({
      key: `${mi}-${ti}`, milestone: m.title, selected: true, title: t.title, description: t.description,
      priority: t.priority, start_date: t.start_date, due_date: t.due_date, role: t.suggested_owner_role,
    }))));
  });

  const update = (key: string, patch: Partial<DraftTask>) => setTasks((ts) => ts!.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  const selected = tasks?.filter((t) => t.selected) ?? [];
  const milestones = tasks ? [...new Set(tasks.map((t) => t.milestone))] : [];

  const save = () => startSave(async () => {
    setError(null);
    const res = await applyPlan({
      projectId,
      tasks: selected.map((t) => ({
        title: t.title.trim(),
        // Milestone and suggested role are kept as context in the description; nobody is assigned.
        description: [t.description.trim(), `Milestone: ${t.milestone}`, t.role ? `Suggested role: ${t.role}` : ''].filter(Boolean).join('\n\n'),
        priority: t.priority, start_date: t.start_date, due_date: t.due_date,
      })),
    });
    if (!res.ok) { setError(res.error); return; }
    router.push(`/projects/${projectId}`);
    router.refresh();
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><div><CardTitle>Project brief</CardTitle><CardDescription>Describe the goal. Claude suggests milestones and tasks for {projectName}; you decide what to keep.</CardDescription></div></CardHeader>
        <CardContent className="space-y-4">
          <FormField id="goal" label="Goal"><Input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={500} placeholder="e.g. Launch the new e-commerce site" /></FormField>
          <FormField id="desc" label="Details (optional)" hint="Scope, constraints, team, anything Claude should know."><Textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={3000} /></FormField>
          <FormField id="target" label="Target date (optional)"><Input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="sm:w-52" /></FormField>
          {error && <Alert tone="error">{error}</Alert>}
          <Button variant="ai" onClick={generate} disabled={drafting || goal.trim().length < 3}>{drafting ? <Spinner /> : <Sparkles />} {tasks ? 'Draft again' : 'Draft plan'}</Button>
          {drafting && <p className="text-sm text-muted-foreground" aria-live="polite">Drafting a plan — this can take up to 30 seconds…</p>}
        </CardContent>
      </Card>

      {tasks && (
        <Card className="border-ai/20">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">Draft plan <AiLabel>AI draft — review before saving</AiLabel></CardTitle>
              <CardDescription>Edit or untick anything you don&apos;t want. Tasks are added unassigned; assign people afterwards.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {assumptions.length > 0 && (
              <Alert tone="info" title="Assumptions Claude made">
                <ul className="list-disc pl-5">{assumptions.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </Alert>
            )}
            {milestones.map((m) => (
              <fieldset key={m} className="space-y-3">
                <legend className="text-sm font-semibold">{m}</legend>
                {tasks.filter((t) => t.milestone === m).map((t) => (
                  <div key={t.key} className={`rounded-lg border p-3 ${t.selected ? 'bg-card' : 'bg-muted/40 opacity-60'}`}>
                    <div className="flex items-start gap-3">
                      <Checkbox id={`sel-${t.key}`} checked={t.selected} onCheckedChange={(c) => update(t.key, { selected: c === true })} className="mt-2.5" aria-label={`Include ${t.title}`} />
                      <div className="grid flex-1 gap-2">
                        <Label htmlFor={`t-${t.key}`} className="sr-only">Title</Label>
                        <Input id={`t-${t.key}`} value={t.title} onChange={(e) => update(t.key, { title: e.target.value })} maxLength={200} className="font-medium" />
                        <Label htmlFor={`d-${t.key}`} className="sr-only">Description</Label>
                        <Textarea id={`d-${t.key}`} rows={2} value={t.description} onChange={(e) => update(t.key, { description: e.target.value })} className="min-h-0 text-[13px]" />
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <NativeSelect aria-label="Priority" value={t.priority} onChange={(e) => update(t.key, { priority: e.target.value as Priority })} className="h-8 text-[13px]">
                            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
                          </NativeSelect>
                          <Input aria-label="Start date" type="date" value={t.start_date} onChange={(e) => update(t.key, { start_date: e.target.value })} className="h-8 text-[13px]" />
                          <Input aria-label="Due date" type="date" value={t.due_date} onChange={(e) => update(t.key, { due_date: e.target.value })} className="h-8 text-[13px]" />
                          <p className="self-center text-xs text-muted-foreground">Suggested role: {t.role || '—'}</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" aria-label={`Remove ${t.title}`} onClick={() => setTasks((ts) => ts!.filter((x) => x.key !== t.key))}><Trash2 /></Button>
                    </div>
                  </div>
                ))}
              </fieldset>
            ))}
            <div className="flex flex-col-reverse items-stretch gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">{selected.length} of {tasks.length} tasks selected</p>
              <Button onClick={save} disabled={saving || selected.length === 0 || selected.some((t) => t.title.trim().length < 2)}>
                {saving && <Spinner />} Add {selected.length} task{selected.length === 1 ? '' : 's'} to project
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
