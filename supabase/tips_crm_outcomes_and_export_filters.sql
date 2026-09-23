DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed();

CREATE OR REPLACE FUNCTION public.tips_crm_set_visit_outcome_active(outcome_id uuid, next_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  outcome_label text;
  remaining_active_count integer;
BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN
    RAISE EXCEPTION 'Outcome management permission required';
  END IF;

  SELECT label INTO outcome_label
  FROM tips_crm.visit_outcomes
  WHERE id = outcome_id
  FOR UPDATE;

  IF outcome_label IS NULL THEN
    RAISE EXCEPTION 'Visit outcome was not found';
  END IF;

  IF NOT next_is_active THEN
    SELECT count(*) INTO remaining_active_count
    FROM tips_crm.visit_outcomes
    WHERE is_active AND id <> outcome_id;
    IF remaining_active_count = 0 THEN
      RAISE EXCEPTION 'At least one active visit outcome is required';
    END IF;
  END IF;

  UPDATE tips_crm.visit_outcomes
  SET is_active = next_is_active, updated_at = now()
  WHERE id = outcome_id;

  PERFORM tips_crm.log_audit(
    CASE WHEN next_is_active THEN 'visit_outcome_activated' ELSE 'visit_outcome_deactivated' END,
    'visit_outcome',
    outcome_id::text,
    jsonb_build_object('label', outcome_label)
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date DEFAULT NULL, report_end date DEFAULT NULL, report_rep_id uuid DEFAULT NULL)
RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN
    RAISE EXCEPTION 'Export permission required';
  END IF;
  IF report_start IS NOT NULL AND report_end IS NOT NULL AND report_start > report_end THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;

  RETURN QUERY
  SELECT report_rows.record_type, report_rows.occurred_at, report_rows.actor_name, report_rows.title, report_rows.status, report_rows.details
  FROM (
    SELECT 'plan'::text AS record_type, p.created_at AS occurred_at, owner.full_name AS actor_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) AS details, p.owner_id AS rep_id
    FROM tips_crm.plans p
    JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit'::text, v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, ''), v.rep_id
    FROM tips_crm.visits v
    JOIN tips_crm.profiles rep ON rep.id = v.rep_id
    JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit'::text, audit.created_at, coalesce(profile.full_name, 'النظام'), audit.action, audit.entity_type, audit.details::text, audit.actor_id
    FROM tips_crm.audit_log audit
    LEFT JOIN tips_crm.profiles profile ON profile.id = audit.actor_id
  ) AS report_rows
  WHERE (report_start IS NULL OR report_rows.occurred_at >= report_start::timestamptz)
    AND (report_end IS NULL OR report_rows.occurred_at < (report_end + 1)::timestamptz)
    AND (report_rep_id IS NULL OR report_rows.rep_id = report_rep_id)
  ORDER BY report_rows.occurred_at DESC
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_set_visit_outcome_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_set_visit_outcome_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid) TO authenticated;
