import { supabase } from "@/lib/supabase-client";
import type { Proforma, ProformaLine, ProformaStatus } from "@/lib/proforma-utils";

export type ConfirmationMethod = "phone" | "whatsapp" | "in_person" | "email" | "other";
export type ReviewProforma = Proforma & { repId: string; repName: string; clientConfirmedAt?: string; clientConfirmationMethod?: ConfirmationMethod; clientConfirmerName?: string; clientConfirmationNote?: string; clientConfirmationAttachmentPath?: string; managerNote?: string };
type RemoteLine = { id?: string; product_id: string; sku: string; name: string; unit_label: string; quantity: number | string; unit_price: number | string; line_total: number | string };
type RemoteReview = { id: string; proforma_number: number; status: ProformaStatus; account_id: string; account_name: string; account_type: string; rep_id: string; rep_name: string; notes?: string | null; subtotal: number | string; currency: string; issued_at?: string | null; client_confirmed_at?: string | null; client_confirmation_method?: ConfirmationMethod | null; client_confirmer_name?: string | null; client_confirmation_note?: string | null; client_confirmation_attachment_path?: string | null; manager_note?: string | null; updated_at: string; created_at: string; lines?: RemoteLine[] | null };

function mapLine(line: RemoteLine): ProformaLine { return { id: line.id, productId: line.product_id, sku: line.sku, name: line.name, unitLabel: line.unit_label, quantity: Number(line.quantity), unitPrice: Number(line.unit_price), lineTotal: Number(line.line_total) }; }
function mapReview(item: RemoteReview): ReviewProforma { return { id: item.id, proformaNumber: Number(item.proforma_number), status: item.status, accountId: item.account_id, accountName: item.account_name, accountType: item.account_type, repId: item.rep_id, repName: item.rep_name, notes: item.notes ?? undefined, subtotal: Number(item.subtotal), currency: item.currency, issuedAt: item.issued_at ?? undefined, clientConfirmedAt: item.client_confirmed_at ?? undefined, clientConfirmationMethod: item.client_confirmation_method ?? undefined, clientConfirmerName: item.client_confirmer_name ?? undefined, clientConfirmationNote: item.client_confirmation_note ?? undefined, clientConfirmationAttachmentPath: item.client_confirmation_attachment_path ?? undefined, managerNote: item.manager_note ?? undefined, updatedAt: item.updated_at, createdAt: item.created_at, lines: (item.lines ?? []).map(mapLine) }; }

export function confirmationMethodLabel(method?: ConfirmationMethod) { return ({ phone: "اتصال هاتفي", whatsapp: "واتساب", in_person: "تأكيد حضوري", email: "بريد إلكتروني", other: "وسيلة أخرى" } as Record<ConfirmationMethod, string>)[method ?? "other"]; }

export async function confirmProformaClient(input: { id: string; method: ConfirmationMethod; confirmerName: string; confirmedAt: string; note?: string; attachmentPath?: string }) {
  if (!supabase) throw new Error("خدمة البيانات غير متاحة الآن.");
  const { data, error } = await supabase.rpc("tips_crm_confirm_proforma_client", { target_proforma_id: input.id, confirmation_method_input: input.method, confirmer_name_input: input.confirmerName.trim(), confirmed_at_input: input.confirmedAt, confirmation_note_input: input.note?.trim() ?? "", attachment_path_input: input.attachmentPath ?? null });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("تعذر تسجيل تأكيد العميل.");
  return row as { id: string; status: ProformaStatus; client_confirmed_at: string; updated_at: string };
}

export async function listReviewProformas() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tips_crm_list_review_proformas");
  if (error) throw error;
  return ((data ?? []) as RemoteReview[]).map(mapReview);
}

export async function reviewProforma(input: { id: string; decision: "approved" | "returned" | "cancelled"; note?: string }) {
  if (!supabase) throw new Error("خدمة البيانات غير متاحة الآن.");
  const { data, error } = await supabase.rpc("tips_crm_review_proforma", { target_proforma_id: input.id, decision_input: input.decision, manager_note_input: input.note?.trim() ?? "" });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("تعذر حفظ قرار الإدارة.");
  return row as { id: string; status: ProformaStatus; reviewed_at: string; updated_at: string };
}
