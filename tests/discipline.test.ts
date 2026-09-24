import { describe, expect, it } from "vitest";
import { legacyRolesFor } from "@shared/auth/legacy";
import { disciplineForAppRole } from "../lib/app-role-discipline";

describe("legacy role key to Discipline", () => {
  it("resolves medical_rep to medical and sales_rep to sales", () => {
    expect(legacyRolesFor({ roleKey: "medical_rep" }).disciplines).toEqual(["medical"]);
    expect(legacyRolesFor({ roleKey: "sales_rep" }).disciplines).toEqual(["sales"]);
  });

  it("resolves medical_supervisor to medical and sales_supervisor to sales", () => {
    expect(legacyRolesFor({ roleKey: "medical_supervisor" }).disciplines).toEqual(["medical"]);
    expect(legacyRolesFor({ roleKey: "sales_supervisor" }).disciplines).toEqual(["sales"]);
  });

  it("resolves company_manager and accountant to no Discipline at all", () => {
    expect(legacyRolesFor({ roleKey: "company_manager" }).disciplines).toEqual([]);
    expect(legacyRolesFor({ roleKey: "accountant" }).disciplines).toEqual([]);
  });

  it("resolves a bare system_admin key to no Discipline, since it is only ever written with is_platform_admin", () => {
    expect(legacyRolesFor({ roleKey: "system_admin" }).disciplines).toEqual([]);
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
