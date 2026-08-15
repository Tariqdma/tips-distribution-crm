import { describe, expect, it } from "vitest";
import { executionRate, findDuplicateAccount, isFollowUpDue } from "../lib/operational-insights";
import type { Account } from "../lib/crm-store";

const account: Account = { id: "a-1", name: "صيدلية الوفاء", type: "صيدلية", state: "ولاية الخرطوم", city: "الخرطوم", area: "العمارات", address: "شارع 1", contact: "0912", lastVisit: "لم تتم زيارة", priority: "اعتيادية", initials: "ص و", accent: "#000" };

describe("operational insights", () => {
  it("يكتشف تكرار الجهة ضمن نفس النوع والمدينة مع تجاهل مسافات الاسم", () => {
    expect(findDuplicateAccount([account], { name: " صيدلية الوفاء ", type: "صيدلية", city: "الخرطوم" })?.id).toBe("a-1");
    expect(findDuplicateAccount([account], { name: "صيدلية الوفاء", type: "صيدلية", city: "بحري" })).toBeUndefined();
  });

  it("يحدد المتابعات المستحقة في تاريخ اليوم أو قبله", () => {
    expect(isFollowUpDue({ followUpDate: "2026-08-15" }, "2026-08-15")).toBe(true);
    expect(isFollowUpDue({ followUpDate: "2026-08-16" }, "2026-08-15")).toBe(false);
  });

  it("يحسب نسبة التنفيذ دون قسمة على صفر", () => {
    expect(executionRate(7, 10)).toBe(70);
    expect(executionRate(0, 0)).toBe(0);
  });
});
