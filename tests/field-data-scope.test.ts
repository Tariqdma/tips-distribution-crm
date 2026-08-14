import { describe, expect, it } from "vitest";
import { getFieldDataScope } from "../lib/field-data-scope";
import type { CrmData } from "../lib/crm-store";

const data = { accounts: [{ id: "a1" }, { id: "a2" }], visits: [{ id: "v1", accountId: "a1" }, { id: "v2", accountId: "a2" }], plans: [{ id: "p1", repName: "مندوب أول", visitIds: ["v1"] }, { id: "p2", repName: "مندوب ثان", visitIds: ["v2"] }] } as unknown as CrmData;

describe("field data scope", () => {
  it("limits a representative to plans, visits, and accounts assigned to their name", () => {
    const scoped = getFieldDataScope(data, { full_name: "مندوب أول", permissions: [], id: "u1", email: null, role_key: "sales_rep", role_name: "مندوب", is_active: true, must_change_password: false });
    expect(scoped.plans.map((plan) => plan.id)).toEqual(["p1"]);
    expect(scoped.visits.map((visit) => visit.id)).toEqual(["v1"]);
    expect(scoped.accounts.map((account) => account.id)).toEqual(["a1"]);
  });

  it("keeps the full operational data available to a manager", () => {
    const scoped = getFieldDataScope(data, { full_name: "مدير", permissions: ["view_team_data"], id: "u0", email: null, role_key: "sales_manager", role_name: "مدير", is_active: true, must_change_password: false });
    expect(scoped.accounts).toHaveLength(2);
    expect(scoped.visits).toHaveLength(2);
  });
});
