import { supabase } from "@/lib/supabase-client";

const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

function bytesFromDataUrl(dataUrl: string) {
  const match = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) throw new Error("صيغة الصورة غير مدعومة.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, contentType: match[1].toLowerCase() };
}

/**
 * Uploads a profile photo to the avatars bucket and returns its public URL.
 * Only that short URL may be stored in the user metadata: the metadata is
 * copied into every access token, so an inline image breaks all API requests.
 */
export async function uploadAvatar(userId: string, dataUrl: string) {
  if (!supabase) throw new Error("تعذر الاتصال بالخادم.");
  const { bytes, contentType } = bytesFromDataUrl(dataUrl);
  if (bytes.byteLength > MAX_AVATAR_BYTES) throw new Error("حجم الصورة أكبر من 2 ميجابايت. اختر صورة أصغر.");
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  const path = `${userId}/avatar.${extension}`;
  const { error } = await supabase.storage.from("avatars").upload(path, bytes, { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  // Cache-bust so a replaced photo shows immediately.
  return `${data.publicUrl}?v=${Date.now()}`;
}

/** Inline images must never be read back from (or written to) the metadata. */
export function safeAvatarUrl(value: unknown) {
  return typeof value === "string" && /^https?:\/\//.test(value) ? value : null;
}
