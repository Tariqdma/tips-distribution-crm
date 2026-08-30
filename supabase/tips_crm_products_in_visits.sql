-- Tips CRM — الحزمة الأولى: المنتج داخل الزيارة
-- تضيف كتالوج المنتجات وسجل التفاعل والملاحظات السوقية، وتربط تسليم العيّنات بزيارة محددة.

CREATE TABLE IF NOT EXISTS tips_crm.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
  category text,
  description text,
  unit_label text NOT NULL DEFAULT 'وحدة' CHECK (char_length(trim(unit_label)) BETWEEN 1 AND 40),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_company_name_unique
  ON tips_crm.products(company_id, lower(name));
CREATE INDEX IF NOT EXISTS products_company_active_idx
  ON tips_crm.products(company_id, is_active, name);

CREATE TABLE IF NOT EXISTS tips_crm.visit_product_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL REFERENCES tips_crm.visits(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES tips_crm.products(id) ON DELETE RESTRICT,
  interaction_type text NOT NULL CHECK (interaction_type IN ('promoted', 'discussed', 'requested_info', 'order_interest')),
  note text,
  created_by uuid NOT NULL REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, product_id)
);

CREATE INDEX IF NOT EXISTS visit_product_interactions_company_created_idx
  ON tips_crm.visit_product_interactions(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS visit_product_interactions_product_idx
  ON tips_crm.visit_product_interactions(product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tips_crm.visit_market_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  visit_id uuid NOT NULL UNIQUE REFERENCES tips_crm.visits(id) ON DELETE CASCADE,
  market_feedback text,
  competitor_notes text,
  follow_up_recommendation text,
  created_by uuid NOT NULL REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (coalesce(char_length(market_feedback), 0) <= 1200),
  CHECK (coalesce(char_length(competitor_notes), 0) <= 1200),
  CHECK (coalesce(char_length(follow_up_recommendation), 0) <= 1200)
);

CREATE INDEX IF NOT EXISTS visit_market_insights_company_created_idx
  ON tips_crm.visit_market_insights(company_id, created_at DESC);

ALTER TABLE tips_crm.medical_material_deliveries
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES tips_crm.visits(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS medical_material_deliveries_visit_material_unique
  ON tips_crm.medical_material_deliveries(visit_id, material_id)
  WHERE visit_id IS NOT NULL;

ALTER TABLE tips_crm.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.visit_product_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.visit_market_insights ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION tips_crm.current_actor_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE caller_company_id uuid;
BEGIN
  SELECT p.active_company_id INTO caller_company_id
  FROM tips_crm.profiles p
  WHERE p.id = auth.uid() AND p.is_active
  LIMIT 1;
  IF caller_company_id IS NULL THEN
    RAISE EXCEPTION 'Active company is required';
  END IF;
  RETURN caller_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION tips_crm.can_manage_product_catalog()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tips_crm.profiles p
    WHERE p.id = auth.uid()
      AND p.is_active
      AND p.active_company_id IS NOT NULL
      AND (
        p.role_key IN ('company_manager', 'sales_manager', 'system_admin')
        OR tips_crm.has_permission('manage_accounts')
        OR tips_crm.has_permission('view_team_data')
      )
  );
$$;

CREATE POLICY products_company_read ON tips_crm.products
  FOR SELECT TO authenticated
  USING (company_id = tips_crm.current_actor_company_id());
CREATE POLICY products_company_manage ON tips_crm.products
  FOR ALL TO authenticated
  USING (company_id = tips_crm.current_actor_company_id() AND tips_crm.can_manage_product_catalog())
  WITH CHECK (company_id = tips_crm.current_actor_company_id() AND tips_crm.can_manage_product_catalog());

CREATE POLICY visit_product_interactions_company_read ON tips_crm.visit_product_interactions
  FOR SELECT TO authenticated
  USING (
    company_id = tips_crm.current_actor_company_id()
    AND (
      created_by = auth.uid()
      OR tips_crm.has_permission('view_team_data')
    )
  );
CREATE POLICY visit_market_insights_company_read ON tips_crm.visit_market_insights
  FOR SELECT TO authenticated
  USING (
    company_id = tips_crm.current_actor_company_id()
    AND (
      created_by = auth.uid()
      OR tips_crm.has_permission('view_team_data')
    )
  );

CREATE OR REPLACE FUNCTION public.tips_crm_list_products()
RETURNS TABLE(id uuid, name text, category text, description text, unit_label text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.name, p.category, p.description, p.unit_label
  FROM tips_crm.products p
  WHERE p.company_id = tips_crm.current_actor_company_id()
    AND p.is_active
  ORDER BY p.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_product(
  target_product_id uuid,
  product_name text,
  product_category text,
  product_description text,
  product_unit_label text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE caller_company_id uuid;
DECLARE saved_product_id uuid;
DECLARE normalized_name text := trim(coalesce(product_name, ''));
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_manage_product_catalog() THEN
    RAISE EXCEPTION 'Product catalog management permission required';
  END IF;
  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 160 THEN
    RAISE EXCEPTION 'Product name must be between 2 and 160 characters';
  END IF;
  IF char_length(trim(coalesce(product_category, ''))) > 80 OR char_length(trim(coalesce(product_description, ''))) > 1200 THEN
    RAISE EXCEPTION 'Product details exceed the permitted length';
  END IF;

  IF target_product_id IS NULL THEN
    INSERT INTO tips_crm.products (company_id, name, category, description, unit_label, created_by)
    VALUES (caller_company_id, normalized_name, nullif(trim(product_category), ''), nullif(trim(product_description), ''), coalesce(nullif(trim(product_unit_label), ''), 'وحدة'), auth.uid())
    RETURNING id INTO saved_product_id;
  ELSE
    UPDATE tips_crm.products
    SET name = normalized_name,
        category = nullif(trim(product_category), ''),
        description = nullif(trim(product_description), ''),
        unit_label = coalesce(nullif(trim(product_unit_label), ''), 'وحدة'),
        updated_at = now()
    WHERE id = target_product_id AND company_id = caller_company_id
    RETURNING id INTO saved_product_id;
    IF saved_product_id IS NULL THEN
      RAISE EXCEPTION 'Product is not available for the active company';
    END IF;
  END IF;
  PERFORM tips_crm.log_audit('product_saved', 'product', saved_product_id::text, jsonb_build_object('company_id', caller_company_id));
  RETURN saved_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_product_context(
  target_visit_id uuid,
  product_lines jsonb DEFAULT '[]'::jsonb,
  market_feedback_input text DEFAULT NULL,
  competitor_notes_input text DEFAULT NULL,
  follow_up_recommendation_input text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE caller_company_id uuid;
DECLARE line_item jsonb;
DECLARE selected_product_id uuid;
DECLARE selected_interaction_type text;
DECLARE selected_note text;
DECLARE interaction_count integer := 0;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.visits v
    WHERE v.id = target_visit_id
      AND v.company_id = caller_company_id
      AND v.rep_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Visit is not available for the current representative';
  END IF;
  IF jsonb_typeof(coalesce(product_lines, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(product_lines, '[]'::jsonb)) > 20 THEN
    RAISE EXCEPTION 'Product lines must be an array containing up to 20 items';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(product_lines, '[]'::jsonb)) item
    GROUP BY item ->> 'product_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A product can be recorded once per visit';
  END IF;

  FOR line_item IN SELECT value FROM jsonb_array_elements(coalesce(product_lines, '[]'::jsonb))
  LOOP
    selected_product_id := nullif(line_item ->> 'product_id', '')::uuid;
    selected_interaction_type := line_item ->> 'interaction_type';
    selected_note := nullif(trim(coalesce(line_item ->> 'note', '')), '');
    IF selected_product_id IS NULL OR selected_interaction_type NOT IN ('promoted', 'discussed', 'requested_info', 'order_interest') OR coalesce(char_length(selected_note), 0) > 800 THEN
      RAISE EXCEPTION 'Invalid product interaction data';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM tips_crm.products p WHERE p.id = selected_product_id AND p.company_id = caller_company_id AND p.is_active) THEN
      RAISE EXCEPTION 'One or more products are not available for the active company';
    END IF;
    INSERT INTO tips_crm.visit_product_interactions (company_id, visit_id, product_id, interaction_type, note, created_by)
    VALUES (caller_company_id, target_visit_id, selected_product_id, selected_interaction_type, selected_note, auth.uid())
    ON CONFLICT (visit_id, product_id) DO UPDATE
      SET interaction_type = excluded.interaction_type,
          note = excluded.note,
          updated_at = now();
    interaction_count := interaction_count + 1;
  END LOOP;

  IF coalesce(char_length(market_feedback_input), 0) > 1200 OR coalesce(char_length(competitor_notes_input), 0) > 1200 OR coalesce(char_length(follow_up_recommendation_input), 0) > 1200 THEN
    RAISE EXCEPTION 'Market insight exceeds the permitted length';
  END IF;
  IF nullif(trim(coalesce(market_feedback_input, '')), '') IS NOT NULL
     OR nullif(trim(coalesce(competitor_notes_input, '')), '') IS NOT NULL
     OR nullif(trim(coalesce(follow_up_recommendation_input, '')), '') IS NOT NULL THEN
    INSERT INTO tips_crm.visit_market_insights (company_id, visit_id, market_feedback, competitor_notes, follow_up_recommendation, created_by)
    VALUES (caller_company_id, target_visit_id, nullif(trim(market_feedback_input), ''), nullif(trim(competitor_notes_input), ''), nullif(trim(follow_up_recommendation_input), ''), auth.uid())
    ON CONFLICT (visit_id) DO UPDATE
      SET market_feedback = excluded.market_feedback,
          competitor_notes = excluded.competitor_notes,
          follow_up_recommendation = excluded.follow_up_recommendation,
          updated_at = now();
  END IF;
  PERFORM tips_crm.log_audit('visit_product_context_saved', 'visit', target_visit_id::text, jsonb_build_object('company_id', caller_company_id, 'product_count', interaction_count));
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_my_visit_samples()
RETURNS TABLE(material_id uuid, name text, unit_label text, available_quantity numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT m.id, m.name, m.unit_label, s.quantity
  FROM tips_crm.medical_rep_material_stock s
  JOIN tips_crm.medical_materials m ON m.id = s.material_id
  WHERE s.rep_id = auth.uid()
    AND s.company_id = tips_crm.current_actor_company_id()
    AND m.company_id = tips_crm.current_actor_company_id()
    AND m.is_active
    AND m.material_type = 'sample'
    AND s.quantity > 0
  ORDER BY m.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_record_visit_sample_deliveries(
  target_visit_id uuid,
  delivery_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE caller_company_id uuid;
DECLARE line_item jsonb;
DECLARE selected_material_id uuid;
DECLARE selected_quantity numeric;
DECLARE created_delivery_id uuid;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.visits v
    WHERE v.id = target_visit_id
      AND v.company_id = caller_company_id
      AND v.rep_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Visit is not available for the current representative';
  END IF;
  IF jsonb_typeof(coalesce(delivery_lines, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(delivery_lines, '[]'::jsonb)) > 10 THEN
    RAISE EXCEPTION 'Sample deliveries must be an array containing up to 10 items';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(coalesce(delivery_lines, '[]'::jsonb)) item
    GROUP BY item ->> 'material_id'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'A sample can be recorded once per visit';
  END IF;

  FOR line_item IN SELECT value FROM jsonb_array_elements(coalesce(delivery_lines, '[]'::jsonb))
  LOOP
    selected_material_id := nullif(line_item ->> 'material_id', '')::uuid;
    selected_quantity := nullif(line_item ->> 'quantity', '')::numeric;
    IF selected_material_id IS NULL OR selected_quantity IS NULL OR selected_quantity <= 0 OR selected_quantity > 1000 THEN
      RAISE EXCEPTION 'Invalid sample delivery quantity';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM tips_crm.medical_materials m
      WHERE m.id = selected_material_id AND m.company_id = caller_company_id AND m.is_active AND m.material_type = 'sample'
    ) THEN
      RAISE EXCEPTION 'Sample is not available for the active company';
    END IF;
    INSERT INTO tips_crm.medical_material_deliveries (material_id, account_id, rep_id, quantity, receipt_confirmed, notes, company_id, visit_id)
    SELECT selected_material_id, v.account_id, auth.uid(), selected_quantity, false, 'تسليم موثق داخل تقرير الزيارة', caller_company_id, target_visit_id
    FROM tips_crm.visits v
    WHERE v.id = target_visit_id
    ON CONFLICT (visit_id, material_id) WHERE visit_id IS NOT NULL DO NOTHING
    RETURNING id INTO created_delivery_id;
    IF created_delivery_id IS NOT NULL THEN
      UPDATE tips_crm.medical_rep_material_stock s
      SET quantity = s.quantity - selected_quantity, updated_at = now()
      WHERE s.material_id = selected_material_id
        AND s.rep_id = auth.uid()
        AND s.company_id = caller_company_id
        AND s.quantity >= selected_quantity;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Insufficient assigned sample stock';
      END IF;
    END IF;
  END LOOP;
  PERFORM tips_crm.log_audit('visit_samples_recorded', 'visit', target_visit_id::text, jsonb_build_object('company_id', caller_company_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_product_visit_report(report_limit integer DEFAULT 100)
RETURNS TABLE(product_id uuid, product_name text, category text, interactions bigint, promotions bigint, information_requests bigint, order_interest bigint, market_feedback_count bigint, competitor_note_count bigint, latest_activity_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id,
         p.name,
         p.category,
         count(vpi.id) AS interactions,
         count(vpi.id) FILTER (WHERE vpi.interaction_type = 'promoted') AS promotions,
         count(vpi.id) FILTER (WHERE vpi.interaction_type = 'requested_info') AS information_requests,
         count(vpi.id) FILTER (WHERE vpi.interaction_type = 'order_interest') AS order_interest,
         count(vmi.id) FILTER (WHERE vmi.market_feedback IS NOT NULL) AS market_feedback_count,
         count(vmi.id) FILTER (WHERE vmi.competitor_notes IS NOT NULL) AS competitor_note_count,
         max(greatest(coalesce(vpi.updated_at, '-infinity'::timestamptz), coalesce(vmi.updated_at, '-infinity'::timestamptz))) AS latest_activity_at
  FROM tips_crm.products p
  LEFT JOIN tips_crm.visit_product_interactions vpi ON vpi.product_id = p.id AND vpi.company_id = p.company_id
  LEFT JOIN tips_crm.visit_market_insights vmi ON vmi.visit_id = vpi.visit_id AND vmi.company_id = p.company_id
  WHERE p.company_id = tips_crm.current_actor_company_id()
    AND tips_crm.has_permission('view_team_data')
  GROUP BY p.id, p.name, p.category
  ORDER BY max(vpi.updated_at) DESC NULLS LAST, p.name ASC
  LIMIT least(greatest(coalesce(report_limit, 100), 1), 250);
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_visit_market_insights(report_limit integer DEFAULT 100)
RETURNS TABLE(visit_id uuid, account_name text, account_type text, representative_name text, visited_at timestamptz, market_feedback text, competitor_notes text, follow_up_recommendation text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT vmi.visit_id,
         a.name,
         a.account_type,
         p.full_name,
         coalesce(v.checked_in_at, v.updated_at),
         vmi.market_feedback,
         vmi.competitor_notes,
         vmi.follow_up_recommendation
  FROM tips_crm.visit_market_insights vmi
  JOIN tips_crm.visits v ON v.id = vmi.visit_id AND v.company_id = vmi.company_id
  JOIN tips_crm.accounts a ON a.id = v.account_id AND a.company_id = vmi.company_id
  JOIN tips_crm.profiles p ON p.id = v.rep_id AND p.active_company_id = vmi.company_id
  WHERE vmi.company_id = tips_crm.current_actor_company_id()
    AND tips_crm.has_permission('view_team_data')
  ORDER BY vmi.updated_at DESC
  LIMIT least(greatest(coalesce(report_limit, 100), 1), 250);
$$;

REVOKE ALL ON FUNCTION tips_crm.current_actor_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION tips_crm.can_manage_product_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_products() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_product(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_visit_product_context(uuid, jsonb, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_my_visit_samples() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_record_visit_sample_deliveries(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_product_visit_report(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_visit_market_insights(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.current_actor_company_id() TO authenticated;
GRANT EXECUTE ON FUNCTION tips_crm.can_manage_product_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_products() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_product(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_visit_product_context(uuid, jsonb, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_my_visit_samples() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_record_visit_sample_deliveries(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_product_visit_report(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_visit_market_insights(integer) TO authenticated;
