ALTER TABLE tips_crm.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temporary_password_issued_at timestamptz;

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

CREATE OR REPLACE FUNCTION public.tips_crm_mark_password_changed()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE tips_crm.profiles
  SET must_change_password = false, updated_at = now()
  WHERE id = auth.uid();
  PERFORM tips_crm.log_audit('temporary_password_changed', 'profile', auth.uid()::text, '{}'::jsonb);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.tips_crm_mark_password_changed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_mark_password_changed() TO authenticated;
