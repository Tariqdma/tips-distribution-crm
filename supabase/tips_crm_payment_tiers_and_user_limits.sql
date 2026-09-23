-- إضافة جدول باقات الدفع المالي والحدود المخصصة للموظفين
CREATE TABLE IF NOT EXISTS tips_crm.payment_tiers (
  key text PRIMARY KEY,
  name text NOT NULL,
  price_monthly numeric(10,2) NOT NULL DEFAULT 0,
  default_user_limit integer NOT NULL DEFAULT 20,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

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

-- دالة فحص حد الموظفين في الشركة النشطة
CREATE OR REPLACE FUNCTION public.tips_crm_check_company_user_limit(target_company_id uuid)
RETURNS TABLE (
  active_user_count bigint,
  max_user_limit integer,
  can_add boolean,
  payment_tier_key text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  v_max_limit integer;
  v_tier text;
  v_active_count bigint;
BEGIN
  SELECT c.max_user_limit, c.payment_tier_key
  INTO v_max_limit, v_tier
  FROM tips_crm.companies c
  WHERE c.id = target_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company not found';
  END IF;

  SELECT count(*)
  INTO v_active_count
  FROM tips_crm.company_memberships m
  WHERE m.company_id = target_company_id AND m.is_active = true;

  RETURN QUERY
  SELECT 
    v_active_count,
    v_max_limit,
    (v_active_count < v_max_limit),
    v_tier;
END;
$$;

-- دالة تحديث باقة الدفع والحد المخصص بواسطة مدير المنصة
CREATE OR REPLACE FUNCTION public.tips_crm_update_company_subscription(
  target_company_id uuid,
  new_payment_tier_key text,
  new_max_user_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = auth.uid() AND is_platform_admin = true) THEN
    RAISE EXCEPTION 'Platform Admin permission required';
  END IF;

  IF new_max_user_limit < 1 THEN
    RAISE EXCEPTION 'User limit must be at least 1';
  END IF;

  UPDATE tips_crm.companies
  SET payment_tier_key = new_payment_tier_key,
      max_user_limit = new_max_user_limit,
      updated_at = now()
  WHERE id = target_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target company not found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_check_company_user_limit(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_update_company_subscription(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_check_company_user_limit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tips_crm_update_company_subscription(uuid, text, integer) TO authenticated, service_role;
