ALTER TABLE tips_crm.accounts ADD COLUMN IF NOT EXISTS local_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_created_by_local_ref_idx ON tips_crm.accounts(created_by, local_ref) WHERE local_ref IS NOT NULL;

DROP FUNCTION IF EXISTS public.tips_crm_create_invite(text, text, text);
CREATE OR REPLACE FUNCTION public.tips_crm_create_invite(invitee_email text, invite_role_key text, invite_territory text DEFAULT NULL)
RETURNS TABLE(invite_id uuid, invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE new_invite tips_crm.team_invites%ROWTYPE; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF invitee_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = invite_role_key AND is_active) THEN RAISE EXCEPTION 'Role is not available'; END IF;
  INSERT INTO tips_crm.team_invites(email, role_key, territory_label, invited_by) VALUES (lower(invitee_email), invite_role_key, NULLIF(invite_territory, ''), auth.uid()) RETURNING * INTO new_invite;
  PERFORM tips_crm.log_audit('invite_created', 'team_invite', new_invite.id::text, jsonb_build_object('email', new_invite.email, 'role_key', new_invite.role_key));
  RETURN QUERY SELECT new_invite.id, new_invite.invite_token, new_invite.expires_at;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text);
CREATE OR REPLACE FUNCTION public.tips_crm_sync_account(local_ref_input text, account_type text, account_name text, account_specialty text, account_state text, account_city text, account_area text, account_address text, account_phone text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE account_id uuid; BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF account_type NOT IN ('doctor', 'pharmacy', 'hospital', 'distributor') THEN RAISE EXCEPTION 'Invalid account type'; END IF;
  SELECT id INTO account_id FROM tips_crm.accounts WHERE created_by = auth.uid() AND local_ref = local_ref_input LIMIT 1;
  IF account_id IS NULL THEN
    INSERT INTO tips_crm.accounts(account_type, name, specialty, state, city, area, address, phone, local_ref, created_by)
    VALUES (account_type, account_name, NULLIF(account_specialty, ''), account_state, account_city, NULLIF(account_area, ''), NULLIF(account_address, ''), NULLIF(account_phone, ''), local_ref_input, auth.uid()) RETURNING id INTO account_id;
    PERFORM tips_crm.log_audit('account_created', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref_input));
  ELSE
    UPDATE tips_crm.accounts SET name = account_name, specialty = NULLIF(account_specialty, ''), state = account_state, city = account_city, area = NULLIF(account_area, ''), address = NULLIF(account_address, ''), phone = NULLIF(account_phone, ''), updated_at = now() WHERE id = account_id;
    PERFORM tips_crm.log_audit('account_updated', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref_input));
  END IF;
  RETURN account_id;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_accounts()
RETURNS TABLE(id uuid, local_ref text, account_type text, name text, specialty text, state text, city text, area text, address text, phone text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT a.id, a.local_ref, a.account_type, a.name, a.specialty, a.state, a.city, a.area, a.address, a.phone, a.created_at FROM tips_crm.accounts a WHERE a.created_by = auth.uid() OR tips_crm.has_permission('view_team_data') ORDER BY a.updated_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.tips_crm_create_invite(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_create_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_accounts() TO authenticated;
