-- ==============================================================================
-- Tips CRM: Phase B2 — move every RLS policy off the old permission strings
-- onto the new 46-permission vocabulary (shared/auth/permissions.ts).
--
-- Phase A (tips_crm_tenant_isolation_phase_a.sql) closed the cross-tenant gaps
-- but deliberately left every predicate testing the OLD strings through
-- tips_crm.has_permission(text), which reads roles.permissions via the single
-- profiles.role_key. Phase B1 (tips_crm_my_profile_membership_permissions.sql)
-- made the app read the real, materialized membership_permissions. This
-- migration is the last step: the policies themselves stop calling
-- has_permission() and start calling the new tips_crm.has_perm(), which reads
-- membership_permissions for the caller's active company.
--
-- has_permission() is NOT dropped or altered. Other code still calls it
-- (tips_crm_save_role, tips_crm_list_roles, tips_crm_create_invite, and the
-- rest of chunks/03_functions.sql / tips_crm_operations.sql), and retiring
-- those RPCs is separate follow-up work, not this migration.
--
-- Every change here is a STRING SWAP plus, where item 2 or item 3 below
-- applies, a deliberate narrowing already decided by the product owner. It is
-- NOT a re-audit of scope: every company predicate, ownership clause
-- (owner_id / rep_id / created_by / recipient_id / profile_id / manager_id),
-- and is_active clause found on the live policy is preserved verbatim. Where a
-- table's existing policy never had an is_platform_admin() bypass or a
-- company predicate, this migration does NOT add one — see the report for
-- why, and for who that leaves exposed.
--
-- Sources for "current definition", per instruction, in priority order:
--   1. supabase/tips_crm_tenant_isolation_phase_a.sql — authoritative for the
--      seven Phase A tables (visits, plan_visits, duty_sessions,
--      duty_location_points, notifications, audit_log, territory_assignments).
--   2. supabase/tips_crm_company_isolation.sql — authoritative for
--      territories, accounts, plans, team_invites, visit_outcomes (the four
--      tables Phase A's own comment says "are correctly scoped"), since it is
--      strictly newer than chunks/02_rls_and_policies.sql and is what added
--      their company_id columns and is_platform_admin() bypass in the first
--      place.
--   3. supabase/tips_crm_membership_roles.sql — authoritative for
--      membership_roles, membership_permissions, role_grant_audit (these
--      tables did not exist before that migration).
--   4. supabase/tips_crm_plan_review_reminders_rls.sql — authoritative for
--      plan_review_reminders.
--   5. supabase/chunks/02_rls_and_policies.sql — treated as APPROXIMATE per
--      instruction, used only where nothing newer exists: roles_read,
--      roles_manage, profiles_read, profiles_manage, mail_settings_read,
--      mail_settings_manage, invite_email_deliveries_read.
--   6. visit_market_insights_company_read and visit_product_interactions_company_read
--      appear in NEITHER the SQL files NOR any TypeScript in this repo — see
--      the report. Their rewrite below is the lowest-confidence part of this
--      file and is flagged again at its own definition.
--
-- BEFORE RUNNING: read the report's "who would plausibly lose access"
-- section. The single most important fact in it: profiles_manage,
-- profiles_read, roles_manage, roles_read, mail_settings_read,
-- mail_settings_manage and invite_email_deliveries_read have no
-- is_platform_admin() bypass today and never gained access through the
-- Membership model — they passed only because a platform admin's legacy
-- role_key ('system_admin') carries permissions = ARRAY['all'], and
-- has_permission() treats 'all' as "yes" to anything. has_perm() does not
-- know about 'all', and a platform admin holds no Membership by design, so
-- has_perm() returns false for them on every one of those seven policies.
-- This migration does not add a bypass to them (that is a scope decision, not
-- a string swap) — it only reports the consequence.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- 1. The new helper. Modelled on tips_crm.my_company_id()
--    (supabase/tips_crm_company_isolation.sql): same STABLE SECURITY DEFINER
--    posture, same REVOKE-then-GRANT treatment. Reads membership_permissions
--    for auth.uid() scoped to that profile's active company — exactly the
--    join tips_crm_my_profile_membership_permissions.sql already uses to
--    expose this same data to the client.
--
--    Platform admins hold no Membership (enforced by trigger in
--    tips_crm_authorization_integrity.sql), so membership_permissions has no
--    rows for them and this returns false — by design. Every policy below
--    that already carries an is_platform_admin() OR keeps granting them
--    access through that branch, not through has_perm().
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.has_perm(required text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tips_crm.membership_permissions mp
    WHERE mp.profile_id = auth.uid()
      AND mp.company_id = tips_crm.my_company_id()
      AND mp.permission = required
  );
$$;

REVOKE ALL ON FUNCTION tips_crm.has_perm(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.has_perm(text) TO authenticated, service_role;

-- ------------------------------------------------------------------
-- 2. in_assigned_territory() becomes purely territorial. Its old body
--    silently OR'd in tips_crm.has_permission('view_team_data') — a
--    team-wide grant hidden inside a function named for one territory.
--    Callers that relied on that hidden branch now need it written out
--    explicitly (accounts_read and territories_read already did; see the
--    report for accounts_write, which did not and is narrowed by this).
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.in_assigned_territory(required_territory uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tips_crm.territory_assignments a
    WHERE a.territory_id = required_territory AND a.profile_id = auth.uid()
  );
$$;

-- ------------------------------------------------------------------
-- 3. accounts (supabase/tips_crm_company_isolation.sql)
--    view_team_data -> account.read.team ; manage_accounts -> account.update
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS accounts_read ON tips_crm.accounts;
CREATE POLICY accounts_read ON tips_crm.accounts
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      tips_crm.has_perm('account.read.team')
      OR created_by = auth.uid()
      OR tips_crm.in_assigned_territory(territory_id)
    )
  )
);

