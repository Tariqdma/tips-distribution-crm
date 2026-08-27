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
ALTER TABLE tips_crm.visit_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.mail_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.invite_email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE tips_crm.plan_review_reminders ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION tips_crm.has_permission(required_permission text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT COALESCE((
    SELECT p.is_active AND r.is_active AND ('all' = ANY(r.permissions) OR required_permission = ANY(r.permissions))
    FROM tips_crm.profiles p
    JOIN tips_crm.roles r ON r.key = p.role_key
    WHERE p.id = auth.uid()
  ), false);
$$;

CREATE OR REPLACE FUNCTION tips_crm.in_assigned_territory(required_territory uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT tips_crm.has_permission('view_team_data') OR EXISTS (
    SELECT 1 FROM tips_crm.territory_assignments a
    WHERE a.territory_id = required_territory AND a.profile_id = auth.uid()
  );
$$;

DROP POLICY IF EXISTS roles_read ON tips_crm.roles;
CREATE POLICY roles_read ON tips_crm.roles FOR SELECT TO authenticated USING (is_active OR tips_crm.has_permission('manage_roles'));
DROP POLICY IF EXISTS roles_manage ON tips_crm.roles;
CREATE POLICY roles_manage ON tips_crm.roles FOR ALL TO authenticated USING (tips_crm.has_permission('manage_roles')) WITH CHECK (tips_crm.has_permission('manage_roles'));
DROP POLICY IF EXISTS profiles_read ON tips_crm.profiles;
CREATE POLICY profiles_read ON tips_crm.profiles FOR SELECT TO authenticated USING (id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS profiles_manage ON tips_crm.profiles;
CREATE POLICY profiles_manage ON tips_crm.profiles FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS invites_manage ON tips_crm.team_invites;
CREATE POLICY invites_manage ON tips_crm.team_invites FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS territories_read ON tips_crm.territories;
CREATE POLICY territories_read ON tips_crm.territories FOR SELECT TO authenticated USING (tips_crm.in_assigned_territory(id));
DROP POLICY IF EXISTS territories_manage ON tips_crm.territories;
CREATE POLICY territories_manage ON tips_crm.territories FOR ALL TO authenticated USING (tips_crm.has_permission('manage_territories')) WITH CHECK (tips_crm.has_permission('manage_territories'));
DROP POLICY IF EXISTS assignments_read ON tips_crm.territory_assignments;
CREATE POLICY assignments_read ON tips_crm.territory_assignments FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS assignments_manage ON tips_crm.territory_assignments;
CREATE POLICY assignments_manage ON tips_crm.territory_assignments FOR ALL TO authenticated USING (tips_crm.has_permission('manage_territories')) WITH CHECK (tips_crm.has_permission('manage_territories'));
DROP POLICY IF EXISTS accounts_read ON tips_crm.accounts;
CREATE POLICY accounts_read ON tips_crm.accounts FOR SELECT TO authenticated USING (tips_crm.in_assigned_territory(territory_id));
DROP POLICY IF EXISTS accounts_write ON tips_crm.accounts;
CREATE POLICY accounts_write ON tips_crm.accounts FOR ALL TO authenticated USING (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id)) WITH CHECK (tips_crm.has_permission('manage_accounts') OR tips_crm.in_assigned_territory(territory_id));
DROP POLICY IF EXISTS plans_read ON tips_crm.plans;
CREATE POLICY plans_read ON tips_crm.plans FOR SELECT TO authenticated USING (owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS plans_write ON tips_crm.plans;
CREATE POLICY plans_write ON tips_crm.plans FOR ALL TO authenticated USING (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')) WITH CHECK (owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'));
DROP POLICY IF EXISTS plan_visits_read ON tips_crm.plan_visits;
CREATE POLICY plan_visits_read ON tips_crm.plan_visits FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('view_team_data'))));
DROP POLICY IF EXISTS plan_visits_write ON tips_crm.plan_visits;
CREATE POLICY plan_visits_write ON tips_crm.plan_visits FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans')))) WITH CHECK (EXISTS (SELECT 1 FROM tips_crm.plans p WHERE p.id = plan_id AND (p.owner_id = auth.uid() OR tips_crm.has_permission('approve_plans'))));
DROP POLICY IF EXISTS visits_read ON tips_crm.visits;
CREATE POLICY visits_read ON tips_crm.visits FOR SELECT TO authenticated USING (rep_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS visits_write ON tips_crm.visits;
CREATE POLICY visits_write ON tips_crm.visits FOR ALL TO authenticated USING (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans')) WITH CHECK (rep_id = auth.uid() OR tips_crm.has_permission('approve_plans'));
DROP POLICY IF EXISTS duty_sessions_read ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_read ON tips_crm.duty_sessions FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS duty_sessions_write ON tips_crm.duty_sessions;
CREATE POLICY duty_sessions_write ON tips_crm.duty_sessions FOR ALL TO authenticated USING (profile_id = auth.uid()) WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS duty_points_read ON tips_crm.duty_location_points;
CREATE POLICY duty_points_read ON tips_crm.duty_location_points FOR SELECT TO authenticated USING (profile_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS duty_points_write ON tips_crm.duty_location_points;
CREATE POLICY duty_points_write ON tips_crm.duty_location_points FOR INSERT TO authenticated WITH CHECK (profile_id = auth.uid());
DROP POLICY IF EXISTS notifications_read ON tips_crm.notifications;
CREATE POLICY notifications_read ON tips_crm.notifications FOR SELECT TO authenticated USING (recipient_id = auth.uid() OR tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS notifications_update ON tips_crm.notifications;
CREATE POLICY notifications_update ON tips_crm.notifications FOR UPDATE TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
DROP POLICY IF EXISTS notifications_send ON tips_crm.notifications;
CREATE POLICY notifications_send ON tips_crm.notifications FOR INSERT TO authenticated WITH CHECK (tips_crm.has_permission('send_notifications'));
DROP POLICY IF EXISTS visit_outcomes_read ON tips_crm.visit_outcomes;
CREATE POLICY visit_outcomes_read ON tips_crm.visit_outcomes FOR SELECT TO authenticated USING (is_active OR tips_crm.has_permission('manage_outcomes'));
DROP POLICY IF EXISTS visit_outcomes_manage ON tips_crm.visit_outcomes;
CREATE POLICY visit_outcomes_manage ON tips_crm.visit_outcomes FOR ALL TO authenticated USING (tips_crm.has_permission('manage_outcomes')) WITH CHECK (tips_crm.has_permission('manage_outcomes'));
DROP POLICY IF EXISTS mail_settings_read ON tips_crm.mail_settings;
CREATE POLICY mail_settings_read ON tips_crm.mail_settings FOR SELECT TO authenticated USING (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS mail_settings_manage ON tips_crm.mail_settings;
CREATE POLICY mail_settings_manage ON tips_crm.mail_settings FOR ALL TO authenticated USING (tips_crm.has_permission('manage_users')) WITH CHECK (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS invite_email_deliveries_read ON tips_crm.invite_email_deliveries;
CREATE POLICY invite_email_deliveries_read ON tips_crm.invite_email_deliveries FOR SELECT TO authenticated USING (tips_crm.has_permission('manage_users'));
DROP POLICY IF EXISTS audit_log_read ON tips_crm.audit_log;
CREATE POLICY audit_log_read ON tips_crm.audit_log FOR SELECT TO authenticated USING (tips_crm.has_permission('view_team_data'));
DROP POLICY IF EXISTS plan_review_reminders_manager_read ON tips_crm.plan_review_reminders;
CREATE POLICY plan_review_reminders_manager_read ON tips_crm.plan_review_reminders FOR SELECT TO authenticated USING (manager_id = auth.uid() AND tips_crm.has_permission('approve_plans'));

REVOKE INSERT, UPDATE, DELETE ON tips_crm.plan_review_reminders FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm REVOKE ALL ON TABLES FROM PUBLIC, anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA tips_crm GRANT ALL ON TABLES TO service_role;

GRANT USAGE ON SCHEMA tips_crm TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, service_role;
