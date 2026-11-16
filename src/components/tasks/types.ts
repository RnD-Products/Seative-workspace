import type { Profile, Project } from '@/lib/types';

export type ProjectRef = Pick<Project, 'id' | 'name' | 'manager_id'> & { memberIds: string[] };
export type Me = Pick<Profile, 'id' | 'role'>;

export const canManageRef = (p: ProjectRef | undefined, me: Me) =>
  !!p && (me.role === 'ceo' || (me.role === 'pm' && p.manager_id === me.id));

/** Projects where `me` can add a task: ones they manage, or belong to (task is then assigned to themselves). */
export const canAddTaskRef = (p: ProjectRef | undefined, me: Me) =>
  !!p && (canManageRef(p, me) || p.memberIds.includes(me.id));

/** A member's own task: created by and assigned to them. They may edit and delete it. */
export const isOwnTask = (t: { created_by: string | null; assignee_id: string | null }, me: Pick<Me, 'id'>) =>
  t.created_by === me.id && t.assignee_id === me.id;
