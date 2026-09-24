-- ==============================================================================
-- Tips CRM: Membership Roles, Discipline, and Permission Materialization
--
-- Structural DDL for docs/authorization-model.md. Additive only: no column is
-- dropped, no legacy row is deleted, profiles.role_key keeps its FK to
-- tips_crm.roles. Every statement is safe to run twice.
--
-- Paste into the Supabase Dashboard -> SQL Editor and run. Read the
-- verification SELECTs at the end after it completes.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. Seed the five System Roles with the new permission vocabulary.
--    Matches shared/auth/roles.ts SYSTEM_ROLE_PERMISSIONS exactly —
--    see tests/permission-vocabulary-sql.test.ts, which fails the build
--    if this list and the TypeScript one ever diverge.
-- ------------------------------------------------------------------

INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active) VALUES
  (
    'owner',
    'المالك',
    'الصلاحيات غير التشغيلية للشركة: الاشتراك والفوترة ونقل الملكية والحذف.',
    ARRAY[
      'portal.company.enter',
      'company.subscription.manage',
      'company.billing.read',
      'company.transfer',
      'company.delete'
    ],
    true,
    true
  ),
  (
    'manager',
    'المدير',
    'إدارة عمليات الشركة: المناطق والموظفين والكتالوج واعتماد الخطط.',
    ARRAY[
      'portal.company.enter',
      'portal.supervisor.enter',
      'portal.rep.enter',
      'company.profile.update',
      'employee.manage',
      'role.assign',
      'territory.manage',
      'team.assign',
      'catalogue.manage',
      'catalogue.read',
      'account.read.assigned',
      'account.read.team',
      'account.read.company',
      'account.create',
      'account.update',
      'account.import',
      'plan.create.own',
      'plan.read.own',
      'plan.read.team',
      'plan.read.company',
      'plan.approve.team',
      'plan.approve.company',
      'visit.record',
      'visit.read.own',
      'visit.read.team',
      'visit.read.company',
      'visit.review',
      'telemetry.read.team',
      'telemetry.read.company',
      'credit_limit.manage',
      'finance.reconcile',
      'report.read.team',
      'report.read.company',
      'audit.read.company'
    ],
    true,
    true
  ),
  (
    'supervisor',
    'المشرف',
    'متابعة فريق من المناديب: مراجعة خططهم واعتماد تغطيتهم الميدانية.',
    ARRAY[
      'portal.supervisor.enter',
      'catalogue.read',
      'account.read.team',
      'plan.read.team',
      'plan.approve.team',
      'visit.read.team',
      'visit.review',
      'telemetry.read.team',
      'report.read.team'
    ],
    true,
    true
  ),
  (
    'rep',
    'المندوب',
    'تنفيذ العمل الميداني: تخطيط الزيارات وتنفيذها وتسجيل نتائجها.',
    ARRAY[
      'portal.rep.enter',
      'catalogue.read',
      'account.read.assigned',
      'account.create',
      'account.update',
      'plan.create.own',
      'plan.read.own',
      'visit.record',
      'visit.read.own'
    ],
    true,
    true
  ),
  (
    'accountant',
    'المحاسب',
    'المتابعة المالية للشركة: حدود الائتمان وتسوية التحصيلات والفواتير.',
    ARRAY[
      'portal.company.enter',
      'account.read.company',
      'visit.read.company',
      'credit_limit.manage',
      'finance.reconcile',
      'report.read.company'
    ],
    true,
    true
  )
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------------
-- 2. membership_roles — a Membership may hold several Roles at once.
--    Follows the house join-table style of territory_assignments.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tips_crm.membership_roles (
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  role_key text NOT NULL REFERENCES tips_crm.roles(key),
  granted_by uuid REFERENCES auth.users(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, profile_id, role_key),
  FOREIGN KEY (company_id, profile_id) REFERENCES tips_crm.company_memberships(company_id, profile_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS membership_roles_role_key_idx ON tips_crm.membership_roles(role_key);

-- ------------------------------------------------------------------
-- 3. Discipline — a set on the Membership and a set on the Account.
--    Columns, not a join table: Discipline carries no FK or grant
--    metadata of its own.
-- ------------------------------------------------------------------

ALTER TABLE tips_crm.company_memberships
  ADD COLUMN IF NOT EXISTS disciplines text[] NOT NULL DEFAULT '{}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'company_memberships_disciplines_check'
      AND conrelid = 'tips_crm.company_memberships'::regclass
  ) THEN
    ALTER TABLE tips_crm.company_memberships
      ADD CONSTRAINT company_memberships_disciplines_check
      CHECK (disciplines <@ ARRAY['sales', 'medical']::text[]);
  END IF;
END $$;

ALTER TABLE tips_crm.accounts
  ADD COLUMN IF NOT EXISTS disciplines text[] NOT NULL DEFAULT '{}'::text[];

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'accounts_disciplines_check'
      AND conrelid = 'tips_crm.accounts'::regclass
  ) THEN
    ALTER TABLE tips_crm.accounts
      ADD CONSTRAINT accounts_disciplines_check
      CHECK (disciplines <@ ARRAY['sales', 'medical']::text[]);
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 4. supervisor_assignments — explicit Team membership. Never inferred
--    from shared Territory or Discipline. Modelled on territory_assignments.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tips_crm.supervisor_assignments (
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  supervisor_profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  rep_profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, supervisor_profile_id, rep_profile_id),
  CHECK (supervisor_profile_id <> rep_profile_id)
);

