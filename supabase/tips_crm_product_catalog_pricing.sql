-- Tips CRM — الحزمة الثانية / المرحلة 2A
-- امتداد كتالوج المنتجات بأسعار معتمدة وسجل تاريخي واستيراد Excel/CSV معزول لكل شركة.

ALTER TABLE tips_crm.products
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS scientific_name text,
  ADD COLUMN IF NOT EXISTS pack_size text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS is_orderable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_list_price numeric(14,2),
  ADD COLUMN IF NOT EXISTS price_currency text NOT NULL DEFAULT 'SDG',
  ADD COLUMN IF NOT EXISTS price_effective_from date;

CREATE UNIQUE INDEX IF NOT EXISTS products_company_sku_unique
  ON tips_crm.products(company_id, lower(sku))
  WHERE sku IS NOT NULL;

CREATE TABLE IF NOT EXISTS tips_crm.product_price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES tips_crm.products(id) ON DELETE RESTRICT,
  list_price numeric(14,2) NOT NULL CHECK (list_price > 0),
  currency text NOT NULL DEFAULT 'SDG' CHECK (char_length(trim(currency)) BETWEEN 3 AND 8),
  effective_from date NOT NULL DEFAULT current_date,
  created_by uuid NOT NULL REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_price_history_company_product_idx
  ON tips_crm.product_price_history(company_id, product_id, effective_from DESC, created_at DESC);

ALTER TABLE tips_crm.product_price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_price_history_company_manager_read ON tips_crm.product_price_history
  FOR SELECT TO authenticated
  USING (company_id = tips_crm.current_actor_company_id() AND tips_crm.can_manage_product_catalog());

