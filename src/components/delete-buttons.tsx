'use client';
import { toast } from '@/components/ui/toast';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Alert, Spinner } from '@/components/ui/misc';
import { deleteProject } from '@/app/actions/projects';
import { deleteTask } from '@/app/actions/tasks';

function ConfirmDelete({ title, body, onConfirm }: { title: string; body: string; onConfirm: () => Promise<string | null> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline" className="text-destructive"><Trash2 /> Delete</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{body}</DialogDescription></DialogHeader>
        {error && <Alert tone="error">{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button variant="destructive" disabled={pending} onClick={() => start(async () => setError(await onConfirm()))}>{pending && <Spinner />} Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteProjectButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDelete
      title={`Delete “${name}”?`}
      body="This permanently deletes the project with all of its tasks, comments and activity. This can't be undone."
      onConfirm={async () => { const r = await deleteProject(id); if (r && !r.ok) return r.error; toast(`Project “${name}” deleted`); return null; }}
    />
  );
}

export function DeleteTaskButton({ id, projectId }: { id: string; projectId: string }) {
  const router = useRouter();
  return (
    <ConfirmDelete
      title="Delete this task?"
      body="The task and its comments will be removed. This can't be undone."
      onConfirm={async () => {
        const r = await deleteTask(id);
        if (!r.ok) return r.error;
        toast('Task deleted');
        router.push(`/projects/${projectId}`);
        return null;
      }}
    />
  );
}
