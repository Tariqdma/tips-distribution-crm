-- 1. Invites: the app sends territory keys, but the deployed function only took
--    three arguments, so every invite failed. Accepting an invite also never
--    created a company membership, leaving the new employee with no access.
-- 2. Report export: the audit screen sends record_type_filter, which the
--    deployed function did not accept, so every export failed.

ALTER TABLE tips_crm.team_invites ADD COLUMN IF NOT EXISTS territory_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Legacy role key -> (membership role, disciplines).
CREATE OR REPLACE FUNCTION tips_crm.membership_shape_for_role(legacy_role text)
RETURNS TABLE(role_key text, disciplines text[])
LANGUAGE sql IMMUTABLE
AS $$
  SELECT m.role_key, m.disciplines FROM (VALUES
    ('sales_rep', 'rep', ARRAY['sales']),
    ('medical_rep', 'rep', ARRAY['medical']),
    ('rep', 'rep', ARRAY[]::text[]),
    ('sales_supervisor', 'supervisor', ARRAY['sales']),
    ('medical_supervisor', 'supervisor', ARRAY['medical']),
    ('supervisor', 'supervisor', ARRAY[]::text[]),
    ('accountant', 'accountant', ARRAY[]::text[]),
    ('company_manager', 'manager', ARRAY[]::text[]),
    ('sales_manager', 'manager', ARRAY['sales']),
    ('manager', 'manager', ARRAY[]::text[])
  ) AS m(legacy, role_key, disciplines)
  WHERE m.legacy = legacy_role;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_invite(invitee_email text, invite_role_key text, invite_territory text, invite_territory_key text, invite_territory_keys text[])
RETURNS TABLE(invite_id uuid, invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  new_invite tips_crm.team_invites%ROWTYPE;
  normalized_keys text[];
  selected_ids uuid[];
  selected_labels text;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF actor_company IS NULL THEN RAISE EXCEPTION 'No active company is set for this account'; END IF;
  IF invitee_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.membership_shape_for_role(invite_role_key)) THEN RAISE EXCEPTION 'Role is not available'; END IF;

  normalized_keys := ARRAY(
    SELECT DISTINCT trim(value) FROM unnest(coalesce(invite_territory_keys, '{}'::text[]) || coalesce(ARRAY[invite_territory_key], '{}'::text[])) value
    WHERE trim(coalesce(value, '')) <> ''
  );
  SELECT array_agg(t.id ORDER BY t.name), string_agg(t.name, '، ' ORDER BY t.name) INTO selected_ids, selected_labels
  FROM tips_crm.territories t
  WHERE t.client_key = ANY(normalized_keys) AND t.is_active AND t.company_id = actor_company;
  IF coalesce(cardinality(selected_ids), 0) <> cardinality(normalized_keys) THEN RAISE EXCEPTION 'One or more selected territories are unavailable'; END IF;

  INSERT INTO tips_crm.team_invites(company_id, email, role_key, territory_label, territory_ids, invited_by)
  VALUES (actor_company, lower(invitee_email), invite_role_key, coalesce(selected_labels, nullif(invite_territory, '')), coalesce(selected_ids, '{}'::uuid[]), auth.uid())
  RETURNING * INTO new_invite;
  PERFORM tips_crm.log_audit('invite_created', 'team_invite', new_invite.id::text,
    jsonb_build_object('email', new_invite.email, 'role_key', new_invite.role_key, 'territory_count', cardinality(new_invite.territory_ids)));
  RETURN QUERY SELECT new_invite.id, new_invite.invite_token, new_invite.expires_at;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_create_invite(text, text, text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_create_invite(text, text, text, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_accept_invite(token text)
RETURNS TABLE(role_key text, territory_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  invited tips_crm.team_invites%ROWTYPE;
  current_email text;
  shape record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO invited FROM tips_crm.team_invites WHERE invite_token = token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF invited.status <> 'pending' OR invited.expires_at < now() THEN RAISE EXCEPTION 'Invitation is no longer valid'; END IF;
  IF lower(invited.email) <> current_email THEN RAISE EXCEPTION 'Invitation email does not match the signed-in account'; END IF;
  SELECT * INTO shape FROM tips_crm.membership_shape_for_role(invited.role_key);
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation role is not available'; END IF;

  UPDATE tips_crm.profiles
  SET role_key = invited.role_key, is_active = true, active_company_id = invited.company_id, updated_at = now()
  WHERE id = auth.uid();

  INSERT INTO tips_crm.company_memberships(company_id, profile_id, role_key, is_active, disciplines)
  VALUES (invited.company_id, auth.uid(), invited.role_key, true, shape.disciplines)
  ON CONFLICT (company_id, profile_id) DO UPDATE SET role_key = EXCLUDED.role_key, is_active = true, disciplines = EXCLUDED.disciplines, updated_at = now();

  INSERT INTO tips_crm.membership_roles(company_id, profile_id, role_key, granted_by)
  VALUES (invited.company_id, auth.uid(), shape.role_key, invited.invited_by)
  ON CONFLICT DO NOTHING;

  INSERT INTO tips_crm.territory_assignments(territory_id, profile_id, assigned_by, company_id)
  SELECT territory_id, auth.uid(), invited.invited_by, invited.company_id
  FROM unnest(invited.territory_ids) territory_id
  ON CONFLICT (territory_id, profile_id) DO NOTHING;

  UPDATE tips_crm.team_invites SET status = 'accepted' WHERE id = invited.id;
  PERFORM tips_crm.log_audit('invite_accepted', 'team_invite', invited.id::text,
    jsonb_build_object('role_key', invited.role_key, 'territory_count', cardinality(invited.territory_ids)));
  RETURN QUERY SELECT invited.role_key, invited.territory_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date, report_end date, report_rep_id uuid, record_type_filter text)
RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT f.record_type, f.occurred_at, f.actor_name, f.title, f.status, f.details
  FROM public.tips_crm_export_report_feed(report_start, report_end, report_rep_id) f
  WHERE record_type_filter IS NULL OR f.record_type = record_type_filter;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid, text) TO authenticated;
