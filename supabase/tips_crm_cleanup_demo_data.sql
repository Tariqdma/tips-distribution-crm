-- Tips CRM — تنظيف بيانات الدليل والاختبار قبل التشغيل الفعلي
--
-- وضع الأمان الافتراضي: تنتهي المعاملة بـ ROLLBACK ولا تُحذف أي بيانات.
-- راجع ناتج استعلام المعاينة أولاً. عند قرار مسؤول التشغيل فقط، استبدل ROLLBACK
-- النهائي بـ COMMIT ثم نفّذ الكتلة الثانية مرة واحدة في Supabase SQL Editor.

-- معاينة السجلات المستهدفة. لا يحذف هذا الجزء شيئاً.
SELECT
  profile.id AS demo_profile_id,
  profile.email,
  profile.role_key,
  count(DISTINCT plan.id) AS demo_plans,
  count(DISTINCT assignment.territory_id) AS assigned_territories
FROM tips_crm.profiles profile
LEFT JOIN tips_crm.plans plan
  ON plan.owner_id = profile.id
  AND plan.title LIKE '[تجريبي للدليل]%'
LEFT JOIN tips_crm.territory_assignments assignment
  ON assignment.profile_id = profile.id
WHERE lower(profile.email) = 'demo.sales.rep.guide@tips-sd.com'
GROUP BY profile.id, profile.email, profile.role_key
LIMIT 1;

BEGIN;

-- امسح عناصر الخطة التجريبية فقط، اعتماداً على العلامة النصية الثابتة في العنوان.
DELETE FROM tips_crm.plan_review_reminders reminder
USING tips_crm.plans plan
WHERE reminder.plan_id = plan.id
  AND plan.title LIKE '[تجريبي للدليل]%';

DELETE FROM tips_crm.plan_visits planned_visit
USING tips_crm.plans plan
WHERE planned_visit.plan_id = plan.id
  AND plan.title LIKE '[تجريبي للدليل]%';

DELETE FROM tips_crm.plans
WHERE title LIKE '[تجريبي للدليل]%';

-- امسح آثار حساب الدليل فقط، ثم أزل حساب المصادقة المطابق.
DELETE FROM tips_crm.notifications
WHERE recipient_id IN (
  SELECT id FROM tips_crm.profiles
  WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com'
);

DELETE FROM tips_crm.audit_log
WHERE actor_id IN (
  SELECT id FROM tips_crm.profiles
  WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com'
)
OR (entity_type = 'profile' AND entity_id IN (
  SELECT id::text FROM tips_crm.profiles
  WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com'
));

DELETE FROM tips_crm.territory_assignments
WHERE profile_id IN (
  SELECT id FROM tips_crm.profiles
  WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com'
);

DELETE FROM tips_crm.profiles
WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com';

DELETE FROM auth.users
WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com';

-- تحقق داخل المعاملة: يجب أن تعود القيم صفراً قبل الاستمرار.
SELECT
  (SELECT count(*) FROM auth.users WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com') AS remaining_auth_users,
  (SELECT count(*) FROM tips_crm.profiles WHERE lower(email) = 'demo.sales.rep.guide@tips-sd.com') AS remaining_profiles,
  (SELECT count(*) FROM tips_crm.plans WHERE title LIKE '[تجريبي للدليل]%') AS remaining_demo_plans
LIMIT 1;

-- حماية افتراضية: لا تغيّرها إلى COMMIT إلا بعد تحقق مسؤول التشغيل من المعاينة والنتيجة.
ROLLBACK;
