import { Alert } from '@/components/ui/misc';

export function AiUnavailable() {
  return (
    <Alert tone="info" title="AI is not configured">
      Add <code>ANTHROPIC_API_KEY</code> to the server environment to turn on AI drafts. Everything else works without it.
    </Alert>
  );
}

