-- Outcome management checked only the legacy 'manage_outcomes' permission,
-- which company managers on the new permission model do not hold.
CREATE OR REPLACE FUNCTION tips_crm.can_manage_outcomes()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT tips_crm.has_permission('manage_outcomes') OR tips_crm.has_perm('company.profile.update') OR tips_crm.has_perm('catalogue.manage');
$$;
REVOKE EXECUTE ON FUNCTION tips_crm.can_manage_outcomes() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.can_manage_outcomes() TO authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_outcome(outcome_label text, outcome_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE outcome_id uuid;
BEGIN
  IF NOT tips_crm.can_manage_outcomes() THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  IF nullif(trim(coalesce(outcome_label, '')), '') IS NULL THEN RAISE EXCEPTION 'Outcome label is required'; END IF;
  INSERT INTO tips_crm.visit_outcomes(company_id, label, sort_order, created_by)
  VALUES (tips_crm.my_company_id(), trim(outcome_label), outcome_sort_order, auth.uid())
  ON CONFLICT (company_id, label) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = now()
  RETURNING id INTO outcome_id;
  PERFORM tips_crm.log_audit('visit_outcome_saved', 'visit_outcome', outcome_id::text, jsonb_build_object('label', trim(outcome_label)));
  RETURN outcome_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_set_visit_outcome_active(outcome_id uuid, next_is_active boolean)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  outcome_label text;
  remaining_active_count integer;
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF NOT tips_crm.can_manage_outcomes() THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  SELECT label INTO outcome_label FROM tips_crm.visit_outcomes WHERE id = outcome_id AND company_id = actor_company FOR UPDATE;
  IF outcome_label IS NULL THEN RAISE EXCEPTION 'Visit outcome was not found'; END IF;
  IF NOT next_is_active THEN
    SELECT count(*) INTO remaining_active_count FROM tips_crm.visit_outcomes WHERE is_active AND id <> outcome_id AND company_id = actor_company;
    IF remaining_active_count = 0 THEN RAISE EXCEPTION 'At least one active visit outcome is required'; END IF;
  END IF;
  UPDATE tips_crm.visit_outcomes SET is_active = next_is_active, updated_at = now() WHERE id = outcome_id AND company_id = actor_company;
  PERFORM tips_crm.log_audit(CASE WHEN next_is_active THEN 'visit_outcome_activated' ELSE 'visit_outcome_deactivated' END, 'visit_outcome', outcome_id::text, jsonb_build_object('label', outcome_label));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_visit_outcomes()
RETURNS TABLE(id uuid, label text, is_active boolean, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT o.id, o.label, o.is_active, o.sort_order
  FROM tips_crm.visit_outcomes o
  WHERE o.company_id = tips_crm.my_company_id()
    AND (o.is_active OR tips_crm.can_manage_outcomes())
  ORDER BY o.sort_order, o.label;
$$;
