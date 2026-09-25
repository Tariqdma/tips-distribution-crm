import { describe, expect, it } from "vitest";
import { permissionsFromMembership } from "@shared/auth/permission-set";
import { PLATFORM_ADMIN_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "@shared/auth/roles";

describe("permissionsFromMembership", () => {
  it("resolves a profile's membership_permissions array to exactly those permissions", () => {
    const permissions = permissionsFromMembership({ membershipPermissions: [...SYSTEM_ROLE_PERMISSIONS.rep] });
    expect(permissions).toEqual(new Set(SYSTEM_ROLE_PERMISSIONS.rep));
  });

  it("resolves a platform admin to PLATFORM_ADMIN_PERMISSIONS despite an empty membership_permissions array", () => {
    const permissions = permissionsFromMembership({ membershipPermissions: [], isPlatformAdmin: true });
    expect(permissions).toEqual(new Set(PLATFORM_ADMIN_PERMISSIONS));
  });

  it("ignores membership_permissions entirely for a platform admin, even if the array holds real permissions", () => {
    const permissions = permissionsFromMembership({ membershipPermissions: [...SYSTEM_ROLE_PERMISSIONS.manager], isPlatformAdmin: true });
    expect(permissions).toEqual(new Set(PLATFORM_ADMIN_PERMISSIONS));
  });

  it("drops an unrecognized permission string instead of trusting it", () => {
    const permissions = permissionsFromMembership({ membershipPermissions: ["account.read.assigned", "made_up_permission", "drop_table_profiles"] });
    expect(permissions).toEqual(new Set(["account.read.assigned"]));
  });

  it("returns an empty set for a missing or null membership_permissions array", () => {
    expect(permissionsFromMembership({})).toEqual(new Set());
    expect(permissionsFromMembership({ membershipPermissions: null })).toEqual(new Set());
  });
});
