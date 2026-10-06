import { supabase } from "@/lib/supabase-client";

export type VisitAttachment = { id: string; name: string; mimeType: string; size?: number; localUri?: string; remotePath?: string; kind: "صورة" | "مستند" };

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export function isSupportedVisitAttachment(mimeType?: string | null) {
  return Boolean(mimeType && allowedTypes.has(mimeType));
}

export function sanitizeAttachmentName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "attachment";
}

export async function uploadVisitAttachments({ visitId, profileId, attachments }: { visitId: string; profileId: string; attachments: VisitAttachment[] }) {
  if (!supabase) return attachments;
  const uploaded: VisitAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.remotePath || !attachment.localUri || !isSupportedVisitAttachment(attachment.mimeType)) { uploaded.push(attachment); continue; }
    try {
      const response = await fetch(attachment.localUri);
      const body = await response.blob();
      const path = `${profileId}/${visitId}/${Date.now()}-${sanitizeAttachmentName(attachment.name)}`;
      const { error } = await supabase.storage.from("visit-attachments").upload(path, body, { contentType: attachment.mimeType, upsert: false });
      if (error) { uploaded.push(attachment); continue; }
      const { error: metadataError } = await supabase.rpc("tips_crm_add_visit_attachment", { target_visit_id: visitId, bucket_path_input: path, file_name_input: attachment.name, mime_type_input: attachment.mimeType, file_size_input: attachment.size ?? null });
      uploaded.push({ ...attachment, remotePath: metadataError ? undefined : path });
    } catch {
      uploaded.push(attachment);
    }
  }
  return uploaded;
}
