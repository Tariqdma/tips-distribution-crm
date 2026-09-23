import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("first system admin bootstrap migration", () => {
  it("creates a profile for the authenticated first admin when one is missing", () => {
    const sql = readFileSync(resolve(process.cwd(), "supabase/tips_crm_first_admin_bootstrap.sql"), "utf8");
    expect(sql).toContain("INSERT INTO tips_crm.profiles");
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain("role_key = 'system_admin'");
  });
});
