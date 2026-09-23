-- بيانات عرض تجريبية للدليل فقط. يُحدّث السجل الأسبوعي المعلّق الموجود
-- ولا ينشئ حسابات أو جهات أو أدوار جديدة.
WITH target_plan AS (
  SELECT p.id, p.owner_id
  FROM tips_crm.plans p
  WHERE p.status = 'pending'
    AND p.starts_on = DATE '2026-08-22'
    AND p.ends_on = DATE '2026-08-28'
  ORDER BY p.created_at DESC
  LIMIT 1
), target_territory AS (
  SELECT t.id
  FROM tips_crm.territories t
  WHERE t.name = 'العمارات والرياض'
    AND t.is_active = true
  ORDER BY t.created_at ASC
  LIMIT 1
), schedule_seed AS (
  SELECT *
  FROM (VALUES
    (TIMESTAMPTZ '2026-08-22 09:00:00+03', 1),
    (TIMESTAMPTZ '2026-08-23 10:00:00+03', 2),
    (TIMESTAMPTZ '2026-08-24 09:30:00+03', 1),
    (TIMESTAMPTZ '2026-08-25 11:00:00+03', 2),
    (TIMESTAMPTZ '2026-08-26 09:00:00+03', 1),
    (TIMESTAMPTZ '2026-08-27 10:30:00+03', 2)
  ) AS rows(scheduled_for, account_position)
), ranked_accounts AS (
  SELECT a.id, row_number() OVER (ORDER BY a.created_at ASC) AS position
  FROM tips_crm.accounts a
  ORDER BY a.created_at ASC
  LIMIT 10
), updated_plan AS (
  UPDATE tips_crm.plans p
  SET territory_id = territory.id,
      title = '[تجريبي للدليل] خطة تغطية أسبوعية — العمارات والرياض',
      updated_at = now()
  FROM target_plan plan
  JOIN target_territory territory ON true
  WHERE p.id = plan.id
  RETURNING p.id, p.owner_id
), inserted_plan_visits AS (
  INSERT INTO tips_crm.plan_visits(plan_id, account_id, scheduled_for)
  SELECT plan.id, account.id, seed.scheduled_for
  FROM updated_plan plan
  JOIN schedule_seed seed ON true
  JOIN ranked_accounts account ON account.position = seed.account_position
  WHERE NOT EXISTS (
    SELECT 1
    FROM tips_crm.plan_visits existing
    WHERE existing.plan_id = plan.id
      AND existing.scheduled_for = seed.scheduled_for
  )
  RETURNING id
), demo_plan_visits AS (
  SELECT pv.id, pv.plan_id, pv.account_id, pv.scheduled_for, plan.owner_id
  FROM tips_crm.plan_visits pv
  JOIN updated_plan plan ON plan.id = pv.plan_id
), inserted_visits AS (
  INSERT INTO tips_crm.visits(
    plan_visit_id,
    rep_id,
    account_id,
    status,
    outcome,
    notes,
    checked_in_at,
    check_in_latitude,
    check_in_longitude,
    location_accuracy_meters,
    follow_up_action,
    follow_up_on,
    visit_priority
  )
  SELECT
    pv.id,
    pv.owner_id,
    pv.account_id,
    CASE EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum')::integer
      WHEN 22 THEN 'completed'
      WHEN 23 THEN 'completed'
      WHEN 24 THEN 'needs_review'
      WHEN 25 THEN 'scheduled'
      WHEN 26 THEN 'completed'
      ELSE 'scheduled'
    END,
    CASE EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum')::integer
      WHEN 22 THEN 'متابعة'
      WHEN 23 THEN 'تم إنشاء فاتورة'
      WHEN 24 THEN 'تحتاج مراجعة'
      WHEN 26 THEN 'تم تحصيل'
      ELSE NULL
    END,
    'بيانات تجريبية معزولة لعرض شاشة اعتماد الخطط في دليل التشغيل.',
    CASE
      WHEN EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum') IN (22, 23, 24, 26)
        THEN pv.scheduled_for + INTERVAL '35 minutes'
      ELSE NULL
    END,
    CASE
      WHEN EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum') IN (22, 23, 24, 26)
        THEN 15.5007
      ELSE NULL
    END,
    CASE
      WHEN EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum') IN (22, 23, 24, 26)
        THEN 32.5599
      ELSE NULL
    END,
    CASE
      WHEN EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum') IN (22, 23, 24, 26)
        THEN 18
      ELSE NULL
    END,
    CASE EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum')::integer
      WHEN 22 THEN 'إرسال عرض المتابعة في الزيارة التالية'
      WHEN 24 THEN 'يراجع المدير تفاصيل الزيارة التجريبية'
      WHEN 26 THEN 'التواصل لتأكيد الرصيد'
      ELSE NULL
    END,
    CASE
      WHEN EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum') IN (22, 24, 26)
        THEN (pv.scheduled_for AT TIME ZONE 'Africa/Khartoum')::date + 7
      ELSE NULL
    END,
    CASE EXTRACT(DAY FROM pv.scheduled_for AT TIME ZONE 'Africa/Khartoum')::integer
      WHEN 24 THEN 'high'
      ELSE 'medium'
    END
  FROM demo_plan_visits pv
  WHERE NOT EXISTS (
    SELECT 1
    FROM tips_crm.visits existing
    WHERE existing.plan_visit_id = pv.id
  )
  RETURNING id
)
SELECT
  (SELECT count(*) FROM updated_plan) AS updated_plans,
  (SELECT count(*) FROM inserted_plan_visits) AS inserted_plan_visits,
  (SELECT count(*) FROM inserted_visits) AS inserted_visits;
