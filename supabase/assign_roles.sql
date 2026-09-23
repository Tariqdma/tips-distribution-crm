INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active) VALUES
  ('sales_supervisor', 'مشرف مبيعات', 'مشرف فريق المبيعات الميداني', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'send_notifications', 'write_own_plans', 'write_own_visits', 'track_duty'], true, true),
  ('medical_supervisor', 'مشرف طبي', 'مشرف الفريق الطبي الميداني', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'send_notifications', 'write_own_plans', 'write_own_visits', 'track_duty'], true, true),
  ('accountant', 'محاسب', 'مسؤول التقارير المالية والمحاسبة', ARRAY['view_team_data', 'export_reports'], true, true)
ON CONFLICT (key) DO NOTHING;

UPDATE auth.users SET email_confirmed_at = now() WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
);

UPDATE tips_crm.profiles SET role_key = 'system_admin', full_name = 'مدير النظام' WHERE id = '5518570a-a817-4466-a55d-76840de543a4';
UPDATE tips_crm.profiles SET role_key = 'sales_manager', full_name = 'مدير الشركة' WHERE id = '2a85e0af-d363-4393-a358-6c61229a627c';
UPDATE tips_crm.profiles SET role_key = 'sales_supervisor', full_name = 'مشرف المبيعات' WHERE id = 'a165125d-bffe-4062-be8d-b619a05bdacd';
UPDATE tips_crm.profiles SET role_key = 'medical_supervisor', full_name = 'مشرف طبي' WHERE id = '7340b272-27d7-4ef2-b399-cb9694acc4bd';
UPDATE tips_crm.profiles SET role_key = 'sales_rep', full_name = 'مندوب مبيعات' WHERE id = '334532ac-df78-4338-a1b9-169920977faa';
UPDATE tips_crm.profiles SET role_key = 'medical_rep', full_name = 'مندوب طبي' WHERE id = 'd047d190-8843-420b-89f8-8e965cb253cc';
UPDATE tips_crm.profiles SET role_key = 'accountant', full_name = 'محاسب' WHERE id = 'c099e004-a198-4fd6-8150-919c9c4afab6';
