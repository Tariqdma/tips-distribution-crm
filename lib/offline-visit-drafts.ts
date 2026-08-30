import AsyncStorage from "@react-native-async-storage/async-storage";
import type { VisitAttachment } from "@/lib/visit-attachments";
import type { VisitProductContextInput } from "@/lib/visit-product-context";

export type OfflineVisitPayload = { result: string; note: string; followUpAction?: string; followUpDate?: string; reportPriority: "عالية" | "متوسطة" | "منخفضة"; attachments?: VisitAttachment[]; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory: boolean; collectionAmount?: number; revenueAmount?: number; receiptReference?: string; medicalInteractionType?: "زيارة حضورية" | "اتصال هاتفي" | "مكالمة أونلاين" | "اجتماع مستشفى"; medicalVisitGoal?: "تعريف بمنتج" | "ترويج علمي" | "متابعة وصف" | "دعوة فعالية" | "طلب معلومات" | "متابعة استفسار"; promotedProduct?: string; scientificMessage?: string; doctorInterest?: "مرتفع" | "متوسط" | "منخفض" | "طلب معلومات" | "لا اهتمام"; medicalFeedback?: string } & VisitProductContextInput;
export type OfflineVisitDraft = { id: string; visitId: string; accountId: string; profileId: string; payload: OfflineVisitPayload; status: "pending" | "failed"; createdAt: string; updatedAt: string; attempts: number; lastError?: string };
export type VisitSyncHistoryEntry = { id: string; profileId: string; draftId: string; visitId: string; accountId: string; status: "synced" | "failed"; attempt: number; recordedAt: string; message: string; result: string; noteExcerpt?: string };

const keyFor = (profileId: string) => `tips-crm-offline-visit-submissions-v1:${profileId}`;
const historyKeyFor = (profileId: string) => `tips-crm-offline-visit-sync-history-v1:${profileId}`;
const isDraft = (value: unknown): value is OfflineVisitDraft => Boolean(value && typeof value === "object" && typeof (value as OfflineVisitDraft).id === "string" && typeof (value as OfflineVisitDraft).visitId === "string" && typeof (value as OfflineVisitDraft).accountId === "string" && typeof (value as OfflineVisitDraft).profileId === "string" && (value as OfflineVisitDraft).payload && typeof (value as OfflineVisitDraft).payload === "object");
const isHistoryEntry = (value: unknown): value is VisitSyncHistoryEntry => Boolean(value && typeof value === "object" && typeof (value as VisitSyncHistoryEntry).id === "string" && typeof (value as VisitSyncHistoryEntry).profileId === "string" && typeof (value as VisitSyncHistoryEntry).draftId === "string" && typeof (value as VisitSyncHistoryEntry).accountId === "string" && ((value as VisitSyncHistoryEntry).status === "synced" || (value as VisitSyncHistoryEntry).status === "failed") && typeof (value as VisitSyncHistoryEntry).recordedAt === "string");

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

export function normalizeVisitSyncHistory(value: unknown, profileId: string) {
  if (!Array.isArray(value)) return [];
  return value.filter(isHistoryEntry).filter((item) => item.profileId === profileId).sort((first, second) => second.recordedAt.localeCompare(first.recordedAt));
}

export async function listVisitSyncHistory(profileId: string) {
  const raw = await AsyncStorage.getItem(historyKeyFor(profileId));
  if (!raw) return [];
  try { return normalizeVisitSyncHistory(JSON.parse(raw), profileId); } catch { return []; }
}

export async function recordVisitSyncHistory(input: { profileId: string; draft: OfflineVisitDraft; status: VisitSyncHistoryEntry["status"]; attempt: number; message: string; now?: string }) {
  const recordedAt = input.now ?? new Date().toISOString();
  const entry: VisitSyncHistoryEntry = { id: `visit-sync-${input.draft.id}-${recordedAt}`, profileId: input.profileId, draftId: input.draft.id, visitId: input.draft.visitId, accountId: input.draft.accountId, status: input.status, attempt: input.attempt, recordedAt, message: input.message.slice(0, 240), result: input.draft.payload.result, noteExcerpt: input.draft.payload.note.trim().slice(0, 240) || undefined };
  const current = await listVisitSyncHistory(input.profileId);
  const next = [entry, ...current].slice(0, 100);
  await AsyncStorage.setItem(historyKeyFor(input.profileId), JSON.stringify(next));
  return next;
}
