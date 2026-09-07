-- ==============================================================================
-- Tips CRM: Multi-Tenant Company Data Isolation Migration
-- Paste this script into your Supabase Dashboard -> SQL Editor and click RUN.
-- ==============================================================================

-- 0. Drop existing RPC functions first to avoid return-type mismatch errors
DROP FUNCTION IF EXISTS public.tips_crm_list_territories CASCADE;
DROP FUNCTION IF EXISTS tips_crm.tips_crm_list_territories CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_my_profile CASCADE;
DROP FUNCTION IF EXISTS tips_crm.tips_crm_my_profile CASCADE;

-- 1. Helper function to get current user's active company id
CREATE OR REPLACE FUNCTION tips_crm.my_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT active_company_id FROM tips_crm.profiles WHERE id = auth.uid();
$$;

-- 2. Helper function to check if current user is a global platform admin
CREATE OR REPLACE FUNCTION tips_crm.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM tips_crm.profiles WHERE id = auth.uid()), false);
$$;

REVOKE ALL ON FUNCTION tips_crm.my_company_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION tips_crm.is_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.my_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION tips_crm.is_platform_admin() TO authenticated, service_role;

-- 3. Ensure company_id and client_key exist on all tenant tables
ALTER TABLE tips_crm.territories ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES tips_crm.companies(id) ON DELETE CASCADE;
ALTER TABLE tips_crm.territories ADD COLUMN IF NOT EXISTS client_key text;
ALTER TABLE tips_crm.accounts ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES tips_crm.companies(id) ON DELETE CASCADE;
ALTER TABLE tips_crm.plans ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES tips_crm.companies(id) ON DELETE CASCADE;
ALTER TABLE tips_crm.team_invites ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES tips_crm.companies(id) ON DELETE CASCADE;
ALTER TABLE tips_crm.visit_outcomes ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES tips_crm.companies(id) ON DELETE CASCADE;

-- 4. Backfill existing data using creator/owner profile's company
UPDATE tips_crm.territories t
SET company_id = p.active_company_id
FROM tips_crm.profiles p
WHERE p.id = t.created_by AND t.company_id IS NULL AND p.active_company_id IS NOT NULL;

UPDATE tips_crm.accounts a
SET company_id = p.active_company_id
FROM tips_crm.profiles p
WHERE p.id = a.created_by AND a.company_id IS NULL AND p.active_company_id IS NOT NULL;

UPDATE tips_crm.plans pl
SET company_id = p.active_company_id
FROM tips_crm.profiles p
WHERE p.id = pl.owner_id AND pl.company_id IS NULL AND p.active_company_id IS NOT NULL;

UPDATE tips_crm.team_invites i
SET company_id = p.active_company_id
FROM tips_crm.profiles p
WHERE p.id = i.invited_by AND i.company_id IS NULL AND p.active_company_id IS NOT NULL;

UPDATE tips_crm.visit_outcomes o
SET company_id = p.active_company_id
FROM tips_crm.profiles p
WHERE p.id = o.created_by AND o.company_id IS NULL AND p.active_company_id IS NOT NULL;

-- 5. Strict Company-Scoped RLS Policies

-- Territories
DROP POLICY IF EXISTS territories_read ON tips_crm.territories;
DROP POLICY IF EXISTS territories_manage ON tips_crm.territories;

CREATE POLICY territories_read ON tips_crm.territories
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (tips_crm.has_permission('view_team_data') OR tips_crm.in_assigned_territory(id))
  )
);

CREATE POLICY territories_manage ON tips_crm.territories
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_permission('manage_territories')
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_permission('manage_territories')
  )
);

-- Accounts
DROP POLICY IF EXISTS accounts_read ON tips_crm.accounts;
DROP POLICY IF EXISTS accounts_write ON tips_crm.accounts;

CREATE POLICY accounts_read ON tips_crm.accounts
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      tips_crm.has_permission('view_team_data')
      OR created_by = auth.uid()
      OR tips_crm.in_assigned_territory(territory_id)
    )
  )
);

CREATE POLICY accounts_write ON tips_crm.accounts
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      tips_crm.has_permission('manage_accounts')
      OR tips_crm.in_assigned_territory(territory_id)
    )
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      tips_crm.has_permission('manage_accounts')
      OR tips_crm.in_assigned_territory(territory_id)
    )
  )
);

-- Plans
DROP POLICY IF EXISTS plans_read ON tips_crm.plans;
DROP POLICY IF EXISTS plans_write ON tips_crm.plans;

CREATE POLICY plans_read ON tips_crm.plans
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      owner_id = auth.uid()
      OR tips_crm.has_permission('view_team_data')
    )
  )
);

CREATE POLICY plans_write ON tips_crm.plans
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      owner_id = auth.uid()
      OR tips_crm.has_permission('approve_plans')
    )
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      owner_id = auth.uid()
      OR tips_crm.has_permission('approve_plans')
    )
  )
);

