'use client';
import { toast } from '@/components/ui/toast';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { newMemberSchema, profileSchema, type NewMemberInput } from '@/lib/validation';
import { ROLES, ROLE_LABEL } from '@/lib/domain';
import type { Role } from '@/lib/types';
import { addMember, changeRole, updateMyProfile, updateOrganization } from '@/app/actions/members';

type Msg = { tone: 'error' | 'success'; text: string } | null;

export function ProfileForm({ fullName, jobTitle }: { fullName: string; jobTitle: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const form = useForm<z.input<typeof profileSchema>>({ resolver: zodResolver(profileSchema), defaultValues: { fullName, jobTitle } });
  return (
    <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => start(async () => {
      const r = await updateMyProfile(v); setMsg(r.ok ? { tone: 'success', text: r.message ?? 'Saved' } : { tone: 'error', text: r.error });
    }))}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="fullName" label="Full name" error={form.formState.errors.fullName?.message}><Input {...form.register('fullName')} /></FormField>
        <FormField id="jobTitle" label="Job title" error={form.formState.errors.jobTitle?.message}><Input placeholder="e.g. UI Designer" {...form.register('jobTitle')} /></FormField>
      </div>
      <Button type="submit" disabled={pending}>{pending && <Spinner />} Save profile</Button>
    </form>
  );
}

export function OrgNameForm({ name }: { name: string }) {
  const [value, setValue] = useState(name);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
      const r = await updateOrganization(value); setMsg(r.ok ? { tone: 'success', text: r.message ?? 'Saved' } : { tone: 'error', text: r.error });
    }); }}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <FormField id="orgName" label="Organization name"><Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} /></FormField>
      <Button type="submit" variant="outline" disabled={pending}>{pending && <Spinner />} Rename</Button>
    </form>
  );
}

export function RoleSelect({ profileId, role, disabled }: { profileId: string; role: Role; disabled?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <NativeSelect aria-label="Role" value={value} disabled={disabled || pending} className="h-8 w-44 text-[13px]" onChange={(e) => {
        const next = e.target.value as Role; const prev = value; setValue(next); setError(null);
        start(async () => { const r = await changeRole(profileId, next); if (!r.ok) { setValue(prev); setError(r.error); } else { toast(`Role changed to ${ROLE_LABEL[next]}`); router.refresh(); } });
      }}>
        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </NativeSelect>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function AddMemberDialog({ canCreate }: { canCreate: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const form = useForm<NewMemberInput>({ resolver: zodResolver(newMemberSchema), defaultValues: { fullName: '', email: '', role: 'employee', jobTitle: '', password: '' } });
  const { errors } = form.formState;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setMsg(null); form.reset(); } }}>
      <DialogTrigger asChild><Button><UserPlus /> Add member</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a team member</DialogTitle>
          <DialogDescription>Creates their login. Share the temporary password with them privately; they can change it after signing in.</DialogDescription>
        </DialogHeader>
        {!canCreate && <Alert tone="warning">Set <code>SUPABASE_SERVICE_ROLE_KEY</code> on the server to enable adding members.</Alert>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <form noValidate className="space-y-4" onSubmit={form.handleSubmit((v) => start(async () => {
          const r = await addMember(v);
          if (!r.ok) { setMsg({ tone: 'error', text: r.error }); Object.entries(r.fieldErrors ?? {}).forEach(([k, e]) => form.setError(k as keyof NewMemberInput, { message: e[0] })); return; }
          setMsg({ tone: 'success', text: r.message ?? 'Member added' }); toast(`${v.fullName} added`); form.reset(); router.refresh();
        }))}>
          <FormField id="m-name" label="Full name" error={errors.fullName?.message}><Input {...form.register('fullName')} /></FormField>
          <FormField id="m-email" label="Email" error={errors.email?.message}><Input type="email" {...form.register('email')} /></FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="m-role" label="Role"><NativeSelect {...form.register('role')}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</NativeSelect></FormField>
            <FormField id="m-title" label="Job title (optional)" error={errors.jobTitle?.message}><Input {...form.register('jobTitle')} /></FormField>
          </div>
          <FormField id="m-pass" label="Temporary password" hint="At least 8 characters." error={errors.password?.message}><Input type="text" autoComplete="off" {...form.register('password')} /></FormField>
          <div className="flex justify-end"><Button type="submit" disabled={pending || !canCreate}>{pending && <Spinner />} Create login</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PasswordForm() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [pw, setPw] = useState('');
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); start(async () => {
      if (pw.length < 8) { setMsg({ tone: 'error', text: 'Use at least 8 characters.' }); return; }
      const { createClient } = await import('@/lib/supabase/client');
      const { error } = await createClient().auth.updateUser({ password: pw });
      setMsg(error ? { tone: 'error', text: error.message } : { tone: 'success', text: 'Password updated.' });
      if (!error) setPw('');
    }); }}>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <FormField id="new-pw" label="New password" hint="At least 8 characters."><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></FormField>
      <Button type="submit" variant="outline" disabled={pending}>{pending && <Spinner />} Change password</Button>
    </form>
  );
}
