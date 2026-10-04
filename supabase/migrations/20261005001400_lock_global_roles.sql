-- tips_crm.roles is one table shared by every company, so editing it from a
-- company account changes the permissions of every company at once.
-- ADR-0001: System Roles are immutable and Custom Roles are not shipped in v1
-- (role.custom.manage is granted to nobody). Until per-company Custom Roles
-- ship, only a platform admin may touch this table, and never a system role's
-- permission bundle (previously save_role overwrote it unconditionally).

CREATE OR REPLACE FUNCTION public.tips_crm_list_roles()
RETURNS TABLE(key text, display_name text, description text, permissions text[], is_system boolean, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT (tips_crm.is_platform_admin() OR tips_crm.has_perm('role.assign') OR tips_crm.has_perm('role.custom.manage')) THEN
    RAISE EXCEPTION 'Role permission required';
  END IF;
  RETURN QUERY
  SELECT r.key, r.display_name, r.description, r.permissions, r.is_system, r.is_active
  FROM tips_crm.roles r
  ORDER BY r.is_system DESC, r.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_role(role_key text, role_name text, role_description text, role_permissions text[], role_active boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.is_platform_admin() THEN
    RAISE EXCEPTION 'Roles are shared by all companies; only a platform admin may change them';
  END IF;
  IF role_key !~ '^[a-z][a-z0-9_]{2,60}$' THEN
    RAISE EXCEPTION 'Invalid role key';
  END IF;
  IF EXISTS (SELECT 1 FROM tips_crm.roles r WHERE r.key = role_key AND r.is_system) THEN
    RAISE EXCEPTION 'System roles cannot be changed';
  END IF;
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active)
  VALUES (role_key, role_name, role_description, COALESCE(role_permissions, '{}'::text[]), false, role_active)
  ON CONFLICT (key) DO UPDATE
    SET display_name = EXCLUDED.display_name, description = EXCLUDED.description,
        permissions = EXCLUDED.permissions, is_active = EXCLUDED.is_active, updated_at = now();
  -- audit_log is per company; a platform admin acting outside one is not logged there.
  IF tips_crm.my_company_id() IS NOT NULL THEN
    PERFORM tips_crm.log_audit('role_saved', 'role', role_key, jsonb_build_object('permissions', role_permissions, 'active', role_active));
  END IF;
  RETURN role_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_deactivate_role(role_key text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  changed boolean;
BEGIN
  IF NOT tips_crm.is_platform_admin() THEN
    RAISE EXCEPTION 'Roles are shared by all companies; only a platform admin may change them';
  END IF;
  UPDATE tips_crm.roles SET is_active = false, updated_at = now() WHERE key = role_key AND NOT is_system;
  changed := FOUND;
  IF changed AND tips_crm.my_company_id() IS NOT NULL THEN
    PERFORM tips_crm.log_audit('role_deactivated', 'role', role_key, '{}'::jsonb);
  END IF;
  RETURN changed;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_roles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_save_role(text, text, text, text[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_deactivate_role(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_role(text, text, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_deactivate_role(text) TO authenticated;
