GRANT USAGE ON SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;

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

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm GRANT ALL ON ROUTINES TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
