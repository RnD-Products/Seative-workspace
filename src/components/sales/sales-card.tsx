import { BadgeDollarSign, Mail, Phone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/badges';
import { fmtDate, daysUntil } from '@/lib/domain';
import { DEAL_SOURCE_LABEL, PAYMENT_STATUS_LABEL, PAYMENT_TONE, fmtMoney, outstanding, type ProjectSales } from '@/lib/sales';
import { EditSalesDialog } from './sales-form';

/** Commercial details of a project. Only rendered for people the database lets read them. */
export function SalesCard({ sales, owner, canEdit, minutesLogged, compact }: {
  sales: ProjectSales; owner: { id: string; full_name: string } | null; canEdit: boolean; minutesLogged?: number; compact?: boolean;
}) {
  const due = outstanding(sales);
  const hours = (minutesLogged ?? 0) / 60;
  const rate = sales.contract_amount && hours >= 1 ? Number(sales.contract_amount) / hours : null;
  const left = sales.client_deadline ? daysUntil(sales.client_deadline) : null;
  return (
    <Card aria-labelledby="sales-heading">
      <CardHeader>
        <div>
          <CardTitle id="sales-heading" className="flex items-center gap-2"><BadgeDollarSign className="size-4 text-success" aria-hidden /> Sales info</CardTitle>
          <CardDescription>Visible to Sales, project managers and the CEO only.</CardDescription>
        </div>
        {canEdit && <EditSalesDialog projectId={sales.project_id} sales={sales} />}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className={`grid grid-cols-2 gap-3 ${compact ? '' : 'lg:grid-cols-4'}`}>
          <Money label="Contract amount" value={fmtMoney(sales.contract_amount, sales.currency)} strong />
          <Money label="Client budget" value={fmtMoney(sales.budget, sales.currency)} />
          <Money label="Advance received" value={fmtMoney(sales.advance_received, sales.currency)} />
          <Money label="Still to collect" value={fmtMoney(due, sales.currency)} tone={due > 0 ? 'text-deadline' : 'text-success'} />
        </div>
        <dl className={`grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 ${compact ? '' : 'lg:grid-cols-3'}`}>
          <Row label="Client">{sales.client_name}</Row>
          <Row label="Payment"><Badge tone={PAYMENT_TONE[sales.payment_status]} dot>{PAYMENT_STATUS_LABEL[sales.payment_status]}</Badge></Row>
          <Row label="Source">{DEAL_SOURCE_LABEL[sales.deal_source]}</Row>
          <Row label="Deal date">{fmtDate(sales.deal_date)}</Row>
          <Row label="Client deadline">
            {fmtDate(sales.client_deadline)}
            {left !== null && <span className={left < 0 ? ' text-destructive' : left <= 3 ? ' text-deadline' : ' text-muted-foreground'}> · {left < 0 ? `${-left}d late` : left === 0 ? 'today' : `${left}d left`}</span>}
          </Row>
          <Row label="Salesperson"><span className="flex items-center gap-2"><Avatar person={owner} />{owner?.full_name ?? '—'}</span></Row>
          {(sales.client_contact_name || sales.client_email || sales.client_phone) && (
            <Row label="Contact">
              <span className="block">{sales.client_contact_name}</span>
              {sales.client_email && <a href={`mailto:${sales.client_email}`} className="flex items-center gap-1 text-ai hover:underline"><Mail className="size-3" />{sales.client_email}</a>}
              {sales.client_phone && <a href={`tel:${sales.client_phone}`} className="flex items-center gap-1 text-ai hover:underline"><Phone className="size-3" />{sales.client_phone}</a>}
            </Row>
          )}
          {minutesLogged !== undefined && <Row label="Hours logged">{hours.toFixed(1)}h{rate ? <span className="text-muted-foreground"> · {fmtMoney(Math.round(rate), sales.currency)}/h so far</span> : null}</Row>}
        </dl>
        {(sales.requirement_tags.length > 0 || sales.team_requirements) && (
          <div>
            <p className="mb-1.5 text-[12px] text-muted-foreground">Skills needed</p>
            <div className="flex flex-wrap gap-1.5">{sales.requirement_tags.map((t) => <span key={t} className="rounded-[5px] border border-primary/30 bg-primary-soft px-2 py-0.5 text-[12px]">{t}</span>)}</div>
            {sales.team_requirements && <p className="mt-2 text-[13px] text-foreground/85">{sales.team_requirements}</p>}
          </div>
        )}
        {sales.scope_summary && <div><p className="mb-1 text-[12px] text-muted-foreground">Scope</p><p className="whitespace-pre-line text-[13px] leading-relaxed text-foreground/85">{sales.scope_summary}</p></div>}
      </CardContent>
    </Card>
  );
}

function Money({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[12px] text-muted-foreground">{label}</p>
      <p className={`mt-1 tabular ${strong ? 'text-[22px] font-normal tracking-[-0.03em]' : 'text-[16px] font-medium'} ${tone ?? ''}`}>{value}</p>
    </div>
  );
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><dt className="text-[12px] text-muted-foreground">{label}</dt><dd className="mt-0.5">{children}</dd></div>;
}