DROP POLICY IF EXISTS accounts_write ON tips_crm.accounts;
CREATE POLICY accounts_write ON tips_crm.accounts
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      tips_crm.has_perm('account.update')
      OR tips_crm.in_assigned_territory(territory_id)
    )
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      tips_crm.has_perm('account.update')
      OR tips_crm.in_assigned_territory(territory_id)
    )
  )
);

-- ------------------------------------------------------------------
-- 4. audit_log (supabase/tips_crm_tenant_isolation_phase_a.sql)
--    view_team_data -> audit.read.company
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS audit_log_read ON tips_crm.audit_log;
CREATE POLICY audit_log_read ON tips_crm.audit_log FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_perm('audit.read.company'))
);

-- ------------------------------------------------------------------
-- 5. duty_location_points, duty_sessions (Phase A)
--    view_team_data -> telemetry.read.team
--    (duty_*_write policies never called has_permission and are untouched.)
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS duty_points_read ON tips_crm.duty_location_points;
CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (profile_id = auth.uid() OR tips_crm.has_perm('telemetry.read.team')))
);

DROP POLICY IF EXISTS duty_sessions_read ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (profile_id = auth.uid() OR tips_crm.has_perm('telemetry.read.team')))
);

-- ------------------------------------------------------------------
-- 6. invite_email_deliveries, mail_settings (supabase/chunks/02_rls_and_policies.sql
--    — approximate, no newer source found). manage_users -> employee.manage.
--
--    Neither table carries a company_id column in any definition this repo
--    has, and neither appears in Phase A's seven-table audit. Per instruction
--    these are left exactly as found apart from the string swap — no company
--    scope is invented here. See the report.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS invite_email_deliveries_read ON tips_crm.invite_email_deliveries;
-- Platform admins reach this today because their legacy role carries permissions = ARRAY['all'],
-- which has_permission() treats as a yes to anything. has_perm() has no wildcard and they hold no
-- Membership, so the bypass has to be explicit or they silently lose access.
CREATE POLICY invite_email_deliveries_read ON tips_crm.invite_email_deliveries FOR SELECT TO authenticated
USING (tips_crm.is_platform_admin() OR tips_crm.has_perm('employee.manage'));

DROP POLICY IF EXISTS mail_settings_read ON tips_crm.mail_settings;
-- Platform admins reach this today because their legacy role carries permissions = ARRAY['all'],
-- which has_permission() treats as a yes to anything. has_perm() has no wildcard and they hold no
-- Membership, so the bypass has to be explicit or they silently lose access.
CREATE POLICY mail_settings_read ON tips_crm.mail_settings FOR SELECT TO authenticated
USING (tips_crm.is_platform_admin() OR tips_crm.has_perm('employee.manage'));

