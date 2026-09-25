import { describe, expect, it } from "vitest";
import { permissionsForLegacyRoleKey } from "../shared/auth/legacy-role-key";
import type { Permission } from "../shared/auth/permissions";
import { canGrant, hasPermission, resolvePermissions } from "../shared/auth/resolve";
import { PLATFORM_ADMIN_PERMISSIONS, SYSTEM_ROLE_PERMISSIONS } from "../shared/auth/roles";

// Asserts the key maps, so a typo in a test fixture fails loudly instead of silently becoming an
// empty set. The mapping itself is the production function, not a copy of it.
function permissionsFor(roleKey: string): ReadonlySet<Permission> {
  const permissions = permissionsForLegacyRoleKey(roleKey);
  if (!permissions) throw new Error(`unmapped legacy role key in test fixture: ${roleKey}`);
  return permissions;
}


const managerKeys = ["company_manager", "sales_manager"] as const;
const nonManagerKeys = ["sales_rep", "medical_rep", "sales_supervisor", "medical_supervisor"] as const;

const companyGuardPermissions: Record<string, Permission> = {
  "company-setup.ts": "company.profile.update",
  "company-team-setup.ts": "employee.manage",
  "company-account-import.ts": "account.import",
  "company-territory-setup.ts": "territory.manage",
};

describe("server guard permission mapping", () => {
  it("lets every legacy manager key through every migrated company guard", () => {
    for (const managerKey of managerKeys) {
      const permissions = permissionsFor(managerKey);
      for (const permission of Object.values(companyGuardPermissions)) {
        expect(hasPermission(permissions, permission)).toBe(true);
      }
    }
  });

  it("refuses a rep or supervisor key employee.manage, territory.manage, and account.import", () => {
    const guarded: Permission[] = ["employee.manage", "territory.manage", "account.import"];
    for (const roleKey of nonManagerKeys) {
      const permissions = permissionsFor(roleKey);
      for (const permission of guarded) {
        expect(hasPermission(permissions, permission)).toBe(false);
      }
    }
  });

  it("refuses a platform admin every company permission", () => {
    const permissions = new Set(PLATFORM_ADMIN_PERMISSIONS);
    for (const permission of Object.values(companyGuardPermissions)) {
      expect(hasPermission(permissions, permission)).toBe(false);
    }
  });

  it("grants a platform admin exactly the permissions the migrated platform-company.ts endpoints require", () => {
    const permissions = new Set(PLATFORM_ADMIN_PERMISSIONS);
    expect(hasPermission(permissions, "platform.company.review")).toBe(true);
    expect(hasPermission(permissions, "platform.package.manage")).toBe(true);
  });
});

describe("employee creation subset rule", () => {
  it("lets a legacy manager key create a rep, a supervisor, and an accountant", () => {
    const managerPermissions = permissionsFor("company_manager");
    for (const roleKey of ["sales_rep", "medical_rep", "sales_supervisor", "medical_supervisor", "accountant"]) {
      const targetPermissions = Array.from(permissionsFor(roleKey));
      expect(canGrant(managerPermissions, targetPermissions)).toBe(true);
    }
  });

  it("blocks a legacy manager key from creating an owner", () => {
    const managerPermissions = permissionsFor("company_manager");
    expect(canGrant(managerPermissions, SYSTEM_ROLE_PERMISSIONS.owner)).toBe(false);
  });

  it("blocks a supervisor key from creating an accountant", () => {
    const supervisorPermissions = permissionsFor("sales_supervisor");
    const accountantPermissions = Array.from(permissionsFor("accountant"));
    expect(canGrant(supervisorPermissions, accountantPermissions)).toBe(false);
  });

  // system_admin means platform admin (docs/authorization-model.md "Migration from the legacy
  // role keys"), so on its own — no Membership, no is_platform_admin flag passed here — it
  // resolves to no role and can create no one.
  it("maps a bare system_admin key to no role, so no one can be created from it", () => {
    expect(permissionsForLegacyRoleKey("system_admin")).toBeNull();
    expect(canGrant(new Set(), Array.from(permissionsFor("sales_rep")))).toBe(false);
  });
});
