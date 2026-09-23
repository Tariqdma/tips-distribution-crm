ALTER TABLE tips_crm.profiles ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
ALTER TABLE tips_crm.profiles ADD COLUMN IF NOT EXISTS temporary_password_issued_at timestamptz;

DROP FUNCTION IF EXISTS public.tips_crm_my_profile CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_my_profile() CASCADE;

CREATE OR REPLACE FUNCTION public.tips_crm_my_profile() RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  is_active boolean,
  must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.full_name, p.email, p.role_key, r.display_name, r.permissions, p.is_active, p.must_change_password
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated, service_role;

SELECT p.id, p.email, p.role_key, p.is_active, r.key AS matched_role
FROM tips_crm.profiles p
LEFT JOIN tips_crm.roles r ON r.key = p.role_key
WHERE p.email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.rep@tips-sd.com',
  'accountant@tips-sd.com'
);
