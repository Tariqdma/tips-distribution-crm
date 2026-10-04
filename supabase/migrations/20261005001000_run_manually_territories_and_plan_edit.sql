-- ==============================================================================
-- RUN MANUALLY in Supabase Dashboard -> SQL Editor.
-- These two functions replace a set of rows (DELETE + INSERT), and the
-- connector that applied the other migrations asks for an approval it could
-- not show. Safe to re-run.
-- ==============================================================================

-- 1. Assign territories to an employee (missing from the database; the team
--    screen calls it when a manager changes an employee's regions).
CREATE OR REPLACE FUNCTION public.tips_crm_set_profile_territories(target_profile_id uuid, selected_territory_keys text[])
RETURNS TABLE(territory_keys text[], territory_labels text[])
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  selected_ids uuid[];
  normalized_keys text[];
BEGIN
  IF NOT (tips_crm.has_perm('team.assign') OR tips_crm.has_perm('employee.manage') OR tips_crm.has_perm('territory.manage')) THEN
    RAISE EXCEPTION 'Team assignment permission required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.company_memberships m
    WHERE m.profile_id = target_profile_id AND m.company_id = actor_company AND m.is_active
  ) THEN
    RAISE EXCEPTION 'Employee is not a member of this company';
  END IF;

  normalized_keys := ARRAY(
    SELECT DISTINCT trim(value) FROM unnest(coalesce(selected_territory_keys, '{}'::text[])) value WHERE trim(value) <> ''
  );
  SELECT array_agg(t.id ORDER BY t.name) INTO selected_ids
  FROM tips_crm.territories t
  WHERE t.client_key = ANY(normalized_keys) AND t.is_active AND t.company_id = actor_company;
  IF coalesce(cardinality(selected_ids), 0) <> cardinality(normalized_keys) THEN
    RAISE EXCEPTION 'One or more selected territories are unavailable';
  END IF;

  DELETE FROM tips_crm.territory_assignments WHERE profile_id = target_profile_id AND company_id = actor_company;
  INSERT INTO tips_crm.territory_assignments(territory_id, profile_id, assigned_by, company_id)
  SELECT territory_id, target_profile_id, auth.uid(), actor_company
  FROM unnest(coalesce(selected_ids, '{}'::uuid[])) territory_id
  ON CONFLICT (territory_id, profile_id) DO NOTHING;

  PERFORM tips_crm.log_audit('territories_assigned', 'profile', target_profile_id::text, jsonb_build_object('territory_keys', normalized_keys));

  RETURN QUERY
  SELECT coalesce(array_agg(t.client_key ORDER BY t.name), '{}'::text[]), coalesce(array_agg(t.name ORDER BY t.name), '{}'::text[])
  FROM tips_crm.territory_assignments a
  JOIN tips_crm.territories t ON t.id = a.territory_id
  WHERE a.profile_id = target_profile_id AND a.company_id = actor_company;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_set_profile_territories(uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_set_profile_territories(uuid, text[]) TO authenticated;

-- 2. Manager edits a pending plan's visits. Same behaviour as before, but
--    limited to plans of the caller's own company (it could previously edit
--    any company's plan by id).
CREATE OR REPLACE FUNCTION public.tips_crm_update_plan_by_manager(target_plan_id uuid, planned_visits jsonb, manager_note_input text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  plan_owner uuid;
  plan_title text;
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') AND NOT tips_crm.has_perm('plan.approve.team') AND NOT tips_crm.has_perm('plan.approve.company') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;

  SELECT owner_id, title INTO plan_owner, plan_title
  FROM tips_crm.plans
  WHERE id = target_plan_id AND status = 'pending' AND company_id = actor_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Only pending plans can be modified'; END IF;

  DELETE FROM tips_crm.plan_visits WHERE plan_id = target_plan_id;
  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for, company_id)
  SELECT target_plan_id, (item->>'account_id')::uuid, (item->>'scheduled_for')::timestamptz, actor_company
  FROM jsonb_array_elements(coalesce(planned_visits, '[]'::jsonb)) AS item
  JOIN tips_crm.accounts a ON a.id = (item->>'account_id')::uuid AND a.company_id = actor_company
  WHERE item ? 'account_id' AND item ? 'scheduled_for'
  ON CONFLICT DO NOTHING;

  UPDATE tips_crm.plans SET manager_note = nullif(trim(manager_note_input), ''), updated_at = now() WHERE id = target_plan_id;

  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by, company_id)
  VALUES (plan_owner, 'تم تعديل خطتك من الإدارة',
          concat('عدّلت الإدارة توزيع زيارات «', plan_title, '». ', coalesce(nullif(trim(manager_note_input), ''), 'راجع الأيام والجهات قبل الاعتماد.')),
          'plan', auth.uid(), actor_company);
  PERFORM tips_crm.log_audit('plan_updated_by_manager', 'plan', target_plan_id::text,
    jsonb_build_object('note', manager_note_input, 'visit_count', jsonb_array_length(coalesce(planned_visits, '[]'::jsonb))));
  RETURN true;
END;
$$;
