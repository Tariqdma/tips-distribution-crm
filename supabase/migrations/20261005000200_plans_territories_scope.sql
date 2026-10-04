-- Scope helper plus the plan, territory and territory-exit RPCs the app calls
-- but that were missing from the deployed database.
--
-- Scope model (same as shared/auth/resolve.ts):
--   *.company permission -> every active member of the caller's company
--   *.team permission    -> the caller and the members who report to them
--   otherwise            -> the caller only

-- 1. Scope helper --------------------------------------------------------------
CREATE OR REPLACE FUNCTION tips_crm.visible_profile_ids(team_permission text, company_permission text)
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT m.profile_id
  FROM tips_crm.company_memberships m
  WHERE m.company_id = tips_crm.my_company_id()
    AND m.is_active
    AND (
      tips_crm.has_perm(company_permission)
      OR m.profile_id = auth.uid()
      OR (tips_crm.has_perm(team_permission) AND m.reports_to_profile_id = auth.uid())
    )
  UNION
  SELECT auth.uid() WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION tips_crm.visible_profile_ids(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.visible_profile_ids(text, text) TO authenticated;

-- 2. Plan visits -----------------------------------------------------------------
-- A retried upload must not duplicate the same scheduled visit.
CREATE UNIQUE INDEX IF NOT EXISTS plan_visits_plan_account_slot_idx
  ON tips_crm.plan_visits(plan_id, account_id, scheduled_for);

CREATE OR REPLACE FUNCTION public.tips_crm_save_plan_visits(target_plan_id uuid, planned_visits jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  inserted_count integer := 0;
  plan_company uuid;
BEGIN
  SELECT p.company_id INTO plan_company
  FROM tips_crm.plans p
  WHERE p.id = target_plan_id AND p.owner_id = auth.uid() AND p.company_id = tips_crm.my_company_id();
  IF plan_company IS NULL THEN
    RAISE EXCEPTION 'Plan not found or not owned by current user';
  END IF;

  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for, company_id)
  SELECT target_plan_id, (item->>'account_id')::uuid, (item->>'scheduled_for')::timestamptz, plan_company
  FROM jsonb_array_elements(COALESCE(planned_visits, '[]'::jsonb)) AS item
  JOIN tips_crm.accounts a ON a.id = (item->>'account_id')::uuid AND a.company_id = plan_company
  WHERE item ? 'account_id' AND item ? 'scheduled_for'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_save_plan_visits(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_plan_visits(uuid, jsonb) TO authenticated;

-- 3. Territory assignment: see 20261005001000_run_manually_territories_and_plan_edit.sql
--    (it replaces rows with DELETE + INSERT and is applied manually).

-- 4. Territory exit alerts ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_raise_territory_exit_alert(territory_key text, captured_at_input timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  assigned_territory tips_crm.territories%ROWTYPE;
  actor_name text;
  message_body text;
BEGIN
  IF auth.uid() IS NULL OR actor_company IS NULL THEN
    RAISE EXCEPTION 'Active company membership required';
  END IF;
  SELECT full_name INTO actor_name FROM tips_crm.profiles WHERE id = auth.uid();
  SELECT t.* INTO assigned_territory
  FROM tips_crm.territory_assignments a
  JOIN tips_crm.territories t ON t.id = a.territory_id
  WHERE a.profile_id = auth.uid() AND t.client_key = territory_key AND t.is_active AND t.company_id = actor_company
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Assigned territory was not found';
  END IF;

  -- One alert per territory per 10 minutes.
  IF EXISTS (
    SELECT 1 FROM tips_crm.notifications n
    WHERE n.created_by = auth.uid() AND n.kind = 'duty' AND n.territory_id = assigned_territory.id
      AND n.created_at >= coalesce(captured_at_input, now()) - interval '10 minutes'
  ) THEN
    RETURN false;
  END IF;

  message_body := coalesce(actor_name, 'مندوب') || ' خارج منطقة ' || assigned_territory.name || ' أثناء الدوام المباشر.';

  -- Notify the rep's direct supervisor and everyone holding company-wide telemetry.
  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by, territory_id, captured_at, company_id)
  SELECT DISTINCT recipient, 'مندوب خارج نطاق المنطقة', message_body, 'duty', auth.uid(), assigned_territory.id, captured_at_input, actor_company
  FROM (
    SELECT m.reports_to_profile_id AS recipient
    FROM tips_crm.company_memberships m
    WHERE m.profile_id = auth.uid() AND m.company_id = actor_company AND m.reports_to_profile_id IS NOT NULL
    UNION
    SELECT mp.profile_id
    FROM tips_crm.membership_permissions mp
    WHERE mp.company_id = actor_company AND mp.permission = 'telemetry.read.company'
  ) recipients
  WHERE recipient IS NOT NULL AND recipient <> auth.uid();

  PERFORM tips_crm.log_audit('territory_exit_alert', 'territory', assigned_territory.id::text,
    jsonb_build_object('territory_key', assigned_territory.client_key, 'captured_at', captured_at_input));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_raise_territory_exit_alert(text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_raise_territory_exit_alert(text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_list_territory_exit_alerts(from_at timestamptz DEFAULT NULL, to_at timestamptz DEFAULT NULL, target_profile_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, occurred_at timestamptz, employee_id uuid, employee_name text, territory_key text, territory_name text, title text, body text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT (tips_crm.has_perm('telemetry.read.team') OR tips_crm.has_perm('telemetry.read.company')) THEN
    RAISE EXCEPTION 'Team telemetry permission required';
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (n.created_by, n.territory_id, coalesce(n.captured_at, n.created_at))
    n.id, coalesce(n.captured_at, n.created_at), n.created_by, coalesce(p.full_name, 'مندوب غير معروف'),
    t.client_key, coalesce(t.name, 'منطقة غير محددة'), n.title, n.body,
    CASE WHEN n.read_at IS NULL THEN 'غير مقروء' ELSE 'تمت المراجعة' END
  FROM tips_crm.notifications n
  LEFT JOIN tips_crm.profiles p ON p.id = n.created_by
  LEFT JOIN tips_crm.territories t ON t.id = n.territory_id
  WHERE n.kind = 'duty'
    AND n.company_id = tips_crm.my_company_id()
    AND n.created_by IN (SELECT tips_crm.visible_profile_ids('telemetry.read.team', 'telemetry.read.company'))
    AND (from_at IS NULL OR coalesce(n.captured_at, n.created_at) >= from_at)
    AND (to_at IS NULL OR coalesce(n.captured_at, n.created_at) <= to_at)
    AND (target_profile_id IS NULL OR n.created_by = target_profile_id)
  ORDER BY n.created_by, n.territory_id, coalesce(n.captured_at, n.created_at) DESC
  LIMIT 1000;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_territory_exit_alerts(timestamptz, timestamptz, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_territory_exit_alerts(timestamptz, timestamptz, uuid) TO authenticated;

-- 5. Reps available in report filters ------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_list_report_reps()
RETURNS TABLE(id uuid, full_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT (tips_crm.has_perm('report.read.team') OR tips_crm.has_perm('report.read.company') OR tips_crm.has_perm('report.export')) THEN
    RAISE EXCEPTION 'Report permission required';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name
  FROM tips_crm.profiles p
  WHERE p.is_active
    AND p.id IN (SELECT tips_crm.visible_profile_ids('report.read.team', 'report.read.company'))
    AND EXISTS (
      SELECT 1 FROM tips_crm.membership_permissions mp
      WHERE mp.profile_id = p.id AND mp.company_id = tips_crm.my_company_id() AND mp.permission = 'visit.record'
    )
  ORDER BY p.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_report_reps() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_report_reps() TO authenticated;
