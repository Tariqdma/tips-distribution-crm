import { describe, expect, it } from "vitest";
import { canGrant } from "../shared/auth/resolve";
import { SYSTEM_ROLE_PERMISSIONS } from "../shared/auth/roles";
import { resolveEmployeeTerritories, validateResetEmployeePasswordInput, validateTemporaryEmployeeInput } from "../server/employee-account";

const validInput = { fullName: "أحمد محمد", email: "ahmed@tips-sd.com", password: "TempPass1", role: "rep" as const, disciplines: ["sales" as const], territoryIds: ["t1", "t2"], forcePasswordChange: true };

describe("temporary employee account validation", () => {
  it("accepts a complete temporary employee account", () => {
    expect(validateTemporaryEmployeeInput(validInput)).toBeNull();
  });

  it("requires a strong-enough temporary password", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, password: "short" })).toContain("8 أحرف");
  });

  it("does not allow creating an owner through the employee flow", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "owner" as never })).toContain("الدور");
  });

  it("requires at least one territory for field representatives and accepts multiple assignments", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, territoryIds: [] })).toContain("منطقة عمل");
    expect(validateTemporaryEmployeeInput({ ...validInput, territoryIds: ["t1", "t2", "t3"] })).toBeNull();
  });

  it("allows company supervisors and accountants without a representative territory", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "supervisor", disciplines: ["sales"], territoryIds: [] })).toBeNull();
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "supervisor", disciplines: ["medical"], territoryIds: [] })).toBeNull();
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "accountant", disciplines: [], territoryIds: [] })).toBeNull();
  });

  it("requires exactly one Discipline for a rep or a supervisor", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "rep", disciplines: [] })).toContain("اختصاصاً واحداً");
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "rep", disciplines: ["sales", "medical"] })).toContain("اختصاصاً واحداً");
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "supervisor", disciplines: [], territoryIds: [] })).toContain("اختصاصاً واحداً");
  });

  it("rejects a Discipline on a manager or an accountant", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "manager", disciplines: ["sales"], territoryIds: [] })).toContain("لا يقبل");
    expect(validateTemporaryEmployeeInput({ ...validInput, role: "accountant", disciplines: ["medical"], territoryIds: [] })).toContain("لا يقبل");
  });

  it("resolves selected territory client keys from the secure shared catalog", () => {
    const result = resolveEmployeeTerritories(["t1", "t2"], ["العمارات والرياض", "بحري"], [
      { id: "id-1", client_key: "t1", name: "العمارات والرياض" },
      { id: "id-2", client_key: "t2", name: "بحري" },
    ]);
    expect(result.keys).toEqual(["t1", "t2"]);
    expect(result.labels).toEqual(["العمارات والرياض", "بحري"]);
    expect(result.selected.map((territory) => territory.id)).toEqual(["id-1", "id-2"]);
  });

  it("requires a strong-enough password when the manager resets an employee password", () => {
    expect(validateResetEmployeePasswordInput({ password: "short", forcePasswordChange: true })).toContain("8 أحرف");
    expect(validateResetEmployeePasswordInput({ password: "NewTemp1", forcePasswordChange: true })).toBeNull();
  });
});

describe("the subset rule bounds who can create which Role", () => {
  it("lets a manager create any creatable Role, since a manager holds every Permission those Roles hold", () => {
    expect(canGrant(new Set(SYSTEM_ROLE_PERMISSIONS.manager), SYSTEM_ROLE_PERMISSIONS.rep)).toBe(true);
    expect(canGrant(new Set(SYSTEM_ROLE_PERMISSIONS.manager), SYSTEM_ROLE_PERMISSIONS.supervisor)).toBe(true);
    expect(canGrant(new Set(SYSTEM_ROLE_PERMISSIONS.manager), SYSTEM_ROLE_PERMISSIONS.accountant)).toBe(true);
  });

  it("blocks a supervisor from creating an accountant", () => {
    expect(canGrant(new Set(SYSTEM_ROLE_PERMISSIONS.supervisor), SYSTEM_ROLE_PERMISSIONS.accountant)).toBe(false);
  });

  it("blocks every creatable-Role holder from creating an owner", () => {
    for (const role of ["manager", "supervisor", "rep", "accountant"] as const) {
      expect(canGrant(new Set(SYSTEM_ROLE_PERMISSIONS[role]), SYSTEM_ROLE_PERMISSIONS.owner)).toBe(false);
    }
  });
});
