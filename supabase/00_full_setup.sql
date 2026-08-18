-- ==========================================================
-- TIPS CRM COMPLETE DATABASE SETUP SCRIPT (100% IDEMPOTENT & SAFE)
-- ==========================================================

CREATE SCHEMA IF NOT EXISTS tips_crm;
REVOKE ALL ON SCHEMA tips_crm FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA tips_crm TO authenticated, service_role;

-- Safely drop all existing tips_crm functions across all overloaded signatures
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.oid::regprocedure AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE (n.nspname = 'tips_crm' OR (n.nspname = 'public' AND p.proname LIKE 'tips_crm_%'))
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE;';
    END LOOP;
END $$;



-- ==========================================
-- MODULE: tips_crm_schema.sql
-- ==========================================

CREATE SCHEMA IF NOT EXISTS tips_crm;
GRANT USAGE ON SCHEMA tips_crm TO anon, authenticated, service_role, postgres, supabase_admin, supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, service_role, supabase_admin, supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, service_role, supabase_admin, supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, service_role, supabase_admin, supabase_auth_admin;

CREATE TABLE IF NOT EXISTS tips_crm.roles (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}'::text[],
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  role_key text NOT NULL REFERENCES tips_crm.roles(key),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.team_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role_key text NOT NULL REFERENCES tips_crm.roles(key),
  territory_label text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  invite_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  invited_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.territories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  state text NOT NULL,
  city text NOT NULL,
  center_latitude numeric(9,6),
  center_longitude numeric(9,6),
  radius_meters integer CHECK (radius_meters > 0),
  boundary_geojson jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.territory_assignments (
  territory_id uuid NOT NULL REFERENCES tips_crm.territories(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (territory_id, profile_id)
);

CREATE TABLE IF NOT EXISTS tips_crm.accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  territory_id uuid REFERENCES tips_crm.territories(id),
  account_type text NOT NULL CHECK (account_type IN ('doctor', 'pharmacy', 'hospital', 'distributor')),
  name text NOT NULL,
  specialty text,
  state text NOT NULL,
  city text NOT NULL,
  area text,
  address text,
  phone text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES tips_crm.profiles(id),
  territory_id uuid REFERENCES tips_crm.territories(id),
  title text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('weekly', 'monthly')),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'approved', 'returned')),
  manager_note text,
  approved_by uuid REFERENCES tips_crm.profiles(id),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS tips_crm.plan_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES tips_crm.plans(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES tips_crm.accounts(id),
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_visit_id uuid REFERENCES tips_crm.plan_visits(id),
  rep_id uuid NOT NULL REFERENCES tips_crm.profiles(id),
  account_id uuid NOT NULL REFERENCES tips_crm.accounts(id),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'needs_review')),
  outcome text,
  notes text,
  checked_in_at timestamptz,
  check_in_latitude numeric(9,6),
  check_in_longitude numeric(9,6),
  location_accuracy_meters integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.duty_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  tracking_consent_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.duty_location_points (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES tips_crm.duty_sessions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id),
  latitude numeric(9,6) NOT NULL,
  longitude numeric(9,6) NOT NULL,
  accuracy_meters integer,
  speed_meters_per_second numeric(8,2),
  source text NOT NULL CHECK (source IN ('foreground', 'background')),
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan', 'visit', 'alert', 'team', 'duty')),
  read_at timestamptz,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS duty_location_points_profile_time_idx ON tips_crm.duty_location_points(profile_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS visits_rep_time_idx ON tips_crm.visits(rep_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS plans_owner_dates_idx ON tips_crm.plans(owner_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS notifications_recipient_time_idx ON tips_crm.notifications(recipient_id, created_at DESC);

INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system) VALUES
  ('system_admin', 'مدير النظام', 'إدارة الأدوار والمستخدمين وكامل إعدادات الشركة.', ARRAY['all'], true),
  ('sales_manager', 'مدير المبيعات', 'متابعة الفريق واعتماد الخطط وإدارة المناطق.', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'manage_accounts', 'send_notifications'], true),
  ('sales_rep', 'مندوب مبيعات', 'إدارة خطة وزيارات البيع الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true),
  ('medical_rep', 'مندوب طبي', 'إدارة خطة وزيارات الأطباء والعيادات الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true)
ON CONFLICT (key) DO NOTHING;

DROP FUNCTION IF EXISTS tips_crm.has_permission CASCADE;
DROP FUNCTION IF EXISTS tips_crm.has_permission() CASCADE;
CREATE OR REPLACE FUNCTION tips_crm.has_permission(required_permission text) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT COALESCE((
    SELECT p.is_active AND r.is_active AND ('all' = ANY(r.permissions) OR required_permission = ANY(r.permissions))
    FROM tips_crm.profiles p
    JOIN tips_crm.roles r ON r.key = p.role_key
    WHERE p.id = auth.uid()
  ), false);
$$;

DROP FUNCTION IF EXISTS tips_crm.in_assigned_territory CASCADE;
DROP FUNCTION IF EXISTS tips_crm.in_assigned_territory() CASCADE;
CREATE OR REPLACE FUNCTION tips_crm.in_assigned_territory(required_territory uuid) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT tips_crm.has_permission('view_team_data') OR EXISTS (
    SELECT 1 FROM tips_crm.territory_assignments a
    WHERE a.territory_id = required_territory AND a.profile_id = auth.uid()
  );
$$;

REVOKE ALL ON ALL TABLES IN SCHEMA tips_crm FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tips_crm TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tips_crm TO authenticated, service_role;

ALTER TABLE tips_crm.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.team_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.territories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.territory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.plan_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.duty_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.duty_location_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles_read" ON tips_crm.roles;
CREATE POLICY roles_read ON tips_crm.roles FOR SELECT TO authenticated USING (is_active OR tips_crm.has_permission('manage_roles'));
DROP POLICY IF EXISTS "roles_manage" ON tips_crm.roles;
CREATE POLICY roles_manage ON tips_crm.roles FOR ALL TO authenticated USING (tips_crm.has_permission('manage_roles')) WITH CHECK (tips_crm.has_permission('manage_roles'));
DROP POLICY IF EXISTS "profiles_read" ON tips_crm.profiles;
CREATE POLICY profiles_read ON tips_crm.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "profiles_manage" ON tips_crm.profiles;
CREATE POLICY profiles_manage ON tips_crm.profiles FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS "invites_manage" ON tips_crm.team_invites;
CREATE POLICY invites_manage ON tips_crm.team_invites FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS "territories_read" ON tips_crm.territories;
CREATE POLICY territories_read ON tips_crm.territories FOR SELECT TO authenticated USING (tips_crm.in_assigned_territory(id));
DROP POLICY IF EXISTS "territories_manage" ON tips_crm.territories;
CREATE POLICY territories_manage ON tips_crm.territories FOR ALL TO authenticated USING (tips_crm.has_permission('manage_territories')) WITH CHECK (tips_crm.has_permission('manage_territories'));
DROP POLICY IF EXISTS "assignments_read" ON tips_crm.territory_assignments;
CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "assignments_manage" ON tips_crm.territory_assignments;
CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated USING (tips_crm.has_permission('manage_territories')) WITH CHECK (tips_crm.has_permission('manage_territories'));
DROP POLICY IF EXISTS "accounts_read" ON tips_crm.accounts;
CREATE POLICY accounts_read ON tips_crm.accounts FOR SELECT TO authenticated USING (tips_crm.in_assigned_territory(territory_id));
DROP POLICY IF EXISTS "accounts_write" ON tips_crm.accounts;
CREATE POLICY accounts_write ON tips_crm.accounts FOR ALL TO authenticated USING (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id)) WITH CHECK (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id));
DROP POLICY IF EXISTS "plans_read" ON tips_crm.plans;
CREATE POLICY plans_read ON tips_crm.plans FOR SELECT TO authenticated USING (owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "plans_write" ON tips_crm.plans;
CREATE POLICY plans_write ON tips_crm.plans FOR ALL TO authenticated USING (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')) WITH CHECK (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'));
DROP POLICY IF EXISTS "plan_visits_read" ON tips_crm.plan_visits;
CREATE POLICY plan_visits_read ON tips_crm.plan_visits FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'))));
DROP POLICY IF EXISTS "plan_visits_write" ON tips_crm.plan_visits;
CREATE POLICY plan_visits_write ON tips_crm.plan_visits FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')))) WITH CHECK (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))));
DROP POLICY IF EXISTS "visits_read" ON tips_crm.visits;
CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated USING (rep_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "visits_write" ON tips_crm.visits;
CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated USING (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')) WITH CHECK (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans'));
DROP POLICY IF EXISTS "duty_sessions_read" ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "duty_sessions_write" ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_write ON tips_crm.duty_sessions FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "duty_points_read" ON tips_crm.duty_location_points;
CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "duty_points_write" ON tips_crm.duty_location_points;
CREATE POLICY duty_points_write ON tips_crm.duty_location_points FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS "notifications_read" ON tips_crm.notifications;
CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS "notifications_update" ON tips_crm.notifications;
CREATE POLICY notifications_update ON tips_crm.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_send" ON tips_crm.notifications;
CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated WITH CHECK (tips_crm.has_permission('send_notifications'));

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm GRANT ALL ON TABLES TO service_role;


-- ==========================================
-- MODULE: tips_crm_auth.sql
-- ==========================================

-- Grant permissions to Supabase internal auth admin roles
GRANT USAGE ON SCHEMA tips_crm TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, service_role;

-- Drop any orphan triggers on auth.users from older migrations/schemas
DROP TRIGGER IF EXISTS tips_crm_after_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

DROP FUNCTION IF EXISTS tips_crm.handle_auth_user_created CASCADE;
DROP FUNCTION IF EXISTS tips_crm.handle_auth_user_created() CASCADE;
CREATE OR REPLACE FUNCTION tips_crm.handle_auth_user_created() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system)
  VALUES ('sales_rep', 'مندوب مبيعات', 'المسؤول الميداني للزيارات والمبيعات', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true)
  ON CONFLICT (key) DO NOTHING;

  INSERT INTO tips_crm.profiles (id, full_name, email, role_key)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''), NEW.email, 'موظف Tips'),
    NEW.email,
    'sales_rep'
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tips_crm_after_auth_user_created ON auth.users;
CREATE TRIGGER tips_crm_after_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION tips_crm.handle_auth_user_created();

