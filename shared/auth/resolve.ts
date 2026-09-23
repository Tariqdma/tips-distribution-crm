import type { Permission } from "./permissions";
import { PORTAL_ENTRY_PERMISSION, PORTAL_LANDING_PRECEDENCE, type Portal } from "./portals";
import { SYSTEM_ROLE_PERMISSIONS, type CustomRole, type SystemRoleName } from "./roles";

export type RoleRef = SystemRoleName | CustomRole;

function permissionsOf(role: RoleRef): readonly Permission[] {
  return typeof role === "string" ? SYSTEM_ROLE_PERMISSIONS[role] : role.permissions;
}

export function resolvePermissions(roles: readonly RoleRef[]): ReadonlySet<Permission> {
  const resolved = new Set<Permission>();
  for (const role of roles) {
    for (const permission of permissionsOf(role)) {
      resolved.add(permission);
    }
  }
  return resolved;
}

export function hasPermission(permissions: ReadonlySet<Permission>, permission: Permission): boolean {
  return permissions.has(permission);
}

export function enterablePortals(permissions: ReadonlySet<Permission>): readonly Portal[] {
  return PORTAL_LANDING_PRECEDENCE.filter((portal) => permissions.has(PORTAL_ENTRY_PERMISSION[portal]));
}

export function landingPortal(permissions: ReadonlySet<Permission>): Portal | null {
  for (const portal of PORTAL_LANDING_PRECEDENCE) {
    if (permissions.has(PORTAL_ENTRY_PERMISSION[portal])) {
      return portal;
    }
  }
  return null;
}

// The subset rule (docs/authorization-model.md "Granting"): an actor may grant, create, or edit
// a Role only if every Permission the target holds is already held by the actor. Takes the
// target's raw permission set, not a RoleRef, so it also governs edits to an existing Role.
export function canGrant(actorPermissions: ReadonlySet<Permission>, targetPermissions: readonly Permission[]): boolean {
  return targetPermissions.every((permission) => actorPermissions.has(permission));
}
