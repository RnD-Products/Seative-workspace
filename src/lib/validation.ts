import { z } from 'zod';

/**
 * Shared Zod schemas. Client forms use them for instant feedback; server actions run them
 * again because client-side validation can be bypassed.
 */

const dateString = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use a valid date')
  .default('');

const uuid = z.string().uuid('Invalid id');
const optionalUuid = z.union([z.literal(''), uuid]).default('');

export const roleEnum = z.enum(['employee', 'pm', 'ceo']);
export const projectStatusEnum = z.enum(['planning', 'active', 'on_hold', 'completed']);
export const priorityEnum = z.enum(['low', 'medium', 'high', 'urgent']);
export const taskStatusEnum = z.enum(['todo', 'in_progress', 'in_review', 'done']);

const datesInOrder = (v: { start_date: string; due_date: string }) => !v.start_date || !v.due_date || v.due_date >= v.start_date;
const dateOrderIssue = { message: 'Due date must be on or after the start date', path: ['due_date'] };

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const setupSchema = z.object({
  orgName: z.string().trim().min(2, 'Organization name is too short').max(120),
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});

export const finishSetupSchema = setupSchema.pick({ orgName: true, fullName: true });

export const projectSchema = z
  .object({
    name: z.string().trim().min(2, 'Give the project a name').max(160),
    description: z.string().trim().max(5000, 'Keep the description under 5,000 characters').default(''),
    status: projectStatusEnum.default('planning'),
    priority: priorityEnum.default('medium'),
    start_date: dateString,
    due_date: dateString,
    manager_id: optionalUuid,
    member_ids: z.array(uuid).max(200).default([]),
  })
  .refine(datesInOrder, dateOrderIssue);
export type ProjectInput = z.input<typeof projectSchema>;

export const taskSchema = z
  .object({
    project_id: uuid,
    title: z.string().trim().min(2, 'Give the task a title').max(200),
    description: z.string().trim().max(10000).default(''),
    status: taskStatusEnum.default('todo'),
    priority: priorityEnum.default('medium'),
    assignee_id: optionalUuid,
    start_date: dateString,
    due_date: dateString,
  })
  .refine(datesInOrder, dateOrderIssue);
export type TaskInput = z.input<typeof taskSchema>;

export const commentSchema = z.object({
  task_id: uuid,
  body: z.string().trim().min(1, 'Write something first').max(5000),
  is_progress_update: z.boolean().default(false),
  ai_assisted: z.boolean().default(false),
});

export const newMemberSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter their full name').max(120),
  email: z.string().trim().email('Enter a valid email address'),
  role: roleEnum,
  jobTitle: z.string().trim().max(80).default(''),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});
export type NewMemberInput = z.input<typeof newMemberSchema>;

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  jobTitle: z.string().trim().max(80).default(''),
});

/** Converts '' from form inputs into null for the database. */
export const nullIfEmpty = (v: string | undefined | null) => (v ? v : null);

export function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[]>;
}
