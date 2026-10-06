-- The tips_crm schema is not exposed through the REST API, so every
-- supabase.schema("tips_crm").from(...) call in the app failed with
-- "Invalid schema: tips_crm" (medical invitations, duty tracking, team alerts,
-- visit attachments, the live map). These functions replace those calls; the
-- schema stays unexposed.

-- 1. Medical event invitations ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_list_medical_event_invitations(target_event_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, event_id uuid, account_id uuid, invitation_status text, notes text, created_at timestamptz,
              event_title text, event_starts_at timestamptz, account_name text, account_specialty text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  RETURN QUERY
  SELECT i.id, i.event_id, i.account_id, i.invitation_status, i.notes, i.created_at,
         e.title, e.starts_at, a.name, a.specialty
  FROM tips_crm.medical_event_invitations i
  JOIN tips_crm.medical_events e ON e.id = i.event_id
  LEFT JOIN tips_crm.accounts a ON a.id = i.account_id
  WHERE i.company_id = tips_crm.my_company_id()
    -- Same rule as the medical_event_invitations_read policy.
    AND (tips_crm.can_manage_medical()
         OR i.assigned_rep_id IN (SELECT tips_crm.visible_profile_ids('visit.read.team', 'visit.read.company')))
    AND (target_event_id IS NULL OR i.event_id = target_event_id)
  ORDER BY i.created_at DESC
  LIMIT 500;
END;
$$;

-- 2. Team alert from the operations screen ------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_send_team_notification(title_input text, body_input text, kind_input text DEFAULT 'alert')
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  sent integer;
BEGIN
  IF actor_company IS NULL OR NOT (tips_crm.has_perm('notification.send.team') OR tips_crm.has_permission('send_notifications')) THEN
    RAISE EXCEPTION 'Notification permission required';
  END IF;
  IF coalesce(trim(title_input), '') = '' OR coalesce(trim(body_input), '') = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;
  IF kind_input NOT IN ('plan', 'visit', 'alert', 'team', 'duty') THEN
    RAISE EXCEPTION 'Invalid notification kind';
  END IF;
  -- Supervisors reach their team; managers (employee.manage) the whole company.
  INSERT INTO tips_crm.notifications(recipient_id, company_id, title, body, kind, created_by)
  SELECT v, actor_company, left(trim(title_input), 200), left(trim(body_input), 2000), kind_input, auth.uid()
  FROM tips_crm.visible_profile_ids('notification.send.team', 'employee.manage') v
  WHERE v <> auth.uid();
  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

-- 3. Visit attachment metadata --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_add_visit_attachment(target_visit_id uuid, bucket_path_input text, file_name_input text, mime_type_input text, file_size_input bigint DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  new_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.visits v
    WHERE v.id = target_visit_id AND v.rep_id = auth.uid() AND v.company_id = tips_crm.my_company_id()
  ) THEN
    RAISE EXCEPTION 'Visit not found';
  END IF;
  IF split_part(bucket_path_input, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'Attachment path must be inside your own folder';
  END IF;
  INSERT INTO tips_crm.visit_attachments(visit_id, profile_id, bucket_path, file_name, mime_type, file_size)
  VALUES (target_visit_id, auth.uid(), bucket_path_input, left(file_name_input, 200), mime_type_input, file_size_input)
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;

-- 4. Duty tracking ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_start_duty_session()
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  session_id uuid;
BEGIN
  IF auth.uid() IS NULL OR actor_company IS NULL THEN
    RAISE EXCEPTION 'Active company membership required';
  END IF;
  SELECT s.id INTO session_id
  FROM tips_crm.duty_sessions s
  WHERE s.profile_id = auth.uid() AND s.company_id = actor_company AND s.is_active AND s.ended_at IS NULL
  ORDER BY s.started_at DESC LIMIT 1;
  IF session_id IS NULL THEN
    INSERT INTO tips_crm.duty_sessions(profile_id, company_id, tracking_consent_at)
    VALUES (auth.uid(), actor_company, now())
    RETURNING id INTO session_id;
  END IF;
  RETURN session_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_end_duty_session()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  ended boolean;
BEGIN
  UPDATE tips_crm.duty_sessions SET is_active = false, ended_at = now()
  WHERE profile_id = auth.uid() AND is_active AND ended_at IS NULL;
  ended := FOUND;
  RETURN ended;
END;
$$;

-- points: [{latitude, longitude, accuracyMeters, speedMetersPerSecond, capturedAt, source}]
CREATE OR REPLACE FUNCTION public.tips_crm_record_duty_points(points jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
  current_session uuid := public.tips_crm_start_duty_session();
  inserted integer;
BEGIN
  INSERT INTO tips_crm.duty_location_points(session_id, profile_id, company_id, latitude, longitude, accuracy_meters, speed_meters_per_second, source, captured_at)
  SELECT current_session, auth.uid(), actor_company,
         (p->>'latitude')::numeric, (p->>'longitude')::numeric,
         round((p->>'accuracyMeters')::numeric)::integer,
         round((p->>'speedMetersPerSecond')::numeric, 2),
         CASE WHEN p->>'source' = 'background' THEN 'background' ELSE 'foreground' END,
         coalesce((p->>'capturedAt')::timestamptz, now())
  FROM jsonb_array_elements(coalesce(points, '[]'::jsonb)) p
  WHERE (p->>'latitude')::numeric BETWEEN -90 AND 90
    AND (p->>'longitude')::numeric BETWEEN -180 AND 180
  LIMIT 200;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  RETURN inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_list_medical_event_invitations(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_send_team_notification(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_add_visit_attachment(uuid, text, text, text, bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_start_duty_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_end_duty_session() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_record_duty_points(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_medical_event_invitations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_send_team_notification(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_add_visit_attachment(uuid, text, text, text, bigint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_start_duty_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_end_duty_session() TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_record_duty_points(jsonb) TO authenticated;
