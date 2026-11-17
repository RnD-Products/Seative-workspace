-- Phase 2: new role and project status. Kept in its own migration because a new enum
-- value cannot be used in the same transaction that adds it.
alter type public.app_role add value if not exists 'sales';
alter type public.project_status add value if not exists 'incoming' before 'planning';
