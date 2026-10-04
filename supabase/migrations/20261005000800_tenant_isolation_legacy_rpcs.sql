-- Tenant isolation for legacy SECURITY DEFINER RPCs.
-- These functions predate company isolation: they check the legacy
-- has_permission() vocabulary but never filter by company, and SECURITY DEFINER
-- bypasses RLS, so a user of one company could read or change another
-- company's accounts, plans, invites, outcomes and audit log.
-- Each function keeps its exact signature, result shape and permission check;
-- the only change is a company_id = tips_crm.my_company_id() predicate.

CREATE OR REPLACE FUNCTION public.tips_crm_list_accounts()
RETURNS TABLE(id uuid, local_ref text, account_type text, name text, specialty text, state text, city text, area text, address text, phone text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY
  SELECT a.id, a.local_ref, a.account_type, a.name, a.specialty, a.state, a.city, a.area, a.address, a.phone, a.created_at
  FROM tips_crm.accounts a
  WHERE a.company_id = tips_crm.my_company_id()
    AND (
      a.created_by = auth.uid()
      OR tips_crm.has_permission('view_team_data')
      OR tips_crm.has_perm('account.read.company')
      OR (tips_crm.has_perm('account.read.team') AND a.created_by IN (SELECT tips_crm.visible_profile_ids('account.read.team', 'account.read.company')))
      OR (a.territory_id IS NOT NULL AND tips_crm.in_assigned_territory(a.territory_id))
    )
  ORDER BY a.updated_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_plans()
RETURNS TABLE(id uuid, title text, plan_type text, starts_on date, ends_on date, status text, manager_note text, created_at timestamptz, owner_name text, owner_territory text, completed_visits bigint, needs_review_visits bigint, last_visit_name text, last_visit_at timestamptz, scheduled_visits jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') AND NOT tips_crm.has_permission('view_team_data')
     AND NOT tips_crm.has_perm('plan.read.own') AND NOT tips_crm.has_perm('plan.read.team') AND NOT tips_crm.has_perm('plan.read.company') THEN
    RAISE EXCEPTION 'Plan access permission required';
  END IF;
  RETURN QUERY
  SELECT
    p.id, p.title, p.plan_type, p.starts_on, p.ends_on, p.status, p.manager_note, p.created_at,
    owner.full_name,
    coalesce((SELECT string_agg(DISTINCT t.name, '، ' ORDER BY t.name) FROM tips_crm.territory_assignments ta JOIN tips_crm.territories t ON t.id = ta.territory_id WHERE ta.profile_id = p.owner_id AND ta.company_id = p.company_id), 'غير محددة'),
    (SELECT count(*) FROM tips_crm.visits v WHERE v.rep_id = p.owner_id AND v.company_id = p.company_id AND v.status = 'completed'),
    (SELECT count(*) FROM tips_crm.visits v WHERE v.rep_id = p.owner_id AND v.company_id = p.company_id AND v.status = 'needs_review'),
    recent.account_name,
    recent.checked_in_at,
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'account_id', pv.account_id, 'account_name', a.name, 'scheduled_for', pv.scheduled_for) ORDER BY pv.scheduled_for, pv.created_at)
              FROM tips_crm.plan_visits pv JOIN tips_crm.accounts a ON a.id = pv.account_id WHERE pv.plan_id = p.id), '[]'::jsonb)
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  LEFT JOIN LATERAL (
    SELECT a.name AS account_name, v.checked_in_at
    FROM tips_crm.visits v JOIN tips_crm.accounts a ON a.id = v.account_id
    WHERE v.rep_id = p.owner_id AND v.company_id = p.company_id AND v.status = 'completed'
    ORDER BY v.checked_in_at DESC NULLS LAST, v.updated_at DESC
    LIMIT 1
  ) recent ON true
  WHERE p.company_id = tips_crm.my_company_id()
    AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')
         OR p.owner_id IN (SELECT tips_crm.visible_profile_ids('plan.read.team', 'plan.read.company')))
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_plan(plan_title text, plan_type text, starts_on date, ends_on date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') AND NOT tips_crm.has_perm('plan.create.own') THEN
    RAISE EXCEPTION 'Plan creation permission required';
  END IF;
  IF tips_crm.my_company_id() IS NULL THEN RAISE EXCEPTION 'No active company is set for this account'; END IF;
  INSERT INTO tips_crm.plans(company_id, owner_id, title, plan_type, starts_on, ends_on, status)
  VALUES (tips_crm.my_company_id(), auth.uid(), plan_title, plan_type, starts_on, ends_on, 'pending')
  RETURNING id INTO plan_id;
  PERFORM tips_crm.log_audit('plan_submitted', 'plan', plan_id::text, jsonb_build_object('title', plan_title, 'plan_type', plan_type));
  RETURN plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_review_plan(target_plan_id uuid, next_status text, note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') AND NOT tips_crm.has_perm('plan.approve.team') AND NOT tips_crm.has_perm('plan.approve.company') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;
  IF next_status NOT IN ('approved', 'returned') THEN RAISE EXCEPTION 'Invalid plan review status'; END IF;
  UPDATE tips_crm.plans
  SET status = next_status, manager_note = nullif(note, ''), approved_by = auth.uid(),
      approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END, updated_at = now()
  WHERE id = target_plan_id
    AND company_id = tips_crm.my_company_id()
    AND (tips_crm.has_permission('approve_plans') OR tips_crm.has_perm('plan.approve.company')
         OR owner_id IN (SELECT tips_crm.visible_profile_ids('plan.approve.team', 'plan.approve.company')));
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
  PERFORM tips_crm.log_audit('plan_' || next_status, 'plan', target_plan_id::text, jsonb_build_object('note', note));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_invites()
RETURNS TABLE(id uuid, email text, role_key text, territory_label text, status text, invite_token text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT i.id, i.email, i.role_key, i.territory_label, i.status, i.invite_token, i.expires_at, i.created_at
  FROM tips_crm.team_invites i
  WHERE i.company_id = tips_crm.my_company_id()
  ORDER BY i.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_invite(invitee_email text, invite_role_key text, invite_territory text DEFAULT NULL)
RETURNS TABLE(invite_id uuid, invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE new_invite tips_crm.team_invites%ROWTYPE;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF invitee_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = invite_role_key AND is_active) THEN RAISE EXCEPTION 'Role is not available'; END IF;
  IF tips_crm.my_company_id() IS NULL THEN RAISE EXCEPTION 'No active company is set for this account'; END IF;
  INSERT INTO tips_crm.team_invites(company_id, email, role_key, territory_label, invited_by)
  VALUES (tips_crm.my_company_id(), lower(invitee_email), invite_role_key, nullif(invite_territory, ''), auth.uid())
  RETURNING * INTO new_invite;
  PERFORM tips_crm.log_audit('invite_created', 'team_invite', new_invite.id::text, jsonb_build_object('email', new_invite.email, 'role_key', new_invite.role_key));
  RETURN QUERY SELECT new_invite.id, new_invite.invite_token, new_invite.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_resend_invite(invite_id uuid)
RETURNS TABLE(invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE resent tips_crm.team_invites%ROWTYPE;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites
  SET status = 'pending', invite_token = encode(gen_random_bytes(24), 'hex'), expires_at = now() + interval '7 days'
  WHERE id = invite_id AND status <> 'accepted' AND company_id = tips_crm.my_company_id()
  RETURNING * INTO resent;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be resent'; END IF;
  PERFORM tips_crm.log_audit('invite_resent', 'team_invite', resent.id::text, jsonb_build_object('email', resent.email));
  RETURN QUERY SELECT resent.invite_token, resent.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_revoke_invite(invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE revoked_email text;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'revoked'
  WHERE id = invite_id AND status = 'pending' AND company_id = tips_crm.my_company_id()
  RETURNING email INTO revoked_email;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM tips_crm.log_audit('invite_revoked', 'team_invite', invite_id::text, jsonb_build_object('email', revoked_email));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_prepare_invite_email(target_invite_id uuid)
RETURNS TABLE(invite_id uuid, recipient_email text, role_label text, territory_label text, invite_token text, expires_at timestamptz, sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT i.id, i.email, r.display_name, i.territory_label, i.invite_token, i.expires_at,
         coalesce(cms.sender_name, s.sender_name), coalesce(cms.reply_to, s.reply_to), coalesce(cms.invite_subject, s.invite_subject),
         coalesce(cms.invite_intro, s.invite_intro), coalesce(cms.invite_action_label, s.invite_action_label)
  FROM tips_crm.team_invites i
  JOIN tips_crm.roles r ON r.key = i.role_key
  CROSS JOIN tips_crm.mail_settings s
  LEFT JOIN tips_crm.company_mail_settings cms ON cms.company_id = i.company_id
  WHERE i.id = target_invite_id AND i.status = 'pending' AND i.expires_at > now() AND i.company_id = tips_crm.my_company_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be sent'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_record_invite_email_delivery(target_invite_id uuid, target_email text, next_status text, provider_id text DEFAULT NULL, error_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE log_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF next_status NOT IN ('accepted_by_provider', 'failed') THEN RAISE EXCEPTION 'Invalid email delivery status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.team_invites i WHERE i.id = target_invite_id AND i.company_id = tips_crm.my_company_id()) THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;
  INSERT INTO tips_crm.invite_email_deliveries(company_id, invite_id, recipient_email, status, provider_message_id, failure_reason, created_by)
  VALUES (tips_crm.my_company_id(), target_invite_id, lower(target_email), next_status, nullif(provider_id, ''), nullif(left(error_reason, 500), ''), auth.uid())
  RETURNING id INTO log_id;
  PERFORM tips_crm.log_audit(CASE WHEN next_status = 'accepted_by_provider' THEN 'invite_email_accepted' ELSE 'invite_email_failed' END, 'team_invite', target_invite_id::text,
    jsonb_build_object('email', lower(target_email), 'provider_message_id', provider_id, 'failure_reason', nullif(left(error_reason, 500), '')));
  RETURN log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_invite_email_deliveries()
RETURNS TABLE(id uuid, invite_id uuid, recipient_email text, status text, provider_message_id text, failure_reason text, created_at timestamptz, actor_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') AND NOT tips_crm.has_perm('employee.manage') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT d.id, d.invite_id, d.recipient_email, d.status, d.provider_message_id, d.failure_reason, d.created_at, coalesce(p.full_name, 'النظام')
  FROM tips_crm.invite_email_deliveries d
  LEFT JOIN tips_crm.profiles p ON p.id = d.created_by
  WHERE d.company_id = tips_crm.my_company_id()
  ORDER BY d.created_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_audit_feed()
RETURNS TABLE(id bigint, action text, entity_type text, entity_id text, details jsonb, created_at timestamptz, actor_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('view_team_data') AND NOT tips_crm.has_perm('audit.read.company') THEN RAISE EXCEPTION 'Team data permission required'; END IF;
  RETURN QUERY
  SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, p.full_name
  FROM tips_crm.audit_log a
  LEFT JOIN tips_crm.profiles p ON p.id = a.actor_id
  WHERE a.company_id = tips_crm.my_company_id()
  ORDER BY a.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date DEFAULT NULL, report_end date DEFAULT NULL, report_rep_id uuid DEFAULT NULL)
RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF NOT tips_crm.has_permission('export_reports') AND NOT tips_crm.has_perm('report.export') THEN RAISE EXCEPTION 'Export permission required'; END IF;
  IF report_start IS NOT NULL AND report_end IS NOT NULL AND report_start > report_end THEN RAISE EXCEPTION 'Start date must be before end date'; END IF;
  RETURN QUERY
  SELECT r.record_type, r.occurred_at, r.actor_name, r.title, r.status, r.details
  FROM (
    SELECT 'plan'::text AS record_type, p.created_at AS occurred_at, owner.full_name AS actor_name, p.title, p.status,
           concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) AS details, p.owner_id AS rep_id
    FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    WHERE p.company_id = actor_company
    UNION ALL
    SELECT 'visit'::text, v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, ''), v.rep_id
    FROM tips_crm.visits v JOIN tips_crm.profiles rep ON rep.id = v.rep_id JOIN tips_crm.accounts a ON a.id = v.account_id
    WHERE v.company_id = actor_company
    UNION ALL
    SELECT 'audit'::text, au.created_at, coalesce(pr.full_name, 'النظام'), au.action, au.entity_type, au.details::text, au.actor_id
    FROM tips_crm.audit_log au LEFT JOIN tips_crm.profiles pr ON pr.id = au.actor_id
    WHERE au.company_id = actor_company
  ) r
  WHERE (report_start IS NULL OR r.occurred_at >= report_start::timestamptz)
    AND (report_end IS NULL OR r.occurred_at < (report_end + 1)::timestamptz)
    AND (report_rep_id IS NULL OR r.rep_id = report_rep_id)
  ORDER BY r.occurred_at DESC
  LIMIT 1000;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_visit_outcomes()
RETURNS TABLE(id uuid, label text, is_active boolean, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT o.id, o.label, o.is_active, o.sort_order
  FROM tips_crm.visit_outcomes o
  WHERE o.company_id = tips_crm.my_company_id()
    AND (o.is_active OR tips_crm.has_permission('manage_outcomes'))
  ORDER BY o.sort_order, o.label;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_set_visit_outcome_active(outcome_id uuid, next_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  outcome_label text;
  remaining_active_count integer;
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  SELECT label INTO outcome_label FROM tips_crm.visit_outcomes WHERE id = outcome_id AND company_id = actor_company FOR UPDATE;
  IF outcome_label IS NULL THEN RAISE EXCEPTION 'Visit outcome was not found'; END IF;
  IF NOT next_is_active THEN
    SELECT count(*) INTO remaining_active_count FROM tips_crm.visit_outcomes WHERE is_active AND id <> outcome_id AND company_id = actor_company;
    IF remaining_active_count = 0 THEN RAISE EXCEPTION 'At least one active visit outcome is required'; END IF;
  END IF;
  UPDATE tips_crm.visit_outcomes SET is_active = next_is_active, updated_at = now() WHERE id = outcome_id AND company_id = actor_company;
  PERFORM tips_crm.log_audit(CASE WHEN next_is_active THEN 'visit_outcome_activated' ELSE 'visit_outcome_deactivated' END, 'visit_outcome', outcome_id::text, jsonb_build_object('label', outcome_label));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit(account_uuid uuid, visit_status text, visit_outcome text, visit_notes text, latitude numeric DEFAULT NULL, longitude numeric DEFAULT NULL, accuracy integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE visit_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('write_own_visits') AND NOT tips_crm.has_perm('visit.record') THEN RAISE EXCEPTION 'Visit write permission required'; END IF;
  IF visit_status NOT IN ('scheduled', 'completed', 'needs_review') THEN RAISE EXCEPTION 'Invalid visit status'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.accounts a WHERE a.id = account_uuid AND a.company_id = tips_crm.my_company_id()) THEN
    RAISE EXCEPTION 'Account not found';
  END IF;
  INSERT INTO tips_crm.visits(company_id, rep_id, account_id, status, outcome, notes, checked_in_at, check_in_latitude, check_in_longitude, location_accuracy_meters)
  VALUES (tips_crm.my_company_id(), auth.uid(), account_uuid, visit_status, nullif(visit_outcome, ''), nullif(visit_notes, ''),
          CASE WHEN visit_status <> 'scheduled' THEN now() END, latitude, longitude, accuracy)
  RETURNING id INTO visit_id;
  PERFORM tips_crm.log_audit('visit_saved', 'visit', visit_id::text, jsonb_build_object('status', visit_status, 'account_id', account_uuid));
  RETURN visit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_my_workspace()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT jsonb_build_object(
    'plans', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'plan_type', p.plan_type, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'status', p.status, 'created_at', p.created_at) ORDER BY p.created_at DESC)
                       FROM tips_crm.plans p
                       WHERE p.company_id = tips_crm.my_company_id() AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'))), '[]'::jsonb),
    'visits', coalesce((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'account_id', v.account_id, 'status', v.status, 'outcome', v.outcome, 'notes', v.notes, 'checked_in_at', v.checked_in_at, 'created_at', v.created_at) ORDER BY v.created_at DESC)
                        FROM tips_crm.visits v
                        WHERE v.company_id = tips_crm.my_company_id() AND (v.rep_id = auth.uid() OR tips_crm.has_permission('view_team_data'))), '[]'::jsonb)
  );
$$;