DROP POLICY IF EXISTS mail_settings_manage ON tips_crm.mail_settings;
-- Platform admins reach this today because their legacy role carries permissions = ARRAY['all'],
-- which has_permission() treats as a yes to anything. has_perm() has no wildcard and they hold no
-- Membership, so the bypass has to be explicit or they silently lose access.
CREATE POLICY mail_settings_manage ON tips_crm.mail_settings FOR ALL TO authenticated
USING (tips_crm.is_platform_admin() OR tips_crm.has_perm('employee.manage'))
WITH CHECK (tips_crm.is_platform_admin() OR tips_crm.has_perm('employee.manage'));

-- ------------------------------------------------------------------
-- 7. membership_permissions, membership_roles (supabase/tips_crm_membership_roles.sql)
--    view_team_data -> employee.manage, per the split table.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS membership_permissions_read ON tips_crm.membership_permissions;
CREATE POLICY membership_permissions_read ON tips_crm.membership_permissions FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_perm('employee.manage'))
);

DROP POLICY IF EXISTS membership_roles_read ON tips_crm.membership_roles;
CREATE POLICY membership_roles_read ON tips_crm.membership_roles FOR SELECT TO authenticated
USING (
  profile_id = auth.uid()
  OR tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_perm('employee.manage'))
);

-- ------------------------------------------------------------------
-- 8. notifications (Phase A)
--    notifications_read: product-owner decision — loses its team branch
--    entirely. recipient_id = auth.uid() plus the company predicate and
--    platform bypass; nobody reads another recipient's row anymore.
--    notifications_send: send_notifications -> notification.send.team.
--    notifications_update never called has_permission and is untouched.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS notifications_read ON tips_crm.notifications;
CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND recipient_id = auth.uid())
);

DROP POLICY IF EXISTS notifications_send ON tips_crm.notifications;
CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_perm('notification.send.team'))
);

-- ------------------------------------------------------------------
-- 9. plan_review_reminders (supabase/tips_crm_plan_review_reminders_rls.sql)
--    approve_plans -> plan.approve.team. No company_id column exists on this
--    table (plan_id/manager_id only); manager_id = auth.uid() already scopes
--    it to one caller, so nothing else changes.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS plan_review_reminders_manager_read ON tips_crm.plan_review_reminders;
CREATE POLICY plan_review_reminders_manager_read
ON tips_crm.plan_review_reminders
FOR SELECT
TO authenticated
USING (
  manager_id = auth.uid()
  AND tips_crm.has_perm('plan.approve.team')
);

-- ------------------------------------------------------------------
-- 10. plan_visits (Phase A) — the EXISTS on plans is preserved exactly.
--     view_team_data -> plan.read.team ; approve_plans -> plan.approve.team
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS plan_visits_read ON tips_crm.plan_visits;
CREATE POLICY plan_visits_read ON tips_crm.plan_visits FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.plans p
        WHERE p.id = plan_visits.plan_id
          AND (p.owner_id = auth.uid() OR tips_crm.has_perm('plan.read.team'))
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
          AND (p.owner_id = auth.uid() OR tips_crm.has_perm('plan.approve.team'))
      ))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.plans p
        WHERE p.id = plan_visits.plan_id
          AND (p.owner_id = auth.uid() OR tips_crm.has_perm('plan.approve.team'))
      ))
);

-- ------------------------------------------------------------------
-- 11. plans (supabase/tips_crm_company_isolation.sql)
--     view_team_data -> plan.read.team ; approve_plans -> plan.approve.team
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS plans_read ON tips_crm.plans;
CREATE POLICY plans_read ON tips_crm.plans
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      owner_id = auth.uid()
      OR tips_crm.has_perm('plan.read.team')
    )
  )
);

DROP POLICY IF EXISTS plans_write ON tips_crm.plans;
CREATE POLICY plans_write ON tips_crm.plans
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      owner_id = auth.uid()
      OR tips_crm.has_perm('plan.approve.team')
    )
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (
      owner_id = auth.uid()
      OR tips_crm.has_perm('plan.approve.team')
    )
  )
);

