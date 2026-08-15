import type { Account, Visit } from "@/lib/crm-store";

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
