DROP FUNCTION IF EXISTS public.tips_crm_list_plans();

CREATE FUNCTION public.tips_crm_list_plans()
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
  owner_territory text,
  completed_visits bigint,
  needs_review_visits bigint,
  last_visit_name text,
  last_visit_at timestamptz,
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
    p.id, p.title, p.plan_type, p.starts_on, p.ends_on, p.status, p.manager_note, p.created_at,
    owner.full_name,
    COALESCE((SELECT string_agg(DISTINCT territory.name, '، ' ORDER BY territory.name) FROM tips_crm.territory_assignments assignment JOIN tips_crm.territories territory ON territory.id = assignment.territory_id WHERE assignment.profile_id = p.owner_id), 'غير محددة'),
    (SELECT count(*) FROM tips_crm.visits visit WHERE visit.rep_id = p.owner_id AND visit.status = 'completed'),
    (SELECT count(*) FROM tips_crm.visits visit WHERE visit.rep_id = p.owner_id AND visit.status = 'needs_review'),
    recent.account_name,
    recent.checked_in_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', plan_visit.id, 'account_id', plan_visit.account_id, 'account_name', account.name, 'scheduled_for', plan_visit.scheduled_for) ORDER BY plan_visit.scheduled_for, plan_visit.created_at) FROM tips_crm.plan_visits plan_visit JOIN tips_crm.accounts account ON account.id = plan_visit.account_id WHERE plan_visit.plan_id = p.id), '[]'::jsonb)
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  LEFT JOIN LATERAL (
    SELECT account.name AS account_name, visit.checked_in_at
    FROM tips_crm.visits visit
    JOIN tips_crm.accounts account ON account.id = visit.account_id
    WHERE visit.rep_id = p.owner_id AND visit.status = 'completed'
    ORDER BY visit.checked_in_at DESC NULLS LAST, visit.updated_at DESC
    LIMIT 1
  ) recent ON true
  WHERE p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')
  ORDER BY p.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_update_plan_by_manager(target_plan_id uuid, planned_visits jsonb, manager_note_input text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_owner uuid;
DECLARE plan_title text;
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;

  SELECT owner_id, title INTO plan_owner, plan_title
  FROM tips_crm.plans
  WHERE id = target_plan_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only pending plans can be modified';
  END IF;

  DELETE FROM tips_crm.plan_visits WHERE plan_id = target_plan_id;
  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for)
  SELECT target_plan_id, (item->>'account_id')::uuid, (item->>'scheduled_for')::timestamptz
  FROM jsonb_array_elements(COALESCE(planned_visits, '[]'::jsonb)) AS item
  WHERE item ? 'account_id' AND item ? 'scheduled_for';

  UPDATE tips_crm.plans
  SET manager_note = NULLIF(trim(manager_note_input), ''), updated_at = now()
  WHERE id = target_plan_id;

  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by)
  VALUES (plan_owner, 'تم تعديل خطتك من الإدارة', concat('عدّلت الإدارة توزيع زيارات «', plan_title, '». ', COALESCE(NULLIF(trim(manager_note_input), ''), 'راجع الأيام والجهات قبل الاعتماد.')), 'plan', auth.uid());
  PERFORM tips_crm.log_audit('plan_updated_by_manager', 'plan', target_plan_id::text, jsonb_build_object('note', manager_note_input, 'visit_count', jsonb_array_length(COALESCE(planned_visits, '[]'::jsonb))));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_review_plan(target_plan_id uuid, next_status text, note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_owner uuid;
DECLARE plan_title text;
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;
  IF next_status NOT IN ('approved', 'returned') THEN
    RAISE EXCEPTION 'Invalid plan review status';
  END IF;

  UPDATE tips_crm.plans
  SET status = next_status, manager_note = NULLIF(trim(note), ''), approved_by = auth.uid(), approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END, updated_at = now()
  WHERE id = target_plan_id
  RETURNING owner_id, title INTO plan_owner, plan_title;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by)
  VALUES (
    plan_owner,
    CASE WHEN next_status = 'approved' THEN 'تم اعتماد خطتك الأسبوعية' ELSE 'أُعيدت خطتك للمراجعة' END,
    CASE WHEN next_status = 'approved' THEN concat('تم اعتماد «', plan_title, '». يمكنك البدء بالتنفيذ وفق الجدول.') ELSE concat('سبب الإعادة: ', COALESCE(NULLIF(trim(note), ''), 'يرجى مراجعة الخطة مع الإدارة.')) END,
    'plan',
    auth.uid()
  );
  PERFORM tips_crm.log_audit('plan_' || next_status, 'plan', target_plan_id::text, jsonb_build_object('note', note));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_plans() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_update_plan_by_manager(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_review_plan(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_update_plan_by_manager(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_review_plan(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_prepare_plan_submission_email(target_plan_id uuid)
RETURNS TABLE(manager_email text, manager_name text, plan_title text, rep_name text, period_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE submitted_plan record;
BEGIN
  SELECT p.title, p.starts_on, p.ends_on, owner.full_name
  INTO submitted_plan
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  WHERE p.id = target_plan_id AND p.owner_id = auth.uid() AND p.status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner can announce a pending plan'; END IF;

  RETURN QUERY
  SELECT manager.email, manager.full_name, submitted_plan.title, submitted_plan.full_name,
    concat(to_char(submitted_plan.starts_on, 'DD/MM/YYYY'), ' — ', to_char(submitted_plan.ends_on, 'DD/MM/YYYY'))
  FROM tips_crm.profiles manager
  JOIN tips_crm.roles role ON role.key = manager.role_key
  WHERE manager.is_active = true AND manager.email IS NOT NULL AND manager.email <> ''
    AND (role.permissions @> ARRAY['approve_plans']::text[] OR 'all' = ANY(role.permissions));
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_prepare_plan_submission_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_prepare_plan_submission_email(uuid) TO authenticated;
