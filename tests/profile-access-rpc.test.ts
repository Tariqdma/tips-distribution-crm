import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migration = readFileSync(`${root}/supabase/tips_crm_profile_access_v2.sql`, "utf8");

describe("company profile access RPC", () => {
  it("returns the company and platform fields required by access guards", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS is_platform_admin");
    expect(migration).toContain("tips_crm_my_profile_v2");
    expect(migration).toContain("active_company_id uuid");
    expect(migration).toContain("active_company_name text");
    expect(migration).toContain("is_platform_admin boolean");
  });

  it("moves every current access guard to the richer profile RPC", () => {
    const files = [
      "lib/supabase-auth.tsx",
      "server/company-account-import.ts",
      "server/company-setup.ts",
      "server/company-team-setup.ts",
      "server/company-territory-setup.ts",
      "server/employee-account.ts",
      "server/financial-control.ts",
      "server/platform-company.ts",
    ];
    for (const file of files) {
      expect(readFileSync(`${root}/${file}`, "utf8")).toContain('rpc("tips_crm_my_profile_v2")');
    }
  });
});
