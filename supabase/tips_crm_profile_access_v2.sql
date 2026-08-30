-- Restore the platform flag expected by platform and company access guards.
ALTER TABLE tips_crm.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

UPDATE tips_crm.profiles
SET is_platform_admin = true,
    updated_at = now()
WHERE lower(email) = 'info@tips-sd.com'
  AND role_key = 'system_admin';

-- Keep the older RPC for backwards compatibility and expose the richer shape
-- required by company setup and platform guards.
CREATE OR REPLACE FUNCTION public.tips_crm_my_profile_v2()
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  is_active boolean,
  must_change_password boolean,
  is_platform_admin boolean,
  active_company_id uuid,
  active_company_name text,
  active_company_slug text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role_key,
    r.display_name,
    r.permissions,
    p.is_active,
    p.must_change_password,
    coalesce(p.is_platform_admin, false),
    p.active_company_id,
    c.name,
    c.slug
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  LEFT JOIN tips_crm.companies c ON c.id = p.active_company_id
  WHERE p.id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile_v2() TO authenticated;
