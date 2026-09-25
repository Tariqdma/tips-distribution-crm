-- ==============================================================================
-- Tips CRM: Phase A — close the cross-tenant gaps in RLS
--
-- An audit of pg_policies found seven tables whose policies have NO company
-- scoping. Any user holding view_team_data — which every manager does — can read
-- every company's rows; several can write them too. accounts, plans, territories
-- and team_invites are correctly scoped, so this is a set of tables that were
-- missed rather than a systemic gap.
--
-- This migration ONLY adds company scoping. It deliberately leaves the old
-- permission strings (view_team_data, approve_plans, manage_territories,
-- send_notifications) exactly as they are — migrating those onto
-- membership_permissions and the 46-permission vocabulary is Phase B. Keeping
-- them separate means a failure here is unambiguous, and Phase B can be rolled
-- back to a state that is still tenant-safe.
--
-- Every change is a NARROWING: each predicate becomes
--     is_platform_admin() OR (company_id = my_company_id() AND <existing rule>)
-- so nobody gains access they did not already have.
--
-- All seven tables carry their own company_id, NOT NULL — verified against
-- information_schema, not against the SQL in this repo, which is out of date.
--
-- my_company_id() is used rather than current_actor_company_id(): the latter
-- RAISES when there is no active company, and an exception inside a policy
-- aborts the whole query. my_company_id() returns NULL, which makes the
-- predicate false and filters the row, which is the behaviour the neighbouring
-- policies on accounts and plans already rely on.
--
-- BEFORE RUNNING: anyone with active_company_id IS NULL loses write access to
-- duty points and sessions, because my_company_id() returns NULL for them. Check
-- the verification query at the bottom of this file first.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- visits
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS visits_read ON tips_crm.visits;
CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (rep_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
);

DROP POLICY IF EXISTS visits_write ON tips_crm.visits;
CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')))
);

-- ------------------------------------------------------------------
-- plan_visits — the EXISTS on plans is preserved exactly; it never
-- filtered by company, which is what let it cross tenants.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS plan_visits_read ON tips_crm.plan_visits;
CREATE POLICY plan_visits_read ON tips_crm.plan_visits FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.plans p
        WHERE p.id = plan_visits.plan_id
          AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'))
      ))
);

DROP POLICY IF EXISTS plan_visits_write ON tips_crm.plan_visits;
CREATE POLICY plan_visits_write ON tips_crm.plan_visits FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.plans p
        WHERE p.id = plan_visits.plan_id
          AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))
      ))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.plans p
        WHERE p.id = plan_visits.plan_id
          AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))
      ))
);

-- ------------------------------------------------------------------
-- duty_sessions
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS duty_sessions_read ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
);

DROP POLICY IF EXISTS duty_sessions_write ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_write ON tips_crm.duty_sessions FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND profile_id = auth.uid())
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND profile_id = auth.uid())
);

-- ------------------------------------------------------------------
-- duty_location_points
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS duty_points_read ON tips_crm.duty_location_points;
CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
);

DROP POLICY IF EXISTS duty_points_write ON tips_crm.duty_location_points;
CREATE POLICY duty_points_write ON tips_crm.duty_location_points FOR INSERT TO authenticated
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND profile_id = auth.uid())
);

-- ------------------------------------------------------------------
-- notifications — send is scoped so an alert cannot be inserted into
-- another company's tenancy.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS notifications_read ON tips_crm.notifications;
CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (recipient_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
);

DROP POLICY IF EXISTS notifications_send ON tips_crm.notifications;
CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_permission('send_notifications'))
);

DROP POLICY IF EXISTS notifications_update ON tips_crm.notifications;
CREATE POLICY notifications_update ON tips_crm.notifications FOR UPDATE TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND recipient_id = auth.uid())
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND recipient_id = auth.uid())
);

-- ------------------------------------------------------------------
-- audit_log
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS audit_log_read ON tips_crm.audit_log;
CREATE POLICY audit_log_read ON tips_crm.audit_log FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_permission('view_team_data'))
);

-- ------------------------------------------------------------------
-- territory_assignments — manage had no company clause at all, so one
-- company's territory manager could reassign another company's reps.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS assignments_read ON tips_crm.territory_assignments;
CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
);

DROP POLICY IF EXISTS assignments_manage ON tips_crm.territory_assignments;
CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_permission('manage_territories'))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_permission('manage_territories'))
);

COMMIT;

