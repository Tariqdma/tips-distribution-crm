-- ==============================================================================
-- Tips CRM: Authorization Model Integrity Triggers
--
-- Three assertions docs/authorization-model.md requires to exist before any UI
-- depends on them. Run this AFTER supabase/tips_crm_membership_roles.sql.
-- Additive only. Safe to run twice.
--
-- Paste into the Supabase Dashboard -> SQL Editor and run.
-- ==============================================================================

-- ------------------------------------------------------------------
-- Pre-flight check for rule 2 (platform admin / Membership mutual
-- exclusion). Run this SELECT yourself before executing the rest of this
-- file. If it returns any rows, the trigger below will not retroactively
-- fix them — resolve each one by hand (either clear is_platform_admin or
-- deactivate/delete the membership row) before proceeding, because the
-- trigger only prevents *new* violations from this point forward.
-- ------------------------------------------------------------------

-- SELECT p.id, p.full_name, p.email, cm.company_id, cm.is_active
-- FROM tips_crm.profiles p
-- JOIN tips_crm.company_memberships cm ON cm.profile_id = p.id
-- WHERE p.is_platform_admin AND cm.is_active;

BEGIN;

-- ------------------------------------------------------------------
-- 1. System Role immutability. Blocks any UPDATE that changes
--    `permissions` on a row that was already is_system = true — closing
--    the gap in tips_crm_save_role (supabase/tips_crm_roles_rpc.sql:34-52),
--    which protects is_active for system roles but overwrites permissions
--    unconditionally.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.trg_roles_block_system_permission_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF OLD.is_system AND NEW.permissions IS DISTINCT FROM OLD.permissions THEN
    RAISE EXCEPTION 'لا يمكن تعديل صلاحيات دور نظام ثابت (%).', OLD.key
      USING ERRCODE = '0LSYS';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS roles_block_system_permission_change ON tips_crm.roles;
CREATE TRIGGER roles_block_system_permission_change
BEFORE UPDATE ON tips_crm.roles
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_roles_block_system_permission_change();

-- ------------------------------------------------------------------
-- 2. Platform admin / Membership mutual exclusion. Cannot be a CHECK
--    constraint (CHECK cannot subquery another table), so it is two
--    triggers guarding the same invariant from both sides.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.trg_profiles_block_platform_admin_with_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NEW.is_platform_admin AND EXISTS (
    SELECT 1 FROM tips_crm.company_memberships cm
    WHERE cm.profile_id = NEW.id AND cm.is_active
  ) THEN
    RAISE EXCEPTION 'لا يمكن أن يكون مدير المنصة عضواً نشطاً في شركة في الوقت نفسه.'
      USING ERRCODE = '0LADM';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_platform_admin_with_membership ON tips_crm.profiles;
CREATE TRIGGER profiles_block_platform_admin_with_membership
BEFORE INSERT OR UPDATE ON tips_crm.profiles
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_profiles_block_platform_admin_with_membership();

CREATE OR REPLACE FUNCTION tips_crm.trg_memberships_block_for_platform_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF NEW.is_active AND EXISTS (
    SELECT 1 FROM tips_crm.profiles p
    WHERE p.id = NEW.profile_id AND p.is_platform_admin
  ) THEN
    RAISE EXCEPTION 'لا يمكن إضافة عضوية شركة نشطة لحساب مدير منصة.'
      USING ERRCODE = '0LADM';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS memberships_block_for_platform_admin ON tips_crm.company_memberships;
CREATE TRIGGER memberships_block_for_platform_admin
BEFORE INSERT OR UPDATE ON tips_crm.company_memberships
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_memberships_block_for_platform_admin();

-- ------------------------------------------------------------------
-- 3. active_company_id integrity. RLS reads active_company_id as the
--    tenant boundary, so a stale value is a cross-tenant read: deleting a
--    Membership must null active_company_id wherever it pointed at that
--    Company.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.trg_memberships_clear_active_company()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
BEGIN
  UPDATE tips_crm.profiles
  SET active_company_id = NULL, updated_at = now()
  WHERE id = OLD.profile_id AND active_company_id = OLD.company_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS memberships_clear_active_company ON tips_crm.company_memberships;
CREATE TRIGGER memberships_clear_active_company
AFTER DELETE ON tips_crm.company_memberships
FOR EACH ROW EXECUTE FUNCTION tips_crm.trg_memberships_clear_active_company();

COMMIT;

-- ==============================================================================
-- Verification — run after this file completes.
-- ==============================================================================

-- Re-run the pre-flight check above; it should now be the operator's job to
-- keep it empty, since the triggers only block *new* violations.

-- Sanity: attempting the following inside a transaction you roll back should
-- raise the system-role-immutability error (do not commit this test):
--   BEGIN;
--   UPDATE tips_crm.roles SET permissions = ARRAY['bogus'] WHERE key = 'owner';
--   ROLLBACK;
