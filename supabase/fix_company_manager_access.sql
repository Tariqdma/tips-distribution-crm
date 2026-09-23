-- Restores company-manager access for the seeded manager account.
-- Run in Supabase SQL Editor after the company-isolation migration.

DO $$
DECLARE
  target_company_id uuid;
  target_profile_id uuid;
BEGIN
  SELECT id INTO target_company_id
  FROM tips_crm.companies
  WHERE slug = 'tips-demo'
  LIMIT 1;

  IF target_company_id IS NULL THEN
    INSERT INTO tips_crm.companies (
      name, slug, status, plan_key, max_user_limit,
      primary_contact_name, primary_contact_email
    )
    VALUES (
      'شركة تيبس للتوزيع والأدوية', 'tips-demo', 'active', 'standard', 20,
      'مدير الشركة', 'company.manager@tips-sd.com'
    )
    RETURNING id INTO target_company_id;
  END IF;

  SELECT id INTO target_profile_id
  FROM auth.users
  WHERE lower(email) = 'company.manager@tips-sd.com'
  LIMIT 1;

  IF target_profile_id IS NULL THEN
    RAISE EXCEPTION 'Auth user company.manager@tips-sd.com was not found';
  END IF;

  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active)
  VALUES (
    'company_manager',
    'مدير الشركة',
    'إدارة مناطق الشركة والموظفين والعملاء والاعتمادات.',
    ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'manage_accounts', 'manage_users', 'export_reports'],
    true,
    true
  )
  ON CONFLICT (key) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      permissions = EXCLUDED.permissions,
      is_active = true;

  INSERT INTO tips_crm.profiles (
    id, full_name, email, role_key, is_active, is_platform_admin, active_company_id
  )
  VALUES (
    target_profile_id, 'مدير الشركة', 'company.manager@tips-sd.com',
    'company_manager', true, false, target_company_id
  )
  ON CONFLICT (id) DO UPDATE
  SET role_key = 'company_manager',
      is_active = true,
      is_platform_admin = false,
      active_company_id = target_company_id,
      updated_at = now();

  INSERT INTO tips_crm.company_memberships (company_id, profile_id, role_key, is_active)
  VALUES (target_company_id, target_profile_id, 'company_manager', true)
  ON CONFLICT (company_id, profile_id) DO UPDATE
  SET role_key = 'company_manager', is_active = true;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_my_profile();

CREATE FUNCTION public.tips_crm_my_profile()
RETURNS TABLE (
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
    p.is_platform_admin,
    p.active_company_id,
    c.name,
    c.slug
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  LEFT JOIN tips_crm.companies c ON c.id = p.active_company_id
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated, service_role;
