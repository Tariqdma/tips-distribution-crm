-- Daily collections report and receipt search, read from visits with
-- collection data. Dates are local to the company's timezone (default Khartoum).

CREATE OR REPLACE FUNCTION tips_crm.company_timezone()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT coalesce(
    (SELECT s.timezone FROM tips_crm.company_operational_settings s WHERE s.company_id = tips_crm.my_company_id()),
    'Africa/Khartoum'
  );
$$;
REVOKE ALL ON FUNCTION tips_crm.company_timezone() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.company_timezone() TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_list_daily_collections(report_day date)
RETURNS TABLE(visit_id uuid, report_date date, checked_in_at timestamptz, rep_id uuid, rep_name text, account_id uuid, account_name text, account_type text, state text, city text, area text, territory_name text, outcome text, collection_amount numeric, revenue_amount numeric, receipt_reference text, notes text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE tz text := tips_crm.company_timezone();
BEGIN
  IF NOT (tips_crm.has_perm('finance.reconcile') OR tips_crm.has_perm('report.read.team') OR tips_crm.has_perm('report.read.company')) THEN
    RAISE EXCEPTION 'Collections report permission required';
  END IF;
  RETURN QUERY
  SELECT v.id, (coalesce(v.checked_in_at, v.created_at) AT TIME ZONE tz)::date, coalesce(v.checked_in_at, v.created_at),
         v.rep_id, coalesce(p.full_name, 'مندوب'), a.id, a.name, a.account_type, a.state, a.city, a.area, t.name,
         v.outcome, v.collection_amount, v.revenue_amount, v.receipt_reference, v.notes
  FROM tips_crm.visits v
  JOIN tips_crm.accounts a ON a.id = v.account_id
  LEFT JOIN tips_crm.territories t ON t.id = a.territory_id
  LEFT JOIN tips_crm.profiles p ON p.id = v.rep_id
  WHERE v.company_id = tips_crm.my_company_id()
    AND (coalesce(v.checked_in_at, v.created_at) AT TIME ZONE tz)::date = report_day
    AND (v.collection_amount > 0 OR v.revenue_amount > 0 OR nullif(trim(coalesce(v.receipt_reference, '')), '') IS NOT NULL)
    AND (tips_crm.has_perm('finance.reconcile') OR v.rep_id IN (SELECT tips_crm.visible_profile_ids('report.read.team', 'report.read.company')))
  ORDER BY coalesce(v.checked_in_at, v.created_at) DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_daily_collections(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_daily_collections(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_search_receipt_records(search_query text DEFAULT NULL, date_from date DEFAULT NULL, date_to date DEFAULT NULL, result_limit integer DEFAULT 200)
RETURNS TABLE(visit_id uuid, report_date date, checked_in_at timestamptz, rep_id uuid, rep_name text, rep_email text, account_id uuid, account_name text, account_type text, account_phone text, state text, city text, area text, address text, territory_name text, outcome text, notes text, follow_up_action text, follow_up_on date, visit_priority text, check_in_latitude numeric, check_in_longitude numeric, location_accuracy_meters integer, collection_amount numeric, revenue_amount numeric, receipt_reference text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  tz text := tips_crm.company_timezone();
  needle text := nullif(trim(coalesce(search_query, '')), '');
BEGIN
  IF NOT (tips_crm.has_perm('finance.reconcile') OR tips_crm.has_perm('report.read.team') OR tips_crm.has_perm('report.read.company')) THEN
    RAISE EXCEPTION 'Receipt search permission required';
  END IF;
  RETURN QUERY
  SELECT v.id, (coalesce(v.checked_in_at, v.created_at) AT TIME ZONE tz)::date, coalesce(v.checked_in_at, v.created_at),
         v.rep_id, coalesce(p.full_name, 'مندوب'), p.email, a.id, a.name, a.account_type, a.phone, a.state, a.city, a.area, a.address,
         t.name, v.outcome, v.notes, v.follow_up_action, v.follow_up_on, v.visit_priority,
         v.check_in_latitude::numeric, v.check_in_longitude::numeric, v.location_accuracy_meters::integer,
         v.collection_amount, v.revenue_amount, v.receipt_reference
  FROM tips_crm.visits v
  JOIN tips_crm.accounts a ON a.id = v.account_id
  LEFT JOIN tips_crm.territories t ON t.id = a.territory_id
  LEFT JOIN tips_crm.profiles p ON p.id = v.rep_id
  WHERE v.company_id = tips_crm.my_company_id()
    AND nullif(trim(coalesce(v.receipt_reference, '')), '') IS NOT NULL
    AND (tips_crm.has_perm('finance.reconcile') OR v.rep_id IN (SELECT tips_crm.visible_profile_ids('report.read.team', 'report.read.company')))
    AND (date_from IS NULL OR (coalesce(v.checked_in_at, v.created_at) AT TIME ZONE tz)::date >= date_from)
    AND (date_to IS NULL OR (coalesce(v.checked_in_at, v.created_at) AT TIME ZONE tz)::date <= date_to)
    AND (
      needle IS NULL
      OR v.receipt_reference ILIKE '%' || needle || '%'
      OR a.name ILIKE '%' || needle || '%'
      OR p.full_name ILIKE '%' || needle || '%'
      OR v.id::text = needle
    )
  ORDER BY coalesce(v.checked_in_at, v.created_at) DESC
  LIMIT least(greatest(coalesce(result_limit, 200), 1), 500);
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_search_receipt_records(text, date, date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_search_receipt_records(text, date, date, integer) TO authenticated;
