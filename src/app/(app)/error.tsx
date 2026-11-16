'use client';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/misc';

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16">
      <Alert tone="error" title="Something went wrong loading this page">
        {error.message || 'Please try again.'}
      </Alert>
      <Button variant="outline" onClick={reset}>Try again</Button>
    </div>
  );
}
