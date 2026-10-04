-- Visits within the caller's scope (rep: own; supervisor: team; manager: company),
-- so supervisor and manager dashboards read real data instead of the copy
-- stored on their own phone.
CREATE INDEX IF NOT EXISTS visits_company_checked_in_idx ON tips_crm.visits(company_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS visits_company_rep_idx ON tips_crm.visits(company_id, rep_id);

CREATE OR REPLACE FUNCTION public.tips_crm_list_team_visits(from_on date DEFAULT (current_date - 60), to_on date DEFAULT current_date)
RETURNS TABLE(id uuid, offline_client_ref text, account_id uuid, account_local_ref text, account_name text, rep_id uuid, rep_name text, status text, outcome text, notes text, checked_in_at timestamptz, created_at timestamptz, follow_up_action text, follow_up_on date, visit_priority text, check_in_latitude numeric, check_in_longitude numeric, location_accuracy_meters integer, collection_amount numeric, revenue_amount numeric, receipt_reference text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT v.id, v.offline_client_ref, a.id, a.local_ref, a.name, v.rep_id, coalesce(p.full_name, 'مندوب'),
         v.status, v.outcome, v.notes, v.checked_in_at, v.created_at, v.follow_up_action, v.follow_up_on, v.visit_priority,
         v.check_in_latitude, v.check_in_longitude, v.location_accuracy_meters,
         v.collection_amount, v.revenue_amount, v.receipt_reference
  FROM tips_crm.visits v
  JOIN tips_crm.accounts a ON a.id = v.account_id
  LEFT JOIN tips_crm.profiles p ON p.id = v.rep_id
  WHERE v.company_id = tips_crm.my_company_id()
    AND v.rep_id IN (SELECT tips_crm.visible_profile_ids('visit.read.team', 'visit.read.company'))
    AND coalesce(v.checked_in_at, v.created_at)::date BETWEEN coalesce(from_on, current_date - 60) AND coalesce(to_on, current_date)
  ORDER BY coalesce(v.checked_in_at, v.created_at) DESC
  LIMIT 2000;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_team_visits(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_team_visits(date, date) TO authenticated;
