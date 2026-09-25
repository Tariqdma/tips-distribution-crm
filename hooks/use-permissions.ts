import { useMemo } from "react";
import { legacyRoleMappingFor, type Discipline } from "@shared/auth/legacy-role-key";
import type { Permission } from "@shared/auth/permissions";
import { permissionsFromMembership } from "@shared/auth/permission-set";
import { hasPermission } from "@shared/auth/resolve";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export type { Discipline } from "@shared/auth/legacy-role-key";

export function usePermissions() {
  const { profile } = useSupabaseAuth();

  const permissions = useMemo(
    () =>
      permissionsFromMembership({
        membershipPermissions: profile?.membership_permissions,
        isPlatformAdmin: profile?.is_platform_admin,
      }),
    [profile?.membership_permissions, profile?.is_platform_admin]
  );

  // Discipline lives on company_memberships.disciplines, which tips_crm_my_profile does not
  // return; the legacy role_key is still the only signal the client has for it.
  const disciplines = useMemo(
    () => (profile?.is_platform_admin ? new Set<Discipline>() : new Set<Discipline>(legacyRoleMappingFor(profile?.role_key).disciplines)),
    [profile?.role_key, profile?.is_platform_admin]
  );

  return useMemo(
    () => ({
      permissions,
      can: (permission: Permission) => hasPermission(permissions, permission),
      disciplines,
      hasDiscipline: (discipline: Discipline) => disciplines.has(discipline),
    }),
    [permissions, disciplines]
  );
}
