import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { DealForm } from '@/components/sales/sales-form';
import { requireSession } from '@/lib/session';

export const metadata = { title: 'New deal' };

export default async function NewDealPage() {
  const session = await requireSession();
  if (!['sales', 'ceo'].includes(session.profile.role)) redirect('/');
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={<Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>}
        title="New deal"
        description="Record a closed deal. It arrives as an Incoming project, and every project manager is notified to pick it up."
      />
      <Card><CardContent className="pt-5"><DealForm /></CardContent></Card>
    </div>
  );
}