-- ------------------------------------------------------------------
-- 12. profiles (supabase/chunks/02_rls_and_policies.sql — approximate).
--     view_team_data -> employee.manage ; manage_users -> employee.manage.
--     No company_id column and no is_platform_admin() bypass in the source
--     read for this table — both preserved as-is. See the report.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_read ON tips_crm.profiles;
-- The live policy carries a platform-admin bypass AND company scoping, applied by hand when the
-- profiles table was found to have no tenant isolation at all. No file in the repo reflects that,
-- so both clauses must be preserved here explicitly — dropping either reopens a cross-tenant leak.
CREATE POLICY profiles_read ON tips_crm.profiles FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR tips_crm.is_platform_admin()
  OR (active_company_id = tips_crm.my_company_id() AND tips_crm.has_perm('employee.read.team'))
);

DROP POLICY IF EXISTS profiles_manage ON tips_crm.profiles;
CREATE POLICY profiles_manage ON tips_crm.profiles FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (active_company_id = tips_crm.my_company_id() AND tips_crm.has_perm('employee.manage'))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (active_company_id = tips_crm.my_company_id() AND tips_crm.has_perm('employee.manage'))
);

-- ------------------------------------------------------------------
-- 13. role_grant_audit (supabase/tips_crm_membership_roles.sql)
--     view_team_data -> audit.read.company
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS role_grant_audit_read ON tips_crm.role_grant_audit;
CREATE POLICY role_grant_audit_read ON tips_crm.role_grant_audit FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id() AND tips_crm.has_perm('audit.read.company'))
);

-- ------------------------------------------------------------------
-- 14. roles (supabase/chunks/02_rls_and_policies.sql — approximate).
--     manage_roles -> role.custom.manage. No company_id column and no
--     is_platform_admin() bypass in the source read — preserved as-is.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS roles_read ON tips_crm.roles;
CREATE POLICY roles_read ON tips_crm.roles FOR SELECT TO authenticated
USING (is_active OR tips_crm.has_perm('role.custom.manage'));

DROP POLICY IF EXISTS roles_manage ON tips_crm.roles;
-- Platform admins reach this today because their legacy role carries permissions = ARRAY['all'],
-- which has_permission() treats as a yes to anything. has_perm() has no wildcard and they hold no
-- Membership, so the bypass has to be explicit or they silently lose access.
CREATE POLICY roles_manage ON tips_crm.roles FOR ALL TO authenticated
USING (tips_crm.is_platform_admin() OR tips_crm.has_perm('role.custom.manage'))
WITH CHECK (tips_crm.is_platform_admin() OR tips_crm.has_perm('role.custom.manage'));

-- ------------------------------------------------------------------
-- 15. team_invites (supabase/tips_crm_company_isolation.sql)
--     manage_users -> employee.manage
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS invites_read ON tips_crm.team_invites;
CREATE POLICY invites_read ON tips_crm.team_invites
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_perm('employee.manage')
  )
);

DROP POLICY IF EXISTS invites_manage ON tips_crm.team_invites;
CREATE POLICY invites_manage ON tips_crm.team_invites
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_perm('employee.manage')
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_perm('employee.manage')
  )
);

-- ------------------------------------------------------------------
-- 16. territories (supabase/tips_crm_company_isolation.sql)
--     manage_territories -> territory.manage ; view_team_data -> employee.manage
--     (territories_read's own explicit branch, not the one now removed from
--     in_assigned_territory — see item 2).
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS territories_read ON tips_crm.territories;
CREATE POLICY territories_read ON tips_crm.territories
FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND (tips_crm.has_perm('employee.read.team') OR tips_crm.in_assigned_territory(id))
  )
);

DROP POLICY IF EXISTS territories_manage ON tips_crm.territories;
CREATE POLICY territories_manage ON tips_crm.territories
FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_perm('territory.manage')
  )
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (
    company_id = tips_crm.my_company_id()
    AND tips_crm.has_perm('territory.manage')
  )
);

-- ------------------------------------------------------------------
-- 17. territory_assignments (Phase A)
--     view_team_data -> employee.manage ; manage_territories -> territory.manage
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS assignments_read ON tips_crm.territory_assignments;
CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (profile_id = auth.uid() OR tips_crm.has_perm('employee.read.team')))
);

DROP POLICY IF EXISTS assignments_manage ON tips_crm.territory_assignments;
CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_perm('territory.manage'))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND tips_crm.has_perm('territory.manage'))
);

