-- يكمل ملف الموظف ومناطق عمله بعد إنشاء مستخدم Auth من الخادم.
-- تعمل الدالة بهوية المدير الطالب وتتحقق من صلاحية إدارة المستخدمين.
CREATE OR REPLACE FUNCTION public.tips_crm_finalize_employee_account(
  target_profile_id uuid,
  employee_full_name text,
  employee_email text,
  employee_role_key text,
  employee_territory_keys text[],
  employee_force_password_change boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  resolved_territory_count integer;
  requested_territory_count integer;
BEGIN
  IF NOT tips_crm.has_permission('manage_users') THEN
    RAISE EXCEPTION 'User management permission required';
  END IF;

  IF employee_role_key NOT IN ('sales_manager', 'sales_rep', 'medical_rep')
     OR NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = employee_role_key AND is_active) THEN
    RAISE EXCEPTION 'Employee role is not available';
  END IF;

  SELECT cardinality(coalesce(employee_territory_keys, ARRAY[]::text[]))
  INTO requested_territory_count;

  IF employee_role_key <> 'sales_manager' AND requested_territory_count = 0 THEN
    RAISE EXCEPTION 'At least one territory is required for a representative';
  END IF;

  SELECT count(*) INTO resolved_territory_count
  FROM tips_crm.territories
  WHERE is_active AND client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]));

  IF resolved_territory_count <> requested_territory_count THEN
    RAISE EXCEPTION 'One or more territories are unavailable';
  END IF;

  UPDATE tips_crm.profiles
  SET full_name = trim(employee_full_name),
      email = lower(trim(employee_email)),
      role_key = employee_role_key,
      must_change_password = employee_force_password_change,
      temporary_password_issued_at = now()
  WHERE id = target_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Employee profile was not created';
  END IF;

  DELETE FROM tips_crm.territory_assignments
  WHERE profile_id = target_profile_id
    AND territory_id NOT IN (
      SELECT id FROM tips_crm.territories
      WHERE client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]))
    );

  INSERT INTO tips_crm.territory_assignments(territory_id, profile_id, assigned_by)
  SELECT territory.id, target_profile_id, auth.uid()
  FROM tips_crm.territories territory
  WHERE territory.client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]))
  ON CONFLICT (territory_id, profile_id) DO NOTHING;

  PERFORM tips_crm.log_audit(
    'employee_account_created',
    'profile',
    target_profile_id::text,
    jsonb_build_object(
      'email', lower(trim(employee_email)),
      'role_key', employee_role_key,
      'territory_keys', coalesce(employee_territory_keys, ARRAY[]::text[]),
      'force_password_change', employee_force_password_change
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_finalize_employee_account(uuid, text, text, text, text[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_finalize_employee_account(uuid, text, text, text, text[], boolean) TO authenticated;
