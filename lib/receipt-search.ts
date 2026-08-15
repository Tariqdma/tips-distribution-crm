import type { Account } from "@/lib/crm-store";

export type ReceiptSearchRecord = { visitId: string; reportDate: string; checkedInAt: string; repId: string; repName: string; repEmail?: string; accountId: string; accountName: string; accountType: Account["type"]; accountPhone?: string; state: string; city: string; area: string; address?: string; territoryName?: string; outcome?: string; notes?: string; followUpAction?: string; followUpOn?: string; visitPriority?: string; checkInLatitude?: number; checkInLongitude?: number; locationAccuracyMeters?: number; collectionAmount: number; revenueAmount: number; receiptReference: string };

export type RemoteReceiptSearchRecord = { visit_id: string; report_date: string; checked_in_at: string; rep_id: string; rep_name: string; rep_email: string | null; account_id: string; account_name: string; account_type: string; account_phone: string | null; state: string; city: string; area: string | null; address: string | null; territory_name: string | null; outcome: string | null; notes: string | null; follow_up_action: string | null; follow_up_on: string | null; visit_priority: string | null; check_in_latitude?: number | string | null; check_in_longitude?: number | string | null; location_accuracy_meters?: number | null; collection_amount: number | string; revenue_amount: number | string; receipt_reference: string };

const accountTypes: Record<string, Account["type"]> = { doctor: "طبيب", pharmacy: "صيدلية", hospital: "مستشفى", distributor: "موزع" };
const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function mapReceiptSearchRecord(row: RemoteReceiptSearchRecord): ReceiptSearchRecord {
  return { visitId: row.visit_id, reportDate: row.report_date, checkedInAt: row.checked_in_at, repId: row.rep_id, repName: row.rep_name, repEmail: row.rep_email ?? undefined, accountId: row.account_id, accountName: row.account_name, accountType: accountTypes[row.account_type] ?? "موزع", accountPhone: row.account_phone ?? undefined, state: row.state, city: row.city, area: row.area ?? "", address: row.address ?? undefined, territoryName: row.territory_name ?? undefined, outcome: row.outcome ?? undefined, notes: row.notes ?? undefined, followUpAction: row.follow_up_action ?? undefined, followUpOn: row.follow_up_on ?? undefined, visitPriority: row.visit_priority ?? undefined, checkInLatitude: row.check_in_latitude == null ? undefined : numeric(row.check_in_latitude), checkInLongitude: row.check_in_longitude == null ? undefined : numeric(row.check_in_longitude), locationAccuracyMeters: row.location_accuracy_meters ?? undefined, collectionAmount: numeric(row.collection_amount), revenueAmount: numeric(row.revenue_amount), receiptReference: row.receipt_reference };
}

export function summarizeReceiptSearch(records: ReceiptSearchRecord[]) {
  const round = (value: number) => Math.round(value * 100) / 100;
  return { recordCount: records.length, repCount: new Set(records.map((record) => record.repId)).size, accountCount: new Set(records.map((record) => record.accountId)).size, collectionAmount: round(records.reduce((sum, record) => sum + record.collectionAmount, 0)), revenueAmount: round(records.reduce((sum, record) => sum + record.revenueAmount, 0)) };
}
