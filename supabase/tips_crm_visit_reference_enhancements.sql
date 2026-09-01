-- Med Rep Pro-inspired visit enhancements for TIPS CRM.
-- Availability is a market observation only; it never changes company stock.

ALTER TABLE tips_crm.visits
  ADD COLUMN IF NOT EXISTS medical_visit_place text,
  ADD COLUMN IF NOT EXISTS medical_prescribing_level text,
  ADD COLUMN IF NOT EXISTS pharmacy_product_availability jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE tips_crm.visits
  DROP CONSTRAINT IF EXISTS visits_medical_visit_place_check;
ALTER TABLE tips_crm.visits
  ADD CONSTRAINT visits_medical_visit_place_check CHECK (
    medical_visit_place IS NULL OR medical_visit_place IN ('private_clinic', 'hospital', 'referral_center')
  );
ALTER TABLE tips_crm.visits
  DROP CONSTRAINT IF EXISTS visits_medical_prescribing_level_check;
ALTER TABLE tips_crm.visits
  ADD CONSTRAINT visits_medical_prescribing_level_check CHECK (
    medical_prescribing_level IS NULL OR medical_prescribing_level IN ('high', 'medium', 'low', 'non_prescriber')
  );
ALTER TABLE tips_crm.visits
  DROP CONSTRAINT IF EXISTS visits_pharmacy_product_availability_check;
