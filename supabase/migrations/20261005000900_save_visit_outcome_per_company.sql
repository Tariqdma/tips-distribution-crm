-- visit_outcomes is unique per (company_id, label); the old function used
-- ON CONFLICT (label), which matches no constraint and always errored.
CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_outcome(outcome_label text, outcome_sort_order integer DEFAULT 0)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE outcome_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  IF nullif(trim(coalesce(outcome_label, '')), '') IS NULL THEN RAISE EXCEPTION 'Outcome label is required'; END IF;
  INSERT INTO tips_crm.visit_outcomes(company_id, label, sort_order, created_by)
  VALUES (tips_crm.my_company_id(), trim(outcome_label), outcome_sort_order, auth.uid())
  ON CONFLICT (company_id, label) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = now()
  RETURNING id INTO outcome_id;
  PERFORM tips_crm.log_audit('visit_outcome_saved', 'visit_outcome', outcome_id::text, jsonb_build_object('label', trim(outcome_label)));
  RETURN outcome_id;
END;
$$;
