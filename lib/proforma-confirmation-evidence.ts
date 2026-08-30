import { supabase } from "@/lib/supabase-client";
import { isSupportedVisitAttachment, sanitizeAttachmentName, type VisitAttachment } from "@/lib/visit-attachments";

export type ProformaConfirmationEvidence = Pick<VisitAttachment, "name" | "mimeType" | "size" | "localUri"> & { remotePath?: string };

export async function uploadProformaConfirmationEvidence(input: { proformaId: string; profileId: string; companyId: string; evidence: ProformaConfirmationEvidence }) {
  if (!supabase) throw new Error("خدمة البيانات غير متاحة الآن.");
  const evidence = input.evidence;
  if (evidence.remotePath) return evidence.remotePath;
  if (!evidence.localUri || !isSupportedVisitAttachment(evidence.mimeType) || (evidence.size != null && evidence.size > 5242880)) throw new Error("اختر صورة أو PDF بحجم لا يتجاوز 5 م.ب.");
  const response = await fetch(evidence.localUri); const body = await response.blob();
  if (body.size > 5242880) throw new Error("حجم الإثبات أكبر من الحد المسموح (5 م.ب).");
  const path = `${input.companyId}/${input.proformaId}/${Date.now()}-${sanitizeAttachmentName(evidence.name)}`;
  const { error: uploadError } = await supabase.storage.from("proforma-evidence").upload(path, body, { contentType: evidence.mimeType, upsert: false });
  if (uploadError) throw uploadError;
  const { error: metadataError } = await supabase.schema("tips_crm").from("proforma_confirmation_attachments").insert({ company_id: input.companyId, proforma_id: input.proformaId, profile_id: input.profileId, bucket_path: path, file_name: evidence.name, mime_type: evidence.mimeType, file_size: evidence.size ?? body.size });
  if (metadataError) throw metadataError;
  return path;
}
