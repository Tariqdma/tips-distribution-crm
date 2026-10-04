-- Supabase grants EXECUTE to anon/authenticated on new functions by default,
-- so every tips_crm RPC and even internal helpers were callable without login.
-- 1. anon keeps only the two public onboarding functions.
-- 2. authenticated loses the internal helpers that are only meant to run
--    inside other functions or triggers.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig, n.nspname, p.proname
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE (n.nspname = 'public' AND p.proname LIKE 'tips_crm\_%') OR n.nspname = 'tips_crm'
  LOOP
    IF fn.proname NOT IN ('tips_crm_create_company_request', 'tips_crm_get_company_request_public_status') THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', fn.sig);
    END IF;
    IF fn.nspname = 'tips_crm' AND (
         fn.proname IN ('log_audit', 'recompute_membership_permissions', 'enqueue_pending_plan_review_reminders',
                        'fill_company_id_from_actor', 'handle_auth_user_created')
         OR fn.proname LIKE 'trg\_%'
       ) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', fn.sig);
    END IF;
  END LOOP;
END $$;
