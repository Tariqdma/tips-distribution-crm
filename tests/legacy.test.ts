import { describe, expect, it } from "vitest";
import { legacyPermissionsFor, legacyRolesFor } from "@shared/auth/legacy";
import { resolvePermissions } from "@shared/auth/resolve";
import { PLATFORM_ADMIN_PERMISSIONS } from "@shared/auth/roles";

describe("legacy role adapter", () => {
  it("maps company_manager and sales_manager to manager with no discipline", () => {
    expect(legacyRolesFor({ roleKey: "company_manager" })).toEqual({ roles: ["manager"], disciplines: [] });
    expect(legacyRolesFor({ roleKey: "sales_manager" })).toEqual({ roles: ["manager"], disciplines: [] });
  });

  it("maps sales_supervisor to supervisor with the sales discipline", () => {
    expect(legacyRolesFor({ roleKey: "sales_supervisor" })).toEqual({ roles: ["supervisor"], disciplines: ["sales"] });
  });

  it("maps medical_supervisor to supervisor with the medical discipline", () => {
    expect(legacyRolesFor({ roleKey: "medical_supervisor" })).toEqual({ roles: ["supervisor"], disciplines: ["medical"] });
  });

  it("maps sales_rep to rep with the sales discipline", () => {
    expect(legacyRolesFor({ roleKey: "sales_rep" })).toEqual({ roles: ["rep"], disciplines: ["sales"] });
  });

  it("maps medical_rep to rep with the medical discipline", () => {
    expect(legacyRolesFor({ roleKey: "medical_rep" })).toEqual({ roles: ["rep"], disciplines: ["medical"] });
  });

  it("maps accountant to accountant with no discipline", () => {
    expect(legacyRolesFor({ roleKey: "accountant" })).toEqual({ roles: ["accountant"], disciplines: [] });
  });

  it("resolves each mapped legacy key to exactly its system role's permissions", () => {
    expect(legacyPermissionsFor({ roleKey: "sales_rep" })).toEqual(resolvePermissions(["rep"]));
    expect(legacyPermissionsFor({ roleKey: "sales_supervisor" })).toEqual(resolvePermissions(["supervisor"]));
    expect(legacyPermissionsFor({ roleKey: "accountant" })).toEqual(resolvePermissions(["accountant"]));
    expect(legacyPermissionsFor({ roleKey: "company_manager" })).toEqual(resolvePermissions(["manager"]));
  });

  it("lets is_platform_admin win: platform permissions and no company role, whatever role_key says", () => {
    expect(legacyRolesFor({ roleKey: "company_manager", isPlatformAdmin: true })).toEqual({ roles: [], disciplines: [] });
    expect(legacyPermissionsFor({ roleKey: "company_manager", isPlatformAdmin: true })).toEqual(new Set(PLATFORM_ADMIN_PERMISSIONS));
    expect(legacyPermissionsFor({ roleKey: "sales_rep", isPlatformAdmin: true })).toEqual(new Set(PLATFORM_ADMIN_PERMISSIONS));
  });

  it("gives an unknown, null, or missing role_key no roles and an empty permission set, never a guessed rep fallback", () => {
    expect(legacyPermissionsFor({ roleKey: "made_up_role" }).size).toBe(0);
    expect(legacyPermissionsFor({ roleKey: null }).size).toBe(0);
    expect(legacyPermissionsFor({})).toEqual(new Set());
  });

  it("treats system_admin as unknown on its own, since it is only ever written with is_platform_admin", () => {
    expect(legacyRolesFor({ roleKey: "system_admin" })).toEqual({ roles: [], disciplines: [] });
    expect(legacyPermissionsFor({ roleKey: "system_admin" }).size).toBe(0);
  });

  it("treats platform_admin as an unknown legacy key, since it was never inserted into the roles table", () => {
    expect(legacyRolesFor({ roleKey: "platform_admin" })).toEqual({ roles: [], disciplines: [] });
    expect(legacyPermissionsFor({ roleKey: "platform_admin" }).size).toBe(0);
  });
});
