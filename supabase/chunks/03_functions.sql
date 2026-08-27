CREATE OR REPLACE FUNCTION tips_crm.log_audit(log_action text, log_entity_type text, log_entity_id text, log_details jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  INSERT INTO tips_crm.audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), log_action, log_entity_type, log_entity_id, COALESCE(log_details, '{}'::jsonb));
END;
$$;

DROP TRIGGER IF EXISTS tips_crm_after_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

CREATE OR REPLACE FUNCTION tips_crm.handle_auth_user_created() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system)
  VALUES ('sales_rep', 'مندوب مبيعات', 'المسؤول الميداني للزيارات والمبيعات', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true)
  ON CONFLICT (key) DO NOTHING;

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

CREATE OR REPLACE FUNCTION public.tips_crm_my_profile() RETURNS TABLE (
  id uuid, full_name text, email text, role_key text, role_name text, permissions text[], is_active boolean, must_change_password boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.full_name, p.email, p.role_key, r.display_name, r.permissions, p.is_active, p.must_change_password
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  WHERE p.id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_mark_password_changed() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE tips_crm.profiles SET must_change_password = false, updated_at = now() WHERE id = auth.uid();
  PERFORM tips_crm.log_audit('temporary_password_changed', 'profile', auth.uid()::text, '{}'::jsonb);
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_claim_first_system_admin() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM tips_crm.profiles WHERE role_key = 'system_admin') THEN RETURN false; END IF;
  UPDATE tips_crm.profiles SET role_key = 'system_admin', is_active = true WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_roles() RETURNS TABLE (key text, display_name text, description text, permissions text[], is_system boolean, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN RAISE EXCEPTION 'Role management permission required'; END IF;
  RETURN QUERY SELECT r.key, r.display_name, r.description, r.permissions, r.is_system, r.is_active FROM tips_crm.roles r ORDER BY r.is_system DESC, r.display_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_role(role_key text, role_name text, role_description text, role_permissions text[], role_active boolean DEFAULT true) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN RAISE EXCEPTION 'Role management permission required'; END IF;
  IF role_key !~ '^[a-z][a-z0-9_]{2,60}$' THEN RAISE EXCEPTION 'Invalid role key'; END IF;
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active)
  VALUES (role_key, role_name, role_description, COALESCE(role_permissions, '{}'::text[]), false, role_active)
  ON CONFLICT (key) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, permissions = EXCLUDED.permissions, is_active = CASE WHEN tips_crm.roles.is_system THEN tips_crm.roles.is_active ELSE EXCLUDED.is_active END, updated_at = now();
  RETURN role_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_deactivate_role(role_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN RAISE EXCEPTION 'Role management permission required'; END IF;
  UPDATE tips_crm.roles SET is_active = false, updated_at = now() WHERE key = role_key AND NOT is_system;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_invites() RETURNS TABLE(id uuid, email text, role_key text, territory_label text, status text, invite_token text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT i.id, i.email, i.role_key, i.territory_label, i.status, i.invite_token, i.expires_at, i.created_at FROM tips_crm.team_invites i ORDER BY i.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_invite(invitee_email text, invite_role_key text, invite_territory text DEFAULT NULL) RETURNS TABLE(invite_id uuid, invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE new_invite tips_crm.team_invites%ROWTYPE; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF invitee_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = invite_role_key AND is_active) THEN RAISE EXCEPTION 'Role is not available'; END IF;
  INSERT INTO tips_crm.team_invites(email, role_key, territory_label, invited_by) VALUES (lower(invitee_email), invite_role_key, NULLIF(invite_territory, ''), auth.uid()) RETURNING * INTO new_invite;
  PERFORM tips_crm.log_audit('invite_created', 'team_invite', new_invite.id::text, jsonb_build_object('email', new_invite.email, 'role_key', new_invite.role_key));
  RETURN QUERY SELECT new_invite.id, new_invite.invite_token, new_invite.expires_at;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_resend_invite(invite_id uuid) RETURNS TABLE(invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE resent tips_crm.team_invites%ROWTYPE; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'pending', invite_token = encode(gen_random_bytes(24), 'hex'), expires_at = now() + interval '7 days' WHERE id = invite_id AND status <> 'accepted' RETURNING * INTO resent;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be resent'; END IF;
  PERFORM tips_crm.log_audit('invite_resent', 'team_invite', resent.id::text, jsonb_build_object('email', resent.email));
  RETURN QUERY SELECT resent.invite_token, resent.expires_at;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_revoke_invite(invite_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE revoked_email text; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'revoked' WHERE id = invite_id AND status = 'pending' RETURNING email INTO revoked_email;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM tips_crm.log_audit('invite_revoked', 'team_invite', invite_id::text, jsonb_build_object('email', revoked_email));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_accept_invite(token text) RETURNS TABLE(role_key text, territory_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE invited tips_crm.team_invites%ROWTYPE;
DECLARE current_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO invited FROM tips_crm.team_invites WHERE invite_token = token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF invited.status <> 'pending' OR invited.expires_at < now() THEN RAISE EXCEPTION 'Invitation is no longer valid'; END IF;
  IF lower(invited.email) <> current_email THEN RAISE EXCEPTION 'Invitation email does not match the signed-in account'; END IF;
  UPDATE tips_crm.profiles SET role_key = invited.role_key, is_active = true, updated_at = now() WHERE id = auth.uid();
  UPDATE tips_crm.team_invites SET status = 'accepted' WHERE id = invited.id;
  PERFORM tips_crm.log_audit('invite_accepted', 'team_invite', invited.id::text, jsonb_build_object('role_key', invited.role_key));
  RETURN QUERY SELECT invited.role_key, invited.territory_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_accounts() RETURNS TABLE(id uuid, local_ref text, account_type text, name text, specialty text, state text, city text, area text, address text, phone text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT a.id, a.local_ref, a.account_type, a.name, a.specialty, a.state, a.city, a.area, a.address, a.phone, a.created_at FROM tips_crm.accounts a WHERE a.created_by = auth.uid() OR tips_crm.has_permission('view_team_data') ORDER BY a.updated_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_sync_account(local_ref_input text, account_type text, account_name text, account_specialty text, account_state text, account_city text, account_area text, account_address text, account_phone text) RETURNS uuid
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

CREATE OR REPLACE FUNCTION public.tips_crm_list_visit_outcomes() RETURNS TABLE(id uuid, label text, is_active boolean, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ SELECT o.id, o.label, o.is_active, o.sort_order FROM tips_crm.visit_outcomes o WHERE o.is_active OR tips_crm.has_permission('manage_outcomes') ORDER BY o.sort_order, o.label; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_outcome(outcome_label text, outcome_sort_order integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE outcome_id uuid; BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  INSERT INTO tips_crm.visit_outcomes(label, sort_order, created_by) VALUES (trim(outcome_label), outcome_sort_order, auth.uid()) ON CONFLICT (label) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = now() RETURNING id INTO outcome_id;
  PERFORM tips_crm.log_audit('visit_outcome_saved', 'visit_outcome', outcome_id::text, jsonb_build_object('label', trim(outcome_label)));
  RETURN outcome_id;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_set_visit_outcome_active(outcome_id uuid, next_is_active boolean) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE outcome_label text; remaining_active_count integer;
BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  SELECT label INTO outcome_label FROM tips_crm.visit_outcomes WHERE id = outcome_id FOR UPDATE;
  IF outcome_label IS NULL THEN RAISE EXCEPTION 'Visit outcome was not found'; END IF;
  IF NOT next_is_active THEN
    SELECT count(*) INTO remaining_active_count FROM tips_crm.visit_outcomes WHERE is_active AND id <> outcome_id;
    IF remaining_active_count = 0 THEN RAISE EXCEPTION 'At least one active visit outcome is required'; END IF;
  END IF;
  UPDATE tips_crm.visit_outcomes SET is_active = next_is_active, updated_at = now() WHERE id = outcome_id;
  PERFORM tips_crm.log_audit(CASE WHEN next_is_active THEN 'visit_outcome_activated' ELSE 'visit_outcome_deactivated' END, 'visit_outcome', outcome_id::text, jsonb_build_object('label', outcome_label));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_plan(plan_title text, plan_type text, starts_on date, ends_on date) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') THEN RAISE EXCEPTION 'Plan creation permission required'; END IF;
  INSERT INTO tips_crm.plans(owner_id, title, plan_type, starts_on, ends_on, status) VALUES (auth.uid(), plan_title, plan_type, starts_on, ends_on, 'pending') RETURNING id INTO plan_id;
  PERFORM tips_crm.log_audit('plan_submitted', 'plan', plan_id::text, jsonb_build_object('title', plan_title, 'plan_type', plan_type));
  RETURN plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit(account_uuid uuid, visit_status text, visit_outcome text, visit_notes text, latitude numeric DEFAULT NULL, longitude numeric DEFAULT NULL, accuracy integer DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE visit_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('write_own_visits') THEN RAISE EXCEPTION 'Visit write permission required'; END IF;
  IF visit_status NOT IN ('scheduled', 'completed', 'needs_review') THEN RAISE EXCEPTION 'Invalid visit status'; END IF;
  INSERT INTO tips_crm.visits(rep_id, account_id, status, outcome, notes, checked_in_at, check_in_latitude, check_in_longitude, location_accuracy_meters)
  VALUES (auth.uid(), account_uuid, visit_status, NULLIF(visit_outcome, ''), NULLIF(visit_notes, ''), CASE WHEN visit_status <> 'scheduled' THEN now() END, latitude, longitude, accuracy)
  RETURNING id INTO visit_id;
  PERFORM tips_crm.log_audit('visit_saved', 'visit', visit_id::text, jsonb_build_object('status', visit_status, 'account_id', account_uuid));
  RETURN visit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_my_workspace() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT jsonb_build_object(
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'plan_type', p.plan_type, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'status', p.status, 'created_at', p.created_at) ORDER BY p.created_at DESC) FROM tips_crm.plans p WHERE p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')), '[]'::jsonb),
    'visits', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'account_id', v.account_id, 'status', v.status, 'outcome', v.outcome, 'notes', v.notes, 'checked_in_at', v.checked_in_at, 'created_at', v.created_at) ORDER BY v.created_at DESC) FROM tips_crm.visits v WHERE v.rep_id = auth.uid() OR tips_crm.has_permission('view_team_data')), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_audit_feed() RETURNS TABLE(id bigint, action text, entity_type text, entity_id text, details jsonb, created_at timestamptz, actor_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('view_team_data') THEN RAISE EXCEPTION 'Team data permission required'; END IF;
  RETURN QUERY SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, p.full_name FROM tips_crm.audit_log a LEFT JOIN tips_crm.profiles p ON p.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_plans() RETURNS TABLE(
  id uuid, title text, plan_type text, starts_on date, ends_on date, status text, manager_note text, created_at timestamptz,
  owner_name text, owner_territory text, completed_visits bigint, needs_review_visits bigint, last_visit_name text, last_visit_at timestamptz, scheduled_visits jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') AND NOT tips_crm.has_permission('view_team_data') THEN RAISE EXCEPTION 'Plan access permission required'; END IF;
  RETURN QUERY
  SELECT p.id, p.title, p.plan_type, p.starts_on, p.ends_on, p.status, p.manager_note, p.created_at,
    owner.full_name,
    COALESCE((SELECT string_agg(DISTINCT territory.name, '، ' ORDER BY territory.name) FROM tips_crm.territory_assignments assignment JOIN tips_crm.territories territory ON territory.id = assignment.territory_id WHERE assignment.profile_id = p.owner_id), 'غير محددة'),
    (SELECT count(*) FROM tips_crm.visits visit WHERE visit.rep_id = p.owner_id AND visit.status = 'completed'),
    (SELECT count(*) FROM tips_crm.visits visit WHERE visit.rep_id = p.owner_id AND visit.status = 'needs_review'),
    recent.account_name, recent.checked_in_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', plan_visit.id, 'account_id', plan_visit.account_id, 'account_name', account.name, 'scheduled_for', plan_visit.scheduled_for) ORDER BY plan_visit.scheduled_for, plan_visit.created_at) FROM tips_crm.plan_visits plan_visit JOIN tips_crm.accounts account ON account.id = plan_visit.account_id WHERE plan_visit.plan_id = p.id), '[]'::jsonb)
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  LEFT JOIN LATERAL (
    SELECT account.name AS account_name, visit.checked_in_at FROM tips_crm.visits visit JOIN tips_crm.accounts account ON account.id = visit.account_id WHERE visit.rep_id = p.owner_id AND visit.status = 'completed' ORDER BY visit.checked_in_at DESC NULLS LAST, visit.updated_at DESC LIMIT 1
  ) recent ON true
  WHERE p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_update_plan_by_manager(target_plan_id uuid, planned_visits jsonb, manager_note_input text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_owner uuid; plan_title text;
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN RAISE EXCEPTION 'Plan approval permission required'; END IF;
  SELECT owner_id, title INTO plan_owner, plan_title FROM tips_crm.plans WHERE id = target_plan_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only pending plans can be modified'; END IF;
  DELETE FROM tips_crm.plan_visits WHERE plan_id = target_plan_id;
  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for)
  SELECT target_plan_id, (item->>'account_id')::uuid, (item->>'scheduled_for')::timestamptz FROM jsonb_array_elements(COALESCE(planned_visits, '[]'::jsonb)) AS item WHERE item ? 'account_id' AND item ? 'scheduled_for';
  UPDATE tips_crm.plans SET manager_note = NULLIF(trim(manager_note_input), ''), updated_at = now() WHERE id = target_plan_id;
  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by) VALUES (plan_owner, 'تم تعديل خطتك من الإدارة', concat('عدّلت الإدارة توزيع زيارات «', plan_title, '». ', COALESCE(NULLIF(trim(manager_note_input), ''), 'راجع الأيام والجهات قبل الاعتماد.')), 'plan', auth.uid());
  PERFORM tips_crm.log_audit('plan_updated_by_manager', 'plan', target_plan_id::text, jsonb_build_object('note', manager_note_input, 'visit_count', jsonb_array_length(COALESCE(planned_visits, '[]'::jsonb))));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_review_plan(target_plan_id uuid, next_status text, note text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_owner uuid; plan_title text;
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN RAISE EXCEPTION 'Plan approval permission required'; END IF;
  IF next_status NOT IN ('approved', 'returned') THEN RAISE EXCEPTION 'Invalid plan review status'; END IF;
  UPDATE tips_crm.plans SET status = next_status, manager_note = NULLIF(note, ''), approved_by = auth.uid(), approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END, updated_at = now() WHERE id = target_plan_id RETURNING owner_id, title INTO plan_owner, plan_title;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by) VALUES (plan_owner, CASE WHEN next_status = 'approved' THEN 'تم اعتماد خطتك الأسبوعية' ELSE 'أُعيدت خطتك للمراجعة' END, CASE WHEN next_status = 'approved' THEN concat('تم اعتماد «', plan_title, '». يمكنك البدء بالتنفيذ وفق الجدول.') ELSE concat('سبب الإعادة: ', COALESCE(NULLIF(trim(note), ''), 'يرجى مراجعة الخطة مع الإدارة.')) END, 'plan', auth.uid());
  PERFORM tips_crm.log_audit('plan_' || next_status, 'plan', target_plan_id::text, jsonb_build_object('note', note));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_prepare_plan_submission_email(target_plan_id uuid) RETURNS TABLE(manager_email text, manager_name text, plan_title text, rep_name text, period_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE submitted_plan record;
BEGIN
  SELECT p.title, p.starts_on, p.ends_on, owner.full_name INTO submitted_plan FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id WHERE p.id = target_plan_id AND p.owner_id = auth.uid() AND p.status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner can announce a pending plan'; END IF;
  RETURN QUERY SELECT manager.email, manager.full_name, submitted_plan.title, submitted_plan.full_name, concat(to_char(submitted_plan.starts_on, 'DD/MM/YYYY'), ' — ', to_char(submitted_plan.ends_on, 'DD/MM/YYYY')) FROM tips_crm.profiles manager JOIN tips_crm.roles role ON role.key = manager.role_key WHERE manager.is_active = true AND manager.email IS NOT NULL AND manager.email <> '' AND (role.permissions @> ARRAY['approve_plans']::text[] OR 'all' = ANY(role.permissions));
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_prepare_invite_email(target_invite_id uuid) RETURNS TABLE(invite_id uuid, recipient_email text, role_label text, territory_label text, invite_token text, expires_at timestamptz, sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT i.id, i.email, r.display_name, i.territory_label, i.invite_token, i.expires_at, settings.sender_name, settings.reply_to, settings.invite_subject, settings.invite_intro, settings.invite_action_label FROM tips_crm.team_invites i JOIN tips_crm.roles r ON r.key = i.role_key CROSS JOIN tips_crm.mail_settings settings WHERE i.id = target_invite_id AND i.status = 'pending' AND i.expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be sent'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_record_invite_email_delivery(target_invite_id uuid, target_email text, next_status text, provider_id text DEFAULT NULL, error_reason text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE log_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF next_status NOT IN ('accepted_by_provider', 'failed') THEN RAISE EXCEPTION 'Invalid email delivery status'; END IF;
  INSERT INTO tips_crm.invite_email_deliveries(invite_id, recipient_email, status, provider_message_id, failure_reason, created_by) VALUES (target_invite_id, lower(target_email), next_status, NULLIF(provider_id, ''), NULLIF(left(error_reason, 500), ''), auth.uid()) RETURNING id INTO log_id;
  PERFORM tips_crm.log_audit(CASE WHEN next_status = 'accepted_by_provider' THEN 'invite_email_accepted' ELSE 'invite_email_failed' END, 'team_invite', target_invite_id::text, jsonb_build_object('email', lower(target_email), 'provider_message_id', provider_id, 'failure_reason', NULLIF(left(error_reason, 500), '')));
  RETURN log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_invite_email_deliveries() RETURNS TABLE(id uuid, invite_id uuid, recipient_email text, status text, provider_message_id text, failure_reason text, created_at timestamptz, actor_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT delivery.id, delivery.invite_id, delivery.recipient_email, delivery.status, delivery.provider_message_id, delivery.failure_reason, delivery.created_at, coalesce(profile.full_name, 'النظام') FROM tips_crm.invite_email_deliveries delivery LEFT JOIN tips_crm.profiles profile ON profile.id = delivery.created_by ORDER BY delivery.created_at DESC LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_get_mail_settings() RETURNS TABLE(sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT settings.sender_name, settings.reply_to, settings.invite_subject, settings.invite_intro, settings.invite_action_label, settings.updated_at FROM tips_crm.mail_settings settings WHERE settings.id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_mail_settings(next_sender_name text, next_reply_to text, next_invite_subject text, next_invite_intro text, next_invite_action_label text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF length(trim(next_sender_name)) = 0 OR length(trim(next_sender_name)) > 80 THEN RAISE EXCEPTION 'Invalid sender name'; END IF;
  IF nullif(trim(next_reply_to), '') IS NOT NULL AND trim(next_reply_to) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid reply-to address'; END IF;
  IF length(trim(next_invite_subject)) = 0 OR length(trim(next_invite_subject)) > 160 THEN RAISE EXCEPTION 'Invalid invitation subject'; END IF;
  IF length(trim(next_invite_intro)) = 0 OR length(trim(next_invite_intro)) > 1200 THEN RAISE EXCEPTION 'Invalid invitation introduction'; END IF;
  IF length(trim(next_invite_action_label)) = 0 OR length(trim(next_invite_action_label)) > 60 THEN RAISE EXCEPTION 'Invalid invitation action label'; END IF;
  UPDATE tips_crm.mail_settings SET sender_name = trim(next_sender_name), reply_to = nullif(trim(next_reply_to), ''), invite_subject = trim(next_invite_subject), invite_intro = trim(next_invite_intro), invite_action_label = trim(next_invite_action_label), updated_by = auth.uid(), updated_at = now() WHERE id = 1;
  PERFORM tips_crm.log_audit('mail_settings_updated', 'mail_settings', '1', jsonb_build_object('sender_name', trim(next_sender_name)));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date DEFAULT NULL, report_end date DEFAULT NULL, report_rep_id uuid DEFAULT NULL) RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN RAISE EXCEPTION 'Export permission required'; END IF;
  IF report_start IS NOT NULL AND report_end IS NOT NULL AND report_start > report_end THEN RAISE EXCEPTION 'Start date must be before end date'; END IF;
  RETURN QUERY
  SELECT report_rows.record_type, report_rows.occurred_at, report_rows.actor_name, report_rows.title, report_rows.status, report_rows.details
  FROM (
    SELECT 'plan'::text AS record_type, p.created_at AS occurred_at, owner.full_name AS actor_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) AS details, p.owner_id AS rep_id FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit'::text, v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, ''), v.rep_id FROM tips_crm.visits v JOIN tips_crm.profiles rep ON rep.id = v.rep_id JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit'::text, audit.created_at, coalesce(profile.full_name, 'النظام'), audit.action, audit.entity_type, audit.details::text, audit.actor_id FROM tips_crm.audit_log audit LEFT JOIN tips_crm.profiles profile ON profile.id = audit.actor_id
  ) AS report_rows
  WHERE (report_start IS NULL OR report_rows.occurred_at >= report_start::timestamptz)
    AND (report_end IS NULL OR report_rows.occurred_at < (report_end + 1)::timestamptz)
    AND (report_rep_id IS NULL OR report_rows.rep_id = report_rep_id)
  ORDER BY report_rows.occurred_at DESC LIMIT 1000;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_finalize_employee_account(
  target_profile_id uuid, employee_full_name text, employee_email text, employee_role_key text, employee_territory_keys text[], employee_force_password_change boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE res_terr_num integer; req_terr_num integer;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF employee_role_key NOT IN ('sales_manager', 'sales_rep', 'medical_rep') OR NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = employee_role_key AND is_active) THEN RAISE EXCEPTION 'Employee role is not available'; END IF;
  SELECT cardinality(coalesce(employee_territory_keys, ARRAY[]::text[])) INTO req_terr_num;
  IF employee_role_key <> 'sales_manager' AND req_terr_num = 0 THEN RAISE EXCEPTION 'At least one territory is required for a representative'; END IF;
  SELECT count(*) INTO res_terr_num FROM tips_crm.territories WHERE is_active AND client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]));
  IF res_terr_num <> req_terr_num THEN RAISE EXCEPTION 'One or more territories are unavailable'; END IF;
  UPDATE tips_crm.profiles SET full_name = trim(employee_full_name), email = lower(trim(employee_email)), role_key = employee_role_key, must_change_password = employee_force_password_change, temporary_password_issued_at = now() WHERE id = target_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee profile was not created'; END IF;
  DELETE FROM tips_crm.territory_assignments WHERE profile_id = target_profile_id AND territory_id NOT IN (SELECT id FROM tips_crm.territories WHERE client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[])));
  INSERT INTO tips_crm.territory_assignments(territory_id, profile_id, assigned_by) SELECT territory.id, target_profile_id, auth.uid() FROM tips_crm.territories territory WHERE territory.client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[])) ON CONFLICT (territory_id, profile_id) DO NOTHING;
  PERFORM tips_crm.log_audit('employee_account_created', 'profile', target_profile_id::text, jsonb_build_object('email', lower(trim(employee_email)), 'role_key', employee_role_key, 'territory_keys', coalesce(employee_territory_keys, ARRAY[]::text[]), 'force_password_change', employee_force_password_change));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_check_company_user_limit(target_company_id uuid) RETURNS TABLE (
  active_user_count bigint, max_user_limit integer, can_add boolean, payment_tier_key text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE v_max_limit integer; v_tier text; v_active_count bigint;
BEGIN
  SELECT c.max_user_limit, c.payment_tier_key INTO v_max_limit, v_tier FROM tips_crm.companies c WHERE c.id = target_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  SELECT count(*) INTO v_active_count FROM tips_crm.company_memberships m WHERE m.company_id = target_company_id AND m.is_active = true;
  RETURN QUERY SELECT v_active_count, v_max_limit, (v_active_count < v_max_limit), v_tier;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_update_company_subscription(target_company_id uuid, new_payment_tier_key text, new_max_user_limit integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = auth.uid() AND is_platform_admin = true) THEN RAISE EXCEPTION 'Platform Admin permission required'; END IF;
  IF new_max_user_limit < 1 THEN RAISE EXCEPTION 'User limit must be at least 1'; END IF;
  UPDATE tips_crm.companies SET payment_tier_key = new_payment_tier_key, max_user_limit = new_max_user_limit, updated_at = now() WHERE id = target_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Target company not found'; END IF;
  RETURN true;
END;
$$;