-- ==============================================================================
-- Verification
-- ==============================================================================

-- 1. Who would lose duty-tracking writes: anyone without an active company.
--    Platform admins are expected here and are unaffected (they do not record
--    field visits). Anyone else in this list needs an active_company_id.
-- SELECT id, email, full_name, role_key, is_platform_admin
-- FROM tips_crm.profiles
-- WHERE active_company_id IS NULL
-- ORDER BY is_platform_admin DESC, email;

-- 2. Every policy on the seven tables should now mention my_company_id().
--    Any row returned here still has a cross-tenant gap.
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'tips_crm'
--   AND tablename IN ('visits','plan_visits','duty_sessions','duty_location_points',
--                     'notifications','audit_log','territory_assignments')
--   AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%my_company_id%';

-- 3. Row counts per company, to confirm the data itself is tenant-clean.
--    A NULL company_id here would be invisible to everyone after this change,
--    but all seven columns are NOT NULL so this should return no NULL group.
-- SELECT 'visits' AS t, company_id, count(*) FROM tips_crm.visits GROUP BY company_id
-- UNION ALL SELECT 'plan_visits', company_id, count(*) FROM tips_crm.plan_visits GROUP BY company_id
-- UNION ALL SELECT 'duty_sessions', company_id, count(*) FROM tips_crm.duty_sessions GROUP BY company_id
-- UNION ALL SELECT 'notifications', company_id, count(*) FROM tips_crm.notifications GROUP BY company_id
-- ORDER BY 1, 2;

-- ==============================================================================
-- Rollback — restores the previous (cross-tenant) predicates exactly.
-- Only for an emergency: running this reopens the gaps this file closed.
-- ==============================================================================

-- BEGIN;
-- DROP POLICY IF EXISTS visits_read ON tips_crm.visits;
-- CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated
--   USING ((rep_id = auth.uid()) OR tips_crm.has_permission('view_team_data'));
-- DROP POLICY IF EXISTS visits_write ON tips_crm.visits;
-- CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated
--   USING ((rep_id = auth.uid()) OR tips_crm.has_permission('approve_plans'))
--   WITH CHECK ((rep_id = auth.uid()) OR tips_crm.has_permission('approve_plans'));
-- DROP POLICY IF EXISTS duty_sessions_read ON tips_crm.duty_sessions;
-- CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated
--   USING ((profile_id = auth.uid()) OR tips_crm.has_permission('view_team_data'));
-- DROP POLICY IF EXISTS duty_sessions_write ON tips_crm.duty_sessions;
-- CREATE POLICY duty_sessions_write ON tips_crm.duty_sessions FOR ALL TO authenticated
--   USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
-- DROP POLICY IF EXISTS duty_points_read ON tips_crm.duty_location_points;
-- CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated
--   USING ((profile_id = auth.uid()) OR tips_crm.has_permission('view_team_data'));
-- DROP POLICY IF EXISTS duty_points_write ON tips_crm.duty_location_points;
-- CREATE POLICY duty_points_write ON tips_crm.duty_location_points FOR INSERT TO authenticated
--   WITH CHECK (profile_id = auth.uid());
-- DROP POLICY IF EXISTS notifications_read ON tips_crm.notifications;
-- CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated
--   USING ((recipient_id = auth.uid()) OR tips_crm.has_permission('view_team_data'));
-- DROP POLICY IF EXISTS notifications_send ON tips_crm.notifications;
-- CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated
--   WITH CHECK (tips_crm.has_permission('send_notifications'));
-- DROP POLICY IF EXISTS notifications_update ON tips_crm.notifications;
-- CREATE POLICY notifications_update ON tips_crm.notifications FOR UPDATE TO authenticated
--   USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
-- DROP POLICY IF EXISTS audit_log_read ON tips_crm.audit_log;
-- CREATE POLICY audit_log_read ON tips_crm.audit_log FOR SELECT TO authenticated
--   USING (tips_crm.has_permission('view_team_data'));
-- DROP POLICY IF EXISTS assignments_read ON tips_crm.territory_assignments;
-- CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated
--   USING ((profile_id = auth.uid()) OR tips_crm.has_permission('view_team_data'));
-- DROP POLICY IF EXISTS assignments_manage ON tips_crm.territory_assignments;
-- CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated
--   USING (tips_crm.has_permission('manage_territories'))
--   WITH CHECK (tips_crm.has_permission('manage_territories'));
-- COMMIT;
