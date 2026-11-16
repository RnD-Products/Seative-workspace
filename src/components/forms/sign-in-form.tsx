'use client';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { signInSchema } from '@/lib/validation';
import { signIn } from '@/app/actions/auth';

export function SignInForm({ next }: { next?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.input<typeof signInSchema>>({ resolver: zodResolver(signInSchema), defaultValues: { email: '', password: '' } });
  const { errors } = form.formState;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => start(async () => {
        setError(null);
        const res = await signIn(values, next);
        if (res && !res.ok) setError(res.error);
      }))}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <FormField id="email" label="Email" error={errors.email?.message}>
        <Input type="email" autoComplete="email" {...form.register('email')} />
      </FormField>
      <FormField id="password" label="Password" error={errors.password?.message}>
        <Input type="password" autoComplete="current-password" {...form.register('password')} />
      </FormField>
      <Button type="submit" className="w-full" disabled={pending}>{pending && <Spinner />} Sign in</Button>
    </form>
  );
}
