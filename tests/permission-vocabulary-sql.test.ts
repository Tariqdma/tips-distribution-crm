import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS } from "../shared/auth/permissions";
import { SYSTEM_ROLE_NAMES, SYSTEM_ROLE_PERMISSIONS, type SystemRoleName } from "../shared/auth/roles";

// This file is read as text, not executed — vitest cannot run SQL. A typo in the
// 44-string vocabulary here silently grants nothing and no database error is
// raised, which is exactly what this test exists to catch.
const sqlPath = path.resolve(__dirname, "../supabase/tips_crm_membership_roles.sql");
const sql = readFileSync(sqlPath, "utf-8");

const roleEntryPattern = /\(\s*'(\w+)'\s*,\s*'[^']*'\s*,\s*'[^']*'\s*,\s*ARRAY\[([\s\S]*?)\]\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/g;

function extractRoleSeeds(): Map<string, { permissions: string[]; isSystem: boolean; isActive: boolean }> {
  const seeds = new Map<string, { permissions: string[]; isSystem: boolean; isActive: boolean }>();
  for (const match of sql.matchAll(roleEntryPattern)) {
    const [, key, arrayBody, isSystem, isActive] = match;
    const permissions = [...arrayBody.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    seeds.set(key, { permissions, isSystem: isSystem === "true", isActive: isActive === "true" });
  }
  return seeds;
}

const roleSeeds = extractRoleSeeds();

describe("SQL role seed permission vocabulary", () => {
  it("parses all five System Role seeds out of the migration file", () => {
    for (const roleName of SYSTEM_ROLE_NAMES) {
      expect(roleSeeds.has(roleName)).toBe(true);
    }
  });

  it("uses only permission strings that exist in ALL_PERMISSIONS", () => {
    const allPermissionsSet = new Set<string>(ALL_PERMISSIONS);
    for (const [roleKey, seed] of roleSeeds) {
      for (const permission of seed.permissions) {
        expect(allPermissionsSet.has(permission), `${roleKey} seeds unknown permission "${permission}"`).toBe(true);
      }
    }
  });

  it("marks every System Role seed is_system = true and is_active = true", () => {
    for (const roleName of SYSTEM_ROLE_NAMES) {
      const seed = roleSeeds.get(roleName)!;
      expect(seed.isSystem).toBe(true);
      expect(seed.isActive).toBe(true);
    }
  });

  it("matches SYSTEM_ROLE_PERMISSIONS exactly, permission string for permission string, for every System Role", () => {
    for (const roleName of SYSTEM_ROLE_NAMES) {
      const seed = roleSeeds.get(roleName)!;
      const expected = new Set<string>(SYSTEM_ROLE_PERMISSIONS[roleName as SystemRoleName]);
      const actual = new Set(seed.permissions);
      expect(actual).toEqual(expected);
      expect(seed.permissions.length).toBe(SYSTEM_ROLE_PERMISSIONS[roleName as SystemRoleName].length);
    }
  });
});
