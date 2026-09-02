-- Keep employee territory assignments tenant-scoped when finalizing an account.
CREATE OR REPLACE FUNCTION public.tips_crm_finalize_employee_account(
  target_profile_id uuid,
  employee_full_name text,
  employee_email text,
  employee_role_key text,
  employee_territory_keys text[],
  employee_force_password_change boolean
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company_id uuid;
  res_terr_num integer;
  req_terr_num integer;
BEGIN
  actor_company_id := tips_crm.current_actor_company_id();
  IF actor_company_id IS NULL THEN RAISE EXCEPTION 'Active company is required'; END IF;
  IF NOT tips_crm.has_permission('manage_users') THEN RAISE EXCEPTION 'User management permission required'; END IF;
  IF employee_role_key NOT IN ('sales_manager', 'sales_rep', 'medical_rep')
     OR NOT EXISTS (SELECT 1 FROM tips_crm.roles WHERE key = employee_role_key AND is_active) THEN
    RAISE EXCEPTION 'Employee role is not available';
  END IF;

  SELECT cardinality(coalesce(employee_territory_keys, ARRAY[]::text[])) INTO req_terr_num;
  IF employee_role_key <> 'sales_manager' AND req_terr_num = 0 THEN
    RAISE EXCEPTION 'At least one territory is required for a representative';
  END IF;
  SELECT count(*) INTO res_terr_num
  FROM tips_crm.territories
  WHERE company_id = actor_company_id
    AND is_active
    AND client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]));
  IF res_terr_num <> req_terr_num THEN RAISE EXCEPTION 'One or more territories are unavailable'; END IF;

  UPDATE tips_crm.profiles
  SET full_name = trim(employee_full_name),
      email = lower(trim(employee_email)),
      role_key = employee_role_key,
      active_company_id = actor_company_id,
      is_active = true,
      must_change_password = employee_force_password_change,
      temporary_password_issued_at = now(),
      updated_at = now()
  WHERE id = target_profile_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Employee profile was not created'; END IF;

  IF EXISTS (SELECT 1 FROM tips_crm.company_memberships WHERE company_id = actor_company_id AND profile_id = target_profile_id) THEN
    UPDATE tips_crm.company_memberships
    SET role_key = employee_role_key, is_active = true, updated_at = now()
    WHERE company_id = actor_company_id AND profile_id = target_profile_id;
  ELSE
    INSERT INTO tips_crm.company_memberships(company_id, profile_id, role_key, is_active, joined_at, updated_at)
    VALUES (actor_company_id, target_profile_id, employee_role_key, true, now(), now());
  END IF;

  DELETE FROM tips_crm.territory_assignments
  WHERE company_id = actor_company_id
    AND profile_id = target_profile_id
    AND territory_id NOT IN (
      SELECT id FROM tips_crm.territories
      WHERE company_id = actor_company_id
        AND client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]))
    );

  INSERT INTO tips_crm.territory_assignments(company_id, territory_id, profile_id, assigned_by)
  SELECT actor_company_id, territory.id, target_profile_id, auth.uid()
  FROM tips_crm.territories territory
  WHERE territory.company_id = actor_company_id
    AND territory.is_active
    AND territory.client_key = ANY(coalesce(employee_territory_keys, ARRAY[]::text[]))
  ON CONFLICT (territory_id, profile_id) DO UPDATE SET company_id = EXCLUDED.company_id, assigned_by = EXCLUDED.assigned_by;

  PERFORM tips_crm.log_audit(
    'employee_account_created',
    'profile',
    target_profile_id::text,
    jsonb_build_object(
      'company_id', actor_company_id,
      'email', lower(trim(employee_email)),
      'role_key', employee_role_key,
      'territory_keys', coalesce(employee_territory_keys, ARRAY[]::text[]),
      'force_password_change', employee_force_password_change
    )
  );
  RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tips_crm_finalize_employee_account(uuid, text, text, text, text[], boolean) TO authenticated;
