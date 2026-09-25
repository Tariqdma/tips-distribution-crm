import { describe, expect, it } from "vitest";
import { getPlatformPortalFallbackRoute, getPostLoginRoute, shouldRedirectManagerFromFieldHome } from "@shared/lib/post-login-route";
import { resolvePermissions } from "@shared/auth/resolve";
import { PLATFORM_ADMIN_PERMISSIONS } from "@shared/auth/roles";

const managerPermissions = resolvePermissions(["manager"]);
const supervisorPermissions = resolvePermissions(["supervisor"]);
const repPermissions = resolvePermissions(["rep"]);
const platformAdminPermissions = new Set(PLATFORM_ADMIN_PERMISSIONS);
const noPermissions = new Set<never>();

describe("post-login routing", () => {
  it("sends a manager to the dedicated company portal on every client", () => {
    expect(getPostLoginRoute({ permissions: managerPermissions, isWeb: true })).toBe("/company");
    expect(getPostLoginRoute({ permissions: managerPermissions, isWeb: false })).toBe("/company");
  });

  it("sends a platform administrator to the dedicated platform portal on web, and the explanatory screen on native", () => {
    expect(getPostLoginRoute({ permissions: platformAdminPermissions, isWeb: true })).toBe("/platform");
    expect(getPostLoginRoute({ permissions: platformAdminPermissions, isWeb: false })).toBe("/platform/login");
  });

  it("redirects non-platform accounts away from the platform URL", () => {
    expect(getPlatformPortalFallbackRoute(managerPermissions)).toBe("/company");
    expect(getPlatformPortalFallbackRoute(supervisorPermissions)).toBe("/supervisor");
    expect(getPlatformPortalFallbackRoute(repPermissions)).toBe("/");
  });

  it("sends a supervisor to their supervision workspace", () => {
    expect(getPostLoginRoute({ permissions: supervisorPermissions, isWeb: true })).toBe("/supervisor");
    expect(getPostLoginRoute({ permissions: supervisorPermissions, isWeb: false })).toBe("/supervisor");
  });

  it("sends a rep to the full rep experience on both web and mobile", () => {
    expect(getPostLoginRoute({ permissions: repPermissions, isWeb: true })).toBe("/");
    expect(getPostLoginRoute({ permissions: repPermissions, isWeb: false })).toBe("/");
  });

  it("prioritizes the required password change route", () => {
    expect(getPostLoginRoute({ permissions: repPermissions, mustChangePassword: true, isWeb: true })).toBe("/change-password");
  });

  it("lands a holder of owner and rep on the company portal, not rep, by landing precedence", () => {
    const ownerAndRep = resolvePermissions(["owner", "rep"]);
    expect(getPostLoginRoute({ permissions: ownerAndRep, isWeb: true })).toBe("/company");
    expect(getPlatformPortalFallbackRoute(ownerAndRep)).toBe("/company");
  });

  it("moves a restored mobile manager session away from the field home", () => {
    expect(shouldRedirectManagerFromFieldHome(managerPermissions, "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome(managerPermissions, "/(tabs)")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome(managerPermissions, "/(tabs)/index")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome(supervisorPermissions, "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome(platformAdminPermissions, "/")).toBe(true);
    expect(shouldRedirectManagerFromFieldHome(repPermissions, "/")).toBe(false);
    expect(shouldRedirectManagerFromFieldHome(managerPermissions, "/plans")).toBe(false);
  });

  it("lands an empty or unrecognized permission set somewhere safe instead of guessing rep", () => {
    expect(getPostLoginRoute({ permissions: noPermissions, isWeb: true })).toBe("/");
    expect(getPlatformPortalFallbackRoute(noPermissions)).toBe("/");
    expect(shouldRedirectManagerFromFieldHome(noPermissions, "/")).toBe(false);
  });
});
