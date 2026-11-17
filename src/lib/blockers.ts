import { differenceInCalendarDays, parseISO } from 'date-fns';

export type BlockerSide = 'client' | 'internal' | 'third_party';
export interface Blocker {
  id: string; organization_id: string; project_id: string; task_id: string | null;
  title: string; details: string; side: BlockerSide; responsible_id: string | null; raised_by: string | null;
  status: 'open' | 'resolved'; resolved_by: string | null; resolved_note: string; resolved_at: string | null;
  created_at: string; updated_at: string;
}

export const BLOCKER_SIDES: BlockerSide[] = ['client', 'internal', 'third_party'];
export const SIDE_LABEL: Record<BlockerSide, string> = { client: 'Client side', internal: 'Our side', third_party: 'Third party' };
export const SIDE_HINT: Record<BlockerSide, string> = {
  client: 'Waiting on the client: feedback, content, approval or payment',
  internal: 'Waiting on someone in our team',
  third_party: 'Waiting on a vendor, host or platform',
};
/** Tailwind classes per side: orange = client, blue = us, violet = third party. */
export const SIDE_STYLE: Record<BlockerSide, { dot: string; chip: string }> = {
  client: { dot: 'bg-orange-400', chip: 'border-orange-400/30 bg-orange-400/10 text-orange-500 dark:text-orange-300' },
  internal: { dot: 'bg-info', chip: 'border-info/30 bg-info-soft text-info' },
  third_party: { dot: 'bg-violet-400', chip: 'border-violet-400/30 bg-violet-400/10 text-violet-600 dark:text-violet-300' },
};

export const blockerAge = (b: Pick<Blocker, 'created_at' | 'resolved_at'>) =>
  Math.max(0, differenceInCalendarDays(b.resolved_at ? parseISO(b.resolved_at) : new Date(), parseISO(b.created_at)));
export const ageTone = (days: number) => (days >= 7 ? 'text-destructive' : days >= 3 ? 'text-deadline' : 'text-muted-foreground');
export const STALE_BLOCKER_DAYS = 3;
