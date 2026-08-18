import { describe, expect, it } from "vitest";
import { getPostLoginRoute, shouldRedirectManagerFromFieldHome } from "../lib/post-login-route";

describe("post-login routing", () => {
  it("sends web managers to the administration portal", () => {
    expect(getPostLoginRoute({ roleKey: "system_admin", isWeb: true })).toBe("/admin");
    expect(getPostLoginRoute({ roleKey: "sales_manager", isWeb: true })).toBe("/admin");
  });

  it("sends mobile managers to the mobile administration dashboard", () => {
    expect(getPostLoginRoute({ roleKey: "system_admin", isWeb: false })).toBe("/(tabs)/admin");
    expect(getPostLoginRoute({ roleKey: "sales_manager", isWeb: false })).toBe("/(tabs)/admin");
    expect(getPostLoginRoute({ roleKey: "company_manager", isWeb: false })).toBe("/(tabs)/admin");
  });

  it("sends a platform administrator to the dedicated platform portal", () => {
    expect(getPostLoginRoute({ roleKey: "system_admin", isPlatformAdmin: true, isWeb: true })).toBe("/platform");
    expect(getPostLoginRoute({ roleKey: "company_manager", isPlatformAdmin: true, isWeb: false })).toBe("/platform");
  });

  it("sends company supervisors to their supervision workspace", () => {
    expect(getPostLoginRoute({ roleKey: "sales_supervisor", isWeb: true })).toBe("/supervisor");
    expect(getPostLoginRoute({ roleKey: "medical_supervisor", isWeb: false })).toBe("/supervisor");
  });

  it("sends field representatives to their employee tabs on web and mobile", () => {
    expect(getPostLoginRoute({ roleKey: "sales_rep", isWeb: true })).toBe("/");
    expect(getPostLoginRoute({ roleKey: "medical_rep", isWeb: false })).toBe("/");
  });

  it("prioritizes the required password change route", () => {
    expect(getPostLoginRoute({ roleKey: "sales_rep", mustChangePassword: true, isWeb: true })).toBe("/change-password");
  });

  it("moves a restored mobile manager session away from the field home", () => {
    expect(shouldRedirectManagerFromFieldHome("system_admin", "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_manager", "/(tabs)")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("company_manager", "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("company_manager", "/(tabs)/index")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_supervisor", "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_rep", "/", true)).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_rep", "/")).toBe(false);
    expect(shouldRedirectManagerFromFieldHome("system_admin", "/plans")).toBe(false);
  });
});
