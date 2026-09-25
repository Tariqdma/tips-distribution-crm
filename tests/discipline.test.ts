import { describe, expect, it } from "vitest";
import { legacyRoleMappingFor } from "@shared/auth/legacy-role-key";
import { disciplineForAppRole } from "../lib/app-role-discipline";

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
