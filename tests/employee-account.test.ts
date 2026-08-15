import { describe, expect, it } from "vitest";
import { validateResetEmployeePasswordInput, validateTemporaryEmployeeInput } from "../server/employee-account";

const validInput = { fullName: "أحمد محمد", email: "ahmed@tips-sd.com", password: "TempPass1", roleKey: "sales_rep" as const, forcePasswordChange: true };

describe("temporary employee account validation", () => {
  it("accepts a complete temporary employee account", () => {
    expect(validateTemporaryEmployeeInput(validInput)).toBeNull();
  });

  it("requires a strong-enough temporary password", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, password: "short" })).toContain("8 أحرف");
  });

  it("does not allow creating a system admin through the employee flow", () => {
    expect(validateTemporaryEmployeeInput({ ...validInput, roleKey: "system_admin" as never })).toContain("الدور");
  });

  it("requires a strong-enough password when the manager resets an employee password", () => {
    expect(validateResetEmployeePasswordInput({ password: "short", forcePasswordChange: true })).toContain("8 أحرف");
    expect(validateResetEmployeePasswordInput({ password: "NewTemp1", forcePasswordChange: true })).toBeNull();
  });
});
