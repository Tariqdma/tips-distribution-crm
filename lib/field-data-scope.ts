import type { Account, CrmData, Plan, Visit } from "@/lib/crm-store";
import type { SupabaseProfile } from "@/lib/supabase-auth";

export type FieldDataScope = { plans: Plan[]; visits: Visit[]; accounts: Account[]; isManager: boolean };

export function getFieldDataScope(data: CrmData, profile: SupabaseProfile | null): FieldDataScope {
  const isManager = Boolean(profile?.permissions.includes("all") || profile?.permissions.includes("view_team_data"));
  if (isManager) return { plans: data.plans, visits: data.visits, accounts: data.accounts, isManager };
  if (!profile) return { plans: [], visits: [], accounts: [], isManager: false };
  const plans = data.plans.filter((plan) => plan.repName === profile.full_name);
  const visitIds = new Set(plans.flatMap((plan) => plan.visitIds));
  const visits = data.visits.filter((visit) => visitIds.has(visit.id));
  const accountIds = new Set(visits.map((visit) => visit.accountId));
  return { plans, visits, accounts: data.accounts.filter((account) => accountIds.has(account.id)), isManager: false };
}
