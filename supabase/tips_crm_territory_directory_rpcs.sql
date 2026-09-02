-- Restore the territory directory contract used by the mobile setup and employee-account flows.
-- Every read and write is scoped to the actor's active company.

CREATE OR REPLACE FUNCTION public.tips_crm_list_territories()
RETURNS TABLE(
  id uuid,
  client_key text,
  name text,
  state text,
  city text,
  center_latitude numeric,
  center_longitude numeric,
  radius_meters integer,
  boundary_geojson jsonb,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE actor_company_id uuid;
BEGIN
  actor_company_id := tips_crm.current_actor_company_id();
  IF actor_company_id IS NULL THEN
    RAISE EXCEPTION 'Active company is required';
  END IF;
  IF NOT tips_crm.has_permission('view_team_data')
     AND NOT tips_crm.has_permission('manage_territories')
     AND NOT EXISTS (
       SELECT 1
       FROM tips_crm.territory_assignments a
       JOIN tips_crm.territories assigned_territory ON assigned_territory.id = a.territory_id
       WHERE a.profile_id = auth.uid()
         AND a.company_id = actor_company_id
         AND assigned_territory.company_id = actor_company_id
     ) THEN
    RAISE EXCEPTION 'Territory access permission required';
  END IF;

  RETURN QUERY
  SELECT t.id, t.client_key, t.name, t.state, t.city,
         t.center_latitude, t.center_longitude, t.radius_meters,
         t.boundary_geojson, t.is_active, t.created_at, t.updated_at
  FROM tips_crm.territories t
  WHERE t.company_id = actor_company_id
    AND t.is_active
    AND (
      tips_crm.has_permission('view_team_data')
      OR tips_crm.has_permission('manage_territories')
      OR EXISTS (
        SELECT 1
        FROM tips_crm.territory_assignments a
        WHERE a.territory_id = t.id
          AND a.profile_id = auth.uid()
      )
    )
  ORDER BY t.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_upsert_territory(
  territory_key text,
  territory_name text,
  territory_state text,
  territory_city text,
  center_latitude_input numeric,
  center_longitude_input numeric,
  radius_meters_input integer,
  polygon_points_input jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company_id uuid;
  territory_id uuid;
  polygon_geojson jsonb := NULL;
BEGIN
  actor_company_id := tips_crm.current_actor_company_id();
  IF actor_company_id IS NULL THEN
    RAISE EXCEPTION 'Active company is required';
  END IF;
  IF NOT tips_crm.has_permission('manage_territories') THEN
    RAISE EXCEPTION 'Territory management permission required';
  END IF;
  IF NULLIF(trim(territory_key), '') IS NULL
     OR NULLIF(trim(territory_name), '') IS NULL
     OR NULLIF(trim(territory_state), '') IS NULL
     OR NULLIF(trim(territory_city), '') IS NULL THEN
    RAISE EXCEPTION 'Territory identity is required';
  END IF;
  IF center_latitude_input IS NULL OR center_latitude_input < -90 OR center_latitude_input > 90
     OR center_longitude_input IS NULL OR center_longitude_input < -180 OR center_longitude_input > 180 THEN
    RAISE EXCEPTION 'Territory coordinates are invalid';
  END IF;
  IF radius_meters_input IS NULL OR radius_meters_input <= 0 THEN
    RAISE EXCEPTION 'Territory radius must be positive';
  END IF;
  IF jsonb_typeof(coalesce(polygon_points_input, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'Polygon points must be an array';
  END IF;

  IF jsonb_array_length(coalesce(polygon_points_input, '[]'::jsonb)) >= 3 THEN
    polygon_geojson := jsonb_build_object(
      'type', 'Polygon',
      'coordinates', jsonb_build_array(
        (
          SELECT jsonb_agg(jsonb_build_array((point->>'longitude')::numeric, (point->>'latitude')::numeric) ORDER BY ord)
          FROM jsonb_array_elements(polygon_points_input) WITH ORDINALITY AS points(point, ord)
        )
      )
    );
  END IF;

  SELECT t.id INTO territory_id
  FROM tips_crm.territories t
  WHERE t.company_id = actor_company_id
    AND t.client_key = trim(territory_key)
  FOR UPDATE;

  IF territory_id IS NULL THEN
    INSERT INTO tips_crm.territories(
      company_id, client_key, name, state, city, center_latitude,
      center_longitude, radius_meters, boundary_geojson, created_by, updated_at
    )
    VALUES (
      actor_company_id, trim(territory_key), trim(territory_name), trim(territory_state), trim(territory_city),
      center_latitude_input, center_longitude_input, radius_meters_input, polygon_geojson, auth.uid(), now()
    )
    RETURNING id INTO territory_id;
  ELSE
    UPDATE tips_crm.territories
    SET name = trim(territory_name),
        state = trim(territory_state),
        city = trim(territory_city),
        center_latitude = center_latitude_input,
        center_longitude = center_longitude_input,
        radius_meters = radius_meters_input,
        boundary_geojson = polygon_geojson,
        is_active = true,
        updated_at = now()
    WHERE id = territory_id;
  END IF;

  RETURN territory_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tips_crm_list_territories() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_upsert_territory(text, text, text, text, numeric, numeric, integer, jsonb) TO authenticated;
