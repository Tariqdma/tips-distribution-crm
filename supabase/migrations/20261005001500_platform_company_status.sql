-- The platform page suspended/reactivated a company with a direct table
-- update, but tips_crm.companies has no UPDATE policy, so the write matched
-- nothing and the page still reported success.
CREATE OR REPLACE FUNCTION public.tips_crm_set_company_status(p_company_id uuid, p_status text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator permission required';
  END IF;
  IF p_status NOT IN ('active', 'suspended', 'archived') THEN
    RAISE EXCEPTION 'Invalid company status';
  END IF;
  UPDATE tips_crm.companies SET status = p_status, updated_at = now() WHERE id = p_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;
  RETURN p_status;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_set_company_status(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_set_company_status(uuid, text) TO authenticated;
