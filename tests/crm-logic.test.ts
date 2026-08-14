import { describe, expect, it } from "vitest";
import { isLocationAcceptable, visitOutcomeFromAccuracy } from "../lib/crm-logic";
import { crmRoleValues } from "../drizzle/schema";

describe("معايير توثيق الزيارة بالموقع", () => {
  it("تقبل قراءة موقع ضمن حد الدقة المسموح", () => {
    expect(isLocationAcceptable(48)).toBe(true);
    expect(visitOutcomeFromAccuracy(150)).toBe("مكتملة");
  });

  it("تحيل الزيارة إلى المراجعة عند ضعف دقة الموقع", () => {
    expect(isLocationAcceptable(151)).toBe(false);
    expect(visitOutcomeFromAccuracy(260)).toBe("تحتاج مراجعة");
  });

  it("تظل متوافقة مع متصفحات لا تعرض قيمة دقة", () => {
    expect(isLocationAcceptable(null)).toBe(true);
  });
});

describe("أدوار فريق CRM", () => {
  it("تحصر الصلاحيات في المدير ومندوب المبيعات والمندوب الطبي", () => {
    expect(crmRoleValues).toEqual(["manager", "sales_rep", "medical_rep"]);
  });
});
