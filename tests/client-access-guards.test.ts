import { describe, expect, it } from "vitest";
import type { Permission } from "@shared/auth/permissions";
import { legacyPermissionsFor } from "@shared/auth/legacy";
import { hasPermission } from "@shared/auth/resolve";

const managerKeys = ["company_manager", "sales_manager"] as const;
const nonManagerKeys = ["sales_rep", "medical_rep", "sales_supervisor", "medical_supervisor", "accountant"] as const;

// The permission each migrated client guard now asks for, matching the server endpoint
// its screen calls (docs/authorization-model.md "Enforcement").
const screenGuardPermissions: Record<string, Permission> = {
  "app/company/index.tsx": "company.profile.update",
  "app/settings.tsx": "company.profile.update",
  "app/company-setup.tsx": "company.profile.update",
  "app/(tabs)/admin.tsx": "employee.manage",
  "app/company-account-setup.tsx": "account.import",
  "app/company-team-setup.tsx": "employee.manage",
  "app/company-territory-setup.tsx": "territory.manage",
  "components/user-menu.tsx (company settings link)": "company.profile.update",
};

describe("client access guard permission mapping", () => {
  it("lets every legacy manager key through every migrated screen guard", () => {
    for (const managerKey of managerKeys) {
      const permissions = legacyPermissionsFor({ roleKey: managerKey });
      for (const permission of Object.values(screenGuardPermissions)) {
        expect(hasPermission(permissions, permission)).toBe(true);
      }
    }
  });

  it("refuses a rep or supervisor key the manager-only screen guards", () => {
    const guarded: Permission[] = ["employee.manage", "territory.manage", "account.import"];
    for (const roleKey of nonManagerKeys) {
      const permissions = legacyPermissionsFor({ roleKey });
      for (const permission of guarded) {
        expect(hasPermission(permissions, permission)).toBe(false);
      }
    }
  });

  it("refuses a rep or supervisor key company.profile.update", () => {
    for (const roleKey of nonManagerKeys) {
      const permissions = legacyPermissionsFor({ roleKey });
      expect(hasPermission(permissions, "company.profile.update")).toBe(false);
    }
  });
});

describe("supervisor portal link in the user menu", () => {
  it("grants a supervisor key portal.supervisor.enter", () => {
    expect(hasPermission(legacyPermissionsFor({ roleKey: "sales_supervisor" }), "portal.supervisor.enter")).toBe(true);
    expect(hasPermission(legacyPermissionsFor({ roleKey: "medical_supervisor" }), "portal.supervisor.enter")).toBe(true);
  });

  it("refuses a rep key portal.supervisor.enter", () => {
    expect(hasPermission(legacyPermissionsFor({ roleKey: "sales_rep" }), "portal.supervisor.enter")).toBe(false);
    expect(hasPermission(legacyPermissionsFor({ roleKey: "medical_rep" }), "portal.supervisor.enter")).toBe(false);
  });
});

describe("platform portal guard", () => {
  it("grants a platform admin portal.platform.enter", () => {
    const permissions = legacyPermissionsFor({ isPlatformAdmin: true });
    expect(hasPermission(permissions, "portal.platform.enter")).toBe(true);
  });

  it("refuses a company manager portal.platform.enter", () => {
    const permissions = legacyPermissionsFor({ roleKey: "company_manager" });
    expect(hasPermission(permissions, "portal.platform.enter")).toBe(false);
  });

  it("refuses every legacy key portal.platform.enter", () => {
    for (const roleKey of [...managerKeys, ...nonManagerKeys]) {
      const permissions = legacyPermissionsFor({ roleKey });
      expect(hasPermission(permissions, "portal.platform.enter")).toBe(false);
    }
  });
});

// DEPLOYMENT HAZARD, documented rather than worked around (see tests/server-authorization.test.ts).
// A bare system_admin key with no is_platform_admin flag resolves to no roles and therefore no
// permissions, so every migrated client guard above now hides these screens from such an account
// even though the old string comparisons showed them. Real deployed rows must be checked before
// this ships (docs/authorization-model.md "Migration from the legacy role keys").
describe("bare system_admin key", () => {
  it("resolves to no permissions at all", () => {
    const permissions = legacyPermissionsFor({ roleKey: "system_admin", isPlatformAdmin: false });
    expect(permissions.size).toBe(0);
  });

  it("fails every migrated screen guard", () => {
    const permissions = legacyPermissionsFor({ roleKey: "system_admin", isPlatformAdmin: false });
    for (const permission of Object.values(screenGuardPermissions)) {
      expect(hasPermission(permissions, permission)).toBe(false);
    }
    expect(hasPermission(permissions, "portal.platform.enter")).toBe(false);
  });
});
