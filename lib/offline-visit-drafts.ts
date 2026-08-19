import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VisitAttachment } from "@/lib/visit-attachments";

export type OfflineVisitPayload = { result: string; note: string; followUpAction?: string; followUpDate?: string; reportPriority: "عالية" | "متوسطة" | "منخفضة"; attachments?: VisitAttachment[]; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory: boolean; collectionAmount?: number; revenueAmount?: number; receiptReference?: string; medicalInteractionType?: "زيارة حضورية" | "اتصال هاتفي" | "مكالمة أونلاين" | "اجتماع مستشفى"; medicalVisitGoal?: "تعريف بمنتج" | "ترويج علمي" | "متابعة وصف" | "دعوة فعالية" | "طلب معلومات" | "متابعة استفسار"; promotedProduct?: string; scientificMessage?: string; doctorInterest?: "مرتفع" | "متوسط" | "منخفض" | "طلب معلومات" | "لا اهتمام"; medicalFeedback?: string };
export type OfflineVisitDraft = { id: string; visitId: string; accountId: string; profileId: string; payload: OfflineVisitPayload; status: "pending" | "failed"; createdAt: string; updatedAt: string; attempts: number; lastError?: string };

const keyFor = (profileId: string) => `tips-crm-offline-visit-submissions-v1:${profileId}`;
const isDraft = (value: unknown): value is OfflineVisitDraft => Boolean(value && typeof value === "object" && typeof (value as OfflineVisitDraft).id === "string" && typeof (value as OfflineVisitDraft).visitId === "string" && typeof (value as OfflineVisitDraft).accountId === "string" && typeof (value as OfflineVisitDraft).profileId === "string" && (value as OfflineVisitDraft).payload && typeof (value as OfflineVisitDraft).payload === "object");

export function createOfflineVisitDraft(input: { id: string; visitId: string; accountId: string; profileId: string; payload: OfflineVisitPayload; now?: string }): OfflineVisitDraft {
  const now = input.now ?? new Date().toISOString();
  return { id: input.id, visitId: input.visitId, accountId: input.accountId, profileId: input.profileId, payload: input.payload, status: "pending", createdAt: now, updatedAt: now, attempts: 0 };
}

export function normalizeOfflineVisitDrafts(value: unknown, profileId: string) {
  if (!Array.isArray(value)) return [];
  return value.filter(isDraft).filter((item) => item.profileId === profileId).sort((first, second) => first.createdAt.localeCompare(second.createdAt));
}

export async function listOfflineVisitDrafts(profileId: string) {
  const raw = await AsyncStorage.getItem(keyFor(profileId));
  if (!raw) return [];
  try { return normalizeOfflineVisitDrafts(JSON.parse(raw), profileId); } catch { return []; }
}

export async function saveOfflineVisitDraft(draft: OfflineVisitDraft) {
  const current = await listOfflineVisitDrafts(draft.profileId);
  const next = [draft, ...current.filter((item) => item.id !== draft.id)];
  await AsyncStorage.setItem(keyFor(draft.profileId), JSON.stringify(next));
  return next;
}

export async function removeOfflineVisitDraft(profileId: string, draftId: string) {
  const current = await listOfflineVisitDrafts(profileId);
  const next = current.filter((item) => item.id !== draftId);
  await AsyncStorage.setItem(keyFor(profileId), JSON.stringify(next));
  return next;
}

export async function markOfflineVisitDraftFailed(profileId: string, draftId: string, error: string) {
  const current = await listOfflineVisitDrafts(profileId);
  const next = current.map((item) => item.id === draftId ? { ...item, status: "failed" as const, attempts: item.attempts + 1, lastError: error.slice(0, 240), updatedAt: new Date().toISOString() } : item);
  await AsyncStorage.setItem(keyFor(profileId), JSON.stringify(next));
  return next;
}
