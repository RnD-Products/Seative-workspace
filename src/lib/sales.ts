export type DealSource = 'direct' | 'referral' | 'upwork' | 'fiverr' | 'linkedin' | 'other';
export type PaymentStatus = 'unpaid' | 'advance_paid' | 'partially_paid' | 'fully_paid';
export type Currency = 'BDT' | 'USD';

export interface ProjectSales {
  project_id: string;
  organization_id: string;
  sales_owner_id: string | null;
  client_name: string;
  client_contact_name: string;
  client_email: string;
  client_phone: string;
  deal_source: DealSource;
  deal_date: string | null;
  client_deadline: string | null;
  budget: number | null;
  contract_amount: number | null;
  currency: Currency;
  advance_received: number;
  payment_status: PaymentStatus;
  scope_summary: string;
  team_requirements: string;
  requirement_tags: string[];
  created_at: string;
  updated_at: string;
}

export const DEAL_SOURCES: DealSource[] = ['direct', 'referral', 'upwork', 'fiverr', 'linkedin', 'other'];
export const DEAL_SOURCE_LABEL: Record<DealSource, string> = {
  direct: 'Direct', referral: 'Referral', upwork: 'Upwork', fiverr: 'Fiverr', linkedin: 'LinkedIn', other: 'Other',
};
export const PAYMENT_STATUSES: PaymentStatus[] = ['unpaid', 'advance_paid', 'partially_paid', 'fully_paid'];
export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  unpaid: 'Unpaid', advance_paid: 'Advance paid', partially_paid: 'Partially paid', fully_paid: 'Fully paid',
};
export const PAYMENT_TONE: Record<PaymentStatus, 'red' | 'amber' | 'blue' | 'green'> = {
  unpaid: 'red', advance_paid: 'amber', partially_paid: 'blue', fully_paid: 'green',
};

/** Common skill / requirement tags; free text is allowed too. */
export const SKILL_SUGGESTIONS = ['UI/UX', 'Mobile app', 'Web design', 'Branding', 'Logo', 'Illustration', 'Motion', 'Figma prototype', 'Webflow', 'WordPress', 'Frontend', 'Backend', 'SEO', 'Social media', 'Copywriting'];

export function fmtMoney(amount: number | null | undefined, currency: Currency) {
  if (amount == null) return '—';
  const n = Number(amount);
  const s = n.toLocaleString(currency === 'BDT' ? 'en-IN' : 'en-US', { maximumFractionDigits: n % 1 ? 2 : 0 });
  return currency === 'BDT' ? `BDT ${s}` : `$${s}`;
}

export const outstanding = (s: Pick<ProjectSales, 'contract_amount' | 'advance_received' | 'payment_status'>) =>
  s.payment_status === 'fully_paid' ? 0 : Math.max(0, Number(s.contract_amount ?? 0) - Number(s.advance_received ?? 0));

export const normaliseTags = (raw: string[] | string) =>
  [...new Set((Array.isArray(raw) ? raw : raw.split(',')).map((t) => t.trim()).filter(Boolean).map((t) => t.slice(0, 40)))].slice(0, 20);
