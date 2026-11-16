import type { Profile, Project } from '@/lib/types';

export type ProjectRef = Pick<Project, 'id' | 'name' | 'manager_id'> & { memberIds: string[] };
export type Me = Pick<Profile, 'id' | 'role'>;

export const canManageRef = (p: ProjectRef | undefined, me: Me) =>
  !!p && (me.role === 'ceo' || (me.role === 'pm' && p.manager_id === me.id));
