CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE TABLE IF NOT EXISTS tips_crm.plan_review_reminders (
  plan_id uuid NOT NULL REFERENCES tips_crm.plans(id) ON DELETE CASCADE,
  manager_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, manager_id)
);

CREATE OR REPLACE FUNCTION tips_crm.enqueue_pending_plan_review_reminders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, public
AS $$
DECLARE queued_count integer := 0;
BEGIN
  WITH pending_plans AS (
    SELECT id, title, owner_id
    FROM tips_crm.plans
    WHERE status = 'pending' AND created_at <= now() - interval '24 hours'
  ), managers AS (
    SELECT profile.id
    FROM tips_crm.profiles profile
    JOIN tips_crm.roles role ON role.key = profile.role_key
    WHERE profile.is_active
      AND (role.permissions @> ARRAY['approve_plans']::text[] OR 'all' = ANY(role.permissions))
  ), queued AS (
    INSERT INTO tips_crm.plan_review_reminders(plan_id, manager_id)
    SELECT plan.id, manager.id
    FROM pending_plans plan CROSS JOIN managers manager
    ON CONFLICT (plan_id, manager_id) DO NOTHING
    RETURNING plan_id, manager_id
  ), notifications_to_send AS (
    SELECT queued.manager_id, plan.title, owner.full_name
    FROM queued
    JOIN tips_crm.plans plan ON plan.id = queued.plan_id
    JOIN tips_crm.profiles owner ON owner.id = plan.owner_id
  )
  INSERT INTO tips_crm.notifications(recipient_id, title, body, kind, created_by)
  SELECT manager_id,
    'تذكير: خطة بانتظار المراجعة',
    concat('لا تزال خطة «', title, '» للمندوب ', full_name, ' معلقة منذ أكثر من 24 ساعة.'),
    'plan',
    NULL
  FROM notifications_to_send;

  GET DIAGNOSTICS queued_count = ROW_COUNT;
  RETURN queued_count;
END;
$$;

DO $$
DECLARE existing_job_id bigint;
BEGIN
  SELECT jobid INTO existing_job_id FROM cron.job WHERE jobname = 'tips-crm-pending-plan-review-reminders' LIMIT 1;
  IF existing_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(existing_job_id);
  END IF;
  PERFORM cron.schedule(
    'tips-crm-pending-plan-review-reminders',
    '5 * * * *',
    $job$SELECT tips_crm.enqueue_pending_plan_review_reminders();$job$
  );
END;
$$;