-- ------------------------------------------------------------------
-- 18. visit_market_insights, visit_product_interactions — LOWEST CONFIDENCE
--     REWRITE IN THIS FILE. Neither table, column, nor policy appears
--     anywhere in this repo (no SQL file, no TypeScript). The definitions
--     below are inferred from the sibling policy this pair is grouped with in
--     the settled split table (visits, alongside these two, all map
--     view_team_data -> visit.read.team), and modelled structurally on
--     visits_read: a company predicate plus an ownership branch, since every
--     other per-visit child table in this schema (plan_visits) is scoped the
--     same way. The ownership branch below assumes a `visit_id` foreign key
--     back to tips_crm.visits and reads that row's rep_id — NEITHER of which
--     this session could confirm against the live schema.
--
--     Do not run this section without first confirming, against
--     information_schema.columns (or \d in psql) for both tables, that:
--       - each has a company_id column
--       - each has a visit_id column referencing tips_crm.visits(id)
--     If either assumption is wrong, CREATE POLICY will fail loudly (the
--     whole transaction rolls back — see the header), which is the safe
--     failure mode; but a wrong OWNERSHIP assumption that still happens to
--     compile (e.g. a `created_by` column instead of a join to visits) would
--     not be caught by that and would need a human to catch it. Confirm
--     before running, do not just trust that it compiled.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS visit_market_insights_company_read ON tips_crm.visit_market_insights;
CREATE POLICY visit_market_insights_company_read ON tips_crm.visit_market_insights FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.visits v
        WHERE v.id = visit_market_insights.visit_id
          AND (v.rep_id = auth.uid() OR tips_crm.has_perm('visit.read.team'))
      ))
);

DROP POLICY IF EXISTS visit_product_interactions_company_read ON tips_crm.visit_product_interactions;
CREATE POLICY visit_product_interactions_company_read ON tips_crm.visit_product_interactions FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND EXISTS (
        SELECT 1 FROM tips_crm.visits v
        WHERE v.id = visit_product_interactions.visit_id
          AND (v.rep_id = auth.uid() OR tips_crm.has_perm('visit.read.team'))
      ))
);

-- ------------------------------------------------------------------
-- 19. visit_outcomes (supabase/tips_crm_company_isolation.sql)
--     manage_outcomes -> catalogue.manage, per the settled fold-in. No
--     is_platform_admin() bypass in the source read — preserved as-is.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS visit_outcomes_read ON tips_crm.visit_outcomes;
CREATE POLICY visit_outcomes_read ON tips_crm.visit_outcomes
FOR SELECT TO authenticated
USING (
  (company_id IS NULL OR company_id = tips_crm.my_company_id())
  AND (is_active OR tips_crm.has_perm('catalogue.manage'))
);

DROP POLICY IF EXISTS visit_outcomes_manage ON tips_crm.visit_outcomes;
CREATE POLICY visit_outcomes_manage ON tips_crm.visit_outcomes
FOR ALL TO authenticated
USING (
  company_id = tips_crm.my_company_id()
  AND tips_crm.has_perm('catalogue.manage')
)
WITH CHECK (
  company_id = tips_crm.my_company_id()
  AND tips_crm.has_perm('catalogue.manage')
);

-- ------------------------------------------------------------------
-- 20. visits (Phase A)
--     visits_read: view_team_data -> visit.read.team
--     visits_write: product-owner decision — approve_plans -> visit.review,
--     NOT plan.approve.team. Editing someone else's visit record and
--     approving a plan are different capabilities.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS visits_read ON tips_crm.visits;
CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (rep_id = auth.uid() OR tips_crm.has_perm('visit.read.team')))
);

DROP POLICY IF EXISTS visits_write ON tips_crm.visits;
CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated
USING (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (rep_id = auth.uid() OR tips_crm.has_perm('visit.review')))
)
WITH CHECK (
  tips_crm.is_platform_admin()
  OR (company_id = tips_crm.my_company_id()
      AND (rep_id = auth.uid() OR tips_crm.has_perm('visit.review')))
);

COMMIT;

-- ==============================================================================
-- Verification — run these after the migration and read the results before
-- trusting it. Nothing here mutates data.
-- ==============================================================================

