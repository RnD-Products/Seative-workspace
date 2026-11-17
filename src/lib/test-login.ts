import type { Role } from '@/lib/types';

/**
 * TESTING ONLY: one-click sign-in buttons on the login screen.
 * Anyone who opens the login page can enter as any of these people, so switch this off
 * before real company data goes in: set TEST_LOGIN_ENABLED to false (or set the
 * TEST_LOGIN=off environment variable on Vercel). The normal email + password form comes back.
 */
export const TEST_LOGIN_ENABLED = process.env.TEST_LOGIN !== 'off';

export type TestAccount = { role: Role; label: string; email: string; fullName: string; blurb: string; create?: boolean };

export const TEST_ACCOUNTS: TestAccount[] = [
  { role: 'ceo', label: 'CEO', email: 'siddik@seative.digital', fullName: 'Subash', blurb: 'Every project, people, reports, blockers' },
  { role: 'pm', label: 'Project Manager', email: 'pm.test@seative.digital', fullName: 'Test PM', blurb: 'Take incoming projects, plan, assign', create: true },
  { role: 'employee', label: 'Employee', email: 'junayed.seative@gmail.com', fullName: 'Junayed', blurb: 'My Work, tasks, time, chat' },
  { role: 'sales', label: 'Sales', email: 'sales.test@seative.digital', fullName: 'Test Sales', blurb: 'Add deals, track payments and progress', create: true },
];