CREATE OR REPLACE FUNCTION public.tips_crm_save_catalog_product_v2(
  target_product_id uuid,
  product_sku text,
  product_name text,
  product_category text DEFAULT NULL,
  product_description text DEFAULT NULL,
  product_unit_label text DEFAULT 'وحدة',
  product_scientific_name text DEFAULT NULL,
  product_pack_size text DEFAULT NULL,
  product_image_url text DEFAULT NULL,
  product_is_orderable boolean DEFAULT false,
  product_list_price numeric DEFAULT NULL,
  product_currency text DEFAULT 'SDG'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  caller_company_id uuid;
  saved_product_id uuid;
  previous_price numeric;
  previous_currency text;
  normalized_sku text := nullif(upper(trim(coalesce(product_sku, ''))), '');
  normalized_name text := trim(coalesce(product_name, ''));
  normalized_currency text := upper(trim(coalesce(product_currency, 'SDG')));
  normalized_image_url text := nullif(trim(coalesce(product_image_url, '')), '');
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_manage_product_catalog() THEN
    RAISE EXCEPTION 'Product catalog management permission required';
  END IF;
  IF char_length(normalized_name) < 2 OR char_length(normalized_name) > 160 THEN
    RAISE EXCEPTION 'Product name must be between 2 and 160 characters';
  END IF;
  IF normalized_sku IS NOT NULL AND (char_length(normalized_sku) < 2 OR char_length(normalized_sku) > 80) THEN
    RAISE EXCEPTION 'Product SKU must be between 2 and 80 characters';
  END IF;
  IF normalized_currency !~ '^[A-Z]{3,8}$' THEN
    RAISE EXCEPTION 'Product currency is invalid';
  END IF;
  IF normalized_image_url IS NOT NULL AND (char_length(normalized_image_url) > 2048 OR normalized_image_url !~* '^https?://') THEN
    RAISE EXCEPTION 'Product image URL must start with http or https';
  END IF;
  IF coalesce(char_length(product_category), 0) > 80 OR coalesce(char_length(product_description), 0) > 1200
     OR coalesce(char_length(product_scientific_name), 0) > 160 OR coalesce(char_length(product_pack_size), 0) > 80 THEN
    RAISE EXCEPTION 'Product details exceed the permitted length';
  END IF;
  IF product_is_orderable AND (product_list_price IS NULL OR product_list_price <= 0 OR product_list_price > 999999999999) THEN
    RAISE EXCEPTION 'An orderable product requires a positive list price';
  END IF;
  IF NOT product_is_orderable THEN
    product_list_price := NULL;
  END IF;

  IF target_product_id IS NULL THEN
    INSERT INTO tips_crm.products (
      company_id, sku, name, category, description, unit_label, scientific_name, pack_size,
      image_url, is_orderable, default_list_price, price_currency, price_effective_from, created_by
    ) VALUES (
      caller_company_id, normalized_sku, normalized_name, nullif(trim(product_category), ''),
      nullif(trim(product_description), ''), coalesce(nullif(trim(product_unit_label), ''), 'وحدة'),
      nullif(trim(product_scientific_name), ''), nullif(trim(product_pack_size), ''), normalized_image_url,
      product_is_orderable, product_list_price, normalized_currency,
      CASE WHEN product_list_price IS NULL THEN NULL ELSE current_date END, auth.uid()
    ) RETURNING id INTO saved_product_id;
  ELSE
    SELECT default_list_price, price_currency INTO previous_price, previous_currency
    FROM tips_crm.products
    WHERE id = target_product_id AND company_id = caller_company_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product is not available for the active company';
    END IF;
    UPDATE tips_crm.products
    SET sku = normalized_sku,
        name = normalized_name,
        category = nullif(trim(product_category), ''),
        description = nullif(trim(product_description), ''),
        unit_label = coalesce(nullif(trim(product_unit_label), ''), 'وحدة'),
        scientific_name = nullif(trim(product_scientific_name), ''),
        pack_size = nullif(trim(product_pack_size), ''),
        image_url = normalized_image_url,
        is_orderable = product_is_orderable,
        default_list_price = product_list_price,
        price_currency = normalized_currency,
        price_effective_from = CASE WHEN product_list_price IS NULL THEN NULL ELSE current_date END,
        updated_at = now()
    WHERE id = target_product_id AND company_id = caller_company_id
    RETURNING id INTO saved_product_id;
  END IF;

  IF product_list_price IS NOT NULL AND (previous_price IS NULL OR previous_price IS DISTINCT FROM product_list_price OR previous_currency IS DISTINCT FROM normalized_currency) THEN
    INSERT INTO tips_crm.product_price_history (company_id, product_id, list_price, currency, created_by)
    VALUES (caller_company_id, saved_product_id, product_list_price, normalized_currency, auth.uid());
  END IF;
  PERFORM tips_crm.log_audit('product_catalog_saved', 'product', saved_product_id::text,
    jsonb_build_object('company_id', caller_company_id, 'sku', normalized_sku, 'orderable', product_is_orderable, 'price', product_list_price));
  RETURN saved_product_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_catalog_products_v2(include_inactive boolean DEFAULT false)
RETURNS TABLE(
  id uuid, sku text, name text, category text, description text, unit_label text,
  scientific_name text, pack_size text, image_url text, is_orderable boolean,
  list_price numeric, price_currency text, is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.sku, p.name, p.category, p.description, p.unit_label,
         p.scientific_name, p.pack_size, p.image_url, p.is_orderable,
         p.default_list_price, p.price_currency, p.is_active
  FROM tips_crm.products p
  WHERE p.company_id = tips_crm.current_actor_company_id()
    AND (p.is_active OR (include_inactive AND tips_crm.can_manage_product_catalog()))
  ORDER BY p.is_active DESC, p.name ASC;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_import_catalog_products(import_rows jsonb)
RETURNS TABLE(row_number integer, import_status text, product_id uuid, sku text, product_name text, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  caller_company_id uuid;
  row_item jsonb;
  source_row_number bigint;
  parsed_sku text;
  parsed_name text;
  parsed_orderable boolean;
  parsed_price numeric;
  existing_product_id uuid;
  saved_product_id uuid;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_manage_product_catalog() THEN
    RAISE EXCEPTION 'Product catalog management permission required';
  END IF;
  IF jsonb_typeof(coalesce(import_rows, '[]'::jsonb)) <> 'array' OR jsonb_array_length(coalesce(import_rows, '[]'::jsonb)) > 500 THEN
    RAISE EXCEPTION 'Import must be an array containing up to 500 rows';
  END IF;

  FOR row_item, source_row_number IN
    SELECT value, ordinality FROM jsonb_array_elements(coalesce(import_rows, '[]'::jsonb)) WITH ORDINALITY
  LOOP
    row_number := source_row_number::integer;
    parsed_sku := nullif(upper(trim(coalesce(row_item ->> 'sku', ''))), '');
    parsed_name := trim(coalesce(row_item ->> 'name', ''));
    product_id := NULL;
    sku := parsed_sku;
    product_name := parsed_name;
    BEGIN
      parsed_orderable := CASE lower(trim(coalesce(row_item ->> 'is_orderable', 'true')))
        WHEN 'true' THEN true WHEN '1' THEN true WHEN 'نعم' THEN true WHEN 'yes' THEN true
        WHEN 'false' THEN false WHEN '0' THEN false WHEN 'لا' THEN false WHEN 'no' THEN false
        ELSE NULL END;
      IF parsed_sku IS NULL OR parsed_name = '' OR parsed_orderable IS NULL THEN
        import_status := 'rejected'; message := 'تحقق من رمز المنتج والاسم وقيمة قابل للبيع.'; RETURN NEXT; CONTINUE;
      END IF;
      parsed_price := nullif(trim(coalesce(row_item ->> 'list_price', '')), '')::numeric;
      SELECT p.id INTO existing_product_id
      FROM tips_crm.products p
      WHERE p.company_id = caller_company_id AND lower(p.sku) = lower(parsed_sku)
      LIMIT 1;
      saved_product_id := public.tips_crm_save_catalog_product_v2(
        existing_product_id, parsed_sku, parsed_name, row_item ->> 'category', row_item ->> 'description',
        coalesce(nullif(row_item ->> 'unit_label', ''), 'وحدة'), row_item ->> 'scientific_name', row_item ->> 'pack_size',
        row_item ->> 'image_url', parsed_orderable, parsed_price, coalesce(nullif(row_item ->> 'currency', ''), 'SDG')
      );
      product_id := saved_product_id;
      import_status := CASE WHEN existing_product_id IS NULL THEN 'created' ELSE 'updated' END;
      message := CASE WHEN existing_product_id IS NULL THEN 'أضيف المنتج إلى الكتالوج.' ELSE 'تم تحديث المنتج من رمز المنتج نفسه.' END;
    EXCEPTION WHEN OTHERS THEN
      import_status := 'rejected';
      message := left(SQLERRM, 220);
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_save_catalog_product_v2(uuid, text, text, text, text, text, text, text, text, boolean, numeric, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_catalog_products_v2(boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_import_catalog_products(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_catalog_product_v2(uuid, text, text, text, text, text, text, text, text, boolean, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_catalog_products_v2(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_import_catalog_products(jsonb) TO authenticated;