-- Team Invites
DROP POLICY IF EXISTS invites_manage ON tips_crm.team_invites;
DROP POLICY IF EXISTS invites_read ON tips_crm.team_invites;

CREATE POLICY invites_read ON tips_crm.team_invites
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_permission('manage_users')
  )
);

CREATE POLICY invites_manage ON tips_crm.team_invites
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_permission('manage_users')
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_permission('manage_users')
  )
);

-- Visit Outcomes
DROP POLICY IF EXISTS visit_outcomes_read ON tips_crm.visit_outcomes;
DROP POLICY IF EXISTS visit_outcomes_manage ON tips_crm.visit_outcomes;

CREATE POLICY visit_outcomes_read ON tips_crm.visit_outcomes
FOR SELECT TO authenticated
USING (
  (company_id IS NULL OR company_id = tips_crm.my_company_id())
  AND (is_active OR tips_crm.has_permission('manage_outcomes'))
);

CREATE POLICY visit_outcomes_manage ON tips_crm.visit_outcomes
FOR ALL TO authenticated
USING (
  company_id = tips_crm.my_company_id()
  AND tips_crm.has_permission('manage_outcomes')
)
WITH CHECK (
  company_id = tips_crm.my_company_id()
  AND tips_crm.has_permission('manage_outcomes')
);

-- 6. Update tips_crm_my_profile to return active company details
CREATE OR REPLACE FUNCTION public.tips_crm_my_profile()
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  is_active boolean,
  must_change_password boolean,
  is_platform_admin boolean,
  active_company_id uuid,
  active_company_name text,
  active_company_slug text,
  reports_to_profile_id uuid,
  territory_key text,
  territory_label text,
  territory_keys text[],
  territory_labels text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.role_key,
    r.display_name,
    r.permissions,
    p.is_active,
    p.must_change_password,
    p.is_platform_admin,
    p.active_company_id,
    c.name,
    c.slug,
    (
      SELECT m2.profile_id
      FROM tips_crm.company_memberships m2
      JOIN tips_crm.profiles mgr ON mgr.id = m2.profile_id
      JOIN tips_crm.roles mgr_role ON mgr_role.key = mgr.role_key
      WHERE m2.company_id = p.active_company_id
        AND m2.is_active
        AND mgr.id <> p.id
        AND (
          mgr_role.permissions @> ARRAY['approve_plans']::text[]
          OR 'all' = ANY(mgr_role.permissions)
        )
      LIMIT 1
    ) AS reports_to_profile_id,
    (
      SELECT t.client_key
      FROM tips_crm.territory_assignments ta
      JOIN tips_crm.territories t ON t.id = ta.territory_id
      WHERE ta.profile_id = p.id
      LIMIT 1
    ) AS territory_key,
    (
      SELECT t.name
      FROM tips_crm.territory_assignments ta
      JOIN tips_crm.territories t ON t.id = ta.territory_id
      WHERE ta.profile_id = p.id
      LIMIT 1
    ) AS territory_label,
    ARRAY(
      SELECT t.client_key
      FROM tips_crm.territory_assignments ta
      JOIN tips_crm.territories t ON t.id = ta.territory_id
      WHERE ta.profile_id = p.id
        AND t.client_key IS NOT NULL
    ) AS territory_keys,
    ARRAY(
      SELECT t.name
      FROM tips_crm.territory_assignments ta
      JOIN tips_crm.territories t ON t.id = ta.territory_id
      WHERE ta.profile_id = p.id
    ) AS territory_labels
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  LEFT JOIN tips_crm.companies c ON c.id = p.active_company_id
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated, service_role;

-- 7. Update tips_crm_list_territories RPC with actual schema columns
CREATE OR REPLACE FUNCTION public.tips_crm_list_territories()
RETURNS TABLE (
  id uuid,
  company_id uuid,
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT
    t.id,
    t.company_id,
    COALESCE(t.client_key, t.id::text) AS client_key,
    t.name,
    t.state,
    t.city,
    t.center_latitude,
    t.center_longitude,
    t.radius_meters,
    t.boundary_geojson,
    t.is_active,
    t.created_at,
    t.updated_at
  FROM tips_crm.territories t
  WHERE (tips_crm.is_platform_admin() OR t.company_id = tips_crm.my_company_id())
    AND t.is_active = true;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_territories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_territories() TO authenticated, service_role;

-- 8. Ensure tips_crm_list_roles never returns platform admin to company managers
CREATE OR REPLACE FUNCTION public.tips_crm_list_roles()
RETURNS TABLE (
  key text,
  display_name text,
  description text,
  permissions text[],
  is_system boolean,
  is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;

  RETURN QUERY
  SELECT
    r.key,
    r.display_name,
    r.description,
    r.permissions,
    r.is_system,
    r.is_active
  FROM tips_crm.roles r
  WHERE r.key NOT IN ('admin', 'platform_admin')
    AND r.display_name NOT ILIKE '%منصة%'
  ORDER BY r.is_system DESC, r.display_name;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_roles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_roles() TO authenticated, service_role;
