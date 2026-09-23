CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  v_company_id uuid;
  v_territory_1_id uuid;
  v_territory_2_id uuid;
  
  v_admin_id uuid := 'a0000000-0000-0000-0000-000000000001'::uuid;
  v_manager_id uuid := 'a0000000-0000-0000-0000-000000000002'::uuid;
  v_supervisor_sales_id uuid := 'a0000000-0000-0000-0000-000000000003'::uuid;
  v_supervisor_med_id uuid := 'a0000000-0000-0000-0000-000000000004'::uuid;
  v_rep_sales_id uuid := 'a0000000-0000-0000-0000-000000000005'::uuid;
  v_rep_med_id uuid := 'a0000000-0000-0000-0000-000000000006'::uuid;
  v_accountant_id uuid := 'a0000000-0000-0000-0000-000000000007'::uuid;

  v_found_id uuid;
  v_encrypted_pw text := crypt('Password123!', gen_salt('bf'));
BEGIN
  INSERT INTO tips_crm.roles (key, display_name, description, permissions, is_system, is_active)
  VALUES
    ('system_admin', 'مدير النظام', 'إدارة الأدوار والمستخدمين وكامل إعدادات المنصة والشركة.', ARRAY['all'], true, true),
    ('company_manager', 'مدير الشركة', 'إدارة مناطق الشركة، الموظفين، استيراد العملاء والاعتمادات.', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'manage_accounts', 'manage_users', 'export_reports'], true, true),
    ('sales_manager', 'مدير المبيعات', 'متابعة الفريق واعتماد الخطط وإدارة المناطق.', ARRAY['view_team_data', 'approve_plans', 'manage_territories', 'manage_accounts', 'manage_users', 'export_reports'], true, true),
    ('sales_supervisor', 'مشرف مبيعات', 'متابعة مناديب المبيعات ومراجعة خطط العمل.', ARRAY['view_team_data', 'approve_plans', 'send_notifications'], true, true),
    ('medical_supervisor', 'مشرف طبي', 'متابعة المناديب الطبيين والنشاط العلمي.', ARRAY['view_team_data', 'approve_plans', 'send_notifications'], true, true),
    ('sales_rep', 'مندوب مبيعات', 'إدارة خطة وزيارات البيع الخاصة به.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true, true),
    ('medical_rep', 'مندوب طبي', 'إدارة خطة وزيارات الأطباء والعيادات.', ARRAY['write_own_plans', 'write_own_visits', 'track_duty'], true, true),
    ('accountant', 'محاسب مالي', 'متابعة الائتمان والتحصيلات المالية.', ARRAY['view_team_data', 'export_reports'], true, true)
  ON CONFLICT (key) DO UPDATE
  SET display_name = EXCLUDED.display_name, permissions = EXCLUDED.permissions, is_active = true;

  SELECT id INTO v_company_id FROM tips_crm.companies WHERE slug = 'tips-demo' LIMIT 1;
  IF v_company_id IS NULL THEN
    INSERT INTO tips_crm.companies (name, slug, status, plan_key, max_user_limit, primary_contact_name, primary_contact_email)
    VALUES ('شركة تيبس للتوزيع والأدوية', 'tips-demo', 'active', 'enterprise', 50, 'مدير الشركة التجريبي', 'company.manager@tips-sd.com')
    RETURNING id INTO v_company_id;
  ELSE
    UPDATE tips_crm.companies
    SET name = 'شركة تيبس للتوزيع والأدوية', status = 'active', max_user_limit = 50
    WHERE id = v_company_id;
  END IF;

  BEGIN
    INSERT INTO tips_crm.company_roles (company_id, role_key, display_name, permissions, is_active)
    SELECT v_company_id, r.key, r.display_name, r.permissions, true FROM tips_crm.roles r
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO tips_crm.company_roles (company_id, role_key)
      SELECT v_company_id, r.key FROM tips_crm.roles r
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      BEGIN
        INSERT INTO tips_crm.company_roles (company_id, key, display_name, permissions, is_active)
        SELECT v_company_id, r.key, r.display_name, r.permissions, true FROM tips_crm.roles r
        ON CONFLICT DO NOTHING;
      EXCEPTION WHEN OTHERS THEN
        BEGIN
          INSERT INTO tips_crm.company_roles (company_id, key)
          SELECT v_company_id, r.key FROM tips_crm.roles r
          ON CONFLICT DO NOTHING;
        EXCEPTION WHEN OTHERS THEN NULL;
        END;
      END;
    END;
  END;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'platform.admin@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_admin_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_admin_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_admin_id, '00000000-0000-0000-0000-000000000000', 'platform.admin@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"مدير المنصة العام"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_admin_id, 'مدير المنصة العام', 'platform.admin@tips-sd.com', 'system_admin', true, true, NULL, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'system_admin', is_platform_admin = true, is_active = true, must_change_password = false;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'company.manager@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_manager_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_manager_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_manager_id, '00000000-0000-0000-0000-000000000000', 'company.manager@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"أحمد التاج - مدير الشركة"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_manager_id, 'أحمد التاج - مدير الشركة', 'company.manager@tips-sd.com', 'company_manager', true, false, v_company_id, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'company_manager', is_platform_admin = false, active_company_id = v_company_id, is_active = true, must_change_password = false;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'sales.supervisor@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_supervisor_sales_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_supervisor_sales_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_supervisor_sales_id, '00000000-0000-0000-0000-000000000000', 'sales.supervisor@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"عمر فاروق - مشرف المبيعات"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_supervisor_sales_id, 'عمر فاروق - مشرف المبيعات', 'sales.supervisor@tips-sd.com', 'sales_supervisor', true, false, v_company_id, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'sales_supervisor', is_platform_admin = false, active_company_id = v_company_id, is_active = true, must_change_password = false;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'medical.supervisor@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_supervisor_med_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_supervisor_med_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_supervisor_med_id, '00000000-0000-0000-0000-000000000000', 'medical.supervisor@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"د. سارة عثمان - المشرف الطبي"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_supervisor_med_id, 'د. سارة عثمان - المشرف الطبي', 'medical.supervisor@tips-sd.com', 'medical_supervisor', true, false, v_company_id, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'medical_supervisor', is_platform_admin = false, active_company_id = v_company_id, is_active = true, must_change_password = false;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'sales.rep@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_rep_sales_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_rep_sales_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_rep_sales_id, '00000000-0000-0000-0000-000000000000', 'sales.rep@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"محمد عبد الله - مندوب مبيعات"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_rep_sales_id, 'محمد عبد الله - مندوب مبيعات', 'sales.rep@tips-sd.com', 'sales_rep', true, false, v_company_id, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'sales_rep', is_platform_admin = false, active_company_id = v_company_id, is_active = true, must_change_password = false;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'medical.rep@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_rep_med_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_rep_med_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_rep_med_id, '00000000-0000-0000-0000-000000000000', 'medical.rep@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"د. هبة النور - مندوب طبي"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_rep_med_id, 'د. هبة النور - مندوب طبي', 'medical.rep@tips-sd.com', 'medical_rep', true, false, v_company_id, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'medical_rep', is_platform_admin = false, active_company_id = v_company_id, is_active = true, must_change_password = false;

  SELECT id INTO v_found_id FROM auth.users WHERE email = 'accountant@tips-sd.com' LIMIT 1;
  IF v_found_id IS NOT NULL THEN
    v_accountant_id := v_found_id;
    UPDATE auth.users SET encrypted_password = v_encrypted_pw, email_confirmed_at = now(), updated_at = now() WHERE id = v_accountant_id;
  ELSE
    INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, aud, role, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
    VALUES (v_accountant_id, '00000000-0000-0000-0000-000000000000', 'accountant@tips-sd.com', v_encrypted_pw, now(), 'authenticated', 'authenticated', '{"provider":"email","providers":["email"]}', '{"full_name":"ياسر كمال - المحاسب المالي"}', now(), now());
  END IF;
  INSERT INTO tips_crm.profiles (id, full_name, email, role_key, is_active, is_platform_admin, active_company_id, must_change_password)
  VALUES (v_accountant_id, 'ياسر كمال - المحاسب المالي', 'accountant@tips-sd.com', 'accountant', true, false, v_company_id, false)
  ON CONFLICT (id) DO UPDATE SET role_key = 'accountant', is_platform_admin = false, active_company_id = v_company_id, is_active = true, must_change_password = false;

  SELECT id INTO v_territory_1_id FROM tips_crm.territories WHERE name = 'العمارات والرياض' LIMIT 1;
  IF v_territory_1_id IS NULL THEN
    INSERT INTO tips_crm.territories (name, state, city, center_latitude, center_longitude, radius_meters, is_active, company_id, created_by)
    VALUES ('العمارات والرياض', 'ولاية الخرطوم', 'الخرطوم', 15.589800, 32.553200, 5000, true, v_company_id, v_manager_id)
    RETURNING id INTO v_territory_1_id;
  ELSE
    UPDATE tips_crm.territories SET is_active = true, company_id = v_company_id WHERE id = v_territory_1_id;
  END IF;

  SELECT id INTO v_territory_2_id FROM tips_crm.territories WHERE name = 'بحري والمزاد' LIMIT 1;
  IF v_territory_2_id IS NULL THEN
    INSERT INTO tips_crm.territories (name, state, city, center_latitude, center_longitude, radius_meters, is_active, company_id, created_by)
    VALUES ('بحري والمزاد', 'ولاية الخرطوم', 'بحري', 15.632100, 32.531200, 4000, true, v_company_id, v_manager_id)
    RETURNING id INTO v_territory_2_id;
  ELSE
    UPDATE tips_crm.territories SET is_active = true, company_id = v_company_id WHERE id = v_territory_2_id;
  END IF;

  INSERT INTO tips_crm.company_memberships (company_id, profile_id, role_key, is_active)
  VALUES
    (v_company_id, v_manager_id, 'company_manager', true),
    (v_company_id, v_supervisor_sales_id, 'sales_supervisor', true),
    (v_company_id, v_supervisor_med_id, 'medical_supervisor', true),
    (v_company_id, v_rep_sales_id, 'sales_rep', true),
    (v_company_id, v_rep_med_id, 'medical_rep', true),
    (v_company_id, v_accountant_id, 'accountant', true)
  ON CONFLICT (company_id, profile_id) DO UPDATE SET is_active = true;

  BEGIN
    INSERT INTO tips_crm.territory_assignments (territory_id, profile_id, company_id, assigned_by)
    VALUES
      (v_territory_1_id, v_rep_sales_id, v_company_id, v_manager_id),
      (v_territory_1_id, v_supervisor_sales_id, v_company_id, v_manager_id),
      (v_territory_2_id, v_rep_med_id, v_company_id, v_manager_id),
      (v_territory_2_id, v_supervisor_med_id, v_company_id, v_manager_id)
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO tips_crm.territory_assignments (territory_id, profile_id, assigned_by)
      VALUES
        (v_territory_1_id, v_rep_sales_id, v_manager_id),
        (v_territory_1_id, v_supervisor_sales_id, v_manager_id),
        (v_territory_2_id, v_rep_med_id, v_manager_id),
        (v_territory_2_id, v_supervisor_med_id, v_manager_id)
      ON CONFLICT DO NOTHING;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END;

  IF NOT EXISTS (SELECT 1 FROM tips_crm.accounts WHERE name = 'صيدلية النيل الكبرى') THEN
    BEGIN
      INSERT INTO tips_crm.accounts (territory_id, account_type, name, specialty, state, city, area, address, phone, created_by, company_id)
      VALUES
        (v_territory_1_id, 'pharmacy', 'صيدلية النيل الكبرى', NULL, 'ولاية الخرطوم', 'الخرطوم', 'العمارات', 'شارع 15 العمارات', '0912345678', v_manager_id, v_company_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO tips_crm.accounts (territory_id, account_type, name, specialty, state, city, area, address, phone, created_by)
      VALUES
        (v_territory_1_id, 'pharmacy', 'صيدلية النيل الكبرى', NULL, 'ولاية الخرطوم', 'الخرطوم', 'العمارات', 'شارع 15 العمارات', '0912345678', v_manager_id);
    END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tips_crm.accounts WHERE name = 'مستشفى رويال كير الدولي') THEN
    BEGIN
      INSERT INTO tips_crm.accounts (territory_id, account_type, name, specialty, state, city, area, address, phone, created_by, company_id)
      VALUES
        (v_territory_1_id, 'hospital', 'مستشفى رويال كير الدولي', 'متعدد التخصصات', 'ولاية الخرطوم', 'الخرطوم', 'الرياض', 'شارع المشتل', '0183123456', v_manager_id, v_company_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO tips_crm.accounts (territory_id, account_type, name, specialty, state, city, area, address, phone, created_by)
      VALUES
        (v_territory_1_id, 'hospital', 'مستشفى رويال كير الدولي', 'متعدد التخصصات', 'ولاية الخرطوم', 'الخرطوم', 'الرياض', 'شارع المشتل', '0183123456', v_manager_id);
    END;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM tips_crm.accounts WHERE name = 'د. طارق محمود - استشاري باطنية') THEN
    BEGIN
      INSERT INTO tips_crm.accounts (territory_id, account_type, name, specialty, state, city, area, address, phone, created_by, company_id)
      VALUES
        (v_territory_2_id, 'doctor', 'د. طارق محمود - استشاري باطنية', 'أمراض باطنية وقلب', 'ولاية الخرطوم', 'بحري', 'المزاد', 'مجمع العيادات التخصصي', '0923456789', v_manager_id, v_company_id);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO tips_crm.accounts (territory_id, account_type, name, specialty, state, city, area, address, phone, created_by)
      VALUES
        (v_territory_2_id, 'doctor', 'د. طارق محمود - استشاري باطنية', 'أمراض باطنية وقلب', 'ولاية الخرطوم', 'بحري', 'المزاد', 'مجمع العيادات التخصصي', '0923456789', v_manager_id);
    END;
  END IF;

END $$;
