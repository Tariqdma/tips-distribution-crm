import { describe, expect, it } from "vitest";
import { buildCompanyTeamSetup } from "../server/company-team-setup";

describe("company team setup", () => {
  const rows = [
    { profile_id: "manager", full_name: "مدير الشركة", email: "manager@example.com", role_key: "company_manager", reports_to_profile_id: null, reports_to_name: null, is_active: true },
    { profile_id: "sales-supervisor", full_name: "مشرف المبيعات", email: "sales@example.com", role_key: "sales_supervisor", reports_to_profile_id: "manager", reports_to_name: "مدير الشركة", is_active: true },
    { profile_id: "medical-rep", full_name: "مندوب طبي", email: "medical@example.com", role_key: "medical_rep", reports_to_profile_id: "manager", reports_to_name: "مدير الشركة", is_active: true },
    { profile_id: "inactive", full_name: "حساب موقوف", email: "inactive@example.com", role_key: "accountant", reports_to_profile_id: null, reports_to_name: null, is_active: false },
  ];

  it("groups the active company team and exposes eligible direct managers", () => {
    const setup = buildCompanyTeamSetup(rows);
    expect(setup.members).toHaveLength(3);
    expect(setup.salesSupervisors).toHaveLength(1);
    expect(setup.medicalRepresentatives).toHaveLength(1);
    expect(setup.accountants).toHaveLength(0);
    expect(setup.eligibleSalesManagers.map((member) => member.profileId)).toEqual(["manager", "sales-supervisor"]);
    expect(setup.eligibleMedicalManagers.map((member) => member.profileId)).toEqual(["manager"]);
    expect(setup.isTeamSetupStarted).toBe(true);
  });
});
