import type { Plan } from "@/lib/crm-store";

export function buildWeeklyPlanExportRows(plans: Plan[]) {
  return plans.map((plan) => ({
    "اسم الخطة": plan.title,
    "المندوب": plan.repName,
    "المنطقة": plan.territory ?? "غير محددة",
    "حالة الخطة": plan.status,
    "نوع الخطة": plan.kind,
    "الفترة": plan.period,
    "تاريخ البداية": plan.startsOn ?? "",
    "تاريخ النهاية": plan.endsOn ?? "",
    "وقت الإرسال": plan.submittedAt,
    "عدد الزيارات": plan.visitIds.length,
    "أيام العمل": plan.schedule?.filter((day) => day.visitIds.length > 0).map((day) => `${day.label}: ${day.visitIds.length}`).join("، ") ?? "",
    "ملاحظة المدير": plan.managerNote ?? "",
    "زيارات مكتملة سابقة": plan.repSnapshot?.completedVisits ?? 0,
    "زيارات تحتاج مراجعة": plan.repSnapshot?.needsReviewVisits ?? 0,
    "آخر جهة زارها": plan.repSnapshot?.lastVisitName ?? "",
  }));
}
