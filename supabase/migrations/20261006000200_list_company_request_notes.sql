-- The platform page read request notes with GET /api/platform/company-requests/:id/notes,
-- a route the server never had, so notes never appeared. Platform admins read
-- them directly through this function.
CREATE OR REPLACE FUNCTION public.tips_crm_list_company_request_notes(target_request_id uuid)
RETURNS TABLE(id uuid, note_text text, is_internal boolean, created_at timestamptz, created_by_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.is_platform_admin() THEN
    RAISE EXCEPTION 'Platform administrator permission required';
  END IF;
  RETURN QUERY
  SELECT n.id, n.note_text, n.is_internal, n.created_at, coalesce(p.full_name, 'مدير المنصة')
  FROM tips_crm.company_request_notes n
  LEFT JOIN tips_crm.profiles p ON p.id = n.created_by
  WHERE n.request_id = target_request_id
  ORDER BY n.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_company_request_notes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_company_request_notes(uuid) TO authenticated;
