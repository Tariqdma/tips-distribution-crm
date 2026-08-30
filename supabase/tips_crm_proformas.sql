-- الفاتورة المبدئية وثيقة طلب غير محاسبية: لا تؤثر في المخزون أو التحصيل أو الديون.
CREATE TABLE IF NOT EXISTS tips_crm.proformas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  proforma_number bigint GENERATED ALWAYS AS IDENTITY,
  account_id uuid NOT NULL REFERENCES tips_crm.accounts(id) ON DELETE RESTRICT,
  source_visit_local_ref text,
  created_by uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE RESTRICT,
  client_draft_ref text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'pending_approval', 'approved', 'returned', 'cancelled')),
  currency text NOT NULL DEFAULT 'SDG' CHECK (char_length(trim(currency)) BETWEEN 3 AND 6),
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  notes text,
  issued_at timestamptz,
  client_confirmed_at timestamptz,
  client_confirmation_method text,
  client_confirmer_name text,
  client_confirmation_note text,
  client_confirmation_attachment_path text,
  reviewed_by uuid REFERENCES tips_crm.profiles(id),
  reviewed_at timestamptz,
  manager_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_draft_ref)
);

CREATE TABLE IF NOT EXISTS tips_crm.proforma_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  proforma_id uuid NOT NULL REFERENCES tips_crm.proformas(id) ON DELETE CASCADE,
  catalog_product_id uuid NOT NULL REFERENCES tips_crm.products(id) ON DELETE RESTRICT,
  sku_snapshot text NOT NULL,
  product_name_snapshot text NOT NULL,
  unit_label_snapshot text NOT NULL,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0 AND quantity <= 100000),
  unit_price numeric(14,2) NOT NULL CHECK (unit_price > 0),
  line_total numeric(14,2) NOT NULL CHECK (line_total > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (proforma_id, catalog_product_id)
);

