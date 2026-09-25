-- ==============================================================================
-- Tips CRM: repair the accountant System Role bundle
--
-- tips_crm_membership_roles.sql seeds the five System Roles with
-- ON CONFLICT (key) DO NOTHING. Four of the five names were new, so they seeded
-- correctly — manager 36, supervisor 10, rep 9. But `accountant` already existed,
-- seeded by supabase/seed_test_accounts.sql, so the insert was skipped and the
-- row kept its OLD legacy permission array.
--
-- The consequence is worse than a short array: those legacy strings are not in
-- the 46-permission vocabulary, so the client filters them out entirely and the
-- accountant resolves to no usable permissions at all.
--
-- ON CONFLICT DO NOTHING was the right call for a migration that must be safe to
-- re-run; the mistake was assuming none of the five names could already exist.
--
-- The immutability trigger from tips_crm_authorization_integrity.sql blocks
-- changing a system role's permissions, so this disables it for the duration and
-- restores it — the same deliberate-migration pattern as
-- tips_crm_permission_vocabulary_v2.sql.
--
-- Safe to run twice: the UPDATE is an absolute assignment.
-- ==============================================================================

BEGIN;

ALTER TABLE tips_crm.roles DISABLE TRIGGER roles_block_system_permission_change;

UPDATE tips_crm.roles
SET permissions = ARRAY[
      'portal.company.enter',
      'account.read.company',
      'visit.read.company',
      'credit_limit.manage',
      'finance.reconcile',
      'report.read.company'
    ],
    is_system = true,
    is_active = true
WHERE key = 'accountant';

ALTER TABLE tips_crm.roles ENABLE TRIGGER roles_block_system_permission_change;

COMMIT;

-- ==============================================================================
-- Verification
-- ==============================================================================

-- All five System Roles, with the counts they should have:
--   owner 5, manager 36, supervisor 10, rep 9, accountant 6
-- SELECT key, is_system, cardinality(permissions) AS permission_count
-- FROM tips_crm.roles
-- WHERE key IN ('owner','manager','supervisor','rep','accountant')
-- ORDER BY key;

-- The roles_recompute trigger should have re-materialized the accountant's
-- membership. Expect 6, not 2.
-- SELECT p.email, p.role_key, count(mp.permission) AS perms
-- FROM tips_crm.profiles p
-- LEFT JOIN tips_crm.membership_permissions mp
--   ON mp.profile_id = p.id AND mp.company_id = p.active_company_id
-- WHERE NOT p.is_platform_admin AND p.active_company_id IS NOT NULL
-- GROUP BY p.email, p.role_key
-- ORDER BY perms;

-- Nothing anywhere should still hold a permission outside the 46-string
-- vocabulary. This lists any membership permission that is not a known one —
-- expect zero rows. (The legacy roles.permissions arrays on retired keys like
-- sales_rep are expected to hold old strings and are not covered here; they stop
-- mattering once Phase B2 retires has_permission().)
-- SELECT DISTINCT mp.permission
-- FROM tips_crm.membership_permissions mp
-- WHERE mp.permission NOT LIKE 'portal.%'
--   AND mp.permission NOT LIKE 'company.%'
--   AND mp.permission NOT LIKE 'account.%'
--   AND mp.permission NOT LIKE 'plan.%'
--   AND mp.permission NOT LIKE 'visit.%'
--   AND mp.permission NOT LIKE 'telemetry.%'
--   AND mp.permission NOT LIKE 'report.%'
--   AND mp.permission NOT LIKE 'audit.%'
--   AND mp.permission NOT LIKE 'notification.%'
--   AND mp.permission NOT LIKE 'role.%'
--   AND mp.permission NOT LIKE 'platform.%'
--   AND mp.permission NOT IN ('employee.manage','territory.manage','team.assign',
--                             'catalogue.manage','catalogue.read',
--                             'credit_limit.manage','finance.reconcile');
