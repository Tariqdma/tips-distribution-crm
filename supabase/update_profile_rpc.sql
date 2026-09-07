-- RPC and RLS policy to allow users to update their own profile name and photo
CREATE OR REPLACE FUNCTION public.tips_crm_update_my_profile(
  new_full_name text,
  new_avatar_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE tips_crm.profiles
  SET full_name = COALESCE(NULLIF(TRIM(new_full_name), ''), full_name)
  WHERE id = v_uid;

  UPDATE auth.users
  SET raw_user_meta_data = jsonb_set(
    COALESCE(raw_user_meta_data, '{}'::jsonb),
    '{full_name}',
    to_jsonb(COALESCE(NULLIF(TRIM(new_full_name), ''), ''))
  )
  WHERE id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_update_my_profile(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_update_my_profile(text, text) TO authenticated, service_role;

-- Allow users to update their own row in tips_crm.profiles directly as well
DROP POLICY IF EXISTS profiles_update_own ON tips_crm.profiles;
CREATE POLICY profiles_update_own ON tips_crm.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
