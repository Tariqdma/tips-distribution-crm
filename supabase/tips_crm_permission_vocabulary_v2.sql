-- ==============================================================================
-- Tips CRM: Permission vocabulary 44 -> 46
--
-- Run AFTER tips_crm_membership_roles.sql and tips_crm_authorization_integrity.sql.
--
-- An audit of the existing RLS policies found three old permission strings with
-- no equivalent in the new vocabulary:
--
--   send_notifications -> NEW notification.send.team
--       Broadcasting to a team is a capability no other permission implies, and
--       a Supervisor needs it for their own team.
--   export_reports     -> NEW report.export
--       Kept separate from report.read.* so reading a dashboard and extracting
--       its data can be granted independently.
--   manage_outcomes    -> folded into catalogue.manage
--       Visit-outcome labels are a company-configured list, which is what
--       catalogue management already means. No new permission.
--
-- The seeded rows cannot simply be re-inserted: tips_crm_membership_roles.sql
-- uses ON CONFLICT (key) DO NOTHING, and the immutability trigger from
-- tips_crm_authorization_integrity.sql now blocks changing a system role's
-- permissions. That trigger is working as intended — changing a System Role
-- should require a deliberate migration, which is what this file is. It
-- disables the trigger for the duration and restores it.
--
-- Safe to run twice: the UPDATEs are absolute assignments, not increments.
-- ==============================================================================

BEGIN;

ALTER TABLE tips_crm.roles DISABLE TRIGGER roles_block_system_permission_change;

UPDATE tips_crm.roles SET permissions = ARRAY[
  'portal.company.enter',
  'portal.supervisor.enter',
  'portal.rep.enter',
  'company.profile.update',
  'employee.manage',
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

-- Manager must now hold 36 permissions, supervisor 10, and both new strings
-- must appear. owner (5), rep (9) and accountant (6) are unchanged.
-- SELECT key, cardinality(permissions) AS permission_count,
--        'notification.send.team' = ANY(permissions) AS can_send_alerts,
--        'report.export' = ANY(permissions) AS can_export
-- FROM tips_crm.roles
-- WHERE key IN ('owner', 'manager', 'supervisor', 'rep', 'accountant')
-- ORDER BY key;

-- The roles_recompute trigger should have re-materialized every affected
-- membership. A manager's membership must now show 36.
-- SELECT p.email, count(*) AS permission_count
-- FROM tips_crm.membership_permissions mp
-- JOIN tips_crm.profiles p ON p.id = mp.profile_id
-- GROUP BY p.email
-- ORDER BY permission_count DESC;

-- The immutability trigger must be active again. This should RAISE, not succeed:
--   BEGIN;
--   UPDATE tips_crm.roles SET permissions = ARRAY['bogus'] WHERE key = 'owner';
--   ROLLBACK;
