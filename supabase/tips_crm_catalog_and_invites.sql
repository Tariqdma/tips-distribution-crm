CREATE TABLE IF NOT EXISTS tips_crm.visit_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tips_crm.visit_outcomes (label, sort_order)
VALUES ('متابعة', 10), ('تم إنشاء فاتورة', 20), ('تم تحصيل', 30), ('لا يوجد قرار', 40)
ON CONFLICT (label) DO NOTHING;

ALTER TABLE tips_crm.visit_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY visit_outcomes_read ON tips_crm.visit_outcomes FOR SELECT TO authenticated USING (is_active OR tips_crm.has_permission('manage_outcomes'));
CREATE POLICY visit_outcomes_manage ON tips_crm.visit_outcomes FOR ALL TO authenticated USING (tips_crm.has_permission('manage_outcomes')) WITH CHECK (tips_crm.has_permission('manage_outcomes'));

UPDATE tips_crm.roles
SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['manage_outcomes', 'export_reports']))
WHERE key IN ('system_admin', 'sales_manager');

CREATE OR REPLACE FUNCTION public.tips_crm_list_invites()
RETURNS TABLE(id uuid, email text, role_key text, territory_label text, status text, invite_token text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT i.id, i.email, i.role_key, i.territory_label, i.status, i.invite_token, i.expires_at, i.created_at FROM tips_crm.team_invites i ORDER BY i.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_resend_invite(invite_id uuid)
RETURNS TABLE(invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE resent tips_crm.team_invites%ROWTYPE; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'pending', invite_token = encode(gen_random_bytes(24), 'hex'), expires_at = now() + interval '7 days' WHERE id = invite_id AND status <> 'accepted' RETURNING * INTO resent;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be resent'; END IF;
  PERFORM tips_crm.log_audit('invite_resent', 'team_invite', resent.id::text, jsonb_build_object('email', resent.email));
  RETURN QUERY SELECT resent.invite_token, resent.expires_at;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_revoke_invite(invite_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE revoked_email text; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'revoked' WHERE id = invite_id AND status = 'pending' RETURNING email INTO revoked_email;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM tips_crm.log_audit('invite_revoked', 'team_invite', invite_id::text, jsonb_build_object('email', revoked_email));
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_accounts()
RETURNS TABLE(id uuid, account_type text, name text, specialty text, state text, city text, area text, address text, phone text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT a.id, a.account_type, a.name, a.specialty, a.state, a.city, a.area, a.address, a.phone, a.created_at FROM tips_crm.accounts a WHERE a.created_by = auth.uid() OR tips_crm.has_permission('view_team_data') ORDER BY a.updated_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_visit_outcomes()
RETURNS TABLE(id uuid, label text, is_active boolean, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ SELECT o.id, o.label, o.is_active, o.sort_order FROM tips_crm.visit_outcomes o WHERE o.is_active OR tips_crm.has_permission('manage_outcomes') ORDER BY o.sort_order, o.label; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_outcome(outcome_label text, outcome_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE outcome_id uuid; BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  INSERT INTO tips_crm.visit_outcomes(label, sort_order, created_by) VALUES (trim(outcome_label), outcome_sort_order, auth.uid()) ON CONFLICT (label) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = now() RETURNING id INTO outcome_id;
  PERFORM tips_crm.log_audit('visit_outcome_saved', 'visit_outcome', outcome_id::text, jsonb_build_object('label', trim(outcome_label)));
  RETURN outcome_id;
END; $$;

CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed()
RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN RAISE EXCEPTION 'Export permission required'; END IF;
  RETURN QUERY
    SELECT 'plan', p.created_at, owner.full_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit', v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, '') FROM tips_crm.visits v JOIN tips_crm.profiles rep ON rep.id = v.rep_id JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit', a.created_at, coalesce(p.full_name, 'النظام'), a.action, a.entity_type, a.details::text FROM tips_crm.audit_log a LEFT JOIN tips_crm.profiles p ON p.id = a.actor_id
    ORDER BY occurred_at DESC LIMIT 1000;
END; $$;

REVOKE ALL ON FUNCTION public.tips_crm_list_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_resend_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_revoke_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_visit_outcomes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_visit_outcome(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_resend_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_visit_outcomes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_visit_outcome(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed() TO authenticated;
