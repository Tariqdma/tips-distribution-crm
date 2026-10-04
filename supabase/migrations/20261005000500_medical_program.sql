-- Medical program: materials and samples, events and invitations, monthly
-- medical targets, and the medical coverage report. All company-scoped.
--
-- Management = company-wide report or plan approval, or catalogue management.
-- Medical rep = an active membership in the caller's company whose
-- disciplines include 'medical'.

CREATE OR REPLACE FUNCTION tips_crm.can_manage_medical()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT tips_crm.has_perm('report.read.company') OR tips_crm.has_perm('plan.approve.company') OR tips_crm.has_perm('catalogue.manage');
$$;

CREATE OR REPLACE FUNCTION tips_crm.is_medical_member(target_profile uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tips_crm.company_memberships m
    WHERE m.profile_id = target_profile AND m.company_id = tips_crm.my_company_id() AND m.is_active
      AND 'medical' = ANY(m.disciplines)
  );
$$;
REVOKE ALL ON FUNCTION tips_crm.can_manage_medical() FROM PUBLIC;
REVOKE ALL ON FUNCTION tips_crm.is_medical_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.can_manage_medical() TO authenticated;
GRANT EXECUTE ON FUNCTION tips_crm.is_medical_member(uuid) TO authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS medical_materials_company_name_idx ON tips_crm.medical_materials(company_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS medical_event_invitations_event_account_idx ON tips_crm.medical_event_invitations(event_id, account_id);

-- Materials -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_medical_material_overview()
RETURNS TABLE(material_id uuid, name text, material_type text, unit_label text, central_quantity numeric, allocated_quantity numeric, delivered_quantity numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.can_manage_medical() THEN RAISE EXCEPTION 'Medical program management permission required'; END IF;
  RETURN QUERY
  SELECT m.id, m.name, m.material_type, m.unit_label, m.central_quantity,
    coalesce((SELECT sum(s.quantity) FROM tips_crm.medical_rep_material_stock s WHERE s.material_id = m.id), 0),
    coalesce((SELECT sum(d.quantity) FROM tips_crm.medical_material_deliveries d WHERE d.material_id = m.id), 0)
  FROM tips_crm.medical_materials m
  WHERE m.company_id = tips_crm.my_company_id() AND m.is_active
  ORDER BY m.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_medical_material(material_name text, material_kind text, material_unit text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE saved_id uuid;
BEGIN
  IF NOT tips_crm.can_manage_medical() THEN RAISE EXCEPTION 'Medical program management permission required'; END IF;
  IF nullif(trim(material_name), '') IS NULL OR material_kind NOT IN ('sample', 'brochure', 'leaflet', 'other') THEN
    RAISE EXCEPTION 'Invalid material details';
  END IF;
  INSERT INTO tips_crm.medical_materials(company_id, name, material_type, unit_label, created_by)
  VALUES (tips_crm.my_company_id(), trim(material_name), material_kind, coalesce(nullif(trim(material_unit), ''), 'وحدة'), auth.uid())
  ON CONFLICT (company_id, name) DO UPDATE SET material_type = EXCLUDED.material_type, unit_label = EXCLUDED.unit_label, is_active = true, updated_at = now()
  RETURNING id INTO saved_id;
  PERFORM tips_crm.log_audit('medical_material_saved', 'medical_material', saved_id::text, jsonb_build_object('name', trim(material_name)));
  RETURN saved_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_adjust_medical_material_stock(material_uuid uuid, quantity_change numeric, note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.can_manage_medical() THEN RAISE EXCEPTION 'Medical program management permission required'; END IF;
  UPDATE tips_crm.medical_materials
  SET central_quantity = central_quantity + quantity_change, updated_at = now()
  WHERE id = material_uuid AND company_id = tips_crm.my_company_id() AND central_quantity + quantity_change >= 0;
  IF NOT FOUND THEN RAISE EXCEPTION 'Material not found or resulting stock would be negative'; END IF;
  PERFORM tips_crm.log_audit('medical_material_stock_adjusted', 'medical_material', material_uuid::text, jsonb_build_object('quantity_change', quantity_change, 'note', note));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_allocate_medical_material(material_uuid uuid, rep_uuid uuid, allocation_quantity numeric, note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF NOT tips_crm.can_manage_medical() THEN RAISE EXCEPTION 'Medical program management permission required'; END IF;
  IF allocation_quantity <= 0 OR NOT tips_crm.is_medical_member(rep_uuid) THEN
    RAISE EXCEPTION 'Invalid allocation: the representative must be an active medical member of this company';
  END IF;
  UPDATE tips_crm.medical_materials SET central_quantity = central_quantity - allocation_quantity, updated_at = now()
  WHERE id = material_uuid AND company_id = actor_company AND central_quantity >= allocation_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient central stock'; END IF;
  INSERT INTO tips_crm.medical_rep_material_stock(material_id, rep_id, quantity, updated_at, company_id)
  VALUES (material_uuid, rep_uuid, allocation_quantity, now(), actor_company)
  ON CONFLICT (material_id, rep_id) DO UPDATE SET quantity = tips_crm.medical_rep_material_stock.quantity + EXCLUDED.quantity, updated_at = now();
  PERFORM tips_crm.log_audit('medical_material_allocated', 'medical_material', material_uuid::text, jsonb_build_object('rep_id', rep_uuid, 'quantity', allocation_quantity, 'note', note));
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_my_medical_material_stock()
RETURNS TABLE(material_id uuid, name text, material_type text, unit_label text, quantity numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT m.id, m.name, m.material_type, m.unit_label, s.quantity
  FROM tips_crm.medical_rep_material_stock s
  JOIN tips_crm.medical_materials m ON m.id = s.material_id
  WHERE s.rep_id = auth.uid() AND s.company_id = tips_crm.my_company_id() AND m.is_active
  ORDER BY m.name;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_deliver_medical_material(material_uuid uuid, doctor_uuid uuid, delivery_quantity numeric, confirmed boolean DEFAULT false, delivery_note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  delivery_id uuid;
BEGIN
  IF delivery_quantity IS NULL OR delivery_quantity <= 0 THEN RAISE EXCEPTION 'Quantity must be greater than zero'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.accounts a WHERE a.id = doctor_uuid AND a.company_id = actor_company) THEN
    RAISE EXCEPTION 'Doctor account not found';
  END IF;
  UPDATE tips_crm.medical_rep_material_stock
  SET quantity = quantity - delivery_quantity, updated_at = now()
  WHERE material_id = material_uuid AND rep_id = auth.uid() AND company_id = actor_company AND quantity >= delivery_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient personal stock for this material'; END IF;
  INSERT INTO tips_crm.medical_material_deliveries(material_id, account_id, rep_id, quantity, receipt_confirmed, notes, company_id)
  VALUES (material_uuid, doctor_uuid, auth.uid(), delivery_quantity, coalesce(confirmed, false), nullif(trim(coalesce(delivery_note, '')), ''), actor_company)
  RETURNING id INTO delivery_id;
  PERFORM tips_crm.log_audit('medical_material_delivered', 'medical_material', material_uuid::text, jsonb_build_object('doctor_id', doctor_uuid, 'quantity', delivery_quantity, 'confirmed', confirmed));
  RETURN delivery_id;
END;
$$;

-- Events -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_medical_event_overview()
RETURNS TABLE(event_id uuid, title text, topic text, focus_product text, starts_at timestamptz, ends_at timestamptz, venue text, state text, city text, notes text, assigned_rep_id uuid, rep_name text, invite_count bigint, confirmed_count bigint, attended_count bigint, follow_up_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT e.id, e.title, e.topic, e.focus_product, e.starts_at, e.ends_at, e.venue, e.state, e.city, e.notes, e.assigned_rep_id, p.full_name,
    count(i.id), count(i.id) FILTER (WHERE i.invitation_status = 'confirmed'),
    count(i.id) FILTER (WHERE i.invitation_status = 'attended'),
    count(i.id) FILTER (WHERE i.invitation_status = 'follow_up')
  FROM tips_crm.medical_events e
  LEFT JOIN tips_crm.profiles p ON p.id = e.assigned_rep_id
  LEFT JOIN tips_crm.medical_event_invitations i ON i.event_id = e.id
  WHERE e.company_id = tips_crm.my_company_id()
    AND (tips_crm.can_manage_medical() OR e.assigned_rep_id IN (SELECT tips_crm.visible_profile_ids('visit.read.team', 'visit.read.company')))
  GROUP BY e.id, p.full_name
  ORDER BY e.starts_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_create_medical_event(event_title text, event_topic text, event_product text, event_starts_at timestamptz, event_ends_at timestamptz, event_venue text, event_state text, event_city text, event_notes text, doctor_ids uuid[], rep_uuid uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  saved_event_id uuid;
BEGIN
  IF NOT tips_crm.can_manage_medical() THEN RAISE EXCEPTION 'Medical program management permission required'; END IF;
  IF nullif(trim(event_title), '') IS NULL OR nullif(trim(event_topic), '') IS NULL OR nullif(trim(event_venue), '') IS NULL THEN
    RAISE EXCEPTION 'Event details are incomplete';
  END IF;
  IF NOT tips_crm.is_medical_member(rep_uuid) THEN RAISE EXCEPTION 'Assigned representative must be an active medical member'; END IF;
  INSERT INTO tips_crm.medical_events(company_id, title, topic, focus_product, starts_at, ends_at, venue, state, city, notes, assigned_rep_id, created_by)
  VALUES (actor_company, trim(event_title), trim(event_topic), nullif(trim(coalesce(event_product, '')), ''), event_starts_at, event_ends_at, trim(event_venue), trim(event_state), trim(event_city), nullif(trim(coalesce(event_notes, '')), ''), rep_uuid, auth.uid())
  RETURNING id INTO saved_event_id;
  INSERT INTO tips_crm.medical_event_invitations(event_id, account_id, assigned_rep_id, company_id)
  SELECT saved_event_id, a.id, rep_uuid, actor_company
  FROM tips_crm.accounts a
  WHERE a.id = ANY(coalesce(doctor_ids, '{}'::uuid[])) AND a.company_id = actor_company AND a.account_type = 'doctor'
  ON CONFLICT (event_id, account_id) DO NOTHING;
  PERFORM tips_crm.log_audit('medical_event_created', 'medical_event', saved_event_id::text, jsonb_build_object('assigned_rep_id', rep_uuid, 'doctor_count', cardinality(coalesce(doctor_ids, '{}'::uuid[]))));
  RETURN saved_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_update_medical_event_invitation(invitation_uuid uuid, next_status text, note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF next_status NOT IN ('confirmed', 'declined', 'attended', 'no_show', 'follow_up') THEN RAISE EXCEPTION 'Invalid invitation status'; END IF;
  UPDATE tips_crm.medical_event_invitations
  SET invitation_status = next_status, notes = coalesce(nullif(trim(coalesce(note, '')), ''), notes), updated_at = now()
  WHERE id = invitation_uuid AND company_id = tips_crm.my_company_id()
    AND (assigned_rep_id = auth.uid() OR tips_crm.can_manage_medical());
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found or access denied'; END IF;
  PERFORM tips_crm.log_audit('medical_event_invitation_updated', 'medical_event_invitation', invitation_uuid::text, jsonb_build_object('status', next_status));
  RETURN true;
END;
$$;

-- Read policies so the app's direct invitation query (with embedded event and
-- account) returns the rows the caller is allowed to see.
CREATE POLICY medical_events_read ON tips_crm.medical_events FOR SELECT TO authenticated
  USING (company_id = tips_crm.my_company_id() AND (tips_crm.can_manage_medical() OR assigned_rep_id IN (SELECT tips_crm.visible_profile_ids('visit.read.team', 'visit.read.company'))));
CREATE POLICY medical_event_invitations_read ON tips_crm.medical_event_invitations FOR SELECT TO authenticated
  USING (company_id = tips_crm.my_company_id() AND (tips_crm.can_manage_medical() OR assigned_rep_id IN (SELECT tips_crm.visible_profile_ids('visit.read.team', 'visit.read.company'))));

-- Targets ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_save_medical_target(target_month date, kind text, key_value text, metric_value text, value numeric, threshold integer DEFAULT 70)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE saved_id uuid;
BEGIN
  IF NOT tips_crm.can_manage_medical() THEN RAISE EXCEPTION 'Medical program management permission required'; END IF;
  IF nullif(trim(coalesce(key_value, '')), '') IS NULL OR value IS NULL OR value < 0 THEN RAISE EXCEPTION 'Invalid target'; END IF;
  INSERT INTO tips_crm.medical_monthly_targets(company_id, month_start, target_type, target_key, metric, target_value, alert_threshold, created_by, updated_at)
  VALUES (tips_crm.my_company_id(), date_trunc('month', target_month)::date, kind, trim(key_value), metric_value, value, least(greatest(coalesce(threshold, 70), 1), 100), auth.uid(), now())
  ON CONFLICT (month_start, target_type, target_key, metric)
  DO UPDATE SET target_value = EXCLUDED.target_value, alert_threshold = EXCLUDED.alert_threshold, updated_at = now()
  WHERE tips_crm.medical_monthly_targets.company_id = tips_crm.my_company_id()
  RETURNING id INTO saved_id;
  IF saved_id IS NULL THEN RAISE EXCEPTION 'Target slot belongs to another company'; END IF;
  PERFORM tips_crm.log_audit('medical_target_saved', 'medical_target', saved_id::text, jsonb_build_object('kind', kind, 'key', key_value, 'metric', metric_value, 'value', value));
  RETURN saved_id;
END;
$$;

-- Actual value per target: rep -> rep_id, area -> account state, product -> promoted_product.
CREATE OR REPLACE FUNCTION public.tips_crm_medical_target_progress(target_month date)
RETURNS TABLE(target_id uuid, target_type text, target_key text, label text, metric text, target_value numeric, alert_threshold integer, actual numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  WITH month_visits AS (
    SELECT v.rep_id, a.state, v.promoted_product, v.medical_interaction_type, v.doctor_interest
    FROM tips_crm.visits v
    JOIN tips_crm.accounts a ON a.id = v.account_id
    WHERE v.company_id = tips_crm.my_company_id()
      AND v.medical_interaction_type IS NOT NULL
      AND date_trunc('month', coalesce(v.checked_in_at, v.created_at))::date = date_trunc('month', target_month)::date
  )
  SELECT t.id, t.target_type, t.target_key,
    CASE t.target_type WHEN 'rep' THEN coalesce((SELECT p.full_name FROM tips_crm.profiles p WHERE p.id::text = t.target_key), t.target_key) ELSE t.target_key END,
    t.metric, t.target_value, t.alert_threshold::integer,
    (SELECT count(*)::numeric FROM month_visits mv
     WHERE (
       (t.target_type = 'rep' AND mv.rep_id::text = t.target_key)
       OR (t.target_type = 'area' AND mv.state = t.target_key)
       OR (t.target_type = 'product' AND mv.promoted_product = t.target_key)
     )
     AND CASE t.metric
       WHEN 'interactions' THEN true
       WHEN 'in_person' THEN mv.medical_interaction_type = 'in_person'
       WHEN 'high_interest' THEN mv.doctor_interest = 'high'
       WHEN 'information_requests' THEN mv.doctor_interest = 'requested_info'
       WHEN 'product_promotions' THEN mv.promoted_product IS NOT NULL
       ELSE false
     END)
  FROM tips_crm.medical_monthly_targets t
  WHERE t.company_id = tips_crm.my_company_id()
    AND t.month_start = date_trunc('month', target_month)::date
    AND (tips_crm.can_manage_medical() OR (t.target_type = 'rep' AND t.target_key = auth.uid()::text))
  ORDER BY t.target_type, t.target_key, t.metric;
$$;

-- Coverage report ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_medical_visit_report(start_on date, end_on date)
RETURNS TABLE(rep_id uuid, rep_name text, state text, city text, specialty text, total_visits bigint, completed_visits bigint, in_person_visits bigint, remote_visits bigint, high_interest bigint, requested_info bigint, pending_follow_ups bigint, promoted_products text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT (tips_crm.has_perm('report.read.team') OR tips_crm.has_perm('report.read.company')) THEN
    RAISE EXCEPTION 'Report permission required';
  END IF;
  RETURN QUERY
  SELECT v.rep_id, coalesce(p.full_name, 'مندوب'), a.state, a.city, coalesce(a.specialty, 'غير محدد'),
    count(*), count(*) FILTER (WHERE v.status = 'completed'),
    count(*) FILTER (WHERE v.medical_interaction_type = 'in_person'),
    count(*) FILTER (WHERE v.medical_interaction_type IN ('phone', 'online')),
    count(*) FILTER (WHERE v.doctor_interest = 'high'),
    count(*) FILTER (WHERE v.doctor_interest = 'requested_info'),
    count(*) FILTER (WHERE v.follow_up_on IS NOT NULL AND v.follow_up_on >= current_date),
    coalesce(array_agg(DISTINCT v.promoted_product) FILTER (WHERE v.promoted_product IS NOT NULL), '{}'::text[])
  FROM tips_crm.visits v
  JOIN tips_crm.accounts a ON a.id = v.account_id
  LEFT JOIN tips_crm.profiles p ON p.id = v.rep_id
  WHERE v.company_id = tips_crm.my_company_id()
    AND v.medical_interaction_type IS NOT NULL
    AND v.rep_id IN (SELECT tips_crm.visible_profile_ids('report.read.team', 'report.read.company'))
    AND coalesce(v.checked_in_at, v.created_at)::date BETWEEN start_on AND end_on
  GROUP BY v.rep_id, p.full_name, a.state, a.city, a.specialty
  ORDER BY count(*) DESC;
END;
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.tips_crm_medical_material_overview()',
    'public.tips_crm_create_medical_material(text, text, text)',
    'public.tips_crm_adjust_medical_material_stock(uuid, numeric, text)',
    'public.tips_crm_allocate_medical_material(uuid, uuid, numeric, text)',
    'public.tips_crm_my_medical_material_stock()',
    'public.tips_crm_deliver_medical_material(uuid, uuid, numeric, boolean, text)',
    'public.tips_crm_medical_event_overview()',
    'public.tips_crm_create_medical_event(text, text, text, timestamptz, timestamptz, text, text, text, text, uuid[], uuid)',
    'public.tips_crm_update_medical_event_invitation(uuid, text, text)',
    'public.tips_crm_save_medical_target(date, text, text, text, numeric, integer)',
    'public.tips_crm_medical_target_progress(date)',
    'public.tips_crm_medical_visit_report(date, date)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
