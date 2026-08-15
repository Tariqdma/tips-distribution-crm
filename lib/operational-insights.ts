import type { Account, MonthlyTarget, Plan, TargetMetric, TeamMember, Territory, Visit } from "@/lib/crm-store";

export const targetMetricMeta: Record<TargetMetric, { label: string; unit: string; compactLabel: string }> = {
  visits: { label: "الزيارات", unit: "زيارة", compactLabel: "زيارات" },
  collection: { label: "التحصيل", unit: "ج.س", compactLabel: "تحصيل" },
  revenue: { label: "القيمة المالية", unit: "ج.س", compactLabel: "إيرادات" },
};

export function findDuplicateAccount(accounts: Account[], candidate: Pick<Account, "name" | "type" | "city">) {
  const normalizedName = candidate.name.trim().toLocaleLowerCase("ar");
  return accounts.find((account) => account.type === candidate.type && account.city === candidate.city && account.name.trim().toLocaleLowerCase("ar") === normalizedName);
}

export function isFollowUpDue(visit: Pick<Visit, "followUpDate">, asOf = new Date().toISOString().slice(0, 10)) {
  return Boolean(visit.followUpDate && visit.followUpDate <= asOf);
}

export function executionRate(completed: number, assigned: number) {
  if (assigned <= 0) return 0;
  return Math.round((completed / assigned) * 100);
}

export type MonthlyComparisonRow = { id: string; label: string; planned: number; completed: number; needsReview: number; rate: number; actual: number };

export function targetProgress(completed: number, target: number) {
  const normalize = (value: number) => Math.round(Math.max(0, Number.isFinite(value) ? value : 0) * 100) / 100;
  const normalizedTarget = normalize(target);
  const normalizedCompleted = normalize(completed);
  return { target: normalizedTarget, completed: normalizedCompleted, gap: normalize(normalizedTarget - normalizedCompleted), achievementRate: normalizedTarget ? Math.round((normalizedCompleted / normalizedTarget) * 100) : 0 };
}

export function checkAlertThreshold(completed: number, target: number, alertThreshold: number) {
  const progress = targetProgress(completed, target);
  const threshold = Math.min(100, Math.max(1, Math.round(Number.isFinite(alertThreshold) ? alertThreshold : 70)));
  return { ...progress, threshold, shouldAlert: progress.target > 0 && progress.achievementRate < threshold };
}

export function buildMonthlyComparison({ accounts, visits, plans, members, territories, metric = "visits" }: { accounts: Account[]; visits: Visit[]; plans: Plan[]; members: TeamMember[]; territories: Territory[]; metric?: TargetMetric }) {
  const approvedPlans = plans.filter((plan) => plan.status === "معتمدة" && plan.kind === "شهرية");
  const sourcePlans = approvedPlans.length ? approvedPlans : plans.filter((plan) => plan.status === "معتمدة");
  const plannedIdsFor = (filter: (plan: Plan) => boolean) => new Set(sourcePlans.filter(filter).flatMap((plan) => plan.visitIds));
  const summarize = (id: string, label: string, visitIds: Set<string>): MonthlyComparisonRow => {
    const selected = [...visitIds].map((visitId) => visits.find((visit) => visit.id === visitId)).filter((visit): visit is Visit => Boolean(visit));
    const completed = selected.filter((visit) => visit.status === "مكتملة").length;
    const needsReview = selected.filter((visit) => visit.status === "تحتاج مراجعة").length;
    const actual = metric === "visits" ? completed : Math.round(selected.filter((visit) => visit.status === "مكتملة").reduce((sum, visit) => sum + (metric === "collection" ? visit.collectionAmount ?? 0 : visit.revenueAmount ?? 0), 0) * 100) / 100;
    return { id, label, planned: selected.length, completed, needsReview, rate: executionRate(completed, selected.length), actual };
  };
  const reps = members.filter((member) => member.role !== "مدير").map((member) => summarize(member.id, member.name, plannedIdsFor((plan) => plan.repName === member.name))).sort((first, second) => second.rate - first.rate || second.completed - first.completed);
  const territoriesRows = territories.map((territory) => {
    const accountIds = new Set(accounts.filter((account) => account.city === territory.city).map((account) => account.id));
    return summarize(territory.id, territory.name, new Set([...plannedIdsFor(() => true)].filter((visitId) => accountIds.has(visits.find((visit) => visit.id === visitId)?.accountId ?? ""))));
  }).sort((first, second) => second.rate - first.rate || second.completed - first.completed);
  return { reps, territories: territoriesRows };
}

export type MonthlyPerformanceRecord = { monthStart: string; targetType: MonthlyTarget["targetType"]; targetKey: string; metric: TargetMetric; actualValue: number };
export type HistoricalComparisonPoint = { monthStart: string; targetValue: number; actualValue: number };

export function buildHistoricalComparison({ targets, performance, monthStart, targetType, targetKey, metric, months = 3 }: { targets: MonthlyTarget[]; performance: MonthlyPerformanceRecord[]; monthStart: string; targetType: MonthlyTarget["targetType"]; targetKey: string; metric: TargetMetric; months?: number }) {
  const selectedTargets = targets.filter((item) => item.targetType === targetType && item.targetKey === targetKey && item.metric === metric);
  const selectedPerformance = performance.filter((item) => item.targetType === targetType && item.targetKey === targetKey && item.metric === metric);
  const monthKeys = new Set([monthStart, ...selectedTargets.map((item) => item.monthStart), ...selectedPerformance.map((item) => item.monthStart)]);
  const points = [...monthKeys].sort((first, second) => second.localeCompare(first)).slice(0, Math.max(2, months + 1)).map((key) => ({ monthStart: key, targetValue: selectedTargets.find((item) => item.monthStart === key)?.targetValue ?? 0, actualValue: Math.round((selectedPerformance.find((item) => item.monthStart === key)?.actualValue ?? 0) * 100) / 100 }));
  const current = points.find((item) => item.monthStart === monthStart) ?? { monthStart, targetValue: 0, actualValue: 0 };
  const previous = points.filter((item) => item.monthStart !== monthStart).slice(0, months);
  const previousActual = previous[0]?.actualValue ?? null;
  const averagePrevious = previous.length ? Math.round((previous.reduce((sum, item) => sum + item.actualValue, 0) / previous.length) * 100) / 100 : null;
  return { current, previous, previousActual, averagePrevious, deltaFromPrevious: previousActual == null ? null : Math.round((current.actualValue - previousActual) * 100) / 100 };
}
