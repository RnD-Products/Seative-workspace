'use client';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { finishSetupSchema, setupSchema } from '@/lib/validation';
import { finishSetup, setupWorkspace } from '@/app/actions/auth';

export function SetupForm() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const form = useForm<z.input<typeof setupSchema>>({
    resolver: zodResolver(setupSchema),
    defaultValues: { orgName: '', fullName: '', email: '', password: '' },
  });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => start(async () => {
        setResult(null);
        const res = await setupWorkspace(values);
        if (!res) return;
        if (!res.ok) setResult({ tone: 'error', text: res.error });
        else if (res.message) setResult({ tone: 'success', text: res.message });
      }))}
    >
      {result && <Alert tone={result.tone}>{result.text}</Alert>}
      <FormField id="orgName" label="Organization name" error={errors.orgName?.message}>
        <Input placeholder="e.g. Seative Digital" {...form.register('orgName')} />
      </FormField>
      <FormField id="fullName" label="Your full name" error={errors.fullName?.message}>
        <Input autoComplete="name" {...form.register('fullName')} />
      </FormField>
      <FormField id="email" label="Work email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </FormField>
      <FormField id="password" label="Password" hint="At least 8 characters." error={errors.password?.message}>
        <Input type="password" autoComplete="new-password" {...form.register('password')} />
      </FormField>
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Spinner />} Create workspace</Button>
    </form>
  );
}

export function FinishSetupForm({ defaultName }: { defaultName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof finishSetupSchema>>({
    resolver: zodResolver(finishSetupSchema),
    defaultValues: { orgName: '', fullName: defaultName },
  });
  const { errors } = form.formState;
  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => start(async () => {
        const res = await finishSetup(values);
        if (res && !res.ok) setError(res.error);
      }))}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <FormField id="orgName" label="Organization name" error={errors.orgName?.message}>
        <Input {...form.register('orgName')} />
      </FormField>
      <FormField id="fullName" label="Your full name" error={errors.fullName?.message}>
        <Input {...form.register('fullName')} />
      </FormField>
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Spinner />} Finish setup</Button>
    </form>
  );
}
