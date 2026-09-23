UPDATE tips_crm.territories SET created_by = NULL
WHERE created_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.visits
WHERE account_id IN (
  SELECT id FROM tips_crm.accounts WHERE created_by IN (
    SELECT id FROM auth.users WHERE email IN (
      'platform.admin@tips-sd.com',
      'company.manager@tips-sd.com',
      'sales.supervisor@tips-sd.com',
      'medical.supervisor@tips-sd.com',
      'sales.rep@tips-sd.com',
      'medical.rep@tips-sd.com',
      'accountant@tips-sd.com'
    )
  )
);

DELETE FROM tips_crm.accounts
WHERE created_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.territory_assignments
WHERE profile_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.territory_assignments
WHERE assigned_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

UPDATE tips_crm.plans SET approved_by = NULL
WHERE approved_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.visits
WHERE rep_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.plans
WHERE owner_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

UPDATE tips_crm.notifications SET created_by = NULL
WHERE created_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.notifications
WHERE recipient_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

UPDATE tips_crm.audit_log SET actor_id = NULL
WHERE actor_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));


UPDATE tips_crm.visit_outcomes SET created_by = NULL
WHERE created_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

UPDATE tips_crm.mail_settings SET updated_by = NULL
WHERE updated_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

UPDATE tips_crm.invite_email_deliveries SET created_by = NULL
WHERE created_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.plan_review_reminders
WHERE manager_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.team_invites
WHERE invited_by IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.company_memberships
WHERE profile_id IN (SELECT id FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
));

DELETE FROM tips_crm.profiles WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
);

DELETE FROM auth.identities WHERE user_id IN (
  SELECT id FROM auth.users WHERE email IN (
    'platform.admin@tips-sd.com',
    'company.manager@tips-sd.com',
    'sales.supervisor@tips-sd.com',
    'medical.supervisor@tips-sd.com',
    'sales.rep@tips-sd.com',
    'medical.rep@tips-sd.com',
    'accountant@tips-sd.com'
  )
);

DELETE FROM auth.users WHERE email IN (
  'platform.admin@tips-sd.com',
  'company.manager@tips-sd.com',
  'sales.supervisor@tips-sd.com',
  'medical.supervisor@tips-sd.com',
  'sales.rep@tips-sd.com',
  'medical.rep@tips-sd.com',
  'accountant@tips-sd.com'
);

GRANT USAGE ON SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
