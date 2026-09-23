import { describe, expect, it } from "vitest";
import type { Permission } from "../shared/auth/permissions";
import { legacyPermissionsFor } from "../shared/auth/legacy";
import { canGrant, hasPermission } from "../shared/auth/resolve";
import { SYSTEM_ROLE_PERMISSIONS } from "../shared/auth/roles";

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
      const permissions = legacyPermissionsFor({ roleKey: managerKey });
      for (const permission of Object.values(companyGuardPermissions)) {
        expect(hasPermission(permissions, permission)).toBe(true);
      }
    }
  });

  it("refuses a rep or supervisor key employee.manage, territory.manage, and account.import", () => {
    const guarded: Permission[] = ["employee.manage", "territory.manage", "account.import"];
    for (const roleKey of nonManagerKeys) {
      const permissions = legacyPermissionsFor({ roleKey });
      for (const permission of guarded) {
        expect(hasPermission(permissions, permission)).toBe(false);
      }
    }
  });

  it("refuses a platform admin every company permission", () => {
    const permissions = legacyPermissionsFor({ roleKey: "company_manager", isPlatformAdmin: true });
    for (const permission of Object.values(companyGuardPermissions)) {
      expect(hasPermission(permissions, permission)).toBe(false);
    }
  });

  it("grants a platform admin exactly the permissions the migrated platform-company.ts endpoints require", () => {
    const permissions = legacyPermissionsFor({ isPlatformAdmin: true });
    expect(hasPermission(permissions, "platform.company.review")).toBe(true);
    expect(hasPermission(permissions, "platform.package.manage")).toBe(true);
  });
});

describe("employee creation subset rule", () => {
  it("lets a legacy manager key create a rep, a supervisor, and an accountant", () => {
    const managerPermissions = legacyPermissionsFor({ roleKey: "company_manager" });
    for (const roleKey of ["sales_rep", "medical_rep", "sales_supervisor", "medical_supervisor", "accountant"]) {
      const targetPermissions = Array.from(legacyPermissionsFor({ roleKey }));
      expect(canGrant(managerPermissions, targetPermissions)).toBe(true);
    }
  });

  it("blocks a legacy manager key from creating an owner", () => {
    const managerPermissions = legacyPermissionsFor({ roleKey: "company_manager" });
    expect(canGrant(managerPermissions, SYSTEM_ROLE_PERMISSIONS.owner)).toBe(false);
  });

  it("blocks a supervisor key from creating an accountant", () => {
    const supervisorPermissions = legacyPermissionsFor({ roleKey: "sales_supervisor" });
    const accountantPermissions = Array.from(legacyPermissionsFor({ roleKey: "accountant" }));
    expect(canGrant(supervisorPermissions, accountantPermissions)).toBe(false);
  });

  // DEPLOYMENT HAZARD, documented rather than worked around. Per the migration table,
  // system_admin means platform admin, so on its own it resolves to nothing and can create
  // no one. But company_manager is missing from the canonical roles seed
  // (supabase/00_full_setup.sql) while profiles.role_key has an FK to roles(key), so a really
  // deployed company manager may be stored exactly like this. Check the deployed profiles rows
  // before shipping; if such accounts exist they need a transitional mapping to manager.
  it("gives a bare system_admin key no permissions at all", () => {
    const permissions = legacyPermissionsFor({ roleKey: "system_admin", isPlatformAdmin: false });
    expect(permissions.size).toBe(0);
    expect(canGrant(permissions, Array.from(legacyPermissionsFor({ roleKey: "sales_rep" })))).toBe(false);
  });
});
