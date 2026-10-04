-- Platform: company join requests and company administration.
-- Reference number shown to applicants = first 8 hex chars of the request id.
-- Platform-admin functions check tips_crm.is_platform_admin(); the two public
-- functions (create request, check status) are callable by anon through the
-- server only.

CREATE OR REPLACE FUNCTION tips_crm.require_platform_admin()
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT tips_crm.is_platform_admin() THEN RAISE EXCEPTION 'Platform administrator permission required'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION tips_crm.require_platform_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tips_crm.require_platform_admin() TO authenticated;

-- Public: submit and track a request ------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_create_company_request(request_company_name text, request_contact_name text, request_contact_email text, request_contact_phone text DEFAULT NULL, request_expected_user_count integer DEFAULT NULL, request_notes text DEFAULT NULL, request_activity_type text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE new_id uuid;
BEGIN
  IF length(trim(coalesce(request_company_name, ''))) < 2 OR length(trim(coalesce(request_contact_name, ''))) < 2
     OR coalesce(request_contact_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Invalid request details';
  END IF;
  -- Basic abuse guard: at most 3 open requests per email per day.
  IF (SELECT count(*) FROM tips_crm.company_requests r
      WHERE lower(r.contact_email) = lower(trim(request_contact_email)) AND r.created_at > now() - interval '1 day') >= 3 THEN
    RAISE EXCEPTION 'Too many requests for this email today';
  END IF;
  INSERT INTO tips_crm.company_requests(company_name, contact_name, contact_email, contact_phone, expected_user_count, notes, activity_type, status)
  VALUES (trim(request_company_name), trim(request_contact_name), lower(trim(request_contact_email)), nullif(trim(coalesce(request_contact_phone, '')), ''),
          CASE WHEN request_expected_user_count > 0 THEN request_expected_user_count END,
          nullif(trim(coalesce(request_notes, '')), ''), nullif(trim(coalesce(request_activity_type, '')), ''), 'submitted')
  RETURNING id INTO new_id;
  RETURN new_id;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_create_company_request(text, text, text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_create_company_request(text, text, text, text, integer, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.tips_crm_get_company_request_public_status(reference_id text)
RETURNS TABLE(reference_number text, company_name text, status text, submitted_at timestamptz, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  SELECT left(r.id::text, 8), r.company_name, r.status, r.created_at, r.updated_at
  FROM tips_crm.company_requests r
  WHERE reference_id ~ '^[a-f0-9]{8}$' AND left(r.id::text, 8) = reference_id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_get_company_request_public_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_get_company_request_public_status(text) TO anon, authenticated;

-- Platform admin: lists ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_list_platform_companies()
RETURNS TABLE(company_id uuid, company_name text, company_slug text, status text, plan_key text, payment_tier_key text, max_user_limit integer, active_user_count bigint, primary_manager_name text, primary_manager_email text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  PERFORM tips_crm.require_platform_admin();
  RETURN QUERY
  SELECT c.id, c.name, c.slug, c.status, c.plan_key, c.payment_tier_key, c.max_user_limit,
    (SELECT count(*) FROM tips_crm.company_memberships m WHERE m.company_id = c.id AND m.is_active),
    coalesce(mgr.full_name, c.primary_contact_name), coalesce(mgr.email, c.primary_contact_email), c.created_at
  FROM tips_crm.companies c
  LEFT JOIN LATERAL (
    SELECT p.full_name, p.email
    FROM tips_crm.membership_roles mr
    JOIN tips_crm.profiles p ON p.id = mr.profile_id
    WHERE mr.company_id = c.id AND mr.role_key IN ('owner', 'manager')
    ORDER BY (mr.role_key = 'owner') DESC, mr.granted_at
    LIMIT 1
  ) mgr ON true
  ORDER BY c.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_platform_company_requests()
RETURNS TABLE(id uuid, company_name text, contact_name text, contact_email text, contact_phone text, expected_user_count integer, activity_type text, notes text, status text, created_at timestamptz, review_note text, invitation_sent_at timestamptz, invitation_activated_at timestamptz, invitation_cancelled_at timestamptz, approved_company_id uuid, manager_full_name text, manager_email text, latest_email_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  PERFORM tips_crm.require_platform_admin();
  RETURN QUERY
  SELECT r.id, r.company_name, r.contact_name, r.contact_email, r.contact_phone, r.expected_user_count, r.activity_type, r.notes,
    r.status, r.created_at, r.review_note, r.invitation_sent_at, r.invitation_activated_at, r.invitation_cancelled_at,
    r.approved_company_id, p.full_name, p.email,
    (SELECT d.delivery_status FROM tips_crm.company_request_email_deliveries d WHERE d.request_id = r.id ORDER BY d.created_at DESC LIMIT 1)
  FROM tips_crm.company_requests r
  LEFT JOIN tips_crm.profiles p ON p.id = r.manager_profile_id
  ORDER BY r.created_at DESC;
END;
$$;

-- Platform admin: review workflow ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_add_company_request_note(target_request_id uuid, target_note_text text, target_is_internal boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE note_id uuid;
BEGIN
  PERFORM tips_crm.require_platform_admin();
  IF nullif(trim(coalesce(target_note_text, '')), '') IS NULL THEN RAISE EXCEPTION 'Note text is required'; END IF;
  INSERT INTO tips_crm.company_request_notes(request_id, note_text, created_by, is_internal)
  VALUES (target_request_id, trim(target_note_text), auth.uid(), coalesce(target_is_internal, true))
  RETURNING id INTO note_id;
  RETURN note_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_request_company_info(target_request_id uuid, information_needed text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  PERFORM tips_crm.require_platform_admin();
  UPDATE tips_crm.company_requests
  SET status = 'awaiting_info', review_note = trim(information_needed), reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = target_request_id AND status IN ('submitted', 'awaiting_info');
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or no longer open'; END IF;
  INSERT INTO tips_crm.company_request_notes(request_id, note_text, created_by, is_internal)
  VALUES (target_request_id, trim(information_needed), auth.uid(), false);
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_review_company_request(target_request_id uuid, next_status text, next_review_note text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  PERFORM tips_crm.require_platform_admin();
  IF next_status NOT IN ('submitted', 'awaiting_info', 'rejected', 'cancelled') THEN
    RAISE EXCEPTION 'Use the approval flow to approve a request';
  END IF;
  UPDATE tips_crm.company_requests
  SET status = next_status, review_note = coalesce(nullif(trim(coalesce(next_review_note, '')), ''), review_note),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
  WHERE id = target_request_id AND status NOT IN ('approved', 'invitation_sent', 'manager_activated');
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or already approved'; END IF;
  RETURN true;
END;
$$;

-- Approval: creates the company and makes the new manager its owner and manager.
-- The manager's auth user is created by the server (service role) beforehand;
-- handle_auth_user_created has already inserted the profile row.
CREATE OR REPLACE FUNCTION public.tips_crm_approve_company_request(target_request_id uuid, target_profile_id uuid, approved_slug text, manager_full_name text, manager_email text, selected_plan_key text DEFAULT 'standard')
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  req tips_crm.company_requests%ROWTYPE;
  new_company_id uuid;
  tier_limit integer;
BEGIN
  PERFORM tips_crm.require_platform_admin();
  SELECT * INTO req FROM tips_crm.company_requests WHERE id = target_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status IN ('approved', 'invitation_sent', 'manager_activated') THEN RAISE EXCEPTION 'Request is already approved'; END IF;
  IF approved_slug !~ '^[a-z0-9][a-z0-9-]{1,48}$' THEN RAISE EXCEPTION 'Invalid company slug'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = target_profile_id) THEN RAISE EXCEPTION 'Manager profile not found'; END IF;

  SELECT default_user_limit INTO tier_limit FROM tips_crm.payment_tiers WHERE key = coalesce(selected_plan_key, 'standard') AND is_active;

  INSERT INTO tips_crm.companies(name, slug, status, plan_key, payment_tier_key, max_user_limit, primary_contact_name, primary_contact_email, created_by)
  VALUES (req.company_name, approved_slug, 'active', coalesce(selected_plan_key, 'standard'), coalesce(selected_plan_key, 'standard'),
          coalesce(tier_limit, 20), trim(manager_full_name), lower(trim(manager_email)), auth.uid())
  RETURNING id INTO new_company_id;

  UPDATE tips_crm.profiles
  SET full_name = trim(manager_full_name), email = lower(trim(manager_email)), role_key = 'company_manager',
      is_active = true, active_company_id = new_company_id, updated_at = now()
  WHERE id = target_profile_id;

  INSERT INTO tips_crm.company_memberships(company_id, profile_id, role_key, is_active, disciplines)
  VALUES (new_company_id, target_profile_id, 'company_manager', true, '{}'::text[])
  ON CONFLICT (company_id, profile_id) DO UPDATE SET role_key = 'company_manager', is_active = true, updated_at = now();

  INSERT INTO tips_crm.membership_roles(company_id, profile_id, role_key, granted_by)
  VALUES (new_company_id, target_profile_id, 'owner', auth.uid()), (new_company_id, target_profile_id, 'manager', auth.uid())
  ON CONFLICT DO NOTHING;

  UPDATE tips_crm.company_requests
  SET status = 'approved', approved_company_id = new_company_id, manager_profile_id = target_profile_id,
      requested_slug = approved_slug, reviewed_by = auth.uid(), reviewed_at = now(), invitation_sent_at = now(), updated_at = now()
  WHERE id = target_request_id;

  PERFORM tips_crm.log_audit('company_request_approved', 'company', new_company_id::text,
    jsonb_build_object('request_id', target_request_id, 'manager_id', target_profile_id, 'plan', selected_plan_key));
  RETURN new_company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_update_company_plan_limit(p_company_id uuid, p_plan_key text, p_max_user_limit integer)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  PERFORM tips_crm.require_platform_admin();
  IF p_max_user_limit IS NULL OR p_max_user_limit < 1 THEN RAISE EXCEPTION 'User limit must be at least 1'; END IF;
  IF NOT EXISTS (SELECT 1 FROM tips_crm.payment_tiers WHERE key = p_plan_key AND is_active) THEN RAISE EXCEPTION 'Unknown plan'; END IF;
  UPDATE tips_crm.companies SET plan_key = p_plan_key, payment_tier_key = p_plan_key, max_user_limit = p_max_user_limit, updated_at = now()
  WHERE id = p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Company not found'; END IF;
  PERFORM tips_crm.log_audit('company_plan_updated', 'company', p_company_id::text, jsonb_build_object('plan', p_plan_key, 'max_user_limit', p_max_user_limit));
  RETURN true;
END;
$$;

-- The manager signs in for the first time: mark the request as activated.
CREATE OR REPLACE FUNCTION public.tips_crm_mark_company_manager_activation()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
  WITH updated AS (
    UPDATE tips_crm.company_requests
    SET status = 'manager_activated', invitation_activated_at = coalesce(invitation_activated_at, now()), updated_at = now()
    WHERE manager_profile_id = auth.uid() AND status IN ('approved', 'invitation_sent')
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM updated);
$$;

DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.tips_crm_list_platform_companies()',
    'public.tips_crm_list_platform_company_requests()',
    'public.tips_crm_add_company_request_note(uuid, text, boolean)',
    'public.tips_crm_request_company_info(uuid, text)',
    'public.tips_crm_review_company_request(uuid, text, text)',
    'public.tips_crm_approve_company_request(uuid, uuid, text, text, text, text)',
    'public.tips_crm_update_company_plan_limit(uuid, text, integer)',
    'public.tips_crm_mark_company_manager_activation()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
