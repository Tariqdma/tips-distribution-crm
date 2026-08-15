CREATE OR REPLACE FUNCTION public.tips_crm_list_plans()
RETURNS TABLE(
  id uuid,
  title text,
  plan_type text,
  starts_on date,
  ends_on date,
  status text,
  manager_note text,
  created_at timestamptz,
  owner_name text,
  scheduled_visits jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') AND NOT tips_crm.has_permission('view_team_data') THEN
    RAISE EXCEPTION 'Plan access permission required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.title,
    p.plan_type,
    p.starts_on,
    p.ends_on,
    p.status,
    p.manager_note,
    p.created_at,
    owner.full_name,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', pv.id,
            'account_name', account.name,
            'scheduled_for', pv.scheduled_for
          )
          ORDER BY pv.scheduled_for, pv.created_at
        )
        FROM tips_crm.plan_visits pv
        JOIN tips_crm.accounts account ON account.id = pv.account_id
        WHERE pv.plan_id = p.id
      ),
      '[]'::jsonb
    )
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  WHERE p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_plan_visits(target_plan_id uuid, planned_visits jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE inserted_count integer := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.plans p
    WHERE p.id = target_plan_id AND p.owner_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Plan not found or not owned by current user';
  END IF;

  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for)
  SELECT
    target_plan_id,
    (item->>'account_id')::uuid,
    (item->>'scheduled_for')::timestamptz
  FROM jsonb_array_elements(COALESCE(planned_visits, '[]'::jsonb)) AS item
  WHERE item ? 'account_id' AND item ? 'scheduled_for'
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_plans() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_plan_visits(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_plan_visits(uuid, jsonb) TO authenticated;