DROP FUNCTION IF EXISTS public.tips_crm_my_profile CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_my_profile() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_my_profile() RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.full_name, p.email, p.role_key, r.display_name, r.permissions, p.is_active
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION tips_crm.handle_auth_user_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated, service_role;


-- ==========================================
-- MODULE: tips_crm_first_admin_bootstrap.sql
-- ==========================================

DROP FUNCTION IF EXISTS public.tips_crm_claim_first_system_admin CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_claim_first_system_admin() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_claim_first_system_admin() RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  account_name text;
  account_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF EXISTS (SELECT 1 FROM tips_crm.profiles WHERE role_key = 'system_admin') THEN RETURN false; END IF;

  SELECT COALESCE(NULLIF(raw_user_meta_data ->> 'full_name', ''), email, 'مدير Tips'), email
  INTO account_name, account_email
  FROM auth.users WHERE id = auth.uid();

  IF account_email IS NULL THEN RAISE EXCEPTION 'Authenticated account not found'; END IF;

  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active)
  VALUES (auth.uid(), account_name, account_email, 'system_admin', true)
  ON CONFLICT (id) DO UPDATE SET role_key = 'system_admin', is_active = true, updated_at = now();
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_claim_first_system_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_claim_first_system_admin() TO authenticated;


-- ==========================================
-- MODULE: tips_crm_roles_rpc.sql
-- ==========================================

