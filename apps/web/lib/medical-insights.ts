import type { Account, TeamMember, Visit } from "@/lib/crm-store";

export type MedicalCoverageRow = { repId: string; repName: string; territory: string; specialty: string; visits: number; inPersonVisits: number; remoteVisits: number; highInterest: number; requestedInfo: number; dueFollowUps: number; promotedProducts: string[] };

export function buildMedicalCoverage({ visits, accounts, members, today = new Date().toISOString().slice(0, 10) }: { visits: Visit[]; accounts: Account[]; members: TeamMember[]; today?: string }) {
  const groups = new Map<string, MedicalCoverageRow>();
  visits.filter((visit) => visit.medicalInteractionType).forEach((visit) => {
    const account = accounts.find((item) => item.id === visit.accountId); const member = members.find((item) => item.role === "مندوب طبي");
    if (!account || !member) return;
    const specialty = account.specialty || "غير محدد"; const key = `${member.id}:${account.state}:${account.city}:${specialty}`;
    const row = groups.get(key) ?? { repId: member.id, repName: member.name, territory: `${account.state} · ${account.city}`, specialty, visits: 0, inPersonVisits: 0, remoteVisits: 0, highInterest: 0, requestedInfo: 0, dueFollowUps: 0, promotedProducts: [] };
    row.visits += 1;
    if (visit.medicalInteractionType === "زيارة حضورية" || visit.medicalInteractionType === "اجتماع مستشفى") row.inPersonVisits += 1; else row.remoteVisits += 1;
    if (visit.doctorInterest === "مرتفع") row.highInterest += 1;
    if (visit.doctorInterest === "طلب معلومات") row.requestedInfo += 1;
    if (visit.followUpDate && visit.followUpDate <= today) row.dueFollowUps += 1;
    if (visit.promotedProduct && !row.promotedProducts.includes(visit.promotedProduct)) row.promotedProducts.push(visit.promotedProduct);
    groups.set(key, row);
  });
  return [...groups.values()].sort((a, b) => b.visits - a.visits || b.highInterest - a.highInterest || a.repName.localeCompare(b.repName, "ar"));
}