-- 1. No policy in tips_crm should still reference has_permission. Expect zero
--    rows. (has_permission() itself still exists for the RPCs in
--    chunks/03_functions.sql — this only checks POLICIES.)
-- SELECT schemaname, tablename, policyname
-- FROM pg_policies
-- WHERE schemaname = 'tips_crm'
--   AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%has_permission(%';

-- 2. Every policy on the seven Phase A tables must still reference
--    my_company_id — this migration must not silently undo Phase A. Expect
--    zero rows.
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE schemaname = 'tips_crm'
--   AND tablename IN ('visits','plan_visits','duty_sessions','duty_location_points',
--                     'notifications','audit_log','territory_assignments')
--   AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%my_company_id%';

-- 3. Every permission string appearing in a tips_crm policy must be in the
--    closed 46-string vocabulary (shared/auth/permissions.ts). Expect zero
--    rows; any row returned is a typo that grants nothing and raises no error.
-- WITH known_permissions(permission) AS (
--   VALUES
--     ('portal.platform.enter'), ('portal.company.enter'), ('portal.supervisor.enter'), ('portal.rep.enter'),
--     ('company.subscription.manage'), ('company.billing.read'), ('company.transfer'), ('company.delete'),
--     ('company.profile.update'), ('employee.manage'), ('role.assign'), ('role.custom.manage'),
--     ('territory.manage'), ('team.assign'), ('catalogue.manage'),
--     ('catalogue.read'),
--     ('account.read.assigned'), ('account.read.team'), ('account.read.company'), ('account.create'),
--     ('account.update'), ('account.import'),
--     ('plan.create.own'), ('plan.read.own'), ('plan.read.team'), ('plan.read.company'),
--     ('plan.approve.team'), ('plan.approve.company'),
--     ('visit.record'), ('visit.read.own'), ('visit.read.team'), ('visit.read.company'), ('visit.review'),
--     ('telemetry.read.team'), ('telemetry.read.company'),
--     ('credit_limit.manage'), ('finance.reconcile'),
--     ('notification.send.team'),
--     ('report.read.team'), ('report.read.company'), ('report.export'), ('audit.read.company'),
--     ('platform.company.review'), ('platform.company.suspend'), ('platform.package.manage'), ('platform.audit.read')
-- ),
-- policy_text AS (
--   SELECT schemaname, tablename, policyname,
--          coalesce(qual, '') || ' ' || coalesce(with_check, '') AS body
--   FROM pg_policies
--   WHERE schemaname = 'tips_crm'
-- ),
-- extracted AS (
--   SELECT tablename, policyname, (m.match)[1] AS permission
--   FROM policy_text,
--        LATERAL regexp_matches(body, 'has_perm\(''([a-z_.]+)''\)', 'g') AS m(match)
-- )
-- SELECT * FROM extracted e
-- WHERE NOT EXISTS (SELECT 1 FROM known_permissions k WHERE k.permission = e.permission);

-- ==============================================================================
-- Rollback — restores every predicate this migration changed, verbatim, to
-- its state immediately before this file ran. Only for an emergency: this
-- reopens exactly the string mismatch Phase B2 exists to close, but it does
-- NOT reopen any Phase A cross-tenant gap — every company predicate here is
-- identical to the one Phase B2 shipped with.
-- ==============================================================================

-- BEGIN;
--
-- CREATE OR REPLACE FUNCTION tips_crm.in_assigned_territory(required_territory uuid) RETURNS boolean
-- LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
-- AS $$
--   SELECT tips_crm.has_permission('view_team_data') OR EXISTS (
--     SELECT 1 FROM tips_crm.territory_assignments a
--     WHERE a.territory_id = required_territory AND a.profile_id = auth.uid()
--   );
-- $$;
--
-- DROP POLICY IF EXISTS accounts_read ON tips_crm.accounts;
-- CREATE POLICY accounts_read ON tips_crm.accounts FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (tips_crm.has_permission('view_team_data') OR created_by = auth.uid() OR tips_crm.in_assigned_territory(territory_id)))
-- );
-- DROP POLICY IF EXISTS accounts_write ON tips_crm.accounts;
-- CREATE POLICY accounts_write ON tips_crm.accounts FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id)))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id)))
-- );
--
-- DROP POLICY IF EXISTS audit_log_read ON tips_crm.audit_log;
-- CREATE POLICY audit_log_read ON tips_crm.audit_log FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
-- );
--
-- DROP POLICY IF EXISTS duty_points_read ON tips_crm.duty_location_points;
-- CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
-- );
-- DROP POLICY IF EXISTS duty_sessions_read ON tips_crm.duty_sessions;
-- CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
-- );
--
-- DROP POLICY IF EXISTS invite_email_deliveries_read ON tips_crm.invite_email_deliveries;
-- CREATE POLICY invite_email_deliveries_read ON tips_crm.invite_email_deliveries FOR SELECT TO authenticated
-- USING (tips_crm.has_permission('manage_users'));
-- DROP POLICY IF EXISTS mail_settings_read ON tips_crm.mail_settings;
-- CREATE POLICY mail_settings_read ON tips_crm.mail_settings FOR SELECT TO authenticated
-- USING (tips_crm.has_permission('manage_users'));
-- DROP POLICY IF EXISTS mail_settings_manage ON tips_crm.mail_settings;
-- CREATE POLICY mail_settings_manage ON tips_crm.mail_settings FOR ALL TO authenticated
-- USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
--
-- DROP POLICY IF EXISTS membership_permissions_read ON tips_crm.membership_permissions;
-- CREATE POLICY membership_permissions_read ON tips_crm.membership_permissions FOR SELECT TO authenticated
-- USING (
--   profile_id = auth.uid()
--   OR tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
-- );
-- DROP POLICY IF EXISTS membership_roles_read ON tips_crm.membership_roles;
-- CREATE POLICY membership_roles_read ON tips_crm.membership_roles FOR SELECT TO authenticated
-- USING (
--   profile_id = auth.uid()
--   OR tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
-- );
--
-- DROP POLICY IF EXISTS notifications_read ON tips_crm.notifications;
-- CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (recipient_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
-- );
-- DROP POLICY IF EXISTS notifications_send ON tips_crm.notifications;
-- CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('send_notifications'))
-- );
--
-- DROP POLICY IF EXISTS plan_review_reminders_manager_read ON tips_crm.plan_review_reminders;
-- CREATE POLICY plan_review_reminders_manager_read
-- ON tips_crm.plan_review_reminders FOR SELECT TO authenticated
-- USING (manager_id = auth.uid() AND tips_crm.has_permission('approve_plans'));
--
-- DROP POLICY IF EXISTS plan_visits_read ON tips_crm.plan_visits;
-- CREATE POLICY plan_visits_read ON tips_crm.plan_visits FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND EXISTS (
--         SELECT 1 FROM tips_crm.plans p
--         WHERE p.id = plan_visits.plan_id
--           AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'))
--       ))
-- );
-- DROP POLICY IF EXISTS plan_visits_write ON tips_crm.plan_visits;
-- CREATE POLICY plan_visits_write ON tips_crm.plan_visits FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND EXISTS (
--         SELECT 1 FROM tips_crm.plans p
--         WHERE p.id = plan_visits.plan_id
--           AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))
--       ))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND EXISTS (
--         SELECT 1 FROM tips_crm.plans p
--         WHERE p.id = plan_visits.plan_id
--           AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))
--       ))
-- );
--
-- DROP POLICY IF EXISTS plans_read ON tips_crm.plans;
-- CREATE POLICY plans_read ON tips_crm.plans FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (owner_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
-- );
-- DROP POLICY IF EXISTS plans_write ON tips_crm.plans;
-- CREATE POLICY plans_write ON tips_crm.plans FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')))
-- );
--
-- DROP POLICY IF EXISTS profiles_read ON tips_crm.profiles;
-- CREATE POLICY profiles_read ON tips_crm.profiles FOR SELECT TO authenticated
-- USING (id = auth.uid() OR tips_crm.is_platform_admin()
--        OR (tips_crm.has_permission('view_team_data') AND active_company_id = tips_crm.my_company_id()));
-- DROP POLICY IF EXISTS profiles_manage ON tips_crm.profiles;
-- CREATE POLICY profiles_manage ON tips_crm.profiles FOR ALL TO authenticated
-- USING (tips_crm.is_platform_admin()
--        OR (tips_crm.has_permission('manage_users') AND active_company_id = tips_crm.my_company_id()))
-- WITH CHECK (tips_crm.is_platform_admin()
--        OR (tips_crm.has_permission('manage_users') AND active_company_id = tips_crm.my_company_id()));
--
-- DROP POLICY IF EXISTS role_grant_audit_read ON tips_crm.role_grant_audit;
-- CREATE POLICY role_grant_audit_read ON tips_crm.role_grant_audit FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('view_team_data'))
-- );
--
-- DROP POLICY IF EXISTS roles_read ON tips_crm.roles;
-- CREATE POLICY roles_read ON tips_crm.roles FOR SELECT TO authenticated
-- USING (is_active OR tips_crm.has_permission('manage_roles'));
-- DROP POLICY IF EXISTS roles_manage ON tips_crm.roles;
-- CREATE POLICY roles_manage ON tips_crm.roles FOR ALL TO authenticated
-- USING (tips_crm.has_permission('manage_roles')) WITH CHECK (tips_crm.has_permission('manage_roles'));
--
-- DROP POLICY IF EXISTS invites_read ON tips_crm.team_invites;
-- CREATE POLICY invites_read ON tips_crm.team_invites FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_users'))
-- );
-- DROP POLICY IF EXISTS invites_manage ON tips_crm.team_invites;
-- CREATE POLICY invites_manage ON tips_crm.team_invites FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_users'))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_users'))
-- );
--
-- DROP POLICY IF EXISTS territories_read ON tips_crm.territories;
-- CREATE POLICY territories_read ON tips_crm.territories FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (tips_crm.has_permission('view_team_data') OR tips_crm.in_assigned_territory(id)))
-- );
-- DROP POLICY IF EXISTS territories_manage ON tips_crm.territories;
-- CREATE POLICY territories_manage ON tips_crm.territories FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_territories'))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_territories'))
-- );
--
-- DROP POLICY IF EXISTS assignments_read ON tips_crm.territory_assignments;
-- CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
-- );
-- DROP POLICY IF EXISTS assignments_manage ON tips_crm.territory_assignments;
-- CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_territories'))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_territories'))
-- );
--
-- DROP POLICY IF EXISTS visit_market_insights_company_read ON tips_crm.visit_market_insights;
-- CREATE POLICY visit_market_insights_company_read ON tips_crm.visit_market_insights FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND EXISTS (
--         SELECT 1 FROM tips_crm.visits v
--         WHERE v.id = visit_market_insights.visit_id
--           AND (v.rep_id = auth.uid() OR tips_crm.has_permission('view_team_data'))
--       ))
-- );
-- DROP POLICY IF EXISTS visit_product_interactions_company_read ON tips_crm.visit_product_interactions;
-- CREATE POLICY visit_product_interactions_company_read ON tips_crm.visit_product_interactions FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND EXISTS (
--         SELECT 1 FROM tips_crm.visits v
--         WHERE v.id = visit_product_interactions.visit_id
--           AND (v.rep_id = auth.uid() OR tips_crm.has_permission('view_team_data'))
--       ))
-- );
--
-- DROP POLICY IF EXISTS visit_outcomes_read ON tips_crm.visit_outcomes;
-- CREATE POLICY visit_outcomes_read ON tips_crm.visit_outcomes FOR SELECT TO authenticated
-- USING (
--   (company_id IS NULL OR company_id = tips_crm.my_company_id())
--   AND (is_active OR tips_crm.has_permission('manage_outcomes'))
-- );
-- DROP POLICY IF EXISTS visit_outcomes_manage ON tips_crm.visit_outcomes;
-- CREATE POLICY visit_outcomes_manage ON tips_crm.visit_outcomes FOR ALL TO authenticated
-- USING (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_outcomes'))
-- WITH CHECK (company_id = tips_crm.my_company_id() AND tips_crm.has_permission('manage_outcomes'));
--
-- DROP POLICY IF EXISTS visits_read ON tips_crm.visits;
-- CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (rep_id = auth.uid() OR tips_crm.has_permission('view_team_data')))
-- );
-- DROP POLICY IF EXISTS visits_write ON tips_crm.visits;
-- CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated
-- USING (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')))
-- )
-- WITH CHECK (
--   tips_crm.is_platform_admin()
--   OR (company_id = tips_crm.my_company_id()
--       AND (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')))
-- );
--
-- REVOKE ALL ON FUNCTION tips_crm.has_perm(text) FROM authenticated, service_role;
-- -- has_perm() itself is left in place rather than dropped, in case anything
-- -- else was granted access to it between running this file and rolling it
-- -- back; DROP FUNCTION is a separate, deliberate step for whoever rolls back.
--
-- COMMIT;
