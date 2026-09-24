import { useMemo } from "react";
import { legacyPermissionsFor } from "@shared/auth/legacy";
import type { Permission } from "@shared/auth/permissions";
import { hasPermission } from "@shared/auth/resolve";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export function usePermissions() {
  const { profile } = useSupabaseAuth();

  const permissions = useMemo(
    () => legacyPermissionsFor({ roleKey: profile?.role_key, isPlatformAdmin: profile?.is_platform_admin }),
    [profile?.role_key, profile?.is_platform_admin]
  );

  return useMemo(
    () => ({
      permissions,
      can: (permission: Permission) => hasPermission(permissions, permission),
    }),
    [permissions]
  );
}
