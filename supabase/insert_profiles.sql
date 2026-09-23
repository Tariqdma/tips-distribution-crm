INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, must_change_password) VALUES
  ('5518570a-a817-4466-a55d-76840de543a4', 'مدير النظام', 'platform.admin@tips-sd.com', 'system_admin', true, false),
  ('2a85e0af-d363-4393-a358-6c61229a627c', 'مدير الشركة', 'company.manager@tips-sd.com', 'sales_manager', true, false),
  ('a165125d-bffe-4062-be8d-b619a05bdacd', 'مشرف المبيعات', 'sales.supervisor@tips-sd.com', 'sales_supervisor', true, false),
  ('7340b272-27d7-4ef2-b399-cb9694acc4bd', 'مشرف طبي', 'medical.supervisor@tips-sd.com', 'medical_supervisor', true, false),
  ('334532ac-df78-4338-a1b9-169920977faa', 'مندوب مبيعات', 'sales.rep@tips-sd.com', 'sales_rep', true, false),
  ('d047d190-8843-420b-89f8-8e965cb253cc', 'مندوب طبي', 'medical.rep@tips-sd.com', 'medical_rep', true, false),
  ('c099e004-a198-4fd6-8150-919c9c4afab6', 'محاسب', 'accountant@tips-sd.com', 'accountant', true, false)
ON CONFLICT (id) DO UPDATE SET
  role_key = EXCLUDED.role_key,
  full_name = EXCLUDED.full_name,
  is_active = true;
