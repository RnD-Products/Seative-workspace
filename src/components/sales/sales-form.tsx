'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { PRIORITIES, PRIORITY_LABEL } from '@/lib/domain';
import { DEAL_SOURCES, DEAL_SOURCE_LABEL, PAYMENT_STATUSES, PAYMENT_STATUS_LABEL, SKILL_SUGGESTIONS, type ProjectSales } from '@/lib/sales';
import { createDeal, updateSales } from '@/app/actions/sales';
import { cn } from '@/lib/utils';

/** Chips + free text. Enter or comma adds a tag; suggestions are one click. */
export function TagInput({ id, value, onChange, placeholder = 'Add a tag…', suggestions = SKILL_SUGGESTIONS }: {
  id?: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string; suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');
  const add = (raw: string) => {
    const t = raw.trim().slice(0, 40);
    if (t && !value.some((v) => v.toLowerCase() === t.toLowerCase()) && value.length < 20) onChange([...value, t]);
    setDraft('');
  };
  const unused = suggestions.filter((s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())).slice(0, 8);
  return (
    <div className="space-y-2">
      <div className="flex min-h-8 flex-wrap items-center gap-1.5 rounded-md border border-input bg-card px-1.5 py-1 focus-within:ring-[3px] focus-within:ring-primary/25">
        {value.map((t) => (
          <span key={t} className="inline-flex h-6 items-center gap-1 rounded-[5px] border border-primary/30 bg-primary-soft pl-2 pr-1 text-[12px] text-foreground">
            {t}
            <button type="button" onClick={() => onChange(value.filter((v) => v !== t))} className="grid size-4 place-items-center rounded-[3px] text-muted-foreground hover:bg-foreground/10 hover:text-foreground" aria-label={`Remove ${t}`}><X className="size-3" /></button>
          </span>
        ))}
        <input id={id} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={value.length ? '' : placeholder}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(draft); }
            if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
          }}
          onBlur={() => draft && add(draft)}
          className="h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] outline-none placeholder:text-muted-foreground" />
      </div>
      {unused.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {unused.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-[5px] border border-dashed border-border-strong px-1.5 py-0.5 text-[11.5px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

type SalesValues = {
  client_name: string; client_contact_name: string; client_email: string; client_phone: string;
  deal_source: string; deal_date: string; client_deadline: string; budget: string; contract_amount: string;
  currency: string; advance_received: string; payment_status: string; scope_summary: string; team_requirements: string;
  requirement_tags: string[];
};

const fromSales = (s?: ProjectSales | null): SalesValues => ({
  client_name: s?.client_name ?? '', client_contact_name: s?.client_contact_name ?? '', client_email: s?.client_email ?? '',
  client_phone: s?.client_phone ?? '', deal_source: s?.deal_source ?? 'direct', deal_date: s?.deal_date ?? new Date().toLocaleDateString('en-CA'),
  client_deadline: s?.client_deadline ?? '', budget: s?.budget != null ? String(s.budget) : '', contract_amount: s?.contract_amount != null ? String(s.contract_amount) : '',
  currency: s?.currency ?? 'BDT', advance_received: s?.advance_received ? String(s.advance_received) : '', payment_status: s?.payment_status ?? 'unpaid',
  scope_summary: s?.scope_summary ?? '', team_requirements: s?.team_requirements ?? '', requirement_tags: s?.requirement_tags ?? [],
});

function SalesFields({ v, set }: { v: SalesValues; set: <K extends keyof SalesValues>(k: K, val: SalesValues[K]) => void }) {
  const input = (k: keyof SalesValues) => ({ value: v[k] as string, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never) });
  const cur = v.currency === 'USD' ? 'USD' : 'BDT';
  return (
    <div className="space-y-6">
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[13px] font-semibold">Client</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="s-client" label="Client name"><Input {...input('client_name')} required maxLength={200} placeholder="e.g. Cine Jewelry" /></FormField>
          <FormField id="s-source" label="Deal source"><NativeSelect {...input('deal_source')}>{DEAL_SOURCES.map((d) => <option key={d} value={d}>{DEAL_SOURCE_LABEL[d]}</option>)}</NativeSelect></FormField>
          <FormField id="s-contact" label="Contact person (optional)"><Input {...input('client_contact_name')} maxLength={200} /></FormField>
          <FormField id="s-email" label="Contact email (optional)"><Input type="email" {...input('client_email')} maxLength={200} /></FormField>
          <FormField id="s-phone" label="Contact phone (optional)"><Input type="tel" {...input('client_phone')} maxLength={50} /></FormField>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[13px] font-semibold">Deal</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <FormField id="s-date" label="Deal date"><Input type="date" {...input('deal_date')} /></FormField>
          <FormField id="s-deadline" label="Client deadline" hint="Becomes the project's due date"><Input type="date" {...input('client_deadline')} /></FormField>
          <FormField id="s-currency" label="Currency"><NativeSelect {...input('currency')}><option value="BDT">BDT (Taka)</option><option value="USD">USD (Dollar)</option></NativeSelect></FormField>
          <FormField id="s-budget" label={`Client budget (${cur})`}><Input type="number" min={0} step="any" inputMode="decimal" {...input('budget')} /></FormField>
          <FormField id="s-amount" label={`Contract amount (${cur})`}><Input type="number" min={0} step="any" inputMode="decimal" {...input('contract_amount')} /></FormField>
          <FormField id="s-advance" label={`Advance received (${cur})`}><Input type="number" min={0} step="any" inputMode="decimal" {...input('advance_received')} /></FormField>
          <FormField id="s-payment" label="Payment status"><NativeSelect {...input('payment_status')}>{PAYMENT_STATUSES.map((p) => <option key={p} value={p}>{PAYMENT_STATUS_LABEL[p]}</option>)}</NativeSelect></FormField>
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[13px] font-semibold">Scope and team</legend>
        <FormField id="s-scope" label="Scope summary" hint="What we're delivering"><Textarea rows={3} {...input('scope_summary')} maxLength={4000} /></FormField>
        <FormField id="s-tags" label="Skills needed" hint="The PM uses these to pick designers">
          <TagInput id="s-tags" value={v.requirement_tags} onChange={(t) => set('requirement_tags', t)} placeholder="e.g. UI/UX, Mobile app" />
        </FormField>
        <FormField id="s-req" label="Team notes (optional)"><Input {...input('team_requirements')} maxLength={2000} placeholder="e.g. 2 designers, Figma prototype by week 2" /></FormField>
      </fieldset>
    </div>
  );
}

function useSalesState(initial?: ProjectSales | null) {
  const [v, setV] = useState<SalesValues>(() => fromSales(initial));
  const set = <K extends keyof SalesValues>(k: K, val: SalesValues[K]) => setV((s) => ({ ...s, [k]: val }));
  return { v, set };
}

export function DealForm() {
  const router = useRouter();
  const { v, set } = useSalesState(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form className="space-y-6" onSubmit={(e) => {
      e.preventDefault();
      start(async () => {
        setError(null);
        const r = await createDeal({ ...v, name, description, priority });
        if (!r.ok) { setError(r.error); return; }
        toast(`Deal “${name}” added. PMs have been notified.`);
        router.push(`/projects/${r.data!.id}`);
      });
    }}>
      {error && <Alert tone="error">{error}</Alert>}
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[13px] font-semibold">Project</legend>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          <FormField id="d-name" label="Project name"><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Cine Jewelry e-commerce" /></FormField>
          <FormField id="d-priority" label="Priority"><NativeSelect value={priority} onChange={(e) => setPriority(e.target.value)}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</NativeSelect></FormField>
        </div>
        <FormField id="d-desc" label="Description (optional)"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={4000} /></FormField>
      </fieldset>
      <SalesFields v={v} set={set} />
      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <Spinner />} Add deal</Button>
      </div>
    </form>
  );
}

export function EditSalesDialog({ projectId, sales }: { projectId: string; sales: ProjectSales }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { v, set } = useSalesState(sales);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); setError(null); }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Pencil /> Edit</Button></DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Edit sales info</DialogTitle><DialogDescription>Changes are recorded in the project history.</DialogDescription></DialogHeader>
        <form className={cn('space-y-5')} onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await updateSales(projectId, v);
            if (!r.ok) { setError(r.error); return; }
            toast('Sales info saved'); setOpen(false); router.refresh();
          });
        }}>
          {error && <Alert tone="error">{error}</Alert>}
          <SalesFields v={v} set={set} />
          <div className="flex justify-end gap-2"><Button type="submit" disabled={pending}>{pending && <Spinner />} Save</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
