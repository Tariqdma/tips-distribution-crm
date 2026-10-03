-- Read-only diagnostic for "تعذر مزامنة الجهة" / plans not uploading.
-- Run in Supabase Dashboard -> SQL Editor and send back all result tabs.
-- It changes nothing.

-- 1. Which columns are required on the tables the mobile app writes to.
SELECT table_name, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'tips_crm'
  AND table_name IN ('accounts', 'plans', 'plan_visits', 'visits')
  AND is_nullable = 'NO'
ORDER BY table_name, ordinal_position;

-- 2. The deployed definitions of the RPCs the app calls when saving.
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('tips_crm_sync_account', 'tips_crm_save_visit_report', 'tips_crm_create_plan', 'tips_crm_save_plan_visits');

-- 3. Triggers that may fill company_id on insert.
SELECT event_object_table AS table_name, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE event_object_schema = 'tips_crm'
  AND event_object_table IN ('accounts', 'plans', 'plan_visits', 'visits');

-- 4. Field staff with no active company (their writes are rejected by company isolation).
SELECT p.id, p.full_name, p.active_company_id, p.is_active
FROM tips_crm.profiles p
WHERE p.active_company_id IS NULL AND NOT coalesce(p.is_platform_admin, false);
