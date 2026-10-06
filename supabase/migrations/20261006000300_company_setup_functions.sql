-- The company onboarding screens (team, territories, account import) call
-- functions that never existed in the database, so those screens always
-- failed. Defined here in public so they work without exposing tips_crm.

-- 1. Team structure -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_get_company_team_setup()
RETURNS TABLE(profile_id uuid, full_name text, email text, role_key text, reports_to_profile_id uuid, reports_to_name text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF actor_company IS NULL OR NOT tips_crm.has_perm('employee.manage') THEN
    RAISE EXCEPTION 'Employee management permission required';
  END IF;
  RETURN QUERY
  SELECT m.profile_id, p.full_name, p.email, m.role_key, m.reports_to_profile_id, boss.full_name, (m.is_active AND p.is_active)
  FROM tips_crm.company_memberships m
  JOIN tips_crm.profiles p ON p.id = m.profile_id
  LEFT JOIN tips_crm.profiles boss ON boss.id = m.reports_to_profile_id
  WHERE m.company_id = actor_company
  ORDER BY p.full_name;
END;
$$;

-- 2. Territories --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tips_crm.territory_setup_row(t tips_crm.territories)
RETURNS TABLE(client_key text, name text, state text, city text, center_latitude numeric, center_longitude numeric,
              radius_meters integer, polygon_points jsonb, assigned_member_count integer, is_boundary_complete boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT t.client_key, t.name, t.state, t.city, t.center_latitude, t.center_longitude, t.radius_meters,
         coalesce((
           SELECT jsonb_agg(jsonb_build_object('latitude', (pt->>1)::numeric, 'longitude', (pt->>0)::numeric) ORDER BY ord)
           FROM jsonb_array_elements(t.boundary_geojson->'coordinates'->0) WITH ORDINALITY AS c(pt, ord)
         ), '[]'::jsonb),
         (SELECT count(*)::integer FROM tips_crm.territory_assignments a WHERE a.territory_id = t.id),
         (t.center_latitude IS NOT NULL AND t.center_longitude IS NOT NULL AND coalesce(t.radius_meters, 0) > 0);
$$;
REVOKE ALL ON FUNCTION tips_crm.territory_setup_row(tips_crm.territories) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_get_company_territory_setup()
RETURNS TABLE(client_key text, name text, state text, city text, center_latitude numeric, center_longitude numeric,
              radius_meters integer, polygon_points jsonb, assigned_member_count integer, is_boundary_complete boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF actor_company IS NULL OR NOT (tips_crm.has_perm('territory.manage') OR tips_crm.has_permission('manage_territories')) THEN
    RAISE EXCEPTION 'Territory management permission required';
  END IF;
  RETURN QUERY
  SELECT r.* FROM tips_crm.territories t, LATERAL tips_crm.territory_setup_row(t) r
  WHERE t.company_id = actor_company AND t.is_active
  ORDER BY t.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_save_company_territory(
  input_client_key text, input_name text, input_state text, input_city text,
  input_center_latitude numeric, input_center_longitude numeric, input_radius_meters integer,
  input_polygon_points jsonb DEFAULT '[]'::jsonb)
RETURNS TABLE(client_key text, name text, state text, city text, center_latitude numeric, center_longitude numeric,
              radius_meters integer, polygon_points jsonb, assigned_member_count integer, is_boundary_complete boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  key_value text := nullif(trim(input_client_key), '');
  saved tips_crm.territories;
  polygon_geojson jsonb := NULL;
BEGIN
  IF actor_company IS NULL OR NOT (tips_crm.has_perm('territory.manage') OR tips_crm.has_permission('manage_territories')) THEN
    RAISE EXCEPTION 'Territory management permission required';
  END IF;
  IF coalesce(trim(input_name), '') = '' OR coalesce(trim(input_state), '') = '' OR coalesce(trim(input_city), '') = '' THEN
    RAISE EXCEPTION 'Territory name, state and city are required';
  END IF;
  IF input_center_latitude NOT BETWEEN -90 AND 90 OR input_center_longitude NOT BETWEEN -180 AND 180
     OR input_radius_meters NOT BETWEEN 100 AND 100000 THEN
    RAISE EXCEPTION 'Territory coordinates are invalid';
  END IF;
  IF jsonb_typeof(coalesce(input_polygon_points, '[]'::jsonb)) = 'array' AND jsonb_array_length(coalesce(input_polygon_points, '[]'::jsonb)) >= 3 THEN
    polygon_geojson := jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array((
      SELECT jsonb_agg(jsonb_build_array((p->>'longitude')::numeric, (p->>'latitude')::numeric) ORDER BY ord)
      FROM jsonb_array_elements(input_polygon_points) WITH ORDINALITY AS pts(p, ord))));
  END IF;

  -- client_key is unique across all companies and name is unique per company,
  -- so look the row up inside the caller's company instead of ON CONFLICT.
  IF key_value IS NOT NULL THEN
    SELECT t.* INTO saved FROM tips_crm.territories t
    WHERE t.company_id = actor_company AND t.client_key = key_value
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Territory not found'; END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM tips_crm.territories t
             WHERE t.company_id = actor_company AND lower(t.name) = lower(trim(input_name))
               AND (saved.id IS NULL OR t.id <> saved.id)) THEN
    RAISE EXCEPTION 'Territory already exists with this name';
  END IF;

  IF saved.id IS NULL THEN
    INSERT INTO tips_crm.territories(company_id, client_key, name, state, city, center_latitude, center_longitude, radius_meters, boundary_geojson, created_by, updated_at)
    VALUES (actor_company, 't-' || substr(md5(random()::text || clock_timestamp()::text), 1, 12), trim(input_name), trim(input_state), trim(input_city),
            input_center_latitude, input_center_longitude, input_radius_meters, polygon_geojson, auth.uid(), now())
    RETURNING * INTO saved;
  ELSE
    UPDATE tips_crm.territories
    SET name = trim(input_name), state = trim(input_state), city = trim(input_city),
        center_latitude = input_center_latitude, center_longitude = input_center_longitude,
        radius_meters = input_radius_meters, boundary_geojson = polygon_geojson, is_active = true, updated_at = now()
    WHERE id = saved.id
    RETURNING * INTO saved;
  END IF;

  PERFORM tips_crm.log_audit('territory_saved', 'territory', saved.id::text, jsonb_build_object('name', saved.name, 'client_key', saved.client_key));
  RETURN QUERY SELECT * FROM tips_crm.territory_setup_row(saved);
END;
$$;

-- 3. Account import ---------------------------------------------------------------------
-- input_accounts: [{local_ref, name, account_type, specialty, state, city, area, address, phone, territory_key}]
CREATE OR REPLACE FUNCTION public.tips_crm_import_company_accounts(input_accounts jsonb)
RETURNS TABLE(item_key text, status text, account_id uuid, account_name text, message text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  item jsonb;
  ref text; acc_name text; acc_type text; acc_city text; acc_state text;
  existing_id uuid; territory uuid; new_id uuid;
BEGIN
  IF actor_company IS NULL OR NOT (tips_crm.has_perm('account.import') OR tips_crm.has_permission('manage_accounts')) THEN
    RAISE EXCEPTION 'Account import permission required';
  END IF;
  IF jsonb_typeof(input_accounts) <> 'array' OR jsonb_array_length(input_accounts) > 500 THEN
    RAISE EXCEPTION 'Provide up to 500 accounts';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(input_accounts) LOOP
    ref := nullif(trim(item->>'local_ref'), '');
    acc_name := trim(coalesce(item->>'name', ''));
    acc_type := lower(trim(coalesce(item->>'account_type', '')));
    acc_state := trim(coalesce(item->>'state', ''));
    acc_city := trim(coalesce(item->>'city', ''));

    IF acc_name = '' OR acc_state = '' OR acc_city = '' OR acc_type NOT IN ('doctor', 'pharmacy', 'hospital', 'distributor') THEN
      item_key := coalesce(ref, acc_name); status := 'rejected'; account_id := NULL; account_name := acc_name;
      message := 'بيانات ناقصة أو نوع جهة غير صالح.';
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT t.id INTO territory FROM tips_crm.territories t
    WHERE t.company_id = actor_company AND t.client_key = nullif(trim(item->>'territory_key'), '') LIMIT 1;

    existing_id := NULL;
    IF ref IS NOT NULL THEN
      SELECT a.id INTO existing_id FROM tips_crm.accounts a WHERE a.company_id = actor_company AND a.local_ref = ref LIMIT 1;
    END IF;

    IF existing_id IS NOT NULL THEN
      UPDATE tips_crm.accounts SET name = acc_name, account_type = acc_type, specialty = nullif(trim(item->>'specialty'), ''),
        state = acc_state, city = acc_city, area = nullif(trim(item->>'area'), ''), address = nullif(trim(item->>'address'), ''),
        phone = nullif(trim(item->>'phone'), ''), territory_id = coalesce(territory, territory_id), updated_at = now()
      WHERE id = existing_id;
      item_key := ref; status := 'updated'; account_id := existing_id; account_name := acc_name; message := 'تم تحديث الجهة.';
      RETURN NEXT; CONTINUE;
    END IF;

    SELECT a.id INTO existing_id FROM tips_crm.accounts a
    WHERE a.company_id = actor_company AND a.account_type = acc_type
      AND lower(a.name) = lower(acc_name) AND lower(a.city) = lower(acc_city) LIMIT 1;
    IF existing_id IS NOT NULL THEN
      item_key := coalesce(ref, acc_name); status := 'duplicate'; account_id := existing_id; account_name := acc_name;
      message := 'الجهة موجودة مسبقاً بنفس الاسم والمدينة.';
      RETURN NEXT; CONTINUE;
    END IF;

    INSERT INTO tips_crm.accounts(company_id, account_type, name, specialty, state, city, area, address, phone, local_ref, territory_id, created_by)
    VALUES (actor_company, acc_type, acc_name, nullif(trim(item->>'specialty'), ''), acc_state, acc_city,
            nullif(trim(item->>'area'), ''), nullif(trim(item->>'address'), ''), nullif(trim(item->>'phone'), ''),
            coalesce(ref, 'import-' || substr(md5(random()::text), 1, 12)), territory, auth.uid())
    RETURNING id INTO new_id;
    item_key := coalesce(ref, acc_name); status := 'created'; account_id := new_id; account_name := acc_name; message := 'تمت إضافة الجهة.';
    RETURN NEXT;
  END LOOP;

  PERFORM tips_crm.log_audit('accounts_imported', 'account', NULL, jsonb_build_object('rows', jsonb_array_length(input_accounts)));
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_get_company_team_setup() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_get_company_territory_setup() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_save_company_territory(text, text, text, text, numeric, numeric, integer, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_import_company_accounts(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_get_company_team_setup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_get_company_territory_setup() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_company_territory(text, text, text, text, numeric, numeric, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_import_company_accounts(jsonb) TO authenticated;
