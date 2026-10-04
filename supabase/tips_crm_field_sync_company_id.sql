-- ==============================================================================
-- Field sync: fill company_id on rows created from the mobile app
-- ==============================================================================
-- Symptom (Rep app, visit sync history):
--   null value in column "company_id" of relation "accounts" violates not-null constraint
--
-- Cause: company isolation made company_id NOT NULL on the tenant tables, but
-- tips_crm_sync_account (and possibly other RPCs written before isolation)
-- still inserts without it. The visit report is never sent because its account
-- cannot be created first, so supervisors and managers never see the visit.
--
-- Fix:
--   1. tips_crm_sync_account sets company_id from the caller's active company
--      and only matches accounts inside that company.
--   2. A BEFORE INSERT trigger fills a missing company_id from the caller's
--      active company on every tenant table the field app writes to. It never
--      overrides a company_id the insert already set.
--
-- Safe to re-run. Run in Supabase Dashboard -> SQL Editor.
-- ==============================================================================

BEGIN;

-- 1. Account sync -------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tips_crm_sync_account(local_ref_input text, account_type text, account_name text, account_specialty text, account_state text, account_city text, account_area text, account_address text, account_phone text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  account_id uuid;
  actor_company_id uuid := tips_crm.my_company_id();
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM tips_crm.profiles WHERE id = auth.uid() AND is_active) THEN
    RAISE EXCEPTION 'Active account required';
  END IF;
  IF actor_company_id IS NULL THEN
    RAISE EXCEPTION 'No active company is set for this account';
  END IF;
  IF account_type NOT IN ('doctor', 'pharmacy', 'hospital', 'distributor') THEN
    RAISE EXCEPTION 'Invalid account type';
  END IF;

  SELECT id INTO account_id
  FROM tips_crm.accounts
  WHERE created_by = auth.uid() AND local_ref = local_ref_input AND company_id = actor_company_id
  LIMIT 1;

  IF account_id IS NULL THEN
    INSERT INTO tips_crm.accounts(company_id, account_type, name, specialty, state, city, area, address, phone, local_ref, created_by)
    VALUES (actor_company_id, account_type, account_name, NULLIF(account_specialty, ''), account_state, account_city, NULLIF(account_area, ''), NULLIF(account_address, ''), NULLIF(account_phone, ''), local_ref_input, auth.uid())
    RETURNING id INTO account_id;
    PERFORM tips_crm.log_audit('account_created', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref_input));
  ELSE
    UPDATE tips_crm.accounts
    SET name = account_name, specialty = NULLIF(account_specialty, ''), state = account_state, city = account_city,
        area = NULLIF(account_area, ''), address = NULLIF(account_address, ''), phone = NULLIF(account_phone, ''), updated_at = now()
    WHERE id = account_id;
    PERFORM tips_crm.log_audit('account_updated', 'account', account_id::text, jsonb_build_object('name', account_name, 'local_ref', local_ref_input));
  END IF;

  RETURN account_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_sync_account(text, text, text, text, text, text, text, text, text) TO authenticated;

-- 2. Safety net: default company_id on insert ----------------------------------
CREATE OR REPLACE FUNCTION tips_crm.fill_company_id_from_actor()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := tips_crm.my_company_id();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION tips_crm.fill_company_id_from_actor() FROM PUBLIC;

DO $$
DECLARE
  target text;
BEGIN
  FOREACH target IN ARRAY ARRAY['accounts', 'plans', 'plan_visits', 'visits', 'visit_attachments', 'duty_sessions', 'duty_points'] LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'tips_crm' AND table_name = target AND column_name = 'company_id'
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS fill_company_id ON tips_crm.%I', target);
      EXECUTE format('CREATE TRIGGER fill_company_id BEFORE INSERT ON tips_crm.%I FOR EACH ROW EXECUTE FUNCTION tips_crm.fill_company_id_from_actor()', target);
      RAISE NOTICE 'fill_company_id trigger installed on tips_crm.%', target;
    END IF;
  END LOOP;
END;
$$;

COMMIT;

-- Verification (optional): the field staff below have no active company and
-- will still be rejected. Assign them one before testing.
-- SELECT id, full_name FROM tips_crm.profiles
-- WHERE active_company_id IS NULL AND NOT coalesce(is_platform_admin, false);
