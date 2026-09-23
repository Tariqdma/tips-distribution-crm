import { describe, expect, it } from "vitest";
import { validateTemporaryEmployeeInput } from "../server/employee-account";

describe("Company user limit & 3-Tier backend separation", () => {
  it("validates temporary employee account input before creation", () => {
    const invalidEmail = validateTemporaryEmployeeInput({
      fullName: "أحمد المندوب",
      email: "invalid-email",
      password: "password123",
      roleKey: "sales_rep",
      territoryId: "terr-1",
      forcePasswordChange: true,
    });
    expect(invalidEmail).toBe("اكتب بريداً إلكترونياً صحيحاً.");

    const missingTerritory = validateTemporaryEmployeeInput({
      fullName: "أحمد المندوب",
      email: "rep@company.sd",
      password: "password123",
      roleKey: "sales_rep",
      forcePasswordChange: true,
    });
    expect(missingTerritory).toBe("اختر منطقة عمل واحدة على الأقل للمندوب.");

    const validRep = validateTemporaryEmployeeInput({
      fullName: "أحمد المندوب",
      email: "rep@company.sd",
      password: "password123",
      roleKey: "sales_rep",
      territoryId: "terr-1",
      forcePasswordChange: true,
    });
    expect(validRep).toBeNull();
  });

  it("formats user capacity error messages with Arabized details", () => {
    const maxLimit = 20;
    const currentCount = 20;
    const errorMessage = `تجاوزت الشركة الحد الأقصى المسموح به من الموظفين في باقتها الحالية (الحد المسموح: ${maxLimit} موظف / المسجل حالياً: ${currentCount}). تواصل مع مدير المنصة لترقية الباقة أو زيادة السعة.`;

    expect(errorMessage).toContain("الحد الأقصى المسموح به من الموظفين");
    expect(errorMessage).toContain("الحد المسموح: 20 موظف");
    expect(errorMessage).toContain("مدير المنصة");
  });
});
