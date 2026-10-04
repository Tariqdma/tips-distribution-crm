-- Notifications inbox and monthly targets (operational: visits / collection / revenue).
-- monthly_targets had RLS with no policies and no unique key, so the app's direct
-- select/upsert silently failed. Targets now go through company-scoped RPCs.

CREATE UNIQUE INDEX IF NOT EXISTS monthly_targets_company_slot_idx
  ON tips_crm.monthly_targets(company_id, month_start, target_type, target_key, metric);

CREATE OR REPLACE FUNCTION public.tips_crm_list_my_notifications()
RETURNS TABLE(id uuid, title text, body text, kind text, created_at timestamptz, read_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT n.id, n.title, n.body, n.kind, n.created_at, n.read_at
  FROM tips_crm.notifications n
  WHERE n.company_id = tips_crm.my_company_id()
    AND (n.recipient_id = auth.uid() OR n.recipient_id IS NULL)
  ORDER BY n.created_at DESC
  LIMIT 200;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_my_notifications() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_my_notifications() TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_list_monthly_targets(from_month date)
RETURNS TABLE(id uuid, month_start date, target_type text, target_key text, target_value numeric, metric text, alert_threshold integer, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT t.id, t.month_start, t.target_type, t.target_key, t.target_value, t.metric, t.alert_threshold::integer, t.updated_at
  FROM tips_crm.monthly_targets t
  WHERE t.company_id = tips_crm.my_company_id()
    AND t.month_start >= from_month
    AND (
      tips_crm.has_perm('report.read.company')
      OR (t.target_type = 'rep' AND t.target_key IN (SELECT p::text FROM tips_crm.visible_profile_ids('report.read.team', 'report.read.company') p))
      OR (t.target_type = 'territory' AND tips_crm.has_perm('report.read.team'))
    )
  ORDER BY t.month_start DESC;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_monthly_targets(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_monthly_targets(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_save_monthly_target(month_start_input date, target_type_input text, target_key_input text, target_value_input numeric, metric_input text, alert_threshold_input integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  saved_id uuid;
BEGIN
  IF NOT (tips_crm.has_perm('report.read.company') OR tips_crm.has_perm('employee.manage') OR tips_crm.has_perm('territory.manage')) THEN
    RAISE EXCEPTION 'Target management permission required';
  END IF;
  INSERT INTO tips_crm.monthly_targets(company_id, month_start, target_type, target_key, target_value, metric, alert_threshold, created_by, updated_at)
  VALUES (actor_company, date_trunc('month', month_start_input)::date, target_type_input, target_key_input, target_value_input, metric_input, alert_threshold_input, auth.uid(), now())
  ON CONFLICT (company_id, month_start, target_type, target_key, metric)
  DO UPDATE SET target_value = EXCLUDED.target_value, alert_threshold = EXCLUDED.alert_threshold, updated_at = now()
  RETURNING id INTO saved_id;
  PERFORM tips_crm.log_audit('monthly_target_saved', 'monthly_target', saved_id::text,
    jsonb_build_object('target_type', target_type_input, 'target_key', target_key_input, 'metric', metric_input, 'value', target_value_input));
  RETURN saved_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_save_monthly_target(date, text, text, numeric, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_monthly_target(date, text, text, numeric, text, integer) TO authenticated;

-- Actual values per month for every rep (target_key = profile id) and territory
-- (target_key = territory client_key), for visits / collection / revenue.
CREATE OR REPLACE FUNCTION public.tips_crm_list_monthly_target_performance(months_back integer DEFAULT 6)
RETURNS TABLE(month_start date, target_type text, target_key text, metric text, actual_value numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  WITH scoped AS (
    SELECT date_trunc('month', coalesce(v.checked_in_at, v.created_at))::date AS month_start,
           v.rep_id, t.client_key AS territory_key, v.status, v.collection_amount, v.revenue_amount
    FROM tips_crm.visits v
    JOIN tips_crm.accounts a ON a.id = v.account_id
    LEFT JOIN tips_crm.territories t ON t.id = a.territory_id
    WHERE v.company_id = tips_crm.my_company_id()
      AND v.rep_id IN (SELECT tips_crm.visible_profile_ids('report.read.team', 'report.read.company'))
      AND coalesce(v.checked_in_at, v.created_at) >= date_trunc('month', now()) - make_interval(months => greatest(coalesce(months_back, 6), 0))
  ),
  metrics AS (
    SELECT month_start, 'rep'::text AS target_type, rep_id::text AS target_key, status, collection_amount, revenue_amount FROM scoped
    UNION ALL
    SELECT month_start, 'territory', territory_key, status, collection_amount, revenue_amount FROM scoped WHERE territory_key IS NOT NULL
  )
  SELECT month_start, target_type, target_key, 'visits', count(*) FILTER (WHERE status = 'completed')::numeric FROM metrics GROUP BY 1, 2, 3
  UNION ALL
  SELECT month_start, target_type, target_key, 'collection', coalesce(sum(collection_amount), 0) FROM metrics GROUP BY 1, 2, 3
  UNION ALL
  SELECT month_start, target_type, target_key, 'revenue', coalesce(sum(revenue_amount), 0) FROM metrics GROUP BY 1, 2, 3;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_monthly_target_performance(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_monthly_target_performance(integer) TO authenticated;
