-- Grant permissions to Supabase internal auth admin roles
GRANT USAGE ON SCHEMA tips_crm TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, service_role;

-- Drop any orphan triggers on auth.users from older migrations/schemas
DROP TRIGGER IF EXISTS tips_crm_after_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

CREATE OR REPLACE FUNCTION tips_crm.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system)
  VALUES ('sales_rep', 'مندوب مبيعات', 'المسؤول الميداني للزيارات والمبيعات', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true)
  ON CONFLICT (key) DO NOTHING;

  INSERT INTO tips_crm.profiles (id, full_name, email, role_key)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email, 'موظف Tips'),
    NEW.email,
    'sales_rep'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER tips_crm_after_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION tips_crm.handle_auth_user_created();

CREATE OR REPLACE FUNCTION public.tips_crm_my_profile()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.full_name, p.email, p.role_key, r.display_name, r.permissions, p.is_active
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION tips_crm.handle_auth_user_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated, service_role;
