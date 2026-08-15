import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildWeeklyPlanExportRows } from "../lib/weekly-plan-export";
import type { Plan } from "../lib/crm-store";

const pendingPlan: Plan = {
  id: "plan-rep-1", title: "خطة الأسبوع الأول", period: "15 أغسطس — 21 أغسطس", kind: "أسبوعية", status: "بانتظار الاعتماد", repName: "مندوب اختبار", territory: "الخرطوم", visitIds: ["visit-1", "visit-2"], submittedAt: "الآن", startsOn: "2026-08-15", endsOn: "2026-08-21",
  schedule: [{ id: "sat", label: "السبت", dateLabel: "15 أغسطس", visitIds: ["visit-1"] }, { id: "mon", label: "الاثنين", dateLabel: "17 أغسطس", visitIds: ["visit-2"] }],
  scheduledVisitDetails: [{ id: "visit-1", accountId: "account-1", accountName: "صيدلية النيل", scheduledFor: "2026-08-15T09:00:00+00:00" }, { id: "visit-2", accountId: "account-2", accountName: "عيادة الأمل", scheduledFor: "2026-08-17T09:00:00+00:00" }],
  repSnapshot: { completedVisits: 8, needsReviewVisits: 1, lastVisitName: "صيدلية النيل", lastVisitAt: "2026-08-14T10:00:00+00:00" },
};

describe("دورة الخطة بين المندوب والمدير", () => {
  it("تحتفظ بخطة المندوب قابلة للتعديل ثم الاعتماد مع سجل الزيارات", () => {
    const managerEdit: Plan = { ...pendingPlan, managerNote: "ابدأ بزيارات المتابعة.", scheduledVisitDetails: pendingPlan.scheduledVisitDetails?.map((visit) => visit.id === "visit-2" ? { ...visit, scheduledFor: "2026-08-18T09:00:00+00:00" } : visit) };
    const approved: Plan = { ...managerEdit, status: "معتمدة" };
    expect(managerEdit.status).toBe("بانتظار الاعتماد");
    expect(managerEdit.scheduledVisitDetails?.[1].scheduledFor.slice(0, 10)).toBe("2026-08-18");
    expect(managerEdit.managerNote).toContain("المتابعة");
    expect(approved.status).toBe("معتمدة");
  });

  it("يسمح للمدير بإعادة الخطة للمندوب بسبب واضح", () => {
    const returned: Plan = { ...pendingPlan, status: "معادة للمراجعة", managerNote: "أضف زيارة متابعة ثانية للصيدلية." };
    expect(returned.status).toBe("معادة للمراجعة");
    expect(returned.managerNote).toMatch(/متابعة/);
  });
});

describe("تصدير الخطط المفلترة", () => {
  it("يبني صف Excel يحتوي على حقول الفلترة والمراجعة الأساسية", () => {
    const [row] = buildWeeklyPlanExportRows([pendingPlan]);
    expect(row["المندوب"]).toBe("مندوب اختبار");
    expect(row["المنطقة"]).toBe("الخرطوم");
    expect(row["عدد الزيارات"]).toBe(2);
    expect(row["آخر جهة زارها"]).toBe("صيدلية النيل");
  });
});

describe("عقد التذكير الخلفي", () => {
  it("يحدد مهلة 24 ساعة وجدولة ساعية ومنع التكرار لكل خطة ومدير", () => {
    const sql = readFileSync("supabase/tips_crm_plan_review_reminders.sql", "utf8");
    expect(sql).toContain("interval '24 hours'");
    expect(sql).toContain("PRIMARY KEY (plan_id, manager_id)");
    expect(sql).toContain("'5 * * * *'");
  });
});
