CREATE SCHEMA IF NOT EXISTS tips_crm;
GRANT USAGE ON SCHEMA tips_crm TO anon, authenticated, service_role, postgres, supabase_admin, supabase_auth_admin;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, service_role, supabase_admin, supabase_auth_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, service_role, supabase_admin, supabase_auth_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, service_role, supabase_admin, supabase_auth_admin;

CREATE TABLE tips_crm.roles (
  key text PRIMARY KEY,
  display_name text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}'::text[],
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tips_crm.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text,
  phone text,
  role_key text NOT NULL REFERENCES tips_crm.roles(key),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tips_crm.team_invites (
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

CREATE TABLE tips_crm.territories (
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

CREATE TABLE tips_crm.territory_assignments (
  territory_id uuid NOT NULL REFERENCES tips_crm.territories(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (territory_id, profile_id)
);

CREATE TABLE tips_crm.accounts (
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

CREATE TABLE tips_crm.plans (
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

CREATE TABLE tips_crm.plan_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES tips_crm.plans(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES tips_crm.accounts(id),
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tips_crm.visits (
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

CREATE TABLE tips_crm.duty_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  tracking_consent_at timestamptz NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tips_crm.duty_location_points (
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

CREATE TABLE tips_crm.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('plan', 'visit', 'alert', 'team', 'duty')),
  read_at timestamptz,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX duty_location_points_profile_time_idx ON tips_crm.duty_location_points(profile_id, captured_at DESC);
CREATE INDEX visits_rep_time_idx ON tips_crm.visits(rep_id, checked_in_at DESC);
CREATE INDEX plans_owner_dates_idx ON tips_crm.plans(owner_id, starts_on, ends_on);
CREATE INDEX notifications_recipient_time_idx ON tips_crm.notifications(recipient_id, created_at DESC);

INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system) VALUES
  ('system_admin', 'مدير النظام', 'إدارة الأدوار والمستخدمين وكامل إعدادات الشركة.', ARRAY['all'], true),
  ('sales_manager', 'مدير المبيعات', 'متابعة الفريق واعتماد الخطط وإدارة المناطق.', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'manage_accounts', 'send_notifications'], true),
  ('sales_rep', 'مندوب مبيعات', 'إدارة خطة وزيارات البيع الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true),
  ('medical_rep', 'مندوب طبي', 'إدارة خطة وزيارات الأطباء والعيادات الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION tips_crm.has_permission(required_permission text)
RETURNS boolean
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

CREATE OR REPLACE FUNCTION tips_crm.in_assigned_territory(required_territory uuid)
RETURNS boolean
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

CREATE POLICY roles_read ON tips_crm.roles FOR SELECT TO authenticated USING (is_active OR tips_crm.has_permission('manage_roles'));
CREATE POLICY roles_manage ON tips_crm.roles FOR ALL TO authenticated USING (tips_crm.has_permission('manage_roles')) WITH CHECK (tips_crm.has_permission('manage_roles'));
CREATE POLICY profiles_read ON tips_crm.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY profiles_manage ON tips_crm.profiles FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
CREATE POLICY invites_manage ON tips_crm.team_invites FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
CREATE POLICY territories_read ON tips_crm.territories FOR SELECT TO authenticated USING (tips_crm.in_assigned_territory(id));
CREATE POLICY territories_manage ON tips_crm.territories FOR ALL TO authenticated USING (tips_crm.has_permission('manage_territories')) WITH CHECK (tips_crm.has_permission('manage_territories'));
CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated USING (tips_crm.has_permission('manage_territories')) WITH CHECK (tips_crm.has_permission('manage_territories'));
CREATE POLICY accounts_read ON tips_crm.accounts FOR SELECT TO authenticated USING (tips_crm.in_assigned_territory(territory_id));
CREATE POLICY accounts_write ON tips_crm.accounts FOR ALL TO authenticated USING (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id)) WITH CHECK (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id));
CREATE POLICY plans_read ON tips_crm.plans FOR SELECT TO authenticated USING (owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY plans_write ON tips_crm.plans FOR ALL TO authenticated USING (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')) WITH CHECK (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'));
CREATE POLICY plan_visits_read ON tips_crm.plan_visits FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'))));
CREATE POLICY plan_visits_write ON tips_crm.plan_visits FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')))) WITH CHECK (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))));
CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated USING (rep_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated USING (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')) WITH CHECK (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans'));
CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY duty_sessions_write ON tips_crm.duty_sessions FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY duty_points_write ON tips_crm.duty_location_points FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
CREATE POLICY notifications_update ON tips_crm.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated WITH CHECK (tips_crm.has_permission('send_notifications'));

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm GRANT ALL ON TABLES TO service_role;
