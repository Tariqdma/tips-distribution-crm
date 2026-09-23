import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, OWNERSHIP_PERMISSIONS, PLATFORM_PERMISSIONS, PORTAL_ENTRY_PERMISSIONS } from "../shared/auth/permissions";
import { PORTAL_LANDING_PRECEDENCE } from "../shared/auth/portals";
import { SYSTEM_ROLE_NAMES, SYSTEM_ROLE_PERMISSIONS } from "../shared/auth/roles";
import { canGrant, landingPortal, resolvePermissions } from "../shared/auth/resolve";

describe("permission vocabulary", () => {
  it("defines exactly 44 permissions with no duplicates", () => {
    expect(ALL_PERMISSIONS.length).toBe(44);
    expect(new Set(ALL_PERMISSIONS).size).toBe(44);
  });

  it("defines exactly four portal entry permissions, each reachable by some role or the platform set", () => {
    expect(PORTAL_ENTRY_PERMISSIONS.length).toBe(4);
    for (const entryPermission of PORTAL_ENTRY_PERMISSIONS) {
      const reachable =
        PLATFORM_PERMISSIONS.includes(entryPermission) ||
        SYSTEM_ROLE_NAMES.some((roleName) => SYSTEM_ROLE_PERMISSIONS[roleName].includes(entryPermission));
      expect(reachable).toBe(true);
    }
  });
});

describe("role resolution", () => {
  it("unions permissions across multiple assigned roles", () => {
    const permissions = resolvePermissions(["owner", "manager"]);
    for (const permission of SYSTEM_ROLE_PERMISSIONS.owner) {
      expect(permissions.has(permission)).toBe(true);
    }
    for (const permission of SYSTEM_ROLE_PERMISSIONS.manager) {
      expect(permissions.has(permission)).toBe(true);
    }
    expect(permissions.size).toBe(new Set([...SYSTEM_ROLE_PERMISSIONS.owner, ...SYSTEM_ROLE_PERMISSIONS.manager]).size);
  });

  it("lands an owner-and-rep holder on the company portal, not rep", () => {
    const permissions = resolvePermissions(["owner", "rep"]);
    expect(landingPortal(permissions)).toBe("company");
  });

  // PORTAL_LANDING_PRECEDENCE aliases PORTALS, so reordering that array would silently change
  // where people land. Pinned so the reorder fails here instead.
  it("keeps landing precedence at platform, company, supervisor, rep", () => {
    expect([...PORTAL_LANDING_PRECEDENCE]).toEqual(["platform", "company", "supervisor", "rep"]);
  });

  it("returns no landing portal for a permission set holding no portal entry", () => {
    expect(landingPortal(new Set())).toBeNull();
  });
});

describe("manager superset property", () => {
  it("derives manager as every permission minus ownership, the platform set, and role.custom.manage", () => {
    const expected = new Set(
      ALL_PERMISSIONS.filter(
        (permission) =>
          !OWNERSHIP_PERMISSIONS.includes(permission) && !PLATFORM_PERMISSIONS.includes(permission) && permission !== "role.custom.manage",
      ),
    );
    expect(new Set(SYSTEM_ROLE_PERMISSIONS.manager)).toEqual(expected);
  });

  // Pinned deliberately. The test above mirrors the derivation rule, so a newly added permission
  // would flow into manager and still pass. This count fails instead, forcing whoever adds a
  // permission to decide explicitly whether managers get it.
  it("grants manager exactly 34 of the 44 permissions", () => {
    expect(SYSTEM_ROLE_PERMISSIONS.manager.length).toBe(34);
  });

  it("keeps every system role a subset of manager, except owner", () => {
    const managerSet = new Set(SYSTEM_ROLE_PERMISSIONS.manager);
    for (const roleName of SYSTEM_ROLE_NAMES) {
      if (roleName === "manager" || roleName === "owner") continue;
      const isSubset = SYSTEM_ROLE_PERMISSIONS[roleName].every((permission) => managerSet.has(permission));
      expect(isSubset).toBe(true);
    }
    const ownerIsSubset = SYSTEM_ROLE_PERMISSIONS.owner.every((permission) => managerSet.has(permission));
    expect(ownerIsSubset).toBe(false);
  });

  it("keeps the platform permission set disjoint from every system role", () => {
    for (const roleName of SYSTEM_ROLE_NAMES) {
      const overlap = SYSTEM_ROLE_PERMISSIONS[roleName].some((permission) => PLATFORM_PERMISSIONS.includes(permission));
      expect(overlap).toBe(false);
    }
  });
});

describe("subset rule (granting)", () => {
  it("blocks a manager from granting owner", () => {
    const managerPermissions = resolvePermissions(["manager"]);
    expect(canGrant(managerPermissions, SYSTEM_ROLE_PERMISSIONS.owner)).toBe(false);
  });

  it("blocks an owner-only membership from granting rep", () => {
    const ownerPermissions = resolvePermissions(["owner"]);
    expect(canGrant(ownerPermissions, SYSTEM_ROLE_PERMISSIONS.rep)).toBe(false);
  });

  it("lets a manager grant every role it is a superset of", () => {
    const managerPermissions = resolvePermissions(["manager"]);
    expect(canGrant(managerPermissions, SYSTEM_ROLE_PERMISSIONS.rep)).toBe(true);
    expect(canGrant(managerPermissions, SYSTEM_ROLE_PERMISSIONS.supervisor)).toBe(true);
    expect(canGrant(managerPermissions, SYSTEM_ROLE_PERMISSIONS.accountant)).toBe(true);
  });
});
