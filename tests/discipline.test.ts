import { describe, expect, it } from "vitest";
import { legacyRoleMappingFor } from "@shared/auth/legacy-role-key";
import { disciplineForAppRole } from "../lib/app-role-discipline";
import { employeeRoleLabel } from "../lib/employee-role-label";
import { disciplinesFromProfile } from "../lib/discipline-from-profile";

describe("legacy role key mapping", () => {
  it("maps company_manager and sales_manager to manager with no discipline", () => {
    expect(legacyRoleMappingFor("company_manager")).toEqual({ role: "manager", disciplines: [] });
    expect(legacyRoleMappingFor("sales_manager")).toEqual({ role: "manager", disciplines: [] });
  });

  it("resolves medical_rep to medical and sales_rep to sales", () => {
    expect(legacyRoleMappingFor("medical_rep")).toEqual({ role: "rep", disciplines: ["medical"] });
    expect(legacyRoleMappingFor("sales_rep")).toEqual({ role: "rep", disciplines: ["sales"] });
  });

  it("resolves medical_supervisor to medical and sales_supervisor to sales", () => {
    expect(legacyRoleMappingFor("medical_supervisor")).toEqual({ role: "supervisor", disciplines: ["medical"] });
    expect(legacyRoleMappingFor("sales_supervisor")).toEqual({ role: "supervisor", disciplines: ["sales"] });
  });

  it("resolves company_manager and accountant to no Discipline at all", () => {
    expect(legacyRoleMappingFor("company_manager").disciplines).toEqual([]);
    expect(legacyRoleMappingFor("accountant")).toEqual({ role: "accountant", disciplines: [] });
  });

  it("resolves a bare system_admin key to no role and no Discipline, since it is only ever written with is_platform_admin", () => {
    expect(legacyRoleMappingFor("system_admin")).toEqual({ role: null, disciplines: [] });
  });

  it("resolves an unknown, null, or missing role_key to no role and no Discipline", () => {
    expect(legacyRoleMappingFor("made_up_role")).toEqual({ role: null, disciplines: [] });
    expect(legacyRoleMappingFor(null)).toEqual({ role: null, disciplines: [] });
    expect(legacyRoleMappingFor(undefined)).toEqual({ role: null, disciplines: [] });
  });
});

describe("Arabic role label to Discipline", () => {
  it("maps the medical labels to medical and the sales labels to sales", () => {
    expect(disciplineForAppRole("مندوب طبي")).toBe("medical");
    expect(disciplineForAppRole("مشرف طبي")).toBe("medical");
    expect(disciplineForAppRole("مندوب مبيعات")).toBe("sales");
    expect(disciplineForAppRole("مشرف مبيعات")).toBe("sales");
  });

  it("maps labels carrying no line of work to no Discipline", () => {
    expect(disciplineForAppRole("مدير")).toBeUndefined();
    expect(disciplineForAppRole("محاسب")).toBeUndefined();
  });
});

describe("Discipline resolved from the profile, not from role_key", () => {
  it("reads the Discipline straight off the profile's own disciplines field", () => {
    expect(disciplinesFromProfile(["sales"])).toEqual(new Set(["sales"]));
    expect(disciplinesFromProfile(["sales", "medical"])).toEqual(new Set(["sales", "medical"]));
  });

  it("drops unrecognised strings and tolerates a missing field", () => {
    expect(disciplinesFromProfile(["sales", "made_up"])).toEqual(new Set(["sales"]));
    expect(disciplinesFromProfile(null)).toEqual(new Set());
    expect(disciplinesFromProfile(undefined)).toEqual(new Set());
  });

  it("stays empty for a bare System Role key such as rep, which carries no Discipline of its own", () => {
    // role_key alone ('rep') says nothing about sales vs medical under the new model — only the
    // profile's disciplines field does, which is exactly what this function reads.
    expect(disciplinesFromProfile([])).toEqual(new Set());
  });
});

describe("employee role labels resolve for both vocabularies", () => {
  it("resolves a legacy composite role key", () => {
    expect(employeeRoleLabel("sales_supervisor")).toBe("مشرف مبيعات");
    expect(employeeRoleLabel("medical_rep")).toBe("مندوب طبي");
    expect(employeeRoleLabel("company_manager")).toBe("مدير الشركة");
  });

  it("resolves a bare new-model System Role key", () => {
    expect(employeeRoleLabel("manager")).toBe("مدير");
    expect(employeeRoleLabel("supervisor")).toBe("مشرف");
    expect(employeeRoleLabel("rep")).toBe("مندوب");
    expect(employeeRoleLabel("accountant")).toBe("محاسب");
  });

  it("falls back to the raw key for anything unrecognised", () => {
    expect(employeeRoleLabel("made_up_role")).toBe("made_up_role");
  });
});
