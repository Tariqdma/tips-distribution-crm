-- ==============================================================================
-- Tips CRM: add employee.read.team (vocabulary 46 -> 47)
--
-- Run BEFORE supabase/tips_crm_rls_new_vocabulary.sql. That migration points
-- profiles_read, territories_read and assignments_read at this permission, so it
-- must exist on the roles first or supervisors lose their team the moment B2
-- lands.
--
-- Why it exists: B2 maps the old view_team_data onto scoped permissions per
-- resource. For the three "who is on my team" tables the natural mapping looked
-- like employee.manage — but only manager holds that, so a supervisor would have
-- lost sight of their own roster while keeping team plans, visits and telemetry.
-- Seeing your team is a different capability from managing employees, so it gets
-- its own permission rather than being folded into one that means something else.
--
-- Held by manager and supervisor. Not by rep or accountant: neither supervises.
--
-- The immutability trigger blocks changing a System Role's permissions, so this
-- disables it for the duration and restores it — the deliberate-migration
-- pattern, same as tips_crm_permission_vocabulary_v2.sql.
--
-- Safe to run twice: the UPDATEs are absolute assignments.
-- ==============================================================================

BEGIN;

ALTER TABLE tips_crm.roles DISABLE TRIGGER roles_block_system_permission_change;

UPDATE tips_crm.roles SET permissions = ARRAY[
  'portal.company.enter',
  'portal.supervisor.enter',
  'portal.rep.enter',
  'company.profile.update',
  'employee.manage',
  'employee.read.team',
  'role.assign',
  'territory.manage',
  'team.assign',
  'catalogue.manage',
  'catalogue.read',
  'account.read.assigned',
  'account.read.team',
  'account.read.company',
  'account.create',
  'account.update',
  'account.import',
  'plan.create.own',
  'plan.read.own',
  'plan.read.team',
  'plan.read.company',
  'plan.approve.team',
  'plan.approve.company',
  'visit.record',
  'visit.read.own',
  'visit.read.team',
  'visit.read.company',
  'visit.review',
  'telemetry.read.team',
  'telemetry.read.company',
  'credit_limit.manage',
  'finance.reconcile',
  'notification.send.team',
  'report.read.team',
  'report.read.company',
  'report.export',
  'audit.read.company'
] WHERE key = 'manager';

UPDATE tips_crm.roles SET permissions = ARRAY[
  'portal.supervisor.enter',
  'catalogue.read',
  'employee.read.team',
  'account.read.team',
  'plan.read.team',
  'plan.approve.team',
  'visit.read.team',
  'visit.review',
  'telemetry.read.team',
  'notification.send.team',
  'report.read.team'
] WHERE key = 'supervisor';

ALTER TABLE tips_crm.roles ENABLE TRIGGER roles_block_system_permission_change;

COMMIT;

-- ==============================================================================
-- Verification
-- ==============================================================================

-- Expect owner 5, manager 37, supervisor 11, rep 9, accountant 6.
-- SELECT key, cardinality(permissions) AS n,
--        'employee.read.team' = ANY(permissions) AS can_see_roster
-- FROM tips_crm.roles
-- WHERE key IN ('owner','manager','supervisor','rep','accountant')
-- ORDER BY key;

-- The recompute trigger should have re-materialized every affected membership:
-- managers 37, supervisors 11, reps 9, accountant 6.
-- SELECT p.email, p.role_key, count(mp.permission) AS perms
-- FROM tips_crm.profiles p
-- LEFT JOIN tips_crm.membership_permissions mp
--   ON mp.profile_id = p.id AND mp.company_id = p.active_company_id
-- WHERE NOT p.is_platform_admin AND p.active_company_id IS NOT NULL
-- GROUP BY p.email, p.role_key
-- ORDER BY perms;
