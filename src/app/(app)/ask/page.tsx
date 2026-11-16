import { PageHeader } from '@/components/page-header';
import { AskForm } from '@/components/ai/ask-form';
import { AiUnavailable } from '@/components/ai/ai-unavailable';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'Ask about work' };

export default async function AskPage() {
  await requireSession();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Ask about work" description="Plain-language questions about your projects and tasks. AI answers can be wrong — check the linked sources." />
      {process.env.ANTHROPIC_API_KEY ? <AskForm /> : <AiUnavailable />}
    </div>
  );
}
