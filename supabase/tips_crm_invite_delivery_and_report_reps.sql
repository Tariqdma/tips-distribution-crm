CREATE OR REPLACE FUNCTION public.tips_crm_prepare_invite_email(target_invite_id uuid)
RETURNS TABLE(invite_id uuid, recipient_email text, role_label text, territory_label text, invite_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN
    RAISE EXCEPTION 'User management permission required';
  END IF;
  RETURN QUERY
  SELECT i.id, i.email, r.display_name, i.territory_label, i.invite_token, i.expires_at
  FROM tips_crm.team_invites i
  JOIN tips_crm.roles r ON r.key = i.role_key
  WHERE i.id = target_invite_id AND i.status = 'pending' AND i.expires_at > now();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invite cannot be sent';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_report_reps()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN
    RAISE EXCEPTION 'Export permission required';
  END IF;
  RETURN QUERY SELECT p.id, p.full_name FROM tips_crm.profiles p WHERE p.is_active ORDER BY p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_prepare_invite_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_report_reps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_prepare_invite_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_report_reps() TO authenticated;
