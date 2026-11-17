-- Demo data for testing every role's view (CEO, Project Manager, Employee, Sales).
-- The data itself lives in public.reset_demo_data() (migration 20261117000009). It also runs
-- automatically when someone signs out in testing mode. Safe to run any time.
-- The PM and Sales test accounts must exist first: click "Sign in as Project Manager" and
-- "Sign in as Sales" on the login screen once.
select public.reset_demo_data();
