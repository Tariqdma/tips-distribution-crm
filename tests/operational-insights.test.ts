import { describe, expect, it } from "vitest";
import { buildMonthlyComparison, executionRate, findDuplicateAccount, isFollowUpDue } from "../lib/operational-insights";
import type { Account, Plan, TeamMember, Territory, Visit } from "../lib/crm-store";

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

  it("يقارن التنفيذ الشهري للمندوبين والمناطق بناءً على الزيارات المعتمدة", () => {
    const visits: Visit[] = [{ id: "v-1", accountId: "a-1", date: "اليوم", time: "09:00", status: "مكتملة" }, { id: "v-2", accountId: "a-1", date: "اليوم", time: "10:00", status: "تحتاج مراجعة" }];
    const plans: Plan[] = [{ id: "p-1", title: "سبتمبر", period: "سبتمبر", kind: "شهرية", status: "معتمدة", repName: "سلمى", visitIds: ["v-1", "v-2"], submittedAt: "الآن" }];
    const members: TeamMember[] = [{ id: "u-1", name: "سلمى", initials: "س", role: "مندوب مبيعات", type: "مبيعات", territory: "الخرطوم" }];
    const territories: Territory[] = [{ id: "t-1", name: "الخرطوم", state: "الخرطوم", city: "الخرطوم", assignees: ["سلمى"], accounts: 1, coverage: 0 }];
    const result = buildMonthlyComparison({ accounts: [account], visits, plans, members, territories });
    expect(result.reps[0]).toMatchObject({ label: "سلمى", planned: 2, completed: 1, needsReview: 1, rate: 50 });
    expect(result.territories[0]).toMatchObject({ label: "الخرطوم", planned: 2, completed: 1, rate: 50 });
  });
});
