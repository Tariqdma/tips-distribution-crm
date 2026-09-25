import { ALL_PERMISSIONS, type Permission } from "./permissions";
import { PLATFORM_ADMIN_PERMISSIONS } from "./roles";

const ALL_PERMISSIONS_SET = new Set<string>(ALL_PERMISSIONS);

function isPermission(value: string): value is Permission {
  return ALL_PERMISSIONS_SET.has(value);
}

// A Platform Admin holds no Membership, so its permissions never come from the array;
// they are the fixed set docs/authorization-model.md attaches to is_platform_admin.
// Strings that are not in the closed vocabulary are dropped, not trusted.
export function permissionsFromMembership(input: {
  membershipPermissions?: readonly string[] | null;
  isPlatformAdmin?: boolean | null;
}): ReadonlySet<Permission> {
  if (input.isPlatformAdmin) return new Set(PLATFORM_ADMIN_PERMISSIONS);
  return new Set((input.membershipPermissions ?? []).filter(isPermission));
}
