CREATE SCHEMA IF NOT EXISTS tips_crm;
REVOKE ALL ON SCHEMA tips_crm FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA tips_crm TO authenticated, service_role;
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

CREATE TABLE IF NOT EXISTS tips_crm.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  plan_key text NOT NULL DEFAULT 'standard',
  payment_tier_key text DEFAULT 'standard',
  max_user_limit integer NOT NULL DEFAULT 20,
  primary_contact_name text,
  primary_contact_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.company_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name text NOT NULL,
  requested_slug text,
  contact_name text NOT NULL,
  contact_email text NOT NULL,
  contact_phone text,
  expected_user_count integer,
  activity_type text,
  notes text,
  review_note text,
  status text NOT NULL DEFAULT 'submitted',
  approved_company_id uuid REFERENCES tips_crm.companies(id) ON DELETE SET NULL,
  manager_profile_id uuid,
  invitation_sent_at timestamptz,
  invitation_activated_at timestamptz,
  invitation_cancelled_at timestamptz,
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
  is_platform_admin boolean NOT NULL DEFAULT false,
  active_company_id uuid REFERENCES tips_crm.companies(id) ON DELETE SET NULL,
  must_change_password boolean NOT NULL DEFAULT false,
  temporary_password_issued_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.company_memberships (
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  role_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, profile_id)
);

CREATE TABLE IF NOT EXISTS tips_crm.company_request_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES tips_crm.company_requests(id) ON DELETE CASCADE,
  note_text text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tips_crm.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
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
  local_ref text,
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

CREATE TABLE IF NOT EXISTS tips_crm.visit_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES tips_crm.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS tips_crm.plan_review_reminders (
  plan_id uuid NOT NULL REFERENCES tips_crm.plans(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, manager_id)
);

CREATE TABLE IF NOT EXISTS tips_crm.payment_tiers (
  key text PRIMARY KEY,
  name text NOT NULL,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  default_user_limit integer NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS duty_location_points_profile_time_idx ON tips_crm.duty_location_points(profile_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS visits_rep_time_idx ON tips_crm.visits(rep_id, checked_in_at DESC);
CREATE INDEX IF NOT EXISTS plans_owner_dates_idx ON tips_crm.plans(owner_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS notifications_recipient_time_idx ON tips_crm.notifications(recipient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS invite_email_deliveries_invite_time_idx ON tips_crm.invite_email_deliveries(invite_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON tips_crm.audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON tips_crm.audit_log(actor_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_created_by_local_ref_idx ON tips_crm.accounts(created_by, local_ref) WHERE local_ref IS NOT NULL;

INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system) VALUES
  ('system_admin', 'مدير النظام', 'إدارة الأدوار والمستخدمين وكامل إعدادات الشركة.', ARRAY['all'], true),
  ('sales_manager', 'مدير المبيعات', 'متابعة الفريق واعتماد الخطط وإدارة المناطق.', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'manage_accounts', 'send_notifications'], true),
  ('sales_rep', 'مندوب مبيعات', 'إدارة خطة وزيارات البيع الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true),
  ('medical_rep', 'مندوب طبي', 'إدارة خطة وزيارات الأطباء والعيادات الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true)
ON CONFLICT (key) DO NOTHING;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'visit_outcomes_label_key' AND conrelid = 'tips_crm.visit_outcomes'::regclass) THEN
    ALTER TABLE tips_crm.visit_outcomes ADD CONSTRAINT visit_outcomes_label_key UNIQUE (label);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM tips_crm.visit_outcomes LIMIT 1) THEN
    INSERT INTO tips_crm.visit_outcomes (label, sort_order)
    VALUES ('متابعة', 10), ('تم إنشاء فاتورة', 20), ('تم تحصيل', 30), ('لا يوجد قرار', 40);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM tips_crm.mail_settings WHERE id = 1) THEN
    INSERT INTO tips_crm.mail_settings (id) VALUES (1);
  END IF;
END $$;

INSERT INTO tips_crm.payment_tiers (key, name, price_monthly, default_user_limit) VALUES
  ('free_trial', 'تجربة مجانية', 0.00, 5),
  ('starter', 'باقة البداية', 49.00, 10),
  ('standard', 'الباقة القياسية', 99.00, 20),
  ('pro', 'الباقة الاحترافية', 199.00, 50),
  ('enterprise', 'باقة المؤسسات', 499.00, 200),
  ('custom', 'باقة مخصصة', 0.00, 1000)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  default_user_limit = EXCLUDED.default_user_limit;

ALTER TABLE tips_crm.companies
  ADD COLUMN IF NOT EXISTS payment_tier_key text REFERENCES tips_crm.payment_tiers(key) DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS max_user_limit integer NOT NULL DEFAULT 20;

UPDATE tips_crm.roles
SET permissions = ARRAY(SELECT DISTINCT unnest(permissions || ARRAY['manage_outcomes', 'export_reports']))
WHERE key IN ('system_admin', 'sales_manager');
