export type Role = 'employee' | 'sales' | 'pm' | 'ceo';
export type ProjectStatus = 'incoming' | 'planning' | 'active' | 'on_hold' | 'completed';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
export type ArtifactKind = 'project_plan' | 'progress_summary' | 'risk_signal' | 'org_summary';
export type ArtifactStatus = 'open' | 'reviewed' | 'dismissed';

export interface Organization { id: string; name: string; created_at: string }

export interface Profile {
  id: string;
  organization_id: string;
  full_name: string;
  email: string;
  role: Role;
  job_title: string | null;
  skills?: string[];
  notification_prefs?: Record<string, boolean>;
  created_at: string;
}

export interface Project {
  id: string;
  organization_id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: Priority;
  start_date: string | null;
  due_date: string | null;
  manager_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  organization_id: string;
  project_id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  assignee_id: string | null;
  start_date: string | null;
  due_date: string | null;
  position: number;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  task_id: string;
  author_id: string | null;
  body: string;
  is_progress_update: boolean;
  ai_assisted: boolean;
  created_at: string;
}

export interface Activity {
  id: string;
  project_id: string | null;
  task_id: string | null;
  actor_id: string | null;
  action: string;
  details: Record<string, unknown>;
  ai_assisted: boolean;
  created_at: string;
}

export interface Artifact<T = unknown> {
  id: string;
  project_id: string | null;
  kind: ArtifactKind;
  content: T;
  model: string | null;
  status: ArtifactStatus;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export interface TimeEntry {
  id: string;
  organization_id: string;
  project_id: string;
  task_id: string | null;
  profile_id: string;
  entry_date: string;
  started_at: string | null;
  ended_at: string | null;
  minutes: number | null;
  note: string;
  created_at: string;
}

export interface RunningTimer {
  id: string;
  project_id: string;
  project_name: string;
  task_id: string | null;
  task_title: string | null;
  started_at: string;
}
