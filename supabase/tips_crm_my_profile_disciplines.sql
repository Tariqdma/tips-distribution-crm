-- ==============================================================================
-- Tips CRM: expose the Membership's Disciplines through tips_crm_my_profile
--
-- Run AFTER tips_crm_my_profile_membership_permissions.sql.
--
-- The client still derives Discipline by mapping the legacy profiles.role_key
-- (sales_rep -> sales, medical_supervisor -> medical). That breaks the moment
-- employees are created under the new model, where role_key is 'rep' and the
-- line of work lives in company_memberships.disciplines — 'rep' says nothing
-- about sales versus medical, by design.
--
-- The backfill in tips_crm_membership_roles.sql already populated disciplines
-- for every existing membership, so the database is authoritative for everyone
-- and the client needs no fallback.
--
-- Return type gains a column, so DROP + CREATE rather than CREATE OR REPLACE.
-- No CASCADE: a dependency should fail loudly rather than be removed silently.
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
  disciplines text[],
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
    COALESCE((
      SELECT cm.disciplines
      FROM tips_crm.company_memberships cm
      WHERE cm.profile_id = p.id
        AND cm.company_id = p.active_company_id
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

-- Signed in as yourself: a rep or supervisor should show their line of work, a
-- manager or accountant an empty array, a platform admin an empty array.
-- SELECT role_key, disciplines, cardinality(membership_permissions) AS perms
-- FROM public.tips_crm_my_profile();

-- Across the company, from the table directly. Every sales_* legacy key should
-- read {sales} and every medical_* key {medical}; managers and accountants {}.
-- SELECT p.email, p.role_key, cm.disciplines
-- FROM tips_crm.profiles p
-- JOIN tips_crm.company_memberships cm
--   ON cm.profile_id = p.id AND cm.company_id = p.active_company_id
-- ORDER BY p.email;
