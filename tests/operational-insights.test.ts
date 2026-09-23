import { describe, expect, it } from "vitest";
import { buildDailyCollectionReport, buildHistoricalComparison, buildMonthlyComparison, checkAlertThreshold, executionRate, filterDailyCollectionsByReceiptReference, findDuplicateAccount, isFollowUpDue, targetProgress } from "../lib/operational-insights";
import type { Account, MonthlyTarget, Plan, TeamMember, Territory, Visit } from "../lib/crm-store";

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

  it("يحسب نسبة تحقيق هدف الشهر والفجوة المتبقية", () => {
    expect(targetProgress(7, 10)).toEqual({ target: 10, completed: 7, gap: 3, achievementRate: 70 });
    expect(targetProgress(4, 0).achievementRate).toBe(0);
  });

  it("يحسب التحصيل والإيرادات الفعلية من الزيارات المكتملة", () => {
    const visits: Visit[] = [{ id: "v-1", accountId: "a-1", date: "اليوم", time: "09:00", status: "مكتملة", collectionAmount: 1250.5, revenueAmount: 3400 }, { id: "v-2", accountId: "a-1", date: "اليوم", time: "10:00", status: "تحتاج مراجعة", collectionAmount: 900, revenueAmount: 1200 }];
    const plans: Plan[] = [{ id: "p-1", title: "سبتمبر", period: "سبتمبر", kind: "شهرية", status: "معتمدة", repName: "سلمى", visitIds: ["v-1", "v-2"], submittedAt: "الآن" }];
    const members: TeamMember[] = [{ id: "u-1", name: "سلمى", initials: "س", role: "مندوب مبيعات", type: "مبيعات", territory: "الخرطوم" }];
    const territories: Territory[] = [{ id: "t-1", name: "الخرطوم", state: "الخرطوم", city: "الخرطوم", assignees: ["سلمى"], accounts: 1, coverage: 0 }];
    expect(buildMonthlyComparison({ accounts: [account], visits, plans, members, territories, metric: "collection" }).reps[0].actual).toBe(1250.5);
    expect(buildMonthlyComparison({ accounts: [account], visits, plans, members, territories, metric: "revenue" }).reps[0].actual).toBe(3400);
  });

  it("يطلق التنبيه فقط عندما يكون الإنجاز دون الحد المحدد", () => {
    expect(checkAlertThreshold(69, 100, 70)).toMatchObject({ achievementRate: 69, threshold: 70, shouldAlert: true });
    expect(checkAlertThreshold(70, 100, 70).shouldAlert).toBe(false);
    expect(checkAlertThreshold(0, 0, 70).shouldAlert).toBe(false);
  });

  it("يقارن الهدف الفعلي للشهر مع الشهر السابق ومتوسط الأشهر السابقة", () => {
    const targets: MonthlyTarget[] = [
      { id: "one", monthStart: "2026-06-01", targetType: "مندوب", targetKey: "u-1", targetValue: 10000, metric: "collection", alertThreshold: 70 },
      { id: "two", monthStart: "2026-07-01", targetType: "مندوب", targetKey: "u-1", targetValue: 12000, metric: "collection", alertThreshold: 70 },
      { id: "three", monthStart: "2026-08-01", targetType: "مندوب", targetKey: "u-1", targetValue: 15000, metric: "collection", alertThreshold: 75 },
    ];
    const history = buildHistoricalComparison({ targets, performance: [{ monthStart: "2026-06-01", targetType: "مندوب", targetKey: "u-1", metric: "collection", actualValue: 8000 }, { monthStart: "2026-07-01", targetType: "مندوب", targetKey: "u-1", metric: "collection", actualValue: 9000 }, { monthStart: "2026-08-01", targetType: "مندوب", targetKey: "u-1", metric: "collection", actualValue: 11000 }], monthStart: "2026-08-01", targetType: "مندوب", targetKey: "u-1", metric: "collection", months: 2 });
    expect(history.current).toEqual({ monthStart: "2026-08-01", targetValue: 15000, actualValue: 11000 });
    expect(history.previousActual).toBe(9000);
    expect(history.averagePrevious).toBe(8500);
    expect(history.deltaFromPrevious).toBe(2000);
  });

  it("ينشئ تقرير تحصيل يومي حسب المندوب والجهة ويستبعد الزيارات غير المكتملة أو من تاريخ آخر", () => {
    const secondAccount: Account = { ...account, id: "a-2", name: "مستشفى الحياة", type: "مستشفى", city: "أم درمان" };
    const visits: Visit[] = [
      { id: "v-1", accountId: "a-1", date: "اليوم", time: "09:00", status: "مكتملة", completedAt: "2026-08-15T08:10:00.000Z", collectionAmount: 1250.5, revenueAmount: 3000, receiptReference: "RCP-2026-0001", result: "تم تحصيل" },
      { id: "v-2", accountId: "a-2", date: "اليوم", time: "11:00", status: "مكتملة", completedAt: "2026-08-15T10:05:00.000Z", collectionAmount: 750, revenueAmount: 1250, result: "تم إنشاء فاتورة" },
      { id: "v-3", accountId: "a-1", date: "اليوم", time: "12:00", status: "تحتاج مراجعة", completedAt: "2026-08-15T11:00:00.000Z", collectionAmount: 500 },
      { id: "v-4", accountId: "a-1", date: "أمس", time: "13:00", status: "مكتملة", completedAt: "2026-08-14T11:00:00.000Z", collectionAmount: 900 },
    ];
    const plans: Plan[] = [{ id: "p-1", title: "خطة اليوم", period: "15 أغسطس", kind: "أسبوعية", status: "معتمدة", repName: "سلمى", visitIds: ["v-1", "v-2", "v-3", "v-4"], submittedAt: "الآن" }];
    const report = buildDailyCollectionReport({ visits, accounts: [account, secondAccount], plans, reportDate: "2026-08-15", today: "2026-08-15" });
    expect(report.rows).toHaveLength(2);
    expect(report.rows[0]).toMatchObject({ repName: "سلمى", accountName: "صيدلية الوفاء", collectionAmount: 1250.5, receiptReference: "RCP-2026-0001" });
    expect(report.totals).toEqual({ visitCount: 2, accountCount: 2, repCount: 1, collectionAmount: 2000.5, revenueAmount: 4250 });
    expect(report.repSummaries[0]).toMatchObject({ repName: "سلمى", visitCount: 2, accountCount: 2, collectionAmount: 2000.5 });
  });

  it("يبحث في الإيصال أو الفاتورة دون حساسية لحالة الأحرف أو الشرطات أو الأرقام العربية", () => {
    const rows = [{ visitId: "v-1", reportDate: "2026-08-15", repName: "سلمى", accountId: "a-1", accountName: "صيدلية الوفاء", accountType: "صيدلية" as const, state: "الخرطوم", city: "الخرطوم", area: "العمارات", collectionAmount: 1250, revenueAmount: 3000, receiptReference: "RCP-2026-00125" }, { visitId: "v-2", reportDate: "2026-08-15", repName: "أحمد", accountId: "a-2", accountName: "مستشفى الحياة", accountType: "مستشفى" as const, state: "الخرطوم", city: "أم درمان", area: "الملازمين", collectionAmount: 800, revenueAmount: 1000, receiptReference: "INV-77" }];
    expect(filterDailyCollectionsByReceiptReference(rows, "rcp ٢٠٢٦ 001").map((row) => row.visitId)).toEqual(["v-1"]);
    expect(filterDailyCollectionsByReceiptReference(rows, "inv-77").map((row) => row.visitId)).toEqual(["v-2"]);
    expect(filterDailyCollectionsByReceiptReference(rows, "")).toHaveLength(2);
  });
});
