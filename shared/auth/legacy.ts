import type { Permission } from "./permissions";
import { resolvePermissions, type RoleRef } from "./resolve";
import { PLATFORM_ADMIN_PERMISSIONS } from "./roles";

export type Discipline = "sales" | "medical";

export interface LegacyProfile {
  readonly roleKey?: string | null;
  readonly isPlatformAdmin?: boolean;
}

interface LegacyMapping {
  readonly roles: readonly RoleRef[];
  readonly disciplines: readonly Discipline[];
}

// company_memberships.role_key is written but never read by RLS or has_permission()
// (docs/authorization-model.md "Migration from the legacy role keys"); this adapter is
// temporary scaffolding until the membership-to-roles schema lands.
const LEGACY_ROLE_MAP: Record<string, LegacyMapping> = {
  company_manager: { roles: ["manager"], disciplines: [] },
  sales_manager: { roles: ["manager"], disciplines: [] },
  sales_supervisor: { roles: ["supervisor"], disciplines: ["sales"] },
  medical_supervisor: { roles: ["supervisor"], disciplines: ["medical"] },
  sales_rep: { roles: ["rep"], disciplines: ["sales"] },
  medical_rep: { roles: ["rep"], disciplines: ["medical"] },
  accountant: { roles: ["accountant"], disciplines: [] },
};

export function legacyRolesFor(profile: LegacyProfile): LegacyMapping {
  if (profile.isPlatformAdmin) return { roles: [], disciplines: [] };
  if (!profile.roleKey) return { roles: [], disciplines: [] };
  return LEGACY_ROLE_MAP[profile.roleKey] ?? { roles: [], disciplines: [] };
}

export function legacyPermissionsFor(profile: LegacyProfile): ReadonlySet<Permission> {
  if (profile.isPlatformAdmin) return new Set(PLATFORM_ADMIN_PERMISSIONS);
  return resolvePermissions(legacyRolesFor(profile).roles);
}
