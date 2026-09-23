CREATE TABLE IF NOT EXISTS tips_crm.mail_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sender_name text NOT NULL DEFAULT 'Tips CRM',
  reply_to text,
  invite_subject text NOT NULL DEFAULT 'دعوة للانضمام إلى Tips CRM',
  invite_intro text NOT NULL DEFAULT 'تمت دعوتك للانضمام إلى النظام. اضغط الزر لتسجيل الدخول أو إنشاء حسابك، وسيتم تعيين دورك تلقائياً بعد قبول الدعوة.',
  invite_action_label text NOT NULL DEFAULT 'قبول الدعوة',
  updated_by uuid REFERENCES tips_crm.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM tips_crm.mail_settings WHERE id = 1) THEN
    INSERT INTO tips_crm.mail_settings (id) VALUES (1);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tips_crm.invite_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES tips_crm.team_invites(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted_by_provider', 'failed')),
  provider_message_id text,
  failure_reason text,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_email_deliveries_invite_time_idx ON tips_crm.invite_email_deliveries(invite_id, created_at DESC);

ALTER TABLE tips_crm.mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.invite_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY mail_settings_read ON tips_crm.mail_settings FOR SELECT TO authenticated USING (tips_crm.has_permission('manage_users'));
CREATE POLICY mail_settings_manage ON tips_crm.mail_settings FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
CREATE POLICY invite_email_deliveries_read ON tips_crm.invite_email_deliveries FOR SELECT TO authenticated USING (tips_crm.has_permission('manage_users'));

DROP FUNCTION IF EXISTS public.tips_crm_prepare_invite_email(uuid);
DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed(date, date, uuid);

CREATE OR REPLACE FUNCTION public.tips_crm_prepare_invite_email(target_invite_id uuid)
RETURNS TABLE(invite_id uuid, recipient_email text, role_label text, territory_label text, invite_token text, expires_at timestamptz, sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT i.id, i.email, r.display_name, i.territory_label, i.invite_token, i.expires_at, settings.sender_name, settings.reply_to, settings.invite_subject, settings.invite_intro, settings.invite_action_label
  FROM tips_crm.team_invites i
  JOIN tips_crm.roles r ON r.key = i.role_key
  CROSS JOIN tips_crm.mail_settings settings
  WHERE i.id = target_invite_id AND i.status = 'pending' AND i.expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be sent'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_record_invite_email_delivery(target_invite_id uuid, target_email text, next_status text, provider_id text DEFAULT NULL, error_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE log_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF next_status NOT IN ('accepted_by_provider', 'failed') THEN RAISE EXCEPTION 'Invalid email delivery status'; END IF;
  INSERT INTO tips_crm.invite_email_deliveries(invite_id, recipient_email, status, provider_message_id, failure_reason, created_by)
  VALUES (target_invite_id, lower(target_email), next_status, NULLIF(provider_id, ''), NULLIF(left(error_reason, 500), ''), auth.uid())
  RETURNING id INTO log_id;
  PERFORM tips_crm.log_audit(CASE WHEN next_status = 'accepted_by_provider' THEN 'invite_email_accepted' ELSE 'invite_email_failed' END, 'team_invite', target_invite_id::text, jsonb_build_object('email', lower(target_email), 'provider_message_id', provider_id, 'failure_reason', NULLIF(left(error_reason, 500), '')));
  RETURN log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_invite_email_deliveries()
RETURNS TABLE(id uuid, invite_id uuid, recipient_email text, status text, provider_message_id text, failure_reason text, created_at timestamptz, actor_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT delivery.id, delivery.invite_id, delivery.recipient_email, delivery.status, delivery.provider_message_id, delivery.failure_reason, delivery.created_at, coalesce(profile.full_name, 'النظام')
  FROM tips_crm.invite_email_deliveries delivery
  LEFT JOIN tips_crm.profiles profile ON profile.id = delivery.created_by
  ORDER BY delivery.created_at DESC
  LIMIT 100;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_get_mail_settings()
RETURNS TABLE(sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT settings.sender_name, settings.reply_to, settings.invite_subject, settings.invite_intro, settings.invite_action_label, settings.updated_at FROM tips_crm.mail_settings settings WHERE settings.id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_mail_settings(next_sender_name text, next_reply_to text, next_invite_subject text, next_invite_intro text, next_invite_action_label text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF length(trim(next_sender_name)) = 0 OR length(trim(next_sender_name)) > 80 THEN RAISE EXCEPTION 'Invalid sender name'; END IF;
  IF nullif(trim(next_reply_to), '') IS NOT NULL AND trim(next_reply_to) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid reply-to address'; END IF;
  IF length(trim(next_invite_subject)) = 0 OR length(trim(next_invite_subject)) > 160 THEN RAISE EXCEPTION 'Invalid invitation subject'; END IF;
  IF length(trim(next_invite_intro)) = 0 OR length(trim(next_invite_intro)) > 1200 THEN RAISE EXCEPTION 'Invalid invitation introduction'; END IF;
  IF length(trim(next_invite_action_label)) = 0 OR length(trim(next_invite_action_label)) > 60 THEN RAISE EXCEPTION 'Invalid invitation action label'; END IF;
  UPDATE tips_crm.mail_settings
  SET sender_name = trim(next_sender_name), reply_to = nullif(trim(next_reply_to), ''), invite_subject = trim(next_invite_subject), invite_intro = trim(next_invite_intro), invite_action_label = trim(next_invite_action_label), updated_by = auth.uid(), updated_at = now()
  WHERE id = 1;
  PERFORM tips_crm.log_audit('mail_settings_updated', 'mail_settings', '1', jsonb_build_object('sender_name', trim(next_sender_name)));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date DEFAULT NULL, report_end date DEFAULT NULL, report_rep_id uuid DEFAULT NULL, record_type_filter text DEFAULT NULL)
RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN RAISE EXCEPTION 'Export permission required'; END IF;
  IF report_start IS NOT NULL AND report_end IS NOT NULL AND report_start > report_end THEN RAISE EXCEPTION 'Start date must be before end date'; END IF;
  IF record_type_filter IS NOT NULL AND record_type_filter NOT IN ('plan', 'visit', 'audit') THEN RAISE EXCEPTION 'Invalid report type'; END IF;
  RETURN QUERY
  SELECT report_rows.record_type, report_rows.occurred_at, report_rows.actor_name, report_rows.title, report_rows.status, report_rows.details
  FROM (
    SELECT 'plan'::text AS record_type, p.created_at AS occurred_at, owner.full_name AS actor_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) AS details, p.owner_id AS rep_id FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit'::text, v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, ''), v.rep_id FROM tips_crm.visits v JOIN tips_crm.profiles rep ON rep.id = v.rep_id JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit'::text, audit.created_at, coalesce(profile.full_name, 'النظام'), audit.action, audit.entity_type, audit.details::text, audit.actor_id FROM tips_crm.audit_log audit LEFT JOIN tips_crm.profiles profile ON profile.id = audit.actor_id
  ) report_rows
  WHERE (report_start IS NULL OR report_rows.occurred_at >= report_start::timestamptz)
    AND (report_end IS NULL OR report_rows.occurred_at < (report_end + 1)::timestamptz)
    AND (report_rep_id IS NULL OR report_rows.rep_id = report_rep_id)
    AND (record_type_filter IS NULL OR report_rows.record_type = record_type_filter)
  ORDER BY report_rows.occurred_at DESC LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_prepare_invite_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_record_invite_email_delivery(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_invite_email_deliveries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_get_mail_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_mail_settings(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_prepare_invite_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_record_invite_email_delivery(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_invite_email_deliveries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_get_mail_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_mail_settings(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid, text) TO authenticated;
