-- RPC for Platform Admin: List Platform Companies
CREATE OR REPLACE FUNCTION public.tips_crm_list_platform_companies()
RETURNS TABLE (
  company_id uuid,
  company_name text,
  company_slug text,
  status text,
  plan_key text,
  primary_manager_name text,
  primary_manager_email text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id AS company_id,
    c.name AS company_name,
    c.slug AS company_slug,
    c.status,
    c.plan_key,
    c.primary_contact_name AS primary_manager_name,
    c.primary_contact_email AS primary_manager_email,
    c.created_at
  FROM tips_crm.companies c
  ORDER BY c.created_at DESC;
END;
$$;

-- RPC for Platform Admin: List Platform Company Requests
CREATE OR REPLACE FUNCTION public.tips_crm_list_platform_company_requests()
RETURNS TABLE (
  id uuid,
  company_name text,
  contact_name text,
  contact_email text,
  contact_phone text,
  expected_user_count integer,
  activity_type text,
  notes text,
  status text,
  created_at timestamptz,
  review_note text,
  invitation_sent_at timestamptz,
  invitation_activated_at timestamptz,
  invitation_cancelled_at timestamptz,
  approved_company_id uuid,
  manager_full_name text,
  manager_email text,
  latest_email_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    r.id,
    r.company_name,
    r.contact_name,
    r.contact_email,
    r.contact_phone,
    r.expected_user_count,
    r.activity_type,
    r.notes,
    r.status,
    r.created_at,
    r.review_note,
    r.invitation_sent_at,
    r.invitation_activated_at,
    r.invitation_cancelled_at,
    r.approved_company_id,
    p.full_name AS manager_full_name,
    p.email AS manager_email,
    NULL::text AS latest_email_status
  FROM tips_crm.company_requests r
  LEFT JOIN tips_crm.profiles p ON p.id = r.manager_profile_id
  ORDER BY r.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tips_crm_list_platform_companies() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_platform_company_requests() TO authenticated, service_role;
