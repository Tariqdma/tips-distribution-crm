import fs from 'fs';
import path from 'path';

const files = [
  'tips_crm_schema.sql',
  'tips_crm_auth.sql',
  'tips_crm_first_admin_bootstrap.sql',
  'tips_crm_roles_rpc.sql',
  'tips_crm_catalog_and_invites.sql',
  'tips_crm_operations.sql',
  'tips_crm_plan_approval_enhancements.sql',
  'tips_crm_plan_review.sql',
  'tips_crm_plan_review_reminders.sql',
  'tips_crm_plan_review_reminders_rls.sql',
  'tips_crm_mail_settings_and_exports.sql',
  'tips_crm_outcomes_and_export_filters.sql',
  'tips_crm_sync_refinement.sql',
  'tips_crm_temporary_employee_accounts.sql',
  'tips_crm_finalize_employee_account.sql',
  'tips_crm_payment_tiers_and_user_limits.sql'
];

let combined = `CREATE SCHEMA IF NOT EXISTS tips_crm;
REVOKE ALL ON SCHEMA tips_crm FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA tips_crm TO authenticated, service_role;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT p.oid::regprocedure AS func_signature
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE (n.nspname = 'tips_crm' OR (n.nspname = 'public' AND p.proname LIKE 'tips_crm_%'))
    ) LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || r.func_signature || ' CASCADE;';
    END LOOP;
END $$;

`;

for (const file of files) {
  const filePath = path.join('supabase', file);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');

  // Strip all divider/header comment lines
  content = content.replace(/^--\s*[-=]{2,}.*$/gm, '');

  // 1. Tables: CREATE TABLE -> CREATE TABLE IF NOT EXISTS
  content = content.replace(/CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE TABLE IF NOT EXISTS ');

  // 2. Indexes: CREATE [UNIQUE] INDEX -> CREATE [UNIQUE] INDEX IF NOT EXISTS
  content = content.replace(/CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE INDEX IF NOT EXISTS ');
  content = content.replace(/CREATE\s+UNIQUE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/gi, 'CREATE UNIQUE INDEX IF NOT EXISTS ');

  // 3. Alter table add column -> ADD COLUMN IF NOT EXISTS
  content = content.replace(/ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS)/gi, 'ADD COLUMN IF NOT EXISTS ');

  // 4. Policies: Always DROP POLICY IF EXISTS before CREATE POLICY
  content = content.replace(/CREATE\s+POLICY\s+"?([^"\s]+)"?\s+ON\s+([a-zA-Z0-9_.]+)/gi, (match, policyName, tableName) => {
    return `DROP POLICY IF EXISTS "${policyName}" ON ${tableName};\n${match}`;
  });

  // 5. Triggers: Always DROP TRIGGER IF EXISTS before CREATE TRIGGER
  content = content.replace(/CREATE\s+TRIGGER\s+([a-zA-Z0-9_]+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+[\s\S]*?\s+ON\s+([a-zA-Z0-9_.]+)/gi, (match, triggerName, tableName) => {
    return `DROP TRIGGER IF EXISTS ${triggerName} ON ${tableName};\n${match}`;
  });

  // 6. Ensure CREATE OR REPLACE FUNCTION is used and drop existing signature before creation
  content = content.replace(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-zA-Z0-9_.]+)\s*\(([\s\S]*?)\)\s*RETURNS/gi, (match, funcName, args) => {
    const cleanFuncName = funcName.trim();
    // Generate clean drop without arg names
    const types = args.split(',').map(a => a.trim().split(/\s+/)[1] || a.trim().split(/\s+/)[0]).filter(Boolean).join(', ');
    return `DROP FUNCTION IF EXISTS ${cleanFuncName} CASCADE;\nDROP FUNCTION IF EXISTS ${cleanFuncName}() CASCADE;\nCREATE OR REPLACE FUNCTION ${cleanFuncName}(${args}) RETURNS`;
  });

  // 7. Seed INSERTS on roles / settings / outcomes: ensure ON CONFLICT DO NOTHING where appropriate
  content = content.replace(/(INSERT\s+INTO\s+tips_crm\.roles[\s\S]*?;)/gi, (match) => {
    if (!match.includes('ON CONFLICT')) {
      return match.replace(/;$/, ' ON CONFLICT (key) DO NOTHING;');
    }
    return match;
  });

  combined += `\n\n` + content;
}

fs.writeFileSync(path.join('supabase', '00_full_setup.sql'), combined);
console.log('Successfully generated updated supabase/00_full_setup.sql, total bytes:', combined.length);
