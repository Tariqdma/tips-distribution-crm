-- ==============================================================================
-- Tips CRM: expose membership_permissions through tips_crm_my_profile
--
-- Phase B1. The app resolves permissions by mapping the single profiles.role_key
-- through shared/auth/legacy.ts, scaffolding added before the membership schema
-- existed. This adds the real set to the profile RPC so the client and the
-- server guard can read it directly and that adapter can be deleted.
--
-- RLS is NOT changed here. Policies still enforce via the old permission strings,
-- so the client's set stays advisory: if membership_permissions were incomplete
-- for someone, the symptom is a hidden button rather than a denial at the
-- database, and it is reversible in one commit. Pointing RLS at the new
-- vocabulary is Phase B2, once this has proven the data is right.
--
-- The return type gains a column, so this is DROP + CREATE rather than
-- CREATE OR REPLACE. Existing callers read fields by name and are unaffected;
-- `permissions` (the legacy array) is deliberately still returned, because RLS
-- and several server checks still use it until Phase B2.
--
-- No CASCADE: if anything depends on this function the DROP will fail loudly
-- rather than quietly removing it.
--
-- Platform admins are deliberately NOT special-cased here. They hold no
-- Membership, so they get an empty array, and the fixed platform permission set
-- is applied in code from shared/auth/roles.ts — exactly as
-- docs/authorization-model.md specifies.
--
-- Safe to run twice.
-- ==============================================================================

BEGIN;

DROP FUNCTION IF EXISTS public.tips_crm_my_profile();

CREATE FUNCTION public.tips_crm_my_profile()
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  membership_permissions text[],
  is_active boolean,
  must_change_password boolean,
  is_platform_admin boolean,
  active_company_id uuid,
  active_company_name text,
  active_company_slug text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'tips_crm', 'auth', 'public'
AS $function$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role_key,
    r.display_name,
    r.permissions,
    COALESCE((
      SELECT array_agg(mp.permission ORDER BY mp.permission)
      FROM tips_crm.membership_permissions mp
      WHERE mp.profile_id = p.id
        AND mp.company_id = p.active_company_id
    ), '{}'::text[]),
    p.is_active,
    p.must_change_password,
    p.is_platform_admin,
    p.active_company_id,
    c.name,
    c.slug
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  LEFT JOIN tips_crm.companies c ON c.id = p.active_company_id
  WHERE p.id = auth.uid();
$function$;

COMMIT;

-- ==============================================================================
-- Verification
-- ==============================================================================

-- Signed in as yourself, this should now return a membership_permissions array.
-- A manager should show 36 entries; a platform admin should show 0, because the
-- platform set is applied in code, not stored as a Membership.
-- SELECT role_key, is_platform_admin,
--        cardinality(permissions) AS legacy_permission_count,
--        cardinality(membership_permissions) AS membership_permission_count
-- FROM public.tips_crm_my_profile();

-- Across all users, from the table directly (not via the RPC, which is scoped to
-- the caller). Anyone with a company but zero rows here will see an empty UI
-- once the client switches over — fix them before Phase B2 makes it a denial.
-- SELECT p.email, p.role_key, p.active_company_id,
--        count(mp.permission) AS permission_count
-- FROM tips_crm.profiles p
-- LEFT JOIN tips_crm.membership_permissions mp
--   ON mp.profile_id = p.id AND mp.company_id = p.active_company_id
-- WHERE NOT p.is_platform_admin
-- GROUP BY p.email, p.role_key, p.active_company_id
-- ORDER BY permission_count, p.email;