CREATE INDEX IF NOT EXISTS supervisor_assignments_rep_idx ON tips_crm.supervisor_assignments(company_id, rep_profile_id);

-- ------------------------------------------------------------------
-- 5. membership_permissions — the materialized union RLS will read.
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tips_crm.membership_permissions (
  company_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  permission text NOT NULL,
  PRIMARY KEY (company_id, profile_id, permission),
  FOREIGN KEY (company_id, profile_id) REFERENCES tips_crm.company_memberships(company_id, profile_id) ON DELETE CASCADE
);

-- ------------------------------------------------------------------
-- 6. role_grant_audit — the control that replaces enforced separation
--    of duties between Manager and Accountant (ADR-0001).
-- ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tips_crm.role_grant_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_profile_id uuid REFERENCES tips_crm.profiles(id),
  subject_profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id),
  role_key text NOT NULL REFERENCES tips_crm.roles(key),
  action text NOT NULL CHECK (action IN ('granted', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS role_grant_audit_subject_idx ON tips_crm.role_grant_audit(subject_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS role_grant_audit_company_idx ON tips_crm.role_grant_audit(company_id, created_at DESC);

-- ------------------------------------------------------------------
-- 7. One SECURITY DEFINER function recomputes one membership's rows in
--    membership_permissions. Every trigger below drives this same
--    function rather than re-deriving the union inline.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.recompute_membership_permissions(p_company_id uuid, p_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  DELETE FROM tips_crm.membership_permissions
  WHERE company_id = p_company_id AND profile_id = p_profile_id;

  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.company_memberships cm
    WHERE cm.company_id = p_company_id AND cm.profile_id = p_profile_id AND cm.is_active
  ) THEN
    RETURN;
  END IF;

  INSERT INTO tips_crm.membership_permissions (company_id, profile_id, permission)
  SELECT DISTINCT p_company_id, p_profile_id, perm
  FROM tips_crm.membership_roles mr
  JOIN tips_crm.roles r ON r.key = mr.role_key
  CROSS JOIN LATERAL unnest(r.permissions) AS perm
  WHERE mr.company_id = p_company_id
    AND mr.profile_id = p_profile_id
    AND r.is_active;
END;
$$;

-- Internal machinery, driven only by the triggers below and by the backfill in
-- this file — not part of the app's public surface, so no EXECUTE grant to
-- authenticated. Trigger invocation does not require one.
REVOKE ALL ON FUNCTION tips_crm.recompute_membership_permissions(uuid, uuid) FROM PUBLIC;

-- Trigger: membership_roles changed (insert/update/delete) -> recompute that membership.
CREATE OR REPLACE FUNCTION tips_crm.trg_membership_roles_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM tips_crm.recompute_membership_permissions(OLD.company_id, OLD.profile_id);
    RETURN OLD;
  END IF;

  PERFORM tips_crm.recompute_membership_permissions(NEW.company_id, NEW.profile_id);
  IF TG_OP = 'UPDATE' AND (OLD.company_id <> NEW.company_id OR OLD.profile_id <> NEW.profile_id) THEN
    PERFORM tips_crm.recompute_membership_permissions(OLD.company_id, OLD.profile_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS membership_roles_recompute ON tips_crm.membership_roles;
CREATE TRIGGER membership_roles_recompute
AFTER INSERT OR UPDATE OR DELETE ON tips_crm.membership_roles
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_membership_roles_recompute();

-- Trigger: a company_memberships row is deleted -> drop its materialized rows too.
-- (Deactivation — is_active set to false — is also a permission-relevant change, so
-- catch UPDATE as well as DELETE.)
CREATE OR REPLACE FUNCTION tips_crm.trg_company_memberships_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM tips_crm.recompute_membership_permissions(OLD.company_id, OLD.profile_id);
    RETURN OLD;
  END IF;

  PERFORM tips_crm.recompute_membership_permissions(NEW.company_id, NEW.profile_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS company_memberships_recompute ON tips_crm.company_memberships;
CREATE TRIGGER company_memberships_recompute
AFTER UPDATE OR DELETE ON tips_crm.company_memberships
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_company_memberships_recompute();

-- Trigger: a role's permissions array (or is_active) changed -> recompute every
-- membership holding that role.
CREATE OR REPLACE FUNCTION tips_crm.trg_roles_recompute()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  m record;
BEGIN
  IF NEW.permissions IS DISTINCT FROM OLD.permissions OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
    FOR m IN
      SELECT DISTINCT company_id, profile_id
      FROM tips_crm.membership_roles
      WHERE role_key = NEW.key
    LOOP
      PERFORM tips_crm.recompute_membership_permissions(m.company_id, m.profile_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_recompute ON tips_crm.roles;
CREATE TRIGGER roles_recompute
AFTER UPDATE ON tips_crm.roles
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_roles_recompute();

-- ------------------------------------------------------------------
-- 8. Backfill.
--    Mapping per docs/authorization-model.md "Migration from the
--    legacy role keys" (same table shared/auth/legacy.ts encodes for
--    the client-side scaffolding it deliberately duplicates).
-- ------------------------------------------------------------------

-- 8a. Create the company_memberships row for every profile with an
--     active_company_id that lacks one. Non-platform-admins only —
--     a Platform Admin holds no Membership.
INSERT INTO tips_crm.company_memberships (company_id, profile_id, is_active)
SELECT p.active_company_id, p.id, true
FROM tips_crm.profiles p
WHERE p.active_company_id IS NOT NULL
  AND NOT p.is_platform_admin
ON CONFLICT (company_id, profile_id) DO NOTHING;

-- 8b. Map each legacy role_key to its new System Role(s) and Discipline
--     set. system_admin is excluded: those profiles are platform admins
--     and get no membership role (enforced again in 8c as a safety net).
CREATE TEMP TABLE _legacy_role_map (legacy_key text PRIMARY KEY, new_role_key text NOT NULL, disciplines text[] NOT NULL) ON COMMIT DROP;
INSERT INTO _legacy_role_map (legacy_key, new_role_key, disciplines) VALUES
  ('company_manager', 'manager', '{}'::text[]),
  ('sales_manager', 'manager', '{}'::text[]),
  ('sales_supervisor', 'supervisor', ARRAY['sales']),
  ('medical_supervisor', 'supervisor', ARRAY['medical']),
  ('sales_rep', 'rep', ARRAY['sales']),
  ('medical_rep', 'rep', ARRAY['medical']),
  ('accountant', 'accountant', '{}'::text[]);

UPDATE tips_crm.company_memberships cm
SET disciplines = ARRAY(
  SELECT DISTINCT unnest(cm.disciplines || lrm.disciplines)
)
FROM tips_crm.profiles p
JOIN _legacy_role_map lrm ON lrm.legacy_key = p.role_key
WHERE cm.profile_id = p.id
  AND cm.company_id = p.active_company_id
  AND NOT p.is_platform_admin;

INSERT INTO tips_crm.membership_roles (company_id, profile_id, role_key)
SELECT p.active_company_id, p.id, lrm.new_role_key
FROM tips_crm.profiles p
JOIN _legacy_role_map lrm ON lrm.legacy_key = p.role_key
WHERE p.active_company_id IS NOT NULL
  AND NOT p.is_platform_admin
ON CONFLICT (company_id, profile_id, role_key) DO NOTHING;

-- 8c. system_admin -> is_platform_admin = true, no Membership. The
--     production facts already have is_platform_admin correctly set
--     with active_company_id NULL for these two profiles; this is a
--     safety net in case a system_admin profile was ever given a
--     company_memberships row by other tooling.
DELETE FROM tips_crm.membership_roles mr
USING tips_crm.profiles p
WHERE mr.profile_id = p.id AND p.is_platform_admin;

-- No legacy key maps to owner. Every Company needs an Owner assigned
-- explicitly by a human decision, not invented here — see report.

-- 8d. Populate membership_permissions for every membership just created
--     or touched.
DO $$
DECLARE
  m record;
BEGIN
  FOR m IN SELECT company_id, profile_id FROM tips_crm.company_memberships LOOP
    PERFORM tips_crm.recompute_membership_permissions(m.company_id, m.profile_id);
  END LOOP;
END $$;

-- ------------------------------------------------------------------
-- 9. RLS on the new tables.
--
--    tips_crm is exposed to PostgREST — the client calls
--    supabase.schema('tips_crm').from(...) directly — so a table created
--    without RLS is reachable by any signed-in user. Left off, an
--    authenticated rep could INSERT themselves a 'manager' row into
--    membership_roles and the recompute trigger would materialise manager
--    permissions for them.
--
--    Posture here is deliberately narrow: read what concerns you, write
--    nothing. Every write path is either a SECURITY DEFINER trigger or the
--    service role, and both bypass RLS — so granting no write policy at all
--    denies the client without blocking the machinery.
--
--    These predicates still use has_permission() and the OLD permission
--    vocabulary, matching the rest of the current RLS. Rewriting policies
--    onto membership_permissions is the next migration.
-- ------------------------------------------------------------------

ALTER TABLE tips_crm.membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.membership_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.supervisor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.role_grant_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS membership_roles_read ON tips_crm.membership_roles;
CREATE POLICY membership_roles_read ON tips_crm.membership_roles FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
);

DROP POLICY IF EXISTS membership_permissions_read ON tips_crm.membership_permissions;
CREATE POLICY membership_permissions_read ON tips_crm.membership_permissions FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
);

DROP POLICY IF EXISTS supervisor_assignments_read ON tips_crm.supervisor_assignments;
CREATE POLICY supervisor_assignments_read ON tips_crm.supervisor_assignments FOR SELECT TO authenticated
USING (
  supervisor_profile_id = auth.uid()
  OR rep_profile_id = auth.uid()
  OR tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
);

DROP POLICY IF EXISTS role_grant_audit_read ON tips_crm.role_grant_audit;
CREATE POLICY role_grant_audit_read ON tips_crm.role_grant_audit FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
);

COMMIT;

-- ==============================================================================
-- Verification — run these after the migration and read the results before
-- trusting it. Nothing here mutates data.
-- ==============================================================================

-- RLS must be on for all four new tables (expect four rows, rowsecurity = true)
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'tips_crm'
--   AND tablename IN ('membership_roles', 'membership_permissions',
--                     'supervisor_assignments', 'role_grant_audit');

-- Memberships per company
-- SELECT company_id, count(*) AS membership_count
-- FROM tips_crm.company_memberships
-- GROUP BY company_id
-- ORDER BY company_id;

-- Roles held per membership (expect >= 1 for every non-platform-admin profile
-- that has an active_company_id)
-- SELECT cm.company_id, cm.profile_id, p.full_name, p.role_key AS legacy_role_key,
--        array_agg(mr.role_key ORDER BY mr.role_key) AS new_role_keys
-- FROM tips_crm.company_memberships cm
-- JOIN tips_crm.profiles p ON p.id = cm.profile_id
-- LEFT JOIN tips_crm.membership_roles mr
--   ON mr.company_id = cm.company_id AND mr.profile_id = cm.profile_id
-- GROUP BY cm.company_id, cm.profile_id, p.full_name, p.role_key
-- ORDER BY cm.company_id, p.full_name;

-- Permission counts per membership
-- SELECT company_id, profile_id, count(*) AS permission_count
-- FROM tips_crm.membership_permissions
-- GROUP BY company_id, profile_id
-- ORDER BY company_id, profile_id;

-- Any profile with an active_company_id but no membership role at all
-- (excluding platform admins, who are expected to have none) — this is the
-- "who still needs an Owner or a manual fix" list.
-- SELECT p.id, p.full_name, p.email, p.role_key AS legacy_role_key, p.active_company_id
-- FROM tips_crm.profiles p
-- LEFT JOIN tips_crm.membership_roles mr
--   ON mr.company_id = p.active_company_id AND mr.profile_id = p.id
-- WHERE p.active_company_id IS NOT NULL
--   AND NOT p.is_platform_admin
--   AND mr.role_key IS NULL;

-- Platform admins that unexpectedly ended up with a membership row (should be empty)
-- SELECT p.id, p.full_name, cm.company_id
-- FROM tips_crm.profiles p
-- JOIN tips_crm.company_memberships cm ON cm.profile_id = p.id
-- WHERE p.is_platform_admin;

-- Companies with no Owner. No legacy key maps to `owner` (per spec), so this
-- list is expected to be non-empty after this migration — each one needs an
-- Owner assigned explicitly, decided against real company-creation records.
-- SELECT c.id, c.name
-- FROM tips_crm.companies c
-- WHERE NOT EXISTS (
--   SELECT 1 FROM tips_crm.membership_roles mr
--   WHERE mr.company_id = c.id AND mr.role_key = 'owner'
-- );