CREATE TABLE IF NOT EXISTS tips_crm.proforma_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  proforma_id uuid NOT NULL REFERENCES tips_crm.proformas(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('draft_saved', 'issued', 'client_confirmed', 'submitted_for_approval', 'approved', 'returned', 'cancelled')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proformas_company_created_idx ON tips_crm.proformas(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proformas_company_status_idx ON tips_crm.proformas(company_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS proformas_rep_status_idx ON tips_crm.proformas(created_by, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS proforma_lines_proforma_idx ON tips_crm.proforma_lines(proforma_id, created_at);
CREATE INDEX IF NOT EXISTS proforma_events_proforma_idx ON tips_crm.proforma_events(proforma_id, created_at DESC);

ALTER TABLE tips_crm.proformas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.proforma_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.proforma_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS proformas_company_read ON tips_crm.proformas;
DROP POLICY IF EXISTS proforma_lines_company_read ON tips_crm.proforma_lines;
DROP POLICY IF EXISTS proforma_events_company_read ON tips_crm.proforma_events;
CREATE POLICY proformas_company_read ON tips_crm.proformas
  FOR SELECT TO authenticated
  USING (company_id = tips_crm.current_actor_company_id() AND (created_by = auth.uid() OR tips_crm.can_manage_product_catalog()));
CREATE POLICY proforma_lines_company_read ON tips_crm.proforma_lines
  FOR SELECT TO authenticated
  USING (company_id = tips_crm.current_actor_company_id() AND EXISTS (
    SELECT 1 FROM tips_crm.proformas p
    WHERE p.id = proforma_id AND (p.created_by = auth.uid() OR tips_crm.can_manage_product_catalog())
  ));
CREATE POLICY proforma_events_company_read ON tips_crm.proforma_events
  FOR SELECT TO authenticated
  USING (company_id = tips_crm.current_actor_company_id() AND EXISTS (
    SELECT 1 FROM tips_crm.proformas p
    WHERE p.id = proforma_id AND (p.created_by = auth.uid() OR tips_crm.can_manage_product_catalog())
  ));

CREATE OR REPLACE FUNCTION tips_crm.can_create_proforma()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tips_crm.profiles p
    WHERE p.id = auth.uid() AND p.is_active AND p.active_company_id IS NOT NULL
      AND p.role_key = 'sales_rep'
  );
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_proforma_draft(
  target_proforma_id uuid,
  target_account_id uuid,
  source_visit_ref_input text,
  client_draft_ref_input text,
  notes_input text,
  line_items jsonb
)
RETURNS TABLE(id uuid, proforma_number bigint, status text, subtotal numeric, currency text, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  caller_company_id uuid;
  saved_proforma_id uuid;
  normalized_ref text := trim(coalesce(client_draft_ref_input, ''));
  normalized_notes text := nullif(trim(coalesce(notes_input, '')), '');
  line_item jsonb;
  selected_product_id uuid;
  selected_sku text;
  selected_name text;
  selected_unit text;
  selected_price numeric;
  selected_currency text;
  selected_quantity numeric;
  raw_quantity text;
  line_count integer := 0;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_create_proforma() THEN
    RAISE EXCEPTION 'Only an active sales representative can create a proforma';
  END IF;
  IF char_length(normalized_ref) < 8 OR char_length(normalized_ref) > 120 THEN
    RAISE EXCEPTION 'A valid local draft reference is required';
  END IF;
  IF coalesce(char_length(normalized_notes), 0) > 2000 OR coalesce(char_length(trim(coalesce(source_visit_ref_input, ''))), 0) > 180 THEN
    RAISE EXCEPTION 'Proforma notes or visit reference exceed the permitted length';
  END IF;
  IF jsonb_typeof(coalesce(line_items, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(line_items, '[]'::jsonb)) < 1 OR jsonb_array_length(coalesce(line_items, '[]'::jsonb)) > 100 THEN
    RAISE EXCEPTION 'Proforma requires between 1 and 100 product lines';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(line_items) item GROUP BY item ->> 'product_id' HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'A product can appear once in a proforma';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.accounts a WHERE a.id = target_account_id AND a.company_id = caller_company_id AND a.account_type IN ('pharmacy', 'distributor')) THEN
    RAISE EXCEPTION 'Proforma is limited to a pharmacy or distributor in the active company';
  END IF;

  IF target_proforma_id IS NOT NULL THEN
    SELECT p.id INTO saved_proforma_id FROM tips_crm.proformas p
    WHERE p.id = target_proforma_id AND p.company_id = caller_company_id AND p.created_by = auth.uid()
    FOR UPDATE;
  END IF;
  IF saved_proforma_id IS NULL THEN
    SELECT p.id INTO saved_proforma_id FROM tips_crm.proformas p
    WHERE p.company_id = caller_company_id AND p.client_draft_ref = normalized_ref AND p.created_by = auth.uid()
    FOR UPDATE;
  END IF;

  IF saved_proforma_id IS NULL THEN
    INSERT INTO tips_crm.proformas (company_id, account_id, source_visit_local_ref, created_by, client_draft_ref, notes)
    VALUES (caller_company_id, target_account_id, nullif(trim(coalesce(source_visit_ref_input, '')), ''), auth.uid(), normalized_ref, normalized_notes)
    RETURNING proformas.id INTO saved_proforma_id;
  ELSE
    UPDATE tips_crm.proformas
    SET account_id = target_account_id, source_visit_local_ref = nullif(trim(coalesce(source_visit_ref_input, '')), ''), notes = normalized_notes,
        status = CASE WHEN status = 'returned' THEN 'draft' ELSE status END, updated_at = now()
    WHERE id = saved_proforma_id AND company_id = caller_company_id AND created_by = auth.uid() AND status IN ('draft', 'returned');
    IF NOT FOUND THEN RAISE EXCEPTION 'Only a draft or returned proforma can be changed'; END IF;
  END IF;

  DELETE FROM tips_crm.proforma_lines WHERE proforma_id = saved_proforma_id;
  FOR line_item IN SELECT value FROM jsonb_array_elements(line_items)
  LOOP
    selected_product_id := nullif(trim(coalesce(line_item ->> 'product_id', '')), '')::uuid;
    raw_quantity := trim(coalesce(line_item ->> 'quantity', ''));
    IF selected_product_id IS NULL OR raw_quantity !~ '^[0-9]+(\.[0-9]{1,3})?$' THEN RAISE EXCEPTION 'Invalid proforma line'; END IF;
    selected_quantity := raw_quantity::numeric;
    IF selected_quantity <= 0 OR selected_quantity > 100000 THEN RAISE EXCEPTION 'Proforma quantity is outside its permitted range'; END IF;
    SELECT p.sku, p.name, p.unit_label, p.default_list_price, p.price_currency
    INTO selected_sku, selected_name, selected_unit, selected_price, selected_currency
    FROM tips_crm.products p
    WHERE p.id = selected_product_id AND p.company_id = caller_company_id AND p.is_active AND p.is_orderable AND p.sku IS NOT NULL AND p.default_list_price > 0
    FOR SHARE;
    IF selected_name IS NULL THEN RAISE EXCEPTION 'One or more products are not active, orderable, or priced'; END IF;
    INSERT INTO tips_crm.proforma_lines (company_id, proforma_id, catalog_product_id, sku_snapshot, product_name_snapshot, unit_label_snapshot, quantity, unit_price, line_total)
    VALUES (caller_company_id, saved_proforma_id, selected_product_id, selected_sku, selected_name, selected_unit, selected_quantity, selected_price, round(selected_quantity * selected_price, 2));
    line_count := line_count + 1;
  END LOOP;
  UPDATE tips_crm.proformas p SET subtotal = (SELECT coalesce(sum(line_total), 0) FROM tips_crm.proforma_lines l WHERE l.proforma_id = saved_proforma_id), currency = (SELECT min(price_currency) FROM tips_crm.products product JOIN tips_crm.proforma_lines l ON l.catalog_product_id = product.id WHERE l.proforma_id = saved_proforma_id), updated_at = now() WHERE p.id = saved_proforma_id;
  INSERT INTO tips_crm.proforma_events(company_id, proforma_id, actor_id, event_type, details) VALUES (caller_company_id, saved_proforma_id, auth.uid(), 'draft_saved', jsonb_build_object('line_count', line_count));
  PERFORM tips_crm.log_audit('proforma_draft_saved', 'proforma', saved_proforma_id::text, jsonb_build_object('company_id', caller_company_id, 'line_count', line_count));
  RETURN QUERY SELECT p.id, p.proforma_number, p.status, p.subtotal, p.currency, p.updated_at FROM tips_crm.proformas p WHERE p.id = saved_proforma_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_issue_proforma(target_proforma_id uuid)
RETURNS TABLE(id uuid, proforma_number bigint, status text, subtotal numeric, currency text, issued_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE caller_company_id uuid; expected_lines integer; refreshed_lines integer;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_create_proforma() THEN RAISE EXCEPTION 'Only an active sales representative can issue a proforma'; END IF;
  SELECT count(*) INTO expected_lines FROM tips_crm.proforma_lines l JOIN tips_crm.proformas p ON p.id = l.proforma_id WHERE p.id = target_proforma_id AND p.company_id = caller_company_id AND p.created_by = auth.uid() AND p.status = 'draft';
  IF expected_lines < 1 THEN RAISE EXCEPTION 'A saved draft with product lines is required before issuing'; END IF;
  UPDATE tips_crm.proforma_lines l
  SET sku_snapshot = p.sku, product_name_snapshot = p.name, unit_label_snapshot = p.unit_label, unit_price = p.default_list_price, line_total = round(l.quantity * p.default_list_price, 2), updated_at = now()
  FROM tips_crm.products p
  WHERE l.proforma_id = target_proforma_id AND l.company_id = caller_company_id AND p.id = l.catalog_product_id AND p.company_id = caller_company_id AND p.is_active AND p.is_orderable AND p.sku IS NOT NULL AND p.default_list_price > 0;
  GET DIAGNOSTICS refreshed_lines = ROW_COUNT;
  IF refreshed_lines <> expected_lines THEN RAISE EXCEPTION 'Every product must remain active, orderable, and priced before the proforma is issued'; END IF;
  UPDATE tips_crm.proformas p
  SET subtotal = (SELECT coalesce(sum(l.line_total), 0) FROM tips_crm.proforma_lines l WHERE l.proforma_id = p.id), status = 'issued', issued_at = now(), updated_at = now()
  WHERE p.id = target_proforma_id AND p.company_id = caller_company_id AND p.created_by = auth.uid() AND p.status = 'draft';
  IF NOT FOUND THEN RAISE EXCEPTION 'Proforma is not available for issuing'; END IF;
  INSERT INTO tips_crm.proforma_events(company_id, proforma_id, actor_id, event_type) VALUES (caller_company_id, target_proforma_id, auth.uid(), 'issued');
  PERFORM tips_crm.log_audit('proforma_issued', 'proforma', target_proforma_id::text, jsonb_build_object('company_id', caller_company_id));
  RETURN QUERY SELECT p.id, p.proforma_number, p.status, p.subtotal, p.currency, p.issued_at, p.updated_at FROM tips_crm.proformas p WHERE p.id = target_proforma_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_my_proformas()
RETURNS TABLE(id uuid, proforma_number bigint, status text, account_id uuid, account_name text, account_type text, source_visit_local_ref text, notes text, subtotal numeric, currency text, issued_at timestamptz, updated_at timestamptz, created_at timestamptz, lines jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.proforma_number, p.status, p.account_id, a.name, a.account_type, p.source_visit_local_ref, p.notes, p.subtotal, p.currency, p.issued_at, p.updated_at, p.created_at,
    coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'product_id', l.catalog_product_id, 'sku', l.sku_snapshot, 'name', l.product_name_snapshot, 'unit_label', l.unit_label_snapshot, 'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total) ORDER BY l.created_at) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb)
  FROM tips_crm.proformas p
  JOIN tips_crm.accounts a ON a.id = p.account_id AND a.company_id = p.company_id
  LEFT JOIN tips_crm.proforma_lines l ON l.proforma_id = p.id AND l.company_id = p.company_id
  WHERE p.company_id = tips_crm.current_actor_company_id() AND p.created_by = auth.uid()
  GROUP BY p.id, a.id
  ORDER BY p.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_save_proforma_draft(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_issue_proforma(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_my_proformas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_proforma_draft(uuid, uuid, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_issue_proforma(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_my_proformas() TO authenticated;
