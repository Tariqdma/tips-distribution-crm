import { supabase } from "@/lib/supabase-client";
import { buildProformaHtml, normalizeProformaLineInputs, proformaStatusLabel, type Proforma, type ProformaLine, type ProformaLineInput, type ProformaStatus } from "@/lib/proforma-utils";

export { buildProformaHtml, normalizeProformaLineInputs, proformaStatusLabel, type Proforma, type ProformaLine, type ProformaLineInput, type ProformaStatus } from "@/lib/proforma-utils";

type RemoteLine = { id?: string; product_id: string; sku: string; name: string; unit_label: string; quantity: number | string; unit_price: number | string; line_total: number | string };
type RemoteProforma = { id: string; proforma_number: number; status: ProformaStatus; account_id: string; account_name: string; account_type: string; source_visit_local_ref?: string | null; notes?: string | null; subtotal: number | string; currency: string; issued_at?: string | null; updated_at: string; created_at: string; lines?: RemoteLine[] | null };

function mapLine(line: RemoteLine): ProformaLine { return { id: line.id, productId: line.product_id, sku: line.sku, name: line.name, unitLabel: line.unit_label, quantity: Number(line.quantity), unitPrice: Number(line.unit_price), lineTotal: Number(line.line_total) }; }
function mapProforma(item: RemoteProforma): Proforma { return { id: item.id, proformaNumber: Number(item.proforma_number), status: item.status, accountId: item.account_id, accountName: item.account_name, accountType: item.account_type, sourceVisitRef: item.source_visit_local_ref ?? undefined, notes: item.notes ?? undefined, subtotal: Number(item.subtotal), currency: item.currency, issuedAt: item.issued_at ?? undefined, updatedAt: item.updated_at, createdAt: item.created_at, lines: (item.lines ?? []).map(mapLine) }; }

export async function listMyProformas() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("tips_crm_list_my_proformas");
  if (error) throw error;
  return ((data ?? []) as RemoteProforma[]).map((item) => mapProforma(item));
}

export async function saveProformaDraft(input: { id?: string | null; accountId: string; sourceVisitRef?: string; clientDraftRef: string; notes?: string; lines: ProformaLineInput[] }) {
  if (!supabase) throw new Error("خدمة البيانات غير متاحة الآن.");
  const normalizedLines = normalizeProformaLineInputs(input.lines);
  if (normalizedLines.length !== input.lines.length || !normalizedLines.length) throw new Error("راجع المنتجات والكميات قبل الحفظ.");
  const { data, error } = await supabase.rpc("tips_crm_save_proforma_draft", { target_proforma_id: input.id ?? null, target_account_id: input.accountId, source_visit_ref_input: input.sourceVisitRef ?? "", client_draft_ref_input: input.clientDraftRef, notes_input: input.notes ?? "", line_items: normalizedLines });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("لم تُعد خدمة الحفظ رقم الفاتورة المبدئية.");
  return { id: row.id as string, proformaNumber: Number(row.proforma_number), status: row.status as ProformaStatus, subtotal: Number(row.subtotal), currency: String(row.currency), updatedAt: String(row.updated_at) };
}

export async function issueProforma(id: string) {
  if (!supabase) throw new Error("خدمة البيانات غير متاحة الآن.");
  const { data, error } = await supabase.rpc("tips_crm_issue_proforma", { target_proforma_id: id });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("تعذر إصدار الفاتورة المبدئية.");
  return { id: row.id as string, proformaNumber: Number(row.proforma_number), status: row.status as ProformaStatus, subtotal: Number(row.subtotal), currency: String(row.currency), issuedAt: String(row.issued_at), updatedAt: String(row.updated_at) };
}
