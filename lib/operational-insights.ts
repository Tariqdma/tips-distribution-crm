import type { Account, Plan, TeamMember, Territory, Visit } from "@/lib/crm-store";

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

export type MonthlyComparisonRow = { id: string; label: string; planned: number; completed: number; needsReview: number; rate: number };

export function targetProgress(completed: number, target: number) {
  const normalizedTarget = Math.max(0, Math.floor(target));
  const normalizedCompleted = Math.max(0, Math.floor(completed));
  return { target: normalizedTarget, completed: normalizedCompleted, gap: Math.max(0, normalizedTarget - normalizedCompleted), achievementRate: normalizedTarget ? Math.round((normalizedCompleted / normalizedTarget) * 100) : 0 };
}

export function buildMonthlyComparison({ accounts, visits, plans, members, territories }: { accounts: Account[]; visits: Visit[]; plans: Plan[]; members: TeamMember[]; territories: Territory[] }) {
  const approvedPlans = plans.filter((plan) => plan.status === "معتمدة" && plan.kind === "شهرية");
  const sourcePlans = approvedPlans.length ? approvedPlans : plans.filter((plan) => plan.status === "معتمدة");
  const plannedIdsFor = (filter: (plan: Plan) => boolean) => new Set(sourcePlans.filter(filter).flatMap((plan) => plan.visitIds));
  const summarize = (id: string, label: string, visitIds: Set<string>): MonthlyComparisonRow => {
    const selected = [...visitIds].map((visitId) => visits.find((visit) => visit.id === visitId)).filter((visit): visit is Visit => Boolean(visit));
    const completed = selected.filter((visit) => visit.status === "مكتملة").length;
    const needsReview = selected.filter((visit) => visit.status === "تحتاج مراجعة").length;
    return { id, label, planned: selected.length, completed, needsReview, rate: executionRate(completed, selected.length) };
  };
  const reps = members.filter((member) => member.role !== "مدير").map((member) => summarize(member.id, member.name, plannedIdsFor((plan) => plan.repName === member.name))).sort((first, second) => second.rate - first.rate || second.completed - first.completed);
  const territoriesRows = territories.map((territory) => {
    const accountIds = new Set(accounts.filter((account) => account.city === territory.city).map((account) => account.id));
    return summarize(territory.id, territory.name, new Set([...plannedIdsFor(() => true)].filter((visitId) => accountIds.has(visits.find((visit) => visit.id === visitId)?.accountId ?? ""))));
  }).sort((first, second) => second.rate - first.rate || second.completed - first.completed);
  return { reps, territories: territoriesRows };
}
