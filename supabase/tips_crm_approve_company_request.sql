-- ==============================================================================
-- Tips CRM: approve_company_request RPC
--
-- الدالة المفقودة التي تستدعيها server/platform-company.ts لاعتماد شركة جديدة.
-- شغّل هذا الملف في Supabase Dashboard → SQL Editor.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.tips_crm_approve_company_request(
  target_request_id  uuid,
  target_profile_id  uuid,
  approved_slug      text,
  manager_full_name  text,
  manager_email      text,
  selected_plan_key  text DEFAULT 'standard'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  v_request       tips_crm.company_requests%ROWTYPE;
  v_company_id    uuid;
  v_plan_key      text;
BEGIN
  -- 1. تحقق أن المستخدم الحالي هو مدير منصة
  IF NOT EXISTS (
    SELECT 1 FROM tips_crm.profiles
    WHERE id = auth.uid() AND is_platform_admin = true
  ) THEN
    RAISE EXCEPTION 'Platform Admin permission required';
  END IF;

  -- 2. جلب الطلب والتحقق من حالته
  SELECT * INTO v_request
  FROM tips_crm.company_requests
  WHERE id = target_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company request not found: %', target_request_id;
  END IF;

  IF v_request.status NOT IN ('submitted', 'awaiting_info', 'info_requested') THEN
    RAISE EXCEPTION 'Request is not in an approvable state (current: %)', v_request.status;
  END IF;

  -- 3. تحقق من عدم تكرار الـ slug
  IF EXISTS (SELECT 1 FROM tips_crm.companies WHERE slug = approved_slug) THEN
    RAISE EXCEPTION 'Company slug already taken: %', approved_slug;
  END IF;

  -- 4. تحديد الـ plan_key
  v_plan_key := COALESCE(NULLIF(trim(selected_plan_key), ''), 'standard');

  -- 5. إنشاء الشركة
  INSERT INTO tips_crm.companies (
    name,
    slug,
    status,
    plan_key,
    payment_tier_key,
    max_user_limit,
    primary_contact_name,
    primary_contact_email
  )
  VALUES (
    v_request.company_name,
    approved_slug,
    'active',
    v_plan_key,
    v_plan_key,
    20,  -- الحد الافتراضي، يمكن تغييره لاحقاً عبر updateCompanySubscription
    manager_full_name,
    manager_email
  )
  RETURNING id INTO v_company_id;

  -- 6. ربط ملف مدير الشركة بالشركة الجديدة
  UPDATE tips_crm.profiles
  SET
    active_company_id = v_company_id,
    updated_at        = now()
  WHERE id = target_profile_id;

  -- 7. إنشاء company_membership للمدير بدور 'manager'
  INSERT INTO tips_crm.company_memberships (company_id, profile_id, role_key, is_active)
  VALUES (v_company_id, target_profile_id, 'manager', true)
  ON CONFLICT (company_id, profile_id) DO UPDATE
    SET role_key  = 'manager',
        is_active = true;

  -- 8. إضافة membership_role بدور 'manager' (النموذج الجديد)
  INSERT INTO tips_crm.membership_roles (company_id, profile_id, role_key, granted_by)
  VALUES (v_company_id, target_profile_id, 'manager', auth.uid())
  ON CONFLICT (company_id, profile_id, role_key) DO NOTHING;

  -- 9. تحديث حالة الطلب
  UPDATE tips_crm.company_requests
  SET
    status              = 'approved',
    approved_company_id = v_company_id,
    manager_profile_id  = target_profile_id,
    updated_at          = now()
  WHERE id = target_request_id;

  -- 10. إرجاع معرّف الشركة الجديدة
  RETURN v_company_id;
END;
$$;

-- منح الصلاحية للمستخدمين المصادق عليهم وخدمة Supabase
REVOKE ALL ON FUNCTION public.tips_crm_approve_company_request(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_approve_company_request(uuid, uuid, text, text, text, text)
  TO authenticated, service_role;
