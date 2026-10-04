-- Team members and live duty positions for the company and supervisor
-- dashboards. Until now the app showed seeded demo members and demo GPS paths;
-- the real data was already in company_memberships and duty_location_points.
--
-- Scope (same model as visible_profile_ids):
--   manager -> the whole company, supervisor -> self + direct reports, rep -> self.

CREATE OR REPLACE FUNCTION public.tips_crm_list_team_members()
RETURNS TABLE(
  id uuid, full_name text, email text, phone text,
  role_key text, role_name text, role_keys text[], disciplines text[],
  reports_to_profile_id uuid, is_active boolean,
  territory_keys text[], territory_labels text[]
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF auth.uid() IS NULL OR actor_company IS NULL THEN
    RAISE EXCEPTION 'Active company membership required';
  END IF;
  RETURN QUERY
  SELECT p.id, p.full_name, p.email, p.phone,
         m.role_key, coalesce(r.display_name, m.role_key),
         coalesce((SELECT array_agg(mr.role_key ORDER BY mr.role_key) FROM tips_crm.membership_roles mr
                   WHERE mr.company_id = actor_company AND mr.profile_id = p.id), '{}'::text[]),
         coalesce(m.disciplines, '{}'::text[]),
         m.reports_to_profile_id, (m.is_active AND p.is_active),
         coalesce(t.keys, '{}'::text[]), coalesce(t.labels, '{}'::text[])
  FROM tips_crm.company_memberships m
  JOIN tips_crm.profiles p ON p.id = m.profile_id
  LEFT JOIN tips_crm.roles r ON r.key = m.role_key
  LEFT JOIN LATERAL (
    SELECT array_agg(tr.client_key ORDER BY tr.name) keys, array_agg(tr.name ORDER BY tr.name) labels
    FROM tips_crm.territory_assignments a
    JOIN tips_crm.territories tr ON tr.id = a.territory_id
    WHERE a.profile_id = p.id AND a.company_id = actor_company AND tr.is_active
  ) t ON true
  WHERE m.company_id = actor_company
    AND m.profile_id IN (SELECT tips_crm.visible_profile_ids('employee.read.team', 'employee.manage'))
  ORDER BY p.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_team_members() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_team_members() TO authenticated;

-- One row per employee who was on duty or sent a position since since_at.
-- path holds the most recent points (oldest first), capped at max_points.
CREATE INDEX IF NOT EXISTS duty_location_points_company_captured_idx
  ON tips_crm.duty_location_points(company_id, captured_at DESC);
CREATE INDEX IF NOT EXISTS duty_location_points_profile_captured_idx
  ON tips_crm.duty_location_points(profile_id, captured_at DESC);

CREATE OR REPLACE FUNCTION public.tips_crm_list_team_duty(since_at timestamptz DEFAULT NULL, max_points integer DEFAULT 60)
RETURNS TABLE(profile_id uuid, full_name text, is_on_duty boolean, session_started_at timestamptz, last_point jsonb, path jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  window_start timestamptz := coalesce(since_at, now() - interval '14 hours');
  point_cap integer := least(greatest(coalesce(max_points, 60), 1), 500);
BEGIN
  IF auth.uid() IS NULL OR actor_company IS NULL THEN
    RAISE EXCEPTION 'Active company membership required';
  END IF;
  RETURN QUERY
  WITH scope AS (
    SELECT v AS pid FROM tips_crm.visible_profile_ids('telemetry.read.team', 'telemetry.read.company') v
  ),
  sessions AS (
    SELECT DISTINCT ON (s.profile_id) s.profile_id, s.started_at
    FROM tips_crm.duty_sessions s
    WHERE s.company_id = actor_company AND s.is_active AND s.ended_at IS NULL
      AND s.profile_id IN (SELECT pid FROM scope)
    ORDER BY s.profile_id, s.started_at DESC
  ),
  recent AS (
    SELECT q.profile_id, q.latitude, q.longitude, q.accuracy_meters, q.source, q.captured_at
    FROM (
      SELECT d.*, row_number() OVER (PARTITION BY d.profile_id ORDER BY d.captured_at DESC) rn
      FROM tips_crm.duty_location_points d
      WHERE d.company_id = actor_company AND d.captured_at >= window_start
        AND d.profile_id IN (SELECT pid FROM scope)
    ) q
    WHERE q.rn <= point_cap
  ),
  people AS (
    SELECT sessions.profile_id FROM sessions UNION SELECT recent.profile_id FROM recent
  )
  SELECT pe.profile_id, pr.full_name,
         (se.profile_id IS NOT NULL), se.started_at,
         (SELECT jsonb_build_object('latitude', r.latitude, 'longitude', r.longitude, 'accuracyMeters', r.accuracy_meters,
                                    'capturedAt', r.captured_at, 'source', r.source)
          FROM recent r WHERE r.profile_id = pe.profile_id ORDER BY r.captured_at DESC LIMIT 1),
         coalesce((SELECT jsonb_agg(jsonb_build_object('latitude', r.latitude, 'longitude', r.longitude, 'accuracyMeters', r.accuracy_meters,
                                                        'capturedAt', r.captured_at, 'source', r.source) ORDER BY r.captured_at)
                   FROM recent r WHERE r.profile_id = pe.profile_id), '[]'::jsonb)
  FROM people pe
  JOIN tips_crm.profiles pr ON pr.id = pe.profile_id
  LEFT JOIN sessions se ON se.profile_id = pe.profile_id
  ORDER BY pr.full_name;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_team_duty(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_team_duty(timestamptz, integer) TO authenticated;
