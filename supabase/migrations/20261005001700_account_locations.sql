-- Account coordinates. accounts.latitude/longitude existed but nothing ever
-- filled them and list_accounts does not return them (changing its return
-- type needs a DROP, so locations come from a separate function).

-- 1. Pin an account from its first accurate GPS check-in. Never overwrites a
--    location that is already set.
CREATE OR REPLACE FUNCTION tips_crm.pin_account_from_visit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NEW.account_id IS NOT NULL
     AND NEW.check_in_latitude IS NOT NULL AND NEW.check_in_longitude IS NOT NULL
     AND coalesce(NEW.location_accuracy_meters, 9999) <= 100
     AND NEW.status = 'completed' THEN
    UPDATE tips_crm.accounts
    SET latitude = NEW.check_in_latitude, longitude = NEW.check_in_longitude, updated_at = now()
    WHERE id = NEW.account_id AND company_id = NEW.company_id
      AND latitude IS NULL AND longitude IS NULL;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tips_crm.pin_account_from_visit() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER pin_account_from_visit AFTER INSERT ON tips_crm.visits
  FOR EACH ROW EXECUTE FUNCTION tips_crm.pin_account_from_visit();

-- 2. Locations of the accounts the caller can see (same filter as list_accounts:
--    the caller's company).
CREATE OR REPLACE FUNCTION public.tips_crm_list_account_locations()
RETURNS TABLE(id uuid, local_ref text, latitude double precision, longitude double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF auth.uid() IS NULL OR actor_company IS NULL THEN
    RAISE EXCEPTION 'Active company membership required';
  END IF;
  RETURN QUERY
  SELECT a.id, a.local_ref, a.latitude::double precision, a.longitude::double precision
  FROM tips_crm.accounts a
  WHERE a.company_id = actor_company AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_list_account_locations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_account_locations() TO authenticated;

-- 3. A manager (or the rep standing at the place) can correct the pin.
CREATE OR REPLACE FUNCTION public.tips_crm_set_account_location(target_account_id uuid, latitude_input double precision, longitude_input double precision)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE
  actor_company uuid := tips_crm.my_company_id();
BEGIN
  IF actor_company IS NULL OR NOT (tips_crm.has_perm('account.update') OR tips_crm.has_permission('manage_accounts')) THEN
    RAISE EXCEPTION 'Account update permission required';
  END IF;
  IF latitude_input NOT BETWEEN -90 AND 90 OR longitude_input NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Invalid coordinates';
  END IF;
  UPDATE tips_crm.accounts SET latitude = latitude_input, longitude = longitude_input, updated_at = now()
  WHERE id = target_account_id AND company_id = actor_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'Account not found'; END IF;
  PERFORM tips_crm.log_audit('account_location_set', 'account', target_account_id::text,
    jsonb_build_object('latitude', latitude_input, 'longitude', longitude_input));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.tips_crm_set_account_location(uuid, double precision, double precision) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_set_account_location(uuid, double precision, double precision) TO authenticated;
