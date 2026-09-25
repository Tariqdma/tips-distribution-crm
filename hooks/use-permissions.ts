import { useMemo } from "react";
import type { Discipline } from "@shared/auth/legacy-role-key";
import type { Permission } from "@shared/auth/permissions";
import { permissionsFromMembership } from "@shared/auth/permission-set";
import { hasPermission } from "@shared/auth/resolve";
import { disciplinesFromProfile } from "@/lib/discipline-from-profile";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export type { Discipline } from "@shared/auth/legacy-role-key";
export { disciplinesFromProfile } from "@/lib/discipline-from-profile";

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

  const disciplines = useMemo(() => disciplinesFromProfile(profile?.disciplines), [profile?.disciplines]);

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