DROP FUNCTION IF EXISTS public.tips_crm_claim_first_system_admin CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_claim_first_system_admin() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_claim_first_system_admin() RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF EXISTS (SELECT 1 FROM tips_crm.profiles WHERE role_key = 'system_admin') THEN
    RETURN false;
  END IF;
  UPDATE tips_crm.profiles SET role_key = 'system_admin', is_active = true WHERE id = auth.uid();
  RETURN FOUND;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_list_roles CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_roles() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_roles() RETURNS TABLE (key text, display_name text, description text, permissions text[], is_system boolean, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;
  RETURN QUERY SELECT r.key, r.display_name, r.description, r.permissions, r.is_system, r.is_active FROM tips_crm.roles r ORDER BY r.is_system DESC, r.display_name;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_save_role CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_save_role() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_save_role(role_key text, role_name text, role_description text, role_permissions text[], role_active boolean DEFAULT true) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;
  IF role_key !~ '^[a-z][a-z0-9_]{2,60}$' THEN
    RAISE EXCEPTION 'Invalid role key';
  END IF;
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active)
  VALUES (role_key, role_name, role_description, COALESCE(role_permissions, '{}'::text[]), false, role_active)
  ON CONFLICT (key) DO UPDATE SET display_name = EXCLUDED.display_name, description = EXCLUDED.description, permissions = EXCLUDED.permissions, is_active = CASE WHEN tips_crm.roles.is_system THEN tips_crm.roles.is_active ELSE EXCLUDED.is_active END, updated_at = now();
  RETURN role_key;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_deactivate_role CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_deactivate_role() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_deactivate_role(role_key text) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_roles') THEN
    RAISE EXCEPTION 'Role management permission required';
  END IF;
  UPDATE tips_crm.roles SET is_active = false, updated_at = now() WHERE key = role_key AND NOT is_system;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_claim_first_system_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_roles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_role(text, text, text, text[], boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_deactivate_role(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_claim_first_system_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_roles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_role(text, text, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_deactivate_role(text) TO authenticated;


-- ==========================================
-- MODULE: tips_crm_catalog_and_invites.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS tips_crm.visit_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tips_crm.visit_outcomes (label, sort_order)
VALUES ('متابعة', 10), ('تم إنشاء فاتورة', 20), ('تم تحصيل', 30), ('لا يوجد قرار', 40)
ON CONFLICT (label) DO NOTHING;

ALTER TABLE tips_crm.visit_outcomes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "visit_outcomes_read" ON tips_crm.visit_outcomes;
CREATE POLICY visit_outcomes_read ON tips_crm.visit_outcomes FOR SELECT TO authenticated USING (is_active OR tips_crm.has_permission('manage_outcomes'));
DROP POLICY IF EXISTS "visit_outcomes_manage" ON tips_crm.visit_outcomes;
CREATE POLICY visit_outcomes_manage ON tips_crm.visit_outcomes FOR ALL TO authenticated USING (tips_crm.has_permission('manage_outcomes')) WITH CHECK (tips_crm.has_permission('manage_outcomes'));

UPDATE tips_crm.roles
SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['manage_outcomes', 'export_reports']))
WHERE key IN ('system_admin', 'sales_manager');

DROP FUNCTION IF EXISTS public.tips_crm_list_invites CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_invites() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_invites() RETURNS TABLE(id uuid, email text, role_key text, territory_label text, status text, invite_token text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT i.id, i.email, i.role_key, i.territory_label, i.status, i.invite_token, i.expires_at, i.created_at FROM tips_crm.team_invites i ORDER BY i.created_at DESC;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_resend_invite CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_resend_invite() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_resend_invite(invite_id uuid) RETURNS TABLE(invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE resent tips_crm.team_invites%ROWTYPE; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'pending', invite_token = encode(gen_random_bytes(24), 'hex'), expires_at = now() + interval '7 days' WHERE id = invite_id AND status <> 'accepted' RETURNING * INTO resent;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be resent'; END IF;
  PERFORM tips_crm.log_audit('invite_resent', 'team_invite', resent.id::text, jsonb_build_object('email', resent.email));
  RETURN QUERY SELECT resent.invite_token, resent.expires_at;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_revoke_invite CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_revoke_invite() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_revoke_invite(invite_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE revoked_email text; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  UPDATE tips_crm.team_invites SET status = 'revoked' WHERE id = invite_id AND status = 'pending' RETURNING email INTO revoked_email;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM tips_crm.log_audit('invite_revoked', 'team_invite', invite_id::text, jsonb_build_object('email', revoked_email));
  RETURN true;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_list_accounts CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_accounts() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_accounts() RETURNS TABLE(id uuid, account_type text, name text, specialty text, state text, city text, area text, address text, phone text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT a.id, a.account_type, a.name, a.specialty, a.state, a.city, a.area, a.address, a.phone, a.created_at FROM tips_crm.accounts a WHERE a.created_by = auth.uid() OR tips_crm.has_permission('view_team_data') ORDER BY a.updated_at DESC;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_list_visit_outcomes CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_visit_outcomes() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_visit_outcomes() RETURNS TABLE(id uuid, label text, is_active boolean, sort_order integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ SELECT o.id, o.label, o.is_active, o.sort_order FROM tips_crm.visit_outcomes o WHERE o.is_active OR tips_crm.has_permission('manage_outcomes') ORDER BY o.sort_order, o.label; $$;

DROP FUNCTION IF EXISTS public.tips_crm_save_visit_outcome CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_save_visit_outcome() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_save_visit_outcome(outcome_label text, outcome_sort_order integer DEFAULT 0) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE outcome_id uuid; BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN RAISE EXCEPTION 'Outcome management permission required'; END IF;
  INSERT INTO tips_crm.visit_outcomes(label, sort_order, created_by) VALUES (trim(outcome_label), outcome_sort_order, auth.uid()) ON CONFLICT (label) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order, updated_at = now() RETURNING id INTO outcome_id;
  PERFORM tips_crm.log_audit('visit_outcome_saved', 'visit_outcome', outcome_id::text, jsonb_build_object('label', trim(outcome_label)));
  RETURN outcome_id;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed() RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN RAISE EXCEPTION 'Export permission required'; END IF;
  RETURN QUERY
    SELECT 'plan', p.created_at, owner.full_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit', v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, '') FROM tips_crm.visits v JOIN tips_crm.profiles rep ON rep.id = v.rep_id JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit', a.created_at, coalesce(p.full_name, 'النظام'), a.action, a.entity_type, a.details::text FROM tips_crm.audit_log a LEFT JOIN tips_crm.profiles p ON p.id = a.actor_id
    ORDER BY occurred_at DESC LIMIT 1000;
END; $$;

REVOKE ALL ON FUNCTION public.tips_crm_list_invites() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_resend_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_revoke_invite(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_accounts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_visit_outcomes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_visit_outcome(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_invites() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_resend_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_revoke_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_visit_outcomes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_visit_outcome(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed() TO authenticated;


-- ==========================================
-- MODULE: tips_crm_operations.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS tips_crm.audit_log (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES tips_crm.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON tips_crm.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON tips_crm.audit_log(actor_id, created_at DESC);
ALTER TABLE tips_crm.audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "audit_log_read" ON tips_crm.audit_log;
CREATE POLICY audit_log_read ON tips_crm.audit_log FOR SELECT TO authenticated USING (tips_crm.has_permission('view_team_data'));

DROP FUNCTION IF EXISTS tips_crm.log_audit CASCADE;
DROP FUNCTION IF EXISTS tips_crm.log_audit() CASCADE;
CREATE OR REPLACE FUNCTION tips_crm.log_audit(log_action text, log_entity_type text, log_entity_id text, log_details jsonb DEFAULT '{}'::jsonb) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  INSERT INTO tips_crm.audit_log (actor_id, action, entity_type, entity_id, details)
  VALUES (auth.uid(), log_action, log_entity_type, log_entity_id, COALESCE(log_details, '{}'::jsonb));
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_create_invite CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_create_invite() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_create_invite(invitee_email text, invite_role_key text, invite_territory text DEFAULT NULL) RETURNS TABLE(invite_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE new_invite tips_crm.team_invites%ROWTYPE;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF invitee_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = invite_role_key AND is_active) THEN RAISE EXCEPTION 'Role is not available'; END IF;
  INSERT INTO tips_crm.team_invites(email, role_key, territory_label, invited_by)
  VALUES (lower(invitee_email), invite_role_key, NULLIF(invite_territory, ''), auth.uid())
  RETURNING * INTO new_invite;
  PERFORM tips_crm.log_audit('invite_created', 'team_invite', new_invite.id::text, jsonb_build_object('email', new_invite.email, 'role_key', new_invite.role_key));
  RETURN QUERY SELECT new_invite.invite_token, new_invite.expires_at;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_accept_invite CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_accept_invite() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_accept_invite(token text) RETURNS TABLE(role_key text, territory_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE invited tips_crm.team_invites%ROWTYPE;
DECLARE current_email text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = auth.uid();
  SELECT * INTO invited FROM tips_crm.team_invites WHERE invite_token = token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invitation not found'; END IF;
  IF invited.status <> 'pending' OR invited.expires_at < now() THEN RAISE EXCEPTION 'Invitation is no longer valid'; END IF;
  IF lower(invited.email) <> current_email THEN RAISE EXCEPTION 'Invitation email does not match the signed-in account'; END IF;
  UPDATE tips_crm.profiles SET role_key = invited.role_key, is_active = true, updated_at = now() WHERE id = auth.uid();
  UPDATE tips_crm.team_invites SET status = 'accepted' WHERE id = invited.id;
  PERFORM tips_crm.log_audit('invite_accepted', 'team_invite', invited.id::text, jsonb_build_object('role_key', invited.role_key));
  RETURN QUERY SELECT invited.role_key, invited.territory_label;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_sync_account CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_sync_account() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_sync_account(local_ref text, account_type text, account_name text, account_specialty text, account_state text, account_city text, account_area text, account_address text, account_phone text) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE account_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF account_type NOT IN ('doctor', 'pharmacy', 'hospital', 'distributor') THEN RAISE EXCEPTION 'Invalid account type'; END IF;
  SELECT id INTO account_id FROM tips_crm.accounts WHERE created_by = auth.uid() AND address = CONCAT('__local_ref:', local_ref) LIMIT 1;
  IF account_id IS NULL THEN
    INSERT INTO tips_crm.accounts(account_type, name, specialty, state, city, area, address, phone, created_by)
    VALUES (account_type, account_name, NULLIF(account_specialty, ''), account_state, account_city, NULLIF(account_area, ''), CONCAT('__local_ref:', local_ref), account_phone, auth.uid()) RETURNING id INTO account_id;
    PERFORM tips_crm.log_audit('account_created', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref));
  ELSE
    UPDATE tips_crm.accounts SET name = account_name, specialty = NULLIF(account_specialty, ''), state = account_state, city = account_city, area = NULLIF(account_area, ''), phone = account_phone, updated_at = now() WHERE id = account_id;
    PERFORM tips_crm.log_audit('account_updated', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref));
  END IF;
  RETURN account_id;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_create_plan CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_create_plan() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_create_plan(plan_title text, plan_type text, starts_on date, ends_on date) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') THEN RAISE EXCEPTION 'Plan creation permission required'; END IF;
  INSERT INTO tips_crm.plans(owner_id, title, plan_type, starts_on, ends_on, status)
  VALUES (auth.uid(), plan_title, plan_type, starts_on, ends_on, 'pending') RETURNING id INTO plan_id;
  PERFORM tips_crm.log_audit('plan_submitted', 'plan', plan_id::text, jsonb_build_object('title', plan_title, 'plan_type', plan_type));
  RETURN plan_id;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_save_visit CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_save_visit() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_save_visit(account_uuid uuid, visit_status text, visit_outcome text, visit_notes text, latitude numeric DEFAULT NULL, longitude numeric DEFAULT NULL, accuracy integer DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE visit_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('write_own_visits') THEN RAISE EXCEPTION 'Visit write permission required'; END IF;
  IF visit_status NOT IN ('scheduled', 'completed', 'needs_review') THEN RAISE EXCEPTION 'Invalid visit status'; END IF;
  INSERT INTO tips_crm.visits(rep_id, account_id, status, outcome, notes, checked_in_at, check_in_latitude, check_in_longitude, location_accuracy_meters)
  VALUES (auth.uid(), account_uuid, visit_status, NULLIF(visit_outcome, ''), NULLIF(visit_notes, ''), CASE WHEN visit_status <> 'scheduled' THEN now() END, latitude, longitude, accuracy)
  RETURNING id INTO visit_id;
  PERFORM tips_crm.log_audit('visit_saved', 'visit', visit_id::text, jsonb_build_object('status', visit_status, 'account_id', account_uuid));
  RETURN visit_id;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_my_workspace CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_my_workspace() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_my_workspace() RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT jsonb_build_object(
    'plans', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'plan_type', p.plan_type, 'starts_on', p.starts_on, 'ends_on', p.ends_on, 'status', p.status, 'created_at', p.created_at) ORDER BY p.created_at DESC) FROM tips_crm.plans p WHERE p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')), '[]'::jsonb),
    'visits', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', v.id, 'account_id', v.account_id, 'status', v.status, 'outcome', v.outcome, 'notes', v.notes, 'checked_in_at', v.checked_in_at, 'created_at', v.created_at) ORDER BY v.created_at DESC) FROM tips_crm.visits v WHERE v.rep_id = auth.uid() OR tips_crm.has_permission('view_team_data')), '[]'::jsonb)
  );
$$;

DROP FUNCTION IF EXISTS public.tips_crm_audit_feed CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_audit_feed() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_audit_feed() RETURNS TABLE(id bigint, action text, entity_type text, entity_id text, details jsonb, created_at timestamptz, actor_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('view_team_data') THEN RAISE EXCEPTION 'Team data permission required'; END IF;
  RETURN QUERY SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, p.full_name FROM tips_crm.audit_log a LEFT JOIN tips_crm.profiles p ON p.id = a.actor_id ORDER BY a.created_at DESC LIMIT 200;
END;
$$;

REVOKE ALL ON FUNCTION tips_crm.log_audit(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_create_invite(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_accept_invite(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_create_plan(text, text, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_visit(uuid, text, text, text, numeric, numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_my_workspace() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_audit_feed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_create_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_accept_invite(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_create_plan(text, text, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_visit(uuid, text, text, text, numeric, numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_workspace() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_audit_feed() TO authenticated;


-- ==========================================
-- MODULE: tips_crm_plan_approval_enhancements.sql
-- ==========================================

DROP FUNCTION IF EXISTS public.tips_crm_list_plans();

DROP FUNCTION IF EXISTS public.tips_crm_list_plans CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_plans() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_plans() RETURNS TABLE(
  id uuid,
  title text,
  plan_type text,
  starts_on date,
  ends_on date,
  status text,
  manager_note text,
  created_at timestamptz,
  owner_name text,
  owner_territory text,
  completed_visits bigint,
  needs_review_visits bigint,
  last_visit_name text,
  last_visit_at timestamptz,
  scheduled_visits jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('write_own_plans') AND NOT tips_crm.has_permission('view_team_data') THEN
    RAISE EXCEPTION 'Plan access permission required';
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.title, p.plan_type, p.starts_on, p.ends_on, p.status, p.manager_note, p.created_at,
    owner.full_name,
    COALESCE((SELECT string_agg(DISTINCT territory.name, '، ' ORDER BY territory.name) FROM tips_crm.territory_assignments assignment JOIN tips_crm.territories territory ON territory.id = assignment.territory_id WHERE assignment.profile_id = p.owner_id), 'غير محددة'),
    (SELECT count(*) FROM tips_crm.visits visit WHERE visit.rep_id = p.owner_id AND visit.status = 'completed'),
    (SELECT count(*) FROM tips_crm.visits visit WHERE visit.rep_id = p.owner_id AND visit.status = 'needs_review'),
    recent.account_name,
    recent.checked_in_at,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('id', plan_visit.id, 'account_id', plan_visit.account_id, 'account_name', account.name, 'scheduled_for', plan_visit.scheduled_for) ORDER BY plan_visit.scheduled_for, plan_visit.created_at) FROM tips_crm.plan_visits plan_visit JOIN tips_crm.accounts account ON account.id = plan_visit.account_id WHERE plan_visit.plan_id = p.id), '[]'::jsonb)
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  LEFT JOIN LATERAL (
    SELECT account.name AS account_name, visit.checked_in_at
    FROM tips_crm.visits visit
    JOIN tips_crm.accounts account ON account.id = visit.account_id
    WHERE visit.rep_id = p.owner_id AND visit.status = 'completed'
    ORDER BY visit.checked_in_at DESC NULLS LAST, visit.updated_at DESC
    LIMIT 1
  ) recent ON true
  WHERE p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')
  ORDER BY p.created_at DESC;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_update_plan_by_manager CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_update_plan_by_manager() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_update_plan_by_manager(target_plan_id uuid, planned_visits jsonb, manager_note_input text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_owner uuid;
DECLARE plan_title text;
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;

  SELECT owner_id, title INTO plan_owner, plan_title
  FROM tips_crm.plans
  WHERE id = target_plan_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only pending plans can be modified';
  END IF;

  DELETE FROM tips_crm.plan_visits WHERE plan_id = target_plan_id;
  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for)
  SELECT target_plan_id, (item->>'account_id')::uuid, (item->>'scheduled_for')::timestamptz
  FROM jsonb_array_elements(COALESCE(planned_visits, '[]'::jsonb)) AS item
  WHERE item ? 'account_id' AND item ? 'scheduled_for';

  UPDATE tips_crm.plans
  SET manager_note = NULLIF(trim(manager_note_input), ''), updated_at = now()
  WHERE id = target_plan_id;

  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by)
  VALUES (plan_owner, 'تم تعديل خطتك من الإدارة', concat('عدّلت الإدارة توزيع زيارات «', plan_title, '». ', COALESCE(NULLIF(trim(manager_note_input), ''), 'راجع الأيام والجهات قبل الاعتماد.')), 'plan', auth.uid());
  PERFORM tips_crm.log_audit('plan_updated_by_manager', 'plan', target_plan_id::text, jsonb_build_object('note', manager_note_input, 'visit_count', jsonb_array_length(COALESCE(planned_visits, '[]'::jsonb))));
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_review_plan CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_review_plan() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_review_plan(target_plan_id uuid, next_status text, note text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE plan_owner uuid;
DECLARE plan_title text;
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;
  IF next_status NOT IN ('approved', 'returned') THEN
    RAISE EXCEPTION 'Invalid plan review status';
  END IF;

  UPDATE tips_crm.plans
  SET status = next_status, manager_note = NULLIF(trim(note), ''), approved_by = auth.uid(), approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END, updated_at = now()
  WHERE id = target_plan_id
  RETURNING owner_id, title INTO plan_owner, plan_title;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;

  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by)
  VALUES (
    plan_owner,
    CASE WHEN next_status = 'approved' THEN 'تم اعتماد خطتك الأسبوعية' ELSE 'أُعيدت خطتك للمراجعة' END,
    CASE WHEN next_status = 'approved' THEN concat('تم اعتماد «', plan_title, '». يمكنك البدء بالتنفيذ وفق الجدول.') ELSE concat('سبب الإعادة: ', COALESCE(NULLIF(trim(note), ''), 'يرجى مراجعة الخطة مع الإدارة.')) END,
    'plan',
    auth.uid()
  );
  PERFORM tips_crm.log_audit('plan_' || next_status, 'plan', target_plan_id::text, jsonb_build_object('note', note));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_plans() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_update_plan_by_manager(uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_review_plan(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_plans() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_update_plan_by_manager(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_review_plan(uuid, text, text) TO authenticated;

DROP FUNCTION IF EXISTS public.tips_crm_prepare_plan_submission_email CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_prepare_plan_submission_email() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_prepare_plan_submission_email(target_plan_id uuid) RETURNS TABLE(manager_email text, manager_name text, plan_title text, rep_name text, period_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE submitted_plan record;
BEGIN
  SELECT p.title, p.starts_on, p.ends_on, owner.full_name
  INTO submitted_plan
  FROM tips_crm.plans p
  JOIN tips_crm.profiles owner ON owner.id = p.owner_id
  WHERE p.id = target_plan_id AND p.owner_id = auth.uid() AND p.status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only the owner can announce a pending plan'; END IF;

  RETURN QUERY
  SELECT manager.email, manager.full_name, submitted_plan.title, submitted_plan.full_name,
    concat(to_char(submitted_plan.starts_on, 'DD/MM/YYYY'), ' — ', to_char(submitted_plan.ends_on, 'DD/MM/YYYY'))
  FROM tips_crm.profiles manager
  JOIN tips_crm.roles role ON role.key = manager.role_key
  WHERE manager.is_active = true AND manager.email IS NOT NULL AND manager.email <> ''
    AND (role.permissions @> ARRAY['approve_plans']::text[] OR 'all' = ANY(role.permissions));
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_prepare_plan_submission_email(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_prepare_plan_submission_email(uuid) TO authenticated;


-- ==========================================
-- MODULE: tips_crm_plan_review.sql
-- ==========================================

DROP FUNCTION IF EXISTS public.tips_crm_review_plan CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_review_plan() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_review_plan(target_plan_id uuid, next_status text, note text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('approve_plans') THEN
    RAISE EXCEPTION 'Plan approval permission required';
  END IF;
  IF next_status NOT IN ('approved', 'returned') THEN
    RAISE EXCEPTION 'Invalid plan review status';
  END IF;
  UPDATE tips_crm.plans
  SET status = next_status,
      manager_note = NULLIF(note, ''),
      approved_by = auth.uid(),
      approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE NULL END,
      updated_at = now()
  WHERE id = target_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found'; END IF;
  PERFORM tips_crm.log_audit('plan_' || next_status, 'plan', target_plan_id::text, jsonb_build_object('note', note));
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_review_plan(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_review_plan(uuid, text, text) TO authenticated;


-- ==========================================
-- MODULE: tips_crm_plan_review_reminders.sql
-- ==========================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS tips_crm.plan_review_reminders (
  plan_id uuid NOT NULL REFERENCES tips_crm.plans(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, manager_id)
);

DROP FUNCTION IF EXISTS tips_crm.enqueue_pending_plan_review_reminders CASCADE;
DROP FUNCTION IF EXISTS tips_crm.enqueue_pending_plan_review_reminders() CASCADE;
CREATE OR REPLACE FUNCTION tips_crm.enqueue_pending_plan_review_reminders() RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, public
AS $$
DECLARE queued_count integer := 0;
BEGIN
  WITH pending_plans AS (
    SELECT id, title, owner_id
    FROM tips_crm.plans
    WHERE status = 'pending' AND created_at <= now() - interval '24 hours'
  ), managers AS (
    SELECT profile.id
    FROM tips_crm.profiles profile
    JOIN tips_crm.roles role ON role.key = profile.role_key
    WHERE profile.is_active
      AND (role.permissions @> ARRAY['approve_plans']::text[] OR 'all' = ANY(role.permissions))
  ), queued AS (
    INSERT INTO tips_crm.plan_review_reminders(plan_id, manager_id)
    SELECT plan.id, manager.id
    FROM pending_plans plan CROSS JOIN managers manager
    ON CONFLICT (plan_id, manager_id) DO NOTHING
    RETURNING plan_id, manager_id
  ), notifications_to_send AS (
    SELECT queued.manager_id, plan.title, owner.full_name
    FROM queued
    JOIN tips_crm.plans plan ON plan.id = queued.plan_id
    JOIN tips_crm.profiles owner ON owner.id = plan.owner_id
  )
  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by)
  SELECT manager_id,
    'تذكير: خطة بانتظار المراجعة',
    concat('لا تزال خطة «', title, '» للمندوب ', full_name, ' معلقة منذ أكثر من 24 ساعة.'),
    'plan',
    NULL
  FROM notifications_to_send;

  GET DIAGNOSTICS queued_count = ROW_COUNT;
  RETURN queued_count;
END;
$$;

DO $$
DECLARE existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'tips-crm-pending-plan-review-reminders' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
  PERFORM cron.schedule(
    'tips-crm-pending-plan-review-reminders',
    '5 * * * *',
    $job$SELECT tips_crm.enqueue_pending_plan_review_reminders();$job$
  );
END;
$$;


-- ==========================================
-- MODULE: tips_crm_plan_review_reminders_rls.sql
-- ==========================================

ALTER TABLE tips_crm.plan_review_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_review_reminders_manager_read ON tips_crm.plan_review_reminders;

DROP POLICY IF EXISTS "plan_review_reminders_manager_read" ON tips_crm.plan_review_reminders;
CREATE POLICY plan_review_reminders_manager_read
ON tips_crm.plan_review_reminders
FOR SELECT
TO authenticated
USING (
  manager_id = auth.uid()
  AND tips_crm.has_permission('approve_plans')
);

REVOKE INSERT, UPDATE, DELETE ON tips_crm.plan_review_reminders FROM authenticated;


-- ==========================================
-- MODULE: tips_crm_mail_settings_and_exports.sql
-- ==========================================

CREATE TABLE IF NOT EXISTS tips_crm.mail_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  sender_name text NOT NULL DEFAULT 'Tips CRM',
  reply_to text,
  invite_subject text NOT NULL DEFAULT 'دعوة للانضمام إلى Tips CRM',
  invite_intro text NOT NULL DEFAULT 'تمت دعوتك للانضمام إلى النظام. اضغط الزر لتسجيل الدخول أو إنشاء حسابك، وسيتم تعيين دورك تلقائياً بعد قبول الدعوة.',
  invite_action_label text NOT NULL DEFAULT 'قبول الدعوة',
  updated_by uuid REFERENCES tips_crm.profiles(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tips_crm.mail_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tips_crm.invite_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_id uuid NOT NULL REFERENCES tips_crm.team_invites(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('accepted_by_provider', 'failed')),
  provider_message_id text,
  failure_reason text,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invite_email_deliveries_invite_time_idx ON tips_crm.invite_email_deliveries(invite_id, created_at DESC);

ALTER TABLE tips_crm.mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.invite_email_deliveries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mail_settings_read" ON tips_crm.mail_settings;
CREATE POLICY mail_settings_read ON tips_crm.mail_settings FOR SELECT TO authenticated USING (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS "mail_settings_manage" ON tips_crm.mail_settings;
CREATE POLICY mail_settings_manage ON tips_crm.mail_settings FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS "invite_email_deliveries_read" ON tips_crm.invite_email_deliveries;
CREATE POLICY invite_email_deliveries_read ON tips_crm.invite_email_deliveries FOR SELECT TO authenticated USING (tips_crm.has_permission('manage_users'));

DROP FUNCTION IF EXISTS public.tips_crm_prepare_invite_email(uuid);
DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed(date, date, uuid);

DROP FUNCTION IF EXISTS public.tips_crm_prepare_invite_email CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_prepare_invite_email() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_prepare_invite_email(target_invite_id uuid) RETURNS TABLE(invite_id uuid, recipient_email text, role_label text, territory_label text, invite_token text, expires_at timestamptz, sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT i.id, i.email, r.display_name, i.territory_label, i.invite_token, i.expires_at, settings.sender_name, settings.reply_to, settings.invite_subject, settings.invite_intro, settings.invite_action_label
  FROM tips_crm.team_invites i
  JOIN tips_crm.roles r ON r.key = i.role_key
  CROSS JOIN tips_crm.mail_settings settings
  WHERE i.id = target_invite_id AND i.status = 'pending' AND i.expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'Invite cannot be sent'; END IF;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_record_invite_email_delivery CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_record_invite_email_delivery() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_record_invite_email_delivery(target_invite_id uuid, target_email text, next_status text, provider_id text DEFAULT NULL, error_reason text DEFAULT NULL) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE log_id uuid;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF next_status NOT IN ('accepted_by_provider', 'failed') THEN RAISE EXCEPTION 'Invalid email delivery status'; END IF;
  INSERT INTO tips_crm.invite_email_deliveries(invite_id, recipient_email, status, provider_message_id, failure_reason, created_by)
  VALUES (target_invite_id, lower(target_email), next_status, NULLIF(provider_id, ''), NULLIF(left(error_reason, 500), ''), auth.uid())
  RETURNING id INTO log_id;
  PERFORM tips_crm.log_audit(CASE WHEN next_status = 'accepted_by_provider' THEN 'invite_email_accepted' ELSE 'invite_email_failed' END, 'team_invite', target_invite_id::text, jsonb_build_object('email', lower(target_email), 'provider_message_id', provider_id, 'failure_reason', NULLIF(left(error_reason, 500), '')));
  RETURN log_id;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_list_invite_email_deliveries CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_invite_email_deliveries() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_invite_email_deliveries() RETURNS TABLE(id uuid, invite_id uuid, recipient_email text, status text, provider_message_id text, failure_reason text, created_at timestamptz, actor_name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY
  SELECT delivery.id, delivery.invite_id, delivery.recipient_email, delivery.status, delivery.provider_message_id, delivery.failure_reason, delivery.created_at, coalesce(profile.full_name, 'النظام')
  FROM tips_crm.invite_email_deliveries delivery
  LEFT JOIN tips_crm.profiles profile ON profile.id = delivery.created_by
  ORDER BY delivery.created_at DESC
  LIMIT 100;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_get_mail_settings CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_get_mail_settings() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_get_mail_settings() RETURNS TABLE(sender_name text, reply_to text, invite_subject text, invite_intro text, invite_action_label text, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  RETURN QUERY SELECT settings.sender_name, settings.reply_to, settings.invite_subject, settings.invite_intro, settings.invite_action_label, settings.updated_at FROM tips_crm.mail_settings settings WHERE settings.id = 1;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_save_mail_settings CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_save_mail_settings() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_save_mail_settings(next_sender_name text, next_reply_to text, next_invite_subject text, next_invite_intro text, next_invite_action_label text) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF length(trim(next_sender_name)) = 0 OR length(trim(next_sender_name)) > 80 THEN RAISE EXCEPTION 'Invalid sender name'; END IF;
  IF nullif(trim(next_reply_to), '') IS NOT NULL AND trim(next_reply_to) !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid reply-to address'; END IF;
  IF length(trim(next_invite_subject)) = 0 OR length(trim(next_invite_subject)) > 160 THEN RAISE EXCEPTION 'Invalid invitation subject'; END IF;
  IF length(trim(next_invite_intro)) = 0 OR length(trim(next_invite_intro)) > 1200 THEN RAISE EXCEPTION 'Invalid invitation introduction'; END IF;
  IF length(trim(next_invite_action_label)) = 0 OR length(trim(next_invite_action_label)) > 60 THEN RAISE EXCEPTION 'Invalid invitation action label'; END IF;
  UPDATE tips_crm.mail_settings
  SET sender_name = trim(next_sender_name), reply_to = nullif(trim(next_reply_to), ''), invite_subject = trim(next_invite_subject), invite_intro = trim(next_invite_intro), invite_action_label = trim(next_invite_action_label), updated_by = auth.uid(), updated_at = now()
  WHERE id = 1;
  PERFORM tips_crm.log_audit('mail_settings_updated', 'mail_settings', '1', jsonb_build_object('sender_name', trim(next_sender_name)));
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date DEFAULT NULL, report_end date DEFAULT NULL, report_rep_id uuid DEFAULT NULL, record_type_filter text DEFAULT NULL) RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN RAISE EXCEPTION 'Export permission required'; END IF;
  IF report_start IS NOT NULL AND report_end IS NOT NULL AND report_start > report_end THEN RAISE EXCEPTION 'Start date must be before end date'; END IF;
  IF record_type_filter IS NOT NULL AND record_type_filter NOT IN ('plan', 'visit', 'audit') THEN RAISE EXCEPTION 'Invalid report type'; END IF;
  RETURN QUERY
  SELECT report_rows.record_type, report_rows.occurred_at, report_rows.actor_name, report_rows.title, report_rows.status, report_rows.details
  FROM (
    SELECT 'plan'::text AS record_type, p.created_at AS occurred_at, owner.full_name AS actor_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) AS details, p.owner_id AS rep_id FROM tips_crm.plans p JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit'::text, v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, ''), v.rep_id FROM tips_crm.visits v JOIN tips_crm.profiles rep ON rep.id = v.rep_id JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit'::text, audit.created_at, coalesce(profile.full_name, 'النظام'), audit.action, audit.entity_type, audit.details::text, audit.actor_id FROM tips_crm.audit_log audit LEFT JOIN tips_crm.profiles profile ON profile.id = audit.actor_id
  ) report_rows
  WHERE (report_start IS NULL OR report_rows.occurred_at >= report_start::timestamptz)
    AND (report_end IS NULL OR report_rows.occurred_at < (report_end + 1)::timestamptz)
    AND (report_rep_id IS NULL OR report_rows.rep_id = report_rep_id)
    AND (record_type_filter IS NULL OR report_rows.record_type = record_type_filter)
  ORDER BY report_rows.occurred_at DESC LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_prepare_invite_email(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_record_invite_email_delivery(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_invite_email_deliveries() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_get_mail_settings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_save_mail_settings(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_prepare_invite_email(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_record_invite_email_delivery(uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_invite_email_deliveries() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_get_mail_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_save_mail_settings(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid, text) TO authenticated;


-- ==========================================
-- MODULE: tips_crm_outcomes_and_export_filters.sql
-- ==========================================

DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed();

DROP FUNCTION IF EXISTS public.tips_crm_set_visit_outcome_active CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_set_visit_outcome_active() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_set_visit_outcome_active(outcome_id uuid, next_is_active boolean) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  outcome_label text;
  remaining_active_count integer;
BEGIN
  IF NOT tips_crm.has_permission('manage_outcomes') THEN
    RAISE EXCEPTION 'Outcome management permission required';
  END IF;

  SELECT label INTO outcome_label
  FROM tips_crm.visit_outcomes
  WHERE id = outcome_id
  FOR UPDATE;

  IF outcome_label IS NULL THEN
    RAISE EXCEPTION 'Visit outcome was not found';
  END IF;

  IF NOT next_is_active THEN
    SELECT count(*) INTO remaining_active_count
    FROM tips_crm.visit_outcomes
    WHERE is_active AND id <> outcome_id;
    IF remaining_active_count = 0 THEN
      RAISE EXCEPTION 'At least one active visit outcome is required';
    END IF;
  END IF;

  UPDATE tips_crm.visit_outcomes
  SET is_active = next_is_active, updated_at = now()
  WHERE id = outcome_id;

  PERFORM tips_crm.log_audit(
    CASE WHEN next_is_active THEN 'visit_outcome_activated' ELSE 'visit_outcome_deactivated' END,
    'visit_outcome',
    outcome_id::text,
    jsonb_build_object('label', outcome_label)
  );
  RETURN true;
END;
$$;

DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_export_report_feed() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_export_report_feed(report_start date DEFAULT NULL, report_end date DEFAULT NULL, report_rep_id uuid DEFAULT NULL) RETURNS TABLE(record_type text, occurred_at timestamptz, actor_name text, title text, status text, details text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.has_permission('export_reports') THEN
    RAISE EXCEPTION 'Export permission required';
  END IF;
  IF report_start IS NOT NULL AND report_end IS NOT NULL AND report_start > report_end THEN
    RAISE EXCEPTION 'Start date must be before end date';
  END IF;

  RETURN QUERY
  SELECT report_rows.record_type, report_rows.occurred_at, report_rows.actor_name, report_rows.title, report_rows.status, report_rows.details
  FROM (
    SELECT 'plan'::text AS record_type, p.created_at AS occurred_at, owner.full_name AS actor_name, p.title, p.status, concat(p.plan_type, ' · ', p.starts_on, ' إلى ', p.ends_on) AS details, p.owner_id AS rep_id
    FROM tips_crm.plans p
    JOIN tips_crm.profiles owner ON owner.id = p.owner_id
    UNION ALL
    SELECT 'visit'::text, v.created_at, rep.full_name, a.name, v.status, coalesce(v.outcome, ''), v.rep_id
    FROM tips_crm.visits v
    JOIN tips_crm.profiles rep ON rep.id = v.rep_id
    JOIN tips_crm.accounts a ON a.id = v.account_id
    UNION ALL
    SELECT 'audit'::text, audit.created_at, coalesce(profile.full_name, 'النظام'), audit.action, audit.entity_type, audit.details::text, audit.actor_id
    FROM tips_crm.audit_log audit
    LEFT JOIN tips_crm.profiles profile ON profile.id = audit.actor_id
  ) AS report_rows
  WHERE (report_start IS NULL OR report_rows.occurred_at >= report_start::timestamptz)
    AND (report_end IS NULL OR report_rows.occurred_at < (report_end + 1)::timestamptz)
    AND (report_rep_id IS NULL OR report_rows.rep_id = report_rep_id)
  ORDER BY report_rows.occurred_at DESC
  LIMIT 1000;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_set_visit_outcome_active(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_set_visit_outcome_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_export_report_feed(date, date, uuid) TO authenticated;


-- ==========================================
-- MODULE: tips_crm_sync_refinement.sql
-- ==========================================

ALTER TABLE tips_crm.accounts ADD COLUMN IF NOT EXISTS local_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_created_by_local_ref_idx ON tips_crm.accounts(created_by, local_ref) WHERE local_ref IS NOT NULL;

DROP FUNCTION IF EXISTS public.tips_crm_create_invite(text, text, text);
DROP FUNCTION IF EXISTS public.tips_crm_create_invite CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_create_invite() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_create_invite(invitee_email text, invite_role_key text, invite_territory text DEFAULT NULL) RETURNS TABLE(invite_id uuid, invite_token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE new_invite tips_crm.team_invites%ROWTYPE; BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF invitee_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'Invalid email address'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = invite_role_key AND is_active) THEN RAISE EXCEPTION 'Role is not available'; END IF;
  INSERT INTO tips_crm.team_invites(email, role_key, territory_label, invited_by) VALUES (lower(invitee_email), invite_role_key, NULLIF(invite_territory, ''), auth.uid()) RETURNING * INTO new_invite;
  PERFORM tips_crm.log_audit('invite_created', 'team_invite', new_invite.id::text, jsonb_build_object('email', new_invite.email, 'role_key', new_invite.role_key));
  RETURN QUERY SELECT new_invite.id, new_invite.invite_token, new_invite.expires_at;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.tips_crm_sync_account CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_sync_account() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_sync_account(local_ref_input text, account_type text, account_name text, account_specialty text, account_state text, account_city text, account_area text, account_address text, account_phone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ DECLARE account_id uuid; BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = auth.uid() AND is_active) THEN RAISE EXCEPTION 'Active account required'; END IF;
  IF account_type NOT IN ('doctor', 'pharmacy', 'hospital', 'distributor') THEN RAISE EXCEPTION 'Invalid account type'; END IF;
  SELECT id INTO account_id FROM tips_crm.accounts WHERE created_by = auth.uid() AND local_ref = local_ref_input LIMIT 1;
  IF account_id IS NULL THEN
    INSERT INTO tips_crm.accounts(account_type, name, specialty, state, city, area, address, phone, local_ref, created_by)
    VALUES (account_type, account_name, NULLIF(account_specialty, ''), account_state, account_city, NULLIF(account_area, ''), NULLIF(account_address, ''), NULLIF(account_phone, ''), local_ref_input, auth.uid()) RETURNING id INTO account_id;
    PERFORM tips_crm.log_audit('account_created', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref_input));
  ELSE
    UPDATE tips_crm.accounts SET name = account_name, specialty = NULLIF(account_specialty, ''), state = account_state, city = account_city, area = NULLIF(account_area, ''), address = NULLIF(account_address, ''), phone = NULLIF(account_phone, ''), updated_at = now() WHERE id = account_id;
    PERFORM tips_crm.log_audit('account_updated', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref_input));
  END IF;
  RETURN account_id;
END; $$;

DROP FUNCTION IF EXISTS public.tips_crm_list_accounts CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_list_accounts() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_list_accounts() RETURNS TABLE(id uuid, local_ref text, account_type text, name text, specialty text, state text, city text, area text, address text, phone text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$ BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  RETURN QUERY SELECT a.id, a.local_ref, a.account_type, a.name, a.specialty, a.state, a.city, a.area, a.address, a.phone, a.created_at FROM tips_crm.accounts a WHERE a.created_by = auth.uid() OR tips_crm.has_permission('view_team_data') ORDER BY a.updated_at DESC;
END; $$;

REVOKE ALL ON FUNCTION public.tips_crm_create_invite(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_create_invite(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_accounts() TO authenticated;


-- ==========================================
-- MODULE: tips_crm_temporary_employee_accounts.sql
-- ==========================================

ALTER TABLE tips_crm.profiles
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS temporary_password_issued_at timestamptz;

DROP FUNCTION IF EXISTS public.tips_crm_my_profile();

DROP FUNCTION IF EXISTS public.tips_crm_my_profile CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_my_profile() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_my_profile() RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  role_key text,
  role_name text,
  permissions text[],
  is_active boolean,
  must_change_password boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT p.id, p.full_name, p.email, p.role_key, r.display_name, r.permissions, p.is_active, p.must_change_password
  FROM tips_crm.profiles p
  JOIN tips_crm.roles r ON r.key = p.role_key
  WHERE p.id = auth.uid();
$$;

DROP FUNCTION IF EXISTS public.tips_crm_mark_password_changed CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_mark_password_changed() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_mark_password_changed() RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE tips_crm.profiles
  SET must_change_password = false, updated_at = now()
  WHERE id = auth.uid();
  PERFORM tips_crm.log_audit('temporary_password_changed', 'profile', auth.uid()::text, '{}'::jsonb);
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_my_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.tips_crm_mark_password_changed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_mark_password_changed() TO authenticated;


-- ==========================================
-- MODULE: tips_crm_finalize_employee_account.sql
-- ==========================================

-- يكمل ملف الموظف ومناطق عمله بعد إنشاء مستخدم Auth من الخادم.
-- تعمل الدالة بهوية المدير الطالب وتتحقق من صلاحية إدارة المستخدمين.
DROP FUNCTION IF EXISTS public.tips_crm_finalize_employee_account CASCADE;
DROP FUNCTION IF EXISTS public.tips_crm_finalize_employee_account() CASCADE;
CREATE OR REPLACE FUNCTION public.tips_crm_finalize_employee_account(
  target_profile_id uuid,
  employee_full_name text,
  employee_email text,
  employee_role_key text,
  employee_territory_keys text[],
  employee_force_password_change boolean
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  res_terr_num integer;
  req_terr_num integer;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN
    RAISE EXCEPTION 'User management permission required';
  END IF;

  IF employee_role_key NOT IN ('sales_manager', 'sales_rep', 'medical_rep')
     OR NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = employee_role_key AND is_active) THEN
    RAISE EXCEPTION 'Employee role is not available';
  END IF;

  SELECT cardinality(coalesce(employee_territory_keys, ARRAY[]::text[]))
  INTO req_terr_num;

  IF employee_role_key <> 'sales_manager' AND req_terr_num = 0 THEN
    RAISE EXCEPTION 'At least one territory is required for a representative';
  END IF;

  SELECT count(*) INTO res_terr_num
  FROM tips_crm.territories
  WHERE is_active AND client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]));

  IF res_terr_num <> req_terr_num THEN
    RAISE EXCEPTION 'One or more territories are unavailable';
  END IF;

  UPDATE tips_crm.profiles
  SET full_name = trim(employee_full_name),
      email = lower(trim(employee_email)),
      role_key = employee_role_key,
      must_change_password = employee_force_password_change,
      temporary_password_issued_at = now()
  WHERE id = target_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee profile was not created';
  END IF;

  DELETE FROM tips_crm.territory_assignments
  WHERE profile_id = target_profile_id
    AND territory_id NOT IN (
      SELECT id FROM tips_crm.territories
      WHERE client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]))
    );

  INSERT INTO tips_crm.territory_assignments(territory_id, profile_id, assigned_by)
  SELECT territory.id, target_profile_id, auth.uid()
  FROM tips_crm.territories territory
  WHERE territory.client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]))
  ON CONFLICT (territory_id, profile_id) DO NOTHING;

  PERFORM tips_crm.log_audit(
    'employee_account_created',
    'profile',
    target_profile_id::text,
    jsonb_build_object(
      'email', lower(trim(employee_email)),
      'role_key', employee_role_key,
      'territory_keys', coalesce(employee_territory_keys, ARRAY[]::text[]),
      'force_password_change', employee_force_password_change
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_finalize_employee_account(uuid, text, text, text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_finalize_employee_account(uuid, text, text, text, text[], boolean) TO authenticated;
