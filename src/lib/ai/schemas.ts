import { z } from 'zod';

/**
 * Two schemas per AI feature:
 *  - `*Format`: loose shape sent to Claude as the structured-output JSON schema.
 *  - strict schema: what we accept. Claude's reply is parsed with this before anything is shown
 *    or saved, so over-long, malformed or out-of-range values are rejected.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const priority = z.enum(['low', 'medium', 'high', 'urgent']);

// ---- A. Project plan ----------------------------------------------------------
export const planFormat = z.object({
  milestones: z.array(z.object({
    title: z.string(),
    description: z.string(),
    tasks: z.array(z.object({
      title: z.string(),
      description: z.string(),
      priority,
      start_date: z.string().describe('YYYY-MM-DD or empty string'),
      due_date: z.string().describe('YYYY-MM-DD or empty string'),
      suggested_owner_role: z.string().describe('A role such as "Designer" — never a person’s name'),
    })),
  })),
  assumptions: z.array(z.string()),
});

export const planSchema = z.object({
  milestones: z.array(z.object({
    title: shortText(160),
    description: z.string().trim().max(1000),
    tasks: z.array(z.object({
      title: shortText(200),
      description: z.string().trim().max(2000),
      priority,
      start_date: z.union([isoDate, z.literal('')]),
      due_date: z.union([isoDate, z.literal('')]),
      suggested_owner_role: z.string().trim().max(60),
    })).min(1).max(15),
  })).min(1).max(8),
  assumptions: z.array(z.string().trim().max(300)).max(8),
});
export type Plan = z.infer<typeof planSchema>;

export const planRequestSchema = z.object({
  projectId: z.string().uuid(),
  goal: shortText(500),
  description: z.string().trim().max(3000).default(''),
  targetDate: z.union([isoDate, z.literal('')]).default(''),
});

/** Tasks the user selected and edited from the draft; validated again before insert. */
export const applyPlanSchema = z.object({
  projectId: z.string().uuid(),
  tasks: z.array(z.object({
    title: shortText(200),
    description: z.string().trim().max(10000),
    priority,
    start_date: z.union([isoDate, z.literal('')]),
    due_date: z.union([isoDate, z.literal('')]),
  })).min(1, 'Select at least one task').max(60),
}).refine((v) => v.tasks.every((t) => !t.start_date || !t.due_date || t.due_date >= t.start_date), {
  message: 'A due date is before its start date', path: ['tasks'],
});

// ---- B. Progress summary ---------------------------------------------------------
export const summaryFormat = z.object({
  data_sufficiency: z.enum(['sufficient', 'limited', 'insufficient']),
  overview: z.string(),
  completed: z.array(z.string()),
  next_steps: z.array(z.string()),
  blockers: z.array(z.string()),
  risks: z.array(z.string()),
});
export const summarySchema = z.object({
  data_sufficiency: z.enum(['sufficient', 'limited', 'insufficient']),
  overview: z.string().trim().max(800),
  completed: z.array(z.string().trim().max(300)).max(10),
  next_steps: z.array(z.string().trim().max(300)).max(10),
  blockers: z.array(z.string().trim().max(300)).max(10),
  risks: z.array(z.string().trim().max(300)).max(10),
});
export type ProgressSummary = z.infer<typeof summarySchema>;

// ---- C. Risk interpretation ---------------------------------------------------------
export const riskFormat = z.object({
  signals: z.array(z.object({
    fact_ids: z.array(z.string()).describe('IDs of the observed facts this signal is based on'),
    title: z.string(),
    interpretation: z.string(),
    severity: z.enum(['low', 'medium', 'high']),
    suggested_action: z.string(),
  })),
});
export const riskSchema = z.object({
  signals: z.array(z.object({
    fact_ids: z.array(z.string().max(80)).min(1).max(10),
    title: shortText(140),
    interpretation: z.string().trim().max(600),
    severity: z.enum(['low', 'medium', 'high']),
    suggested_action: z.string().trim().max(300),
  })).max(8),
});

/** What is stored per signal: the AI interpretation plus a frozen copy of the evidence. */
export interface RiskSignalContent {
  title: string;
  interpretation: string;
  severity: 'low' | 'medium' | 'high';
  suggested_action: string;
  evidence: { id: string; label: string; detail: string; taskIds: string[] }[];
}

// ---- D. Task assistant -------------------------------------------------------------
export const assistModeEnum = z.enum(['breakdown', 'clarify', 'acceptance']);
export const assistFormat = z.object({
  description: z.string().describe('Rewritten description (clarify mode) or empty string'),
  subtasks: z.array(z.object({ title: z.string(), detail: z.string() })),
  acceptance_criteria: z.array(z.string()),
  questions: z.array(z.string()).describe('Open questions the task owner should answer'),
});
export const assistSchema = z.object({
  description: z.string().trim().max(4000),
  subtasks: z.array(z.object({ title: shortText(200), detail: z.string().trim().max(500) })).max(12),
  acceptance_criteria: z.array(z.string().trim().max(300)).max(12),
  questions: z.array(z.string().trim().max(300)).max(6),
});
export type AssistDraft = z.infer<typeof assistSchema>;

// ---- E. Personal update ---------------------------------------------------------
export const updateFormat = z.object({ update: z.string() });
export const updateSchema = z.object({ update: z.string().trim().min(1).max(2000) });

// ---- F. Ask about work --------------------------------------------------------------
export const askFormat = z.object({
  answer: z.string(),
  references: z.array(z.object({ type: z.enum(['project', 'task']), id: z.string() })),
  outside_access: z.boolean().describe('True if the question needs data that is not in the provided records'),
});
export const askSchema = z.object({
  answer: z.string().trim().min(1).max(3000),
  references: z.array(z.object({ type: z.enum(['project', 'task']), id: z.string().max(40) })).max(20),
  outside_access: z.boolean(),
});

// ---- Org summary (CEO) ----------------------------------------------------------
export const orgSummaryFormat = z.object({
  overview: z.string(),
  highlights: z.array(z.string()),
  attention: z.array(z.object({ project_ref: z.string(), reason: z.string() })),
  data_gaps: z.array(z.string()),
});
export const orgSummarySchema = z.object({
  overview: z.string().trim().max(900),
  highlights: z.array(z.string().trim().max(300)).max(8),
  attention: z.array(z.object({ project_ref: z.string().max(40), reason: z.string().trim().max(300) })).max(8),
  data_gaps: z.array(z.string().trim().max(300)).max(6),
});
export type OrgSummary = z.infer<typeof orgSummarySchema> & { projects?: Record<string, { id: string; name: string }> };
