GRANT USAGE ON SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL SEQUENCES IN SCHEMA tips_crm TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, anon, authenticated, service_role, supabase_auth_admin, supabase_admin;

DROP TRIGGER IF EXISTS tips_crm_after_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;

INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  'email',
  u.id::text,
  now(),
  now(),
  now()
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
);

UPDATE auth.users
SET email_confirmed_at = now(),
    confirmation_token = '',
    recovery_token = '',
    aud = 'authenticated',
    role = 'authenticated'
WHERE email_confirmed_at IS NULL;
