-- Tips CRM — سيناريو تجريبي للمندوب الطبي (عينات وفعاليات)
-- مخصص للعرض والاختبار ضمن دليل التشغيل اليومي

-- 1. إضافة عينة طبية تجريبية للدليل
INSERT INTO tips_crm.medical_samples (id, name, code, total_stock, unit)
VALUES ('smpl-demo-1', 'عينة [تجريبي] أجوستين 50مجم', 'AG50', 500, 'شريط')
ON CONFLICT (id) DO UPDATE SET total_stock = 500;

-- 2. توزيع مخزون عينات للمندوب الطبي التجريبي
INSERT INTO tips_crm.medical_sample_distributions (id, sample_id, profile_id, quantity_given, notes)
SELECT 
  'dist-demo-1',
  'smpl-demo-1',
  p.id,
  50,
  'توزيع تجريبي للدليل التشغيلي'
FROM tips_crm.profiles p
WHERE p.role_key = 'medical_rep'
LIMIT 1
ON CONFLICT (id) DO NOTHING;

-- 3. إضافة فعالية طبية تجريبية (ندوة علمية)
INSERT INTO tips_crm.medical_events (id, title, event_date, location, description, target_specialty)
VALUES ('ev-demo-1', 'ندوة أمراض الجهاز الهضمي [تجريبي]', '2026-08-25', 'فندق الراعفة - الخرطوم', 'مناقشة أحدث البروتوكولات العلاجية', 'باطنية وجهاز هضمي')
ON CONFLICT (id) DO UPDATE SET title = 'ندوة أمراض الجهاز الهضمي [تجريبي]';

-- 4. تسجيل حضور طبيب للفعالية بدعوة من المندوب
INSERT INTO tips_crm.medical_event_attendees (id, event_id, account_id, profile_id, attendance_status, response_note)
SELECT
  'att-demo-1',
  'ev-demo-1',
  a.id,
  p.id,
  'حضر',
  'أبدى اهتماماً كبيراً بالعينة الموزعة'
FROM tips_crm.accounts a
CROSS JOIN tips_crm.profiles p
WHERE a.type = 'طبيب' AND p.role_key = 'medical_rep'
LIMIT 1
ON CONFLICT (id) DO NOTHING;
