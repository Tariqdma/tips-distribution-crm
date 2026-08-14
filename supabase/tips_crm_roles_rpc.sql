CREATE OR REPLACE FUNCTION public.tips_crm_claim_first_system_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM tips_crm.profiles WHERE role_key = 'system_admin') THEN
    RETURN false;
  END IF;
  UPDATE tips_crm.profiles SET role_key = 'system_admin', is_active = true WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_roles()
RETURNS TABLE (key text, display_name text, description text, permissions text[], is_system boolean, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;
  RETURN QUERY SELECT r.key, r.display_name, r.description, r.permissions, r.is_system, r.is_active FROM tips_crm.roles r ORDER BY r.is_system DESC, r.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_role(role_key text, role_name text, role_description text, role_permissions text[], role_active boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;
  IF role_key !~ '^[a-z][a-z0-9_]{2,60}$' THEN
    RAISE EXCEPTION 'Invalid role key';
  END IF;
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active)
  VALUES (role_key, role_name, role_description, COALESCE(role_permissions, '{}'::text[]), false, role_active)
  ON CONFLICT (key) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, permissions = EXCLUDED.permissions, is_active = CASE WHEN tips_crm.roles.is_system THEN tips_crm.roles.is_active ELSE EXCLUDED.is_active END, updated_at = now();
  RETURN role_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_deactivate_role(role_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;
  UPDATE tips_crm.roles SET is_active = false, updated_at = now() WHERE key = role_key AND NOT is_system;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_claim_first_system_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_role(text, text, text, text[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_deactivate_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_claim_first_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_role(text, text, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_deactivate_role(text) TO authenticated;