ALTER TABLE tips_crm.visits
  ADD CONSTRAINT visits_pharmacy_product_availability_check CHECK (
    jsonb_typeof(pharmacy_product_availability) = 'array' AND jsonb_array_length(pharmacy_product_availability) <= 50
  );

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_report(
  account_uuid uuid,
  visit_status text,
  visit_outcome text,
  visit_notes text,
  follow_up_action_input text DEFAULT NULL,
  follow_up_on_input date DEFAULT NULL,
  visit_priority_input text DEFAULT 'medium',
  latitude numeric DEFAULT NULL,
  longitude numeric DEFAULT NULL,
  accuracy integer DEFAULT NULL,
  collection_amount_input numeric DEFAULT 0,
  revenue_amount_input numeric DEFAULT 0,
  receipt_reference_input text DEFAULT NULL,
  medical_interaction_type_input text DEFAULT NULL,
  medical_visit_goal_input text DEFAULT NULL,
  promoted_product_input text DEFAULT NULL,
  scientific_message_input text DEFAULT NULL,
  doctor_interest_input text DEFAULT NULL,
  medical_feedback_input text DEFAULT NULL,
  offline_client_ref_input text DEFAULT NULL,
  medical_visit_place_input text DEFAULT NULL,
  medical_prescribing_level_input text DEFAULT NULL,
  pharmacy_product_availability_input jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  caller_company_id uuid;
  saved_visit_id uuid;
  normalized_status text := lower(trim(coalesce(visit_status, '')));
  normalized_priority text := lower(trim(coalesce(visit_priority_input, 'medium')));
  availability jsonb := coalesce(pharmacy_product_availability_input, '[]'::jsonb);
  item jsonb;
  product_uuid uuid;
  observed_status text;
  observed_quantity numeric;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.has_permission('write_own_visits') THEN
    RAISE EXCEPTION 'Visit write permission required';
  END IF;
  IF normalized_status NOT IN ('scheduled', 'completed', 'needs_review') THEN
    RAISE EXCEPTION 'Invalid visit status';
  END IF;
  IF normalized_priority NOT IN ('high', 'medium', 'low') THEN
    RAISE EXCEPTION 'Invalid visit priority';
  END IF;
  IF coalesce(collection_amount_input, 0) < 0 OR coalesce(revenue_amount_input, 0) < 0 THEN
    RAISE EXCEPTION 'Financial amounts cannot be negative';
  END IF;
  IF char_length(coalesce(visit_notes, '')) > 3000 OR char_length(coalesce(follow_up_action_input, '')) > 800 OR char_length(coalesce(receipt_reference_input, '')) > 120 THEN
    RAISE EXCEPTION 'Visit text exceeds the permitted length';
  END IF;
  IF availability IS NULL OR jsonb_typeof(availability) <> 'array' OR jsonb_array_length(availability) > 50 THEN
    RAISE EXCEPTION 'Invalid pharmacy availability data';
  END IF;
  IF medical_visit_place_input IS NOT NULL AND medical_visit_place_input NOT IN ('private_clinic', 'hospital', 'referral_center') THEN
    RAISE EXCEPTION 'Invalid medical visit place';
  END IF;
  IF medical_prescribing_level_input IS NOT NULL AND medical_prescribing_level_input NOT IN ('high', 'medium', 'low', 'non_prescriber') THEN
    RAISE EXCEPTION 'Invalid prescribing level';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.accounts a
    WHERE a.id = account_uuid AND a.company_id = caller_company_id
  ) THEN
    RAISE EXCEPTION 'Account is not available for the active company';
  END IF;
  IF offline_client_ref_input IS NOT NULL THEN
    SELECT v.id INTO saved_visit_id
    FROM tips_crm.visits v
    WHERE v.rep_id = auth.uid() AND v.company_id = caller_company_id AND v.offline_client_ref = offline_client_ref_input
    LIMIT 1;
    IF saved_visit_id IS NOT NULL THEN RETURN saved_visit_id; END IF;
  END IF;

  INSERT INTO tips_crm.visits (
    rep_id, account_id, company_id, status, outcome, notes, checked_in_at,
    check_in_latitude, check_in_longitude, location_accuracy_meters,
    follow_up_action, follow_up_on, visit_priority, collection_amount,
    revenue_amount, receipt_reference, medical_interaction_type, medical_visit_goal,
    promoted_product, scientific_message, doctor_interest, medical_feedback,
    offline_client_ref, medical_visit_place, medical_prescribing_level,
    pharmacy_product_availability
  ) VALUES (
    auth.uid(), account_uuid, caller_company_id, normalized_status,
    nullif(trim(visit_outcome), ''), nullif(trim(visit_notes), ''),
    CASE WHEN normalized_status <> 'scheduled' THEN now() END,
    latitude, longitude, accuracy, nullif(trim(follow_up_action_input), ''),
    follow_up_on_input, normalized_priority, coalesce(collection_amount_input, 0),
    coalesce(revenue_amount_input, 0), nullif(trim(receipt_reference_input), ''),
    nullif(trim(medical_interaction_type_input), ''), nullif(trim(medical_visit_goal_input), ''),
    nullif(trim(promoted_product_input), ''), nullif(trim(scientific_message_input), ''),
    nullif(trim(doctor_interest_input), ''), nullif(trim(medical_feedback_input), ''),
    nullif(trim(offline_client_ref_input), ''), medical_visit_place_input,
    medical_prescribing_level_input, availability
  ) RETURNING id INTO saved_visit_id;

  FOR item IN SELECT value FROM jsonb_array_elements(availability)
  LOOP
    product_uuid := nullif(item ->> 'product_id', '')::uuid;
    observed_status := lower(trim(coalesce(item ->> 'status', '')));
    observed_quantity := nullif(item ->> 'observed_quantity', '')::numeric;
    IF product_uuid IS NULL OR observed_status NOT IN ('available', 'low', 'not_available') OR observed_quantity IS NOT NULL AND (observed_quantity < 0 OR observed_quantity > 1000000) THEN
      RAISE EXCEPTION 'Invalid pharmacy product availability item';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tips_crm.products p WHERE p.id = product_uuid AND p.company_id = caller_company_id AND p.is_active) THEN
      RAISE EXCEPTION 'Availability product is not available for the active company';
    END IF;
  END LOOP;

  PERFORM tips_crm.log_audit('visit_saved', 'visit', saved_visit_id::text, jsonb_build_object('company_id', caller_company_id, 'offline_client_ref', offline_client_ref_input, 'availability_count', jsonb_array_length(availability)));
  RETURN saved_visit_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_save_visit_report(uuid, text, text, text, text, date, text, numeric, numeric, integer, numeric, numeric, text, text, text, text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_visit_report(uuid, text, text, text, text, date, text, numeric, numeric, integer, numeric, numeric, text, text, text, text, text, text, text, text, text, text, jsonb) TO authenticated;
