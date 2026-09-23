import { describe, expect, it } from "vitest";
import { getPlatformPortalFallbackRoute, getPostLoginRoute, shouldRedirectManagerFromFieldHome } from "@shared/lib/post-login-route";

describe("post-login routing", () => {
  it("sends web managers to the dedicated company portal", () => {
    expect(getPostLoginRoute({ roleKey: "company_manager", isWeb: true })).toBe("/company");
    expect(getPostLoginRoute({ roleKey: "sales_manager", isWeb: true })).toBe("/company");
  });

  it("sends company managers to their dedicated company portal on every client", () => {
    expect(getPostLoginRoute({ roleKey: "company_manager", isWeb: false })).toBe("/company");
    expect(getPostLoginRoute({ roleKey: "sales_manager", isWeb: false })).toBe("/company");
    expect(getPostLoginRoute({ roleKey: "company_manager", isWeb: true })).toBe("/company");
  });

  it("sends a platform administrator to the dedicated platform portal on web, and the explanatory screen on native", () => {
    expect(getPostLoginRoute({ roleKey: "system_admin", isPlatformAdmin: true, isWeb: true })).toBe("/platform");
    expect(getPostLoginRoute({ roleKey: "company_manager", isPlatformAdmin: true, isWeb: false })).toBe("/platform/login");
  });

  it("redirects non-platform accounts away from the platform URL", () => {
    expect(getPlatformPortalFallbackRoute("sales_manager")).toBe("/company");
    expect(getPlatformPortalFallbackRoute("company_manager")).toBe("/company");
    expect(getPlatformPortalFallbackRoute("sales_supervisor")).toBe("/supervisor");
    expect(getPlatformPortalFallbackRoute("sales_rep")).toBe("/");
  });

  it("sends company supervisors to their supervision workspace", () => {
    expect(getPostLoginRoute({ roleKey: "sales_supervisor", isWeb: true })).toBe("/supervisor");
    expect(getPostLoginRoute({ roleKey: "medical_supervisor", isWeb: false })).toBe("/supervisor");
  });

  it("sends field representatives to the full rep experience on both web and mobile", () => {
    expect(getPostLoginRoute({ roleKey: "sales_rep", isWeb: true })).toBe("/");
    expect(getPostLoginRoute({ roleKey: "medical_rep", isWeb: false })).toBe("/");
  });

  it("prioritizes the required password change route", () => {
    expect(getPostLoginRoute({ roleKey: "sales_rep", mustChangePassword: true, isWeb: true })).toBe("/change-password");
  });

  it("moves a restored mobile manager session away from the field home", () => {
    expect(shouldRedirectManagerFromFieldHome("company_manager", "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_manager", "/(tabs)")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("company_manager", "/(tabs)/index")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_supervisor", "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_rep", "/", true)).toBe(true);
    expect(shouldRedirectManagerFromFieldHome("sales_rep", "/")).toBe(false);
    expect(shouldRedirectManagerFromFieldHome("company_manager", "/plans")).toBe(false);
  });

  // system_admin is only ever written alongside is_platform_admin = true (docs/authorization-model.md
  // "Migration from the legacy role keys"); on its own it maps to no legacy role, same as any unknown key.
  it("lands an unrecognized or missing role_key somewhere safe instead of guessing rep", () => {
    expect(getPostLoginRoute({ roleKey: "system_admin", isWeb: true })).toBe("/");
    expect(getPostLoginRoute({ roleKey: null, isWeb: true })).toBe("/");
    expect(getPostLoginRoute({ isWeb: false })).toBe("/");
    expect(getPlatformPortalFallbackRoute("system_admin")).toBe("/");
    expect(shouldRedirectManagerFromFieldHome("system_admin", "/")).toBe(false);
  });
});
