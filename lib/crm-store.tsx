import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as Network from "expo-network";
import { sendOperationalNotification } from "@/lib/notifications";
import { stateForCity } from "@/lib/sudan-locations";
import { appendDutyPoint, isInsideTerritory } from "@/lib/duty-logic";
import { buildMonthlyComparison, checkAlertThreshold, findDuplicateAccount, isFollowUpDue, targetMetricMeta } from "@/lib/operational-insights";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseAuth } from "@/lib/supabase-auth";
import { getApiBaseUrl } from "@/constants/oauth";
import { uploadVisitAttachments, type VisitAttachment } from "@/lib/visit-attachments";
import { notifyOfflineVisitSyncSuccess, scheduleFollowUpReminder } from "@/lib/mobile-notifications";
import { buildInviteAcceptUrl } from "@/lib/auth-redirect";
import { createOfflineVisitDraft, listOfflineVisitDrafts, listVisitSyncHistory, markOfflineVisitDraftFailed, recordVisitSyncHistory, removeOfflineVisitDraft, saveOfflineVisitDraft, type OfflineVisitDraft, type OfflineVisitPayload, type VisitSyncHistoryEntry } from "@/lib/offline-visit-drafts";

export type AccountType = "طبيب" | "صيدلية" | "مستشفى" | "موزع";
export type VisitStatus = "مجدولة" | "مكتملة" | "تحتاج مراجعة";
export type PlanStatus = "مسودة" | "بانتظار الاعتماد" | "معتمدة" | "معادة للمراجعة";
export type AppRole = "مدير" | "مشرف مبيعات" | "مشرف طبي" | "محاسب" | "مندوب مبيعات" | "مندوب طبي";
export type VisitResult = string;
export type FollowUpPriority = "عالية" | "متوسطة" | "منخفضة";
export type MedicalInteractionType = "زيارة حضورية" | "اتصال هاتفي" | "مكالمة أونلاين" | "اجتماع مستشفى";
export type MedicalVisitGoal = "تعريف بمنتج" | "ترويج علمي" | "متابعة وصف" | "دعوة فعالية" | "طلب معلومات" | "متابعة استفسار";
export type DoctorInterest = "مرتفع" | "متوسط" | "منخفض" | "طلب معلومات" | "لا اهتمام";
export type { VisitAttachment } from "@/lib/visit-attachments";
export type TargetMetric = "visits" | "collection" | "revenue";
export type MonthlyTarget = { id: string; monthStart: string; targetType: "مندوب" | "منطقة"; targetKey: string; targetValue: number; metric: TargetMetric; alertThreshold: number; updatedAt?: string };
export type MonthlyPerformance = { monthStart: string; targetType: MonthlyTarget["targetType"]; targetKey: string; metric: TargetMetric; actualValue: number };
export type OfflineVisitSyncNotice = { count: number; syncedAt: string };

export type Account = { id: string; name: string; type: AccountType; specialty?: string; state: string; area: string; city: string; address: string; contact: string; lastVisit: string; priority: "عالية" | "متوسطة" | "اعتيادية"; initials: string; accent: string };
export type Visit = { id: string; accountId: string; date: string; time: string; status: VisitStatus; result?: VisitResult; note?: string; followUpAction?: string; followUpDate?: string; reportPriority?: FollowUpPriority; attachments?: VisitAttachment[]; checkedInAt?: string; completedAt?: string; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory?: boolean; collectionAmount?: number; revenueAmount?: number; receiptReference?: string; medicalInteractionType?: MedicalInteractionType; medicalVisitGoal?: MedicalVisitGoal; promotedProduct?: string; scientificMessage?: string; doctorInterest?: DoctorInterest; medicalFeedback?: string };
export type PlanScheduleDay = { id: string; label: string; dateLabel: string; visitIds: string[] };
export type PlanVisitDetail = { id: string; accountId?: string; accountName: string; scheduledFor: string };
export type PlanRepSnapshot = { completedVisits: number; needsReviewVisits: number; lastVisitName?: string; lastVisitAt?: string };
export type Plan = { id: string; remoteId?: string; title: string; period: string; kind: "أسبوعية" | "شهرية"; status: PlanStatus; repName: string; territory?: string; startsOn?: string; endsOn?: string; visitIds: string[]; schedule?: PlanScheduleDay[]; scheduledVisitDetails?: PlanVisitDetail[]; repSnapshot?: PlanRepSnapshot; managerNote?: string; submittedAt: string };
export type Territory = { id: string; name: string; state: string; city: string; assignees: string[]; accounts: number; coverage: number };
export type TeamMember = { id: string; name: string; initials: string; role: AppRole; type: string; territory: string; territoryId?: string; territoryIds?: string[]; territories?: string[] };
export type RoleDefinition = { id: string; name: string; description: string; permissions: string[]; isSystem: boolean; isActive: boolean };
export type CrmNotification = { id: string; title: string; body: string; time: string; kind: "خطة" | "زيارة" | "تنبيه" | "فريق"; readAt?: string };
export type TeamInvite = { id: string; email: string; role: AppRole; territory: string; territoryId?: string; territoryIds?: string[]; territories?: string[]; status: "بانتظار الرد" | "مقبولة" | "ملغاة"; sentAt: string; expiresAt: string; acceptUrl?: string };
export type TerritoryBoundary = { territoryId: string; name: string; state: string; city: string; centerLatitude: string; centerLongitude: string; radiusMeters: number; polygonPoints?: Array<{ latitude: number; longitude: number }>; notes?: string; updatedAt: string };
export type DutyTrackPoint = { latitude: number; longitude: number; accuracyMeters?: number | null; speedMetersPerSecond?: number | null; capturedAt: string; source: "foreground" | "background" };
export type RepDutyStatus = { memberId: string; isOnDuty: boolean; lastPoint?: DutyTrackPoint; path: DutyTrackPoint[]; isOutsideTerritory?: boolean; outsideSince?: string; lastTerritoryAlertAt?: string };
export type CrmData = { accounts: Account[]; visits: Visit[]; plans: Plan[]; territories: Territory[]; visitResults: VisitResult[]; teamMembers: TeamMember[]; roleDefinitions: RoleDefinition[]; notifications: CrmNotification[]; invites: TeamInvite[]; boundaries: TerritoryBoundary[]; dutyStatuses: RepDutyStatus[]; monthlyTargets: MonthlyTarget[]; monthlyPerformance: MonthlyPerformance[] };

type VisitCompletion = { result: VisitResult; note: string; followUpAction?: string; followUpDate?: string; reportPriority?: FollowUpPriority; attachments?: VisitAttachment[]; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory: boolean; collectionAmount?: number; revenueAmount?: number; receiptReference?: string; medicalInteractionType?: MedicalInteractionType; medicalVisitGoal?: MedicalVisitGoal; promotedProduct?: string; scientificMessage?: string; doctorInterest?: DoctorInterest; medicalFeedback?: string };
type PlannedVisitInput = Pick<Visit, "id" | "accountId" | "date" | "time"> & { scheduledFor?: string };
type NewPlanInput = { title: string; period: string; kind: Plan["kind"]; visitIds: string[]; schedule?: PlanScheduleDay[]; plannedVisits?: PlannedVisitInput[]; startsOn?: string; endsOn?: string };
type CrmContextValue = {
  data: CrmData; isReady: boolean; role: AppRole; activeMemberId: string; unreadNotificationCount: number; isOnline: boolean; offlineVisitDrafts: OfflineVisitDraft[]; offlineVisitSyncHistory: VisitSyncHistoryEntry[]; offlineVisitSyncNotice: OfflineVisitSyncNotice | null; syncOfflineVisitDrafts: () => Promise<void>; discardOfflineVisitDraft: (draftId: string) => Promise<void>; clearOfflineVisitSyncNotice: () => void;
  setRole: (role: AppRole) => void; selectTeamMember: (id: string) => void; updateTeamMemberRole: (id: string, role: AppRole) => void;
  createRole: (input: Omit<RoleDefinition, "id" | "isSystem" | "isActive">) => void; updateRoleDefinition: (id: string, input: Pick<RoleDefinition, "name" | "description" | "permissions">) => void; toggleRoleDefinition: (id: string) => void; removeRoleDefinition: (id: string) => void;
  accountById: (id: string) => Account | undefined; visitsForAccount: (accountId: string) => Visit[];
  addAccount: (account: Omit<Account, "id" | "lastVisit" | "initials" | "accent">) => { accepted: boolean; duplicate?: Account };
  completeVisit: (visitId: string, completion: VisitCompletion) => Promise<{ delivery: "synced" | "queued" }>; submitPlan: (input: NewPlanInput) => void; approvePlan: (planId: string) => Promise<boolean>; returnPlan: (planId: string, note: string) => Promise<boolean>; updatePlanSchedule: (planId: string, visits: PlanVisitDetail[], managerNote: string) => Promise<boolean>;
  addVisitResult: (label: string) => void; createInvite: (input: Omit<TeamInvite, "id" | "status" | "sentAt" | "expiresAt" | "acceptUrl">) => Promise<TeamInvite | null>; resendInvite: (invite: TeamInvite) => Promise<TeamInvite | null>; revokeInvite: (inviteId: string) => Promise<boolean>; updateBoundary: (boundary: TerritoryBoundary) => void;
  createCentralNotification: (input: Pick<CrmNotification, "title" | "body" | "kind">) => void; refreshSharedCatalog: () => Promise<void>; setTeamMemberTerritories: (memberId: string, territoryIds: string[]) => Promise<boolean>; setMonthlyTarget: (input: Omit<MonthlyTarget, "id" | "updatedAt">) => Promise<boolean>; recordDutyPoint: (point: DutyTrackPoint) => void; markAllNotificationsRead: () => void;
};

const STORAGE_KEY = "tips-crm-demo-data-v4";
const defaultVisitResults = ["متابعة", "تم إنشاء فاتورة", "تم تحصيل", "لا يوجد قرار"];
const notify = (title: string, body: string, kind: CrmNotification["kind"]): CrmNotification => ({ id: `n-${Date.now()}`, title, body, kind, time: "الآن" });
const initialData: CrmData = {
  accounts: [
    { id: "a1", name: "د. سارة عثمان", type: "طبيب", specialty: "باطنية", state: "ولاية الخرطوم", area: "العمارات", city: "الخرطوم", address: "عيادة النخبة، شارع 27", contact: "0912 000 225", lastVisit: "قبل 8 أيام", priority: "عالية", initials: "س ع", accent: "#0F766E" },
    { id: "a2", name: "صيدلية السلام", type: "صيدلية", state: "ولاية الخرطوم", area: "العمارات", city: "الخرطوم", address: "العمارات، شارع 15", contact: "0918 662 100", lastVisit: "قبل يومين", priority: "عالية", initials: "ص س", accent: "#0D9488" },
    { id: "a3", name: "مستشفى الحياة", type: "مستشفى", state: "ولاية الخرطوم", area: "الرياض", city: "الخرطوم", address: "الرياض، شارع المطار", contact: "0183 200 700", lastVisit: "قبل 6 أيام", priority: "متوسطة", initials: "م ح", accent: "#2563EB" },
    { id: "a4", name: "د. معتصم إبراهيم", type: "طبيب", specialty: "أطفال", state: "ولاية الخرطوم", area: "الرياض", city: "الخرطوم", address: "مركز الحياة الطبي، الرياض", contact: "0994 021 900", lastVisit: "قبل 13 يوماً", priority: "متوسطة", initials: "م إ", accent: "#7C3AED" },
    { id: "a5", name: "موزع الولاية", type: "موزع", state: "ولاية الخرطوم", area: "بحري", city: "الخرطوم بحري", address: "المنطقة الصناعية، مربع 8", contact: "0911 006 610", lastVisit: "أمس", priority: "عالية", initials: "م و", accent: "#B45309" },
    { id: "a6", name: "صيدلية الندى", type: "صيدلية", state: "ولاية الخرطوم", area: "بحري", city: "الخرطوم بحري", address: "السوق المركزي، بحري", contact: "0920 780 500", lastVisit: "قبل 3 أيام", priority: "اعتيادية", initials: "ص ن", accent: "#C2410C" },
  ],
  visits: [{ id: "v1", accountId: "a1", date: "اليوم", time: "09:30 ص", status: "مكتملة", result: "متابعة", note: "مراجعة ملاحظات اللقاء السابق.", checkedInAt: "09:33 ص", location: { latitude: 15.5542, longitude: 32.5331, accuracy: 28 }, isInsideTerritory: true }, { id: "v2", accountId: "a2", date: "اليوم", time: "11:00 ص", status: "مجدولة" }, { id: "v3", accountId: "a3", date: "اليوم", time: "01:15 م", status: "مجدولة" }, { id: "v4", accountId: "a5", date: "اليوم", time: "03:30 م", status: "مجدولة" }, { id: "v5", accountId: "a4", date: "غداً", time: "10:00 ص", status: "مجدولة" }, { id: "v6", accountId: "a6", date: "الخميس", time: "12:30 م", status: "مجدولة" }],
  plans: [{ id: "p1", title: "خطة أسبوع 18 أغسطس", period: "18–22 أغسطس", kind: "أسبوعية", status: "معتمدة", repName: "محمد الأمين", visitIds: ["v1", "v2", "v3", "v4", "v5"], submittedAt: "16 أغسطس" }, { id: "p2", title: "خطة سبتمبر الطبية", period: "سبتمبر 2026", kind: "شهرية", status: "بانتظار الاعتماد", repName: "أحمد فضل", visitIds: ["v2", "v3", "v6"], submittedAt: "14 أغسطس" }],
  territories: [{ id: "t1", name: "العمارات والرياض", state: "ولاية الخرطوم", city: "الخرطوم", assignees: ["محمد الأمين", "أحمد فضل"], accounts: 34, coverage: 78 }, { id: "t2", name: "بحري", state: "ولاية الخرطوم", city: "الخرطوم بحري", assignees: ["سلمى الطيب"], accounts: 21, coverage: 61 }],
  visitResults: defaultVisitResults,
  teamMembers: [{ id: "u1", name: "محمد الأمين", initials: "م أ", role: "مدير", type: "مدير مبيعات", territory: "كل المناطق" }, { id: "u2", name: "أحمد فضل", initials: "أ ف", role: "مندوب طبي", type: "المجال الطبي", territory: "العمارات والرياض، بحري", territoryId: "t1", territoryIds: ["t1", "t2"], territories: ["العمارات والرياض", "بحري"] }, { id: "u3", name: "سلمى الطيب", initials: "س ط", role: "مندوب مبيعات", type: "توزيع ميداني", territory: "بحري", territoryId: "t2", territoryIds: ["t2"], territories: ["بحري"] }],
  roleDefinitions: [{ id: "r1", name: "مدير المنصة", description: "إدارة جميع الشركات وطلبات الانضمام على منصة Tips.", permissions: ["إدارة الشركات", "اعتماد طلبات الشركات"], isSystem: true, isActive: true }, { id: "r2", name: "مدير الشركة", description: "متابعة عمليات الشركة والفريق والمناطق والتقارير.", permissions: ["إدارة المستخدمين", "اعتماد الخطط", "إدارة المناطق"], isSystem: true, isActive: true }, { id: "r3", name: "مشرف المبيعات", description: "إشراف مندوبي المبيعات وخططهم ضمن الشركة.", permissions: ["متابعة الفريق", "اعتماد خطط المبيعات"], isSystem: true, isActive: true }, { id: "r4", name: "مشرف طبي", description: "إشراف المناديب الطبيين والتغطية الطبية ضمن الشركة.", permissions: ["متابعة الفريق", "اعتماد الخطط الطبية"], isSystem: true, isActive: true }, { id: "r5", name: "محاسب", description: "متابعة البيانات المالية ومزامنة Google Sheets.", permissions: ["عرض البيانات المالية"], isSystem: true, isActive: true }, { id: "r6", name: "مندوب مبيعات", description: "إدارة زيارات وخطة البيع ضمن المنطقة المعيّنة.", permissions: ["خطتي", "زياراتي", "تتبع الدوام"], isSystem: true, isActive: true }, { id: "r7", name: "مندوب طبي", description: "إدارة زيارة الأطباء والعيادات ضمن المنطقة المعيّنة.", permissions: ["خطتي", "زياراتي", "تتبع الدوام"], isSystem: true, isActive: true }],
  notifications: [{ id: "n1", title: "خطة بانتظار الاعتماد", body: "خطة سبتمبر الطبية لأحمد فضل تحتاج قرارك.", time: "منذ 12 دقيقة", kind: "خطة" }, { id: "n2", title: "تذكير زيارة", body: "زيارة صيدلية السلام مجدولة اليوم عند 11:00 ص.", time: "منذ 35 دقيقة", kind: "زيارة" }],
  invites: [{ id: "i1", email: "medical.rep@tips.sd", role: "مندوب طبي", territory: "العمارات والرياض، بحري", territoryId: "t1", territoryIds: ["t1", "t2"], territories: ["العمارات والرياض", "بحري"], status: "بانتظار الرد", sentAt: "اليوم", expiresAt: "بعد 6 أيام" }],
  boundaries: [{ territoryId: "t1", name: "العمارات والرياض", state: "ولاية الخرطوم", city: "الخرطوم", centerLatitude: "15.5581", centerLongitude: "32.5372", radiusMeters: 4200, notes: "تغطية العيادات والصيدليات.", updatedAt: "اليوم" }, { territoryId: "t2", name: "بحري", state: "ولاية الخرطوم", city: "الخرطوم بحري", centerLatitude: "15.6236", centerLongitude: "32.5327", radiusMeters: 3600, notes: "تغطية الموزعين والصيدليات.", updatedAt: "اليوم" }],
  dutyStatuses: [
    { memberId: "u2", isOnDuty: true, lastPoint: { latitude: 15.5581, longitude: 32.5372, accuracyMeters: 24, capturedAt: new Date().toISOString(), source: "foreground" }, path: [{ latitude: 15.5502, longitude: 32.5252, capturedAt: new Date(Date.now() - 80 * 60000).toISOString(), source: "foreground" }, { latitude: 15.5534, longitude: 32.5301, capturedAt: new Date(Date.now() - 45 * 60000).toISOString(), source: "foreground" }, { latitude: 15.5581, longitude: 32.5372, capturedAt: new Date().toISOString(), source: "foreground" }] },
    { memberId: "u3", isOnDuty: true, lastPoint: { latitude: 15.6236, longitude: 32.5327, accuracyMeters: 38, capturedAt: new Date(Date.now() - 4 * 60000).toISOString(), source: "background" }, path: [{ latitude: 15.6154, longitude: 32.5238, capturedAt: new Date(Date.now() - 90 * 60000).toISOString(), source: "background" }, { latitude: 15.6196, longitude: 32.5270, capturedAt: new Date(Date.now() - 42 * 60000).toISOString(), source: "background" }, { latitude: 15.6236, longitude: 32.5327, capturedAt: new Date(Date.now() - 4 * 60000).toISOString(), source: "background" }] },
  ],
  monthlyTargets: [],
  monthlyPerformance: [],
};

const CrmContext = createContext<CrmContextValue | null>(null);
const initialsFor = (name: string) => name.replace(/^(د\.|صيدلية|مستشفى|موزع)\s*/, "").split(" ").slice(0, 2).map((part) => part[0]).join(" ");
const accentForAccountType: Record<AccountType, string> = { طبيب: "#0F766E", صيدلية: "#B45309", مستشفى: "#2563EB", موزع: "#7C3AED" };
const accountTypeToRemote: Record<AccountType, string> = { طبيب: "doctor", صيدلية: "pharmacy", مستشفى: "hospital", موزع: "distributor" };
const accountTypeFromRemote: Record<string, AccountType> = { doctor: "طبيب", pharmacy: "صيدلية", hospital: "مستشفى", distributor: "موزع" };
const roleToRemote: Record<AppRole, string> = { مدير: "sales_manager", "مشرف مبيعات": "sales_supervisor", "مشرف طبي": "medical_supervisor", محاسب: "accountant", "مندوب مبيعات": "sales_rep", "مندوب طبي": "medical_rep" };
const roleFromRemote: Record<string, AppRole> = { system_admin: "مدير", sales_manager: "مدير", company_manager: "مدير", sales_supervisor: "مشرف مبيعات", medical_supervisor: "مشرف طبي", accountant: "محاسب", sales_rep: "مندوب مبيعات", medical_rep: "مندوب طبي" };
const medicalInteractionToRemote: Record<MedicalInteractionType, string> = { "زيارة حضورية": "in_person", "اتصال هاتفي": "phone", "مكالمة أونلاين": "online", "اجتماع مستشفى": "hospital_meeting" };
const medicalGoalToRemote: Record<MedicalVisitGoal, string> = { "تعريف بمنتج": "product_introduction", "ترويج علمي": "scientific_promotion", "متابعة وصف": "prescribing_followup", "دعوة فعالية": "event_invitation", "طلب معلومات": "information_request", "متابعة استفسار": "objection_followup" };
const doctorInterestToRemote: Record<DoctorInterest, string> = { "مرتفع": "high", "متوسط": "medium", "منخفض": "low", "طلب معلومات": "requested_info", "لا اهتمام": "not_interested" };
const inviteStatusFromRemote: Record<string, TeamInvite["status"]> = { pending: "بانتظار الرد", accepted: "مقبولة", revoked: "ملغاة", expired: "ملغاة" };
type RemoteAccount = { id: string; local_ref: string | null; account_type: string; name: string; specialty: string | null; state: string; city: string; area: string | null; address: string | null; phone: string | null };
type RemoteOutcome = { id: string; label: string; is_active: boolean; sort_order: number };
type RemoteInvite = { id: string; email: string; role_key: string; territory_label: string | null; territory_key: string | null; territory_keys?: string[] | null; status: string; invite_token: string; expires_at: string };
type RemoteTerritory = { client_key: string | null; name: string; state: string; city: string; center_latitude: number | string | null; center_longitude: number | string | null; radius_meters: number | null; boundary_geojson: { polygon_points?: unknown } | null; updated_at: string };
type RemoteNotification = { id: string; title: string; body: string; kind: "plan" | "visit" | "alert" | "team" | "duty"; created_at: string; read_at: string | null };
type RemoteMonthlyTarget = { id: string; month_start: string; target_type: "rep" | "territory"; target_key: string; target_value: number | string; metric: TargetMetric; alert_threshold: number | string; updated_at: string };
type RemoteMonthlyPerformance = { month_start: string; target_type: "rep" | "territory"; target_key: string; metric: TargetMetric; actual_value: number | string };
type RemotePlan = { id: string; title: string; plan_type: "weekly" | "monthly"; starts_on: string; ends_on: string; status: "pending" | "approved" | "returned"; manager_note: string | null; created_at: string; owner_name: string; owner_territory: string | null; completed_visits: number | string; needs_review_visits: number | string; last_visit_name: string | null; last_visit_at: string | null; scheduled_visits?: Array<{ id: string; account_id: string; account_name: string; scheduled_for: string }> };

function polygonPointsFromRemote(value: RemoteTerritory["boundary_geojson"]) {
  const points = value?.polygon_points;
  if (!Array.isArray(points)) return undefined;
  const valid = points.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const candidate = point as { latitude?: unknown; longitude?: unknown };
    const latitude = Number(candidate.latitude); const longitude = Number(candidate.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
  });
  return valid.length >= 3 ? valid : undefined;
}

const planStatusFromRemote: Record<RemotePlan["status"], PlanStatus> = { pending: "بانتظار الاعتماد", approved: "معتمدة", returned: "معادة للمراجعة" };
const dateLabelForPlan = (value: string) => new Intl.DateTimeFormat("ar-SD", { day: "numeric", month: "short" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const weekdayForPlan = (value: string) => new Intl.DateTimeFormat("ar-SD", { weekday: "long" }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
const planPeriodFromRemote = (plan: RemotePlan) => `${dateLabelForPlan(plan.starts_on)} — ${dateLabelForPlan(plan.ends_on)}`;

export function CrmProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CrmData>(initialData);
  const [isReady, setIsReady] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState("u1");
  const [isOnline, setIsOnline] = useState(true);
  const [offlineVisitDrafts, setOfflineVisitDrafts] = useState<OfflineVisitDraft[]>([]);
  const [offlineVisitSyncHistory, setOfflineVisitSyncHistory] = useState<VisitSyncHistoryEntry[]>([]);
  const [offlineVisitSyncNotice, setOfflineVisitSyncNotice] = useState<OfflineVisitSyncNotice | null>(null);
  const { user, profile, session } = useSupabaseAuth();
  const remoteAccountIds = useRef<Record<string, string>>({});
  useEffect(() => {
    if (!profile) return;
    setActiveMemberId(profile.id);
    setData((current) => {
      const mappedRole = roleFromRemote[profile.role_key] ?? "مندوب مبيعات";
      const existing = current.teamMembers.find((member) => member.id === profile.id);
      const territoryIds = profile.territory_keys?.filter(Boolean) ?? (profile.territory_key ? [profile.territory_key] : []);
      const territoryLabels = profile.territory_labels?.filter(Boolean) ?? territoryIds.map((territoryId) => current.boundaries.find((item) => item.territoryId === territoryId)?.name).filter((name): name is string => Boolean(name));
      const member: TeamMember = { id: profile.id, name: profile.full_name, initials: initialsFor(profile.full_name), role: mappedRole, type: profile.role_name, territory: territoryLabels.join("، ") || profile.territory_label || "حسب التعيين", territoryId: territoryIds[0], territoryIds, territories: territoryLabels };
      const teamMembers = existing ? current.teamMembers.map((item) => item.id === profile.id ? { ...item, ...member } : item) : [member, ...current.teamMembers];
      return { ...current, teamMembers };
    });
  }, [profile?.id, profile?.full_name, profile?.role_key, profile?.role_name, profile?.territory_key, profile?.territory_label, profile?.territory_keys, profile?.territory_labels]);
  useEffect(() => { AsyncStorage.getItem(STORAGE_KEY).then((raw) => { if (!raw) return; const saved = JSON.parse(raw) as Partial<CrmData>; setData({ ...initialData, ...saved, accounts: (saved.accounts ?? initialData.accounts).map((account) => ({ ...account, state: account.state || stateForCity(account.city) })), dutyStatuses: saved.dutyStatuses ?? initialData.dutyStatuses }); }).catch(() => undefined).finally(() => setIsReady(true)); }, []);
  const commit = useCallback((updater: (current: CrmData) => CrmData) => setData((current) => { const next = updater(current); void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return next; }), []);
  useEffect(() => {
    if (!isReady) return;
    setData((current) => {
      const today = new Date().toISOString().slice(0, 10);
      const followUpAdditions = current.visits.flatMap((visit) => {
        if (!isFollowUpDue(visit, today)) return [];
        const id = `follow-up-due-${visit.id}-${visit.followUpDate}`;
        if (current.notifications.some((notification) => notification.id === id)) return [];
        const account = current.accounts.find((item) => item.id === visit.accountId);
        return [{ id, title: "متابعة مستحقة اليوم", body: `${account?.name ?? "جهة"}: ${visit.followUpAction || "راجع الخطوة التالية"}.`, time: "الآن", kind: "تنبيه" as const }];
      });
      const planAdditions = current.plans.flatMap((plan) => {
        if (plan.status !== "مسودة") return [];
        const id = `plan-draft-${plan.id}`;
        if (current.notifications.some((notification) => notification.id === id)) return [];
        return [{ id, title: "مسودة خطة غير مرسلة", body: `${plan.title} ما زالت مسودة. راجعها وأرسلها للاعتماد عندما تكون جاهزة.`, time: "الآن", kind: "خطة" as const }];
      });
      const additions = [...followUpAdditions, ...planAdditions];
      if (!additions.length) return current;
      const next = { ...current, notifications: [...additions, ...current.notifications] };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [isReady, data.visits]);
  const role = profile ? (roleFromRemote[profile.role_key] ?? "مندوب مبيعات") : (data.teamMembers.find((member) => member.id === activeMemberId)?.role ?? "مندوب مبيعات");
  useEffect(() => {
    if (!isReady || role !== "مدير") return;
    const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
    const additions = data.monthlyTargets.filter((target) => target.monthStart === monthStart).flatMap((target) => {
      const comparison = buildMonthlyComparison({ accounts: data.accounts, visits: data.visits, plans: data.plans, members: data.teamMembers, territories: data.territories, metric: target.metric });
      const rows = target.targetType === "مندوب" ? comparison.reps : comparison.territories;
      const actual = rows.find((item) => item.id === target.targetKey)?.actual ?? 0;
      const alert = checkAlertThreshold(actual, target.targetValue, target.alertThreshold);
      const id = `target-alert-${target.monthStart}-${target.targetType}-${target.targetKey}-${target.metric}`;
      if (!alert.shouldAlert || data.notifications.some((notification) => notification.id === id)) return [];
      return [{ id, title: "تنبيه إنجاز هدف الشهر", body: `${target.targetType} أقل من حد التنبيه: ${alert.achievementRate}% مقابل حد ${alert.threshold}% في ${targetMetricMeta[target.metric].label}.`, time: "الآن", kind: "تنبيه" as const }];
    });
    if (additions.length) commit((current) => ({ ...current, notifications: [...additions, ...current.notifications] }));
  }, [isReady, role, data.monthlyTargets, data.accounts, data.visits, data.plans, data.teamMembers, data.territories]);
  const refreshSharedCatalog = useCallback(async () => {
    if (!supabase || !user || !isReady) return;
    const historyStart = new Date(); historyStart.setMonth(historyStart.getMonth() - 5); const historyMonthStart = `${historyStart.toISOString().slice(0, 7)}-01`;
    const [accountsResponse, outcomesResponse, invitesResponse, territoriesResponse, notificationsResponse, monthlyTargetsResponse, monthlyPerformanceResponse, plansResponse] = await Promise.all([
      supabase.rpc("tips_crm_list_accounts"),
      supabase.rpc("tips_crm_list_visit_outcomes"),
      supabase.rpc("tips_crm_list_invites"),
      supabase.rpc("tips_crm_list_territories"),
      supabase.rpc("tips_crm_list_my_notifications"),
      supabase.schema("tips_crm").from("monthly_targets").select("*").gte("month_start", historyMonthStart).lte("month_start", `${new Date().toISOString().slice(0, 7)}-01`),
      supabase.rpc("tips_crm_list_monthly_target_performance", { months_back: 6 }),
      supabase.rpc("tips_crm_list_plans"),
    ]);
    const remoteAccounts = accountsResponse.error ? null : (accountsResponse.data ?? []) as RemoteAccount[];
    const remoteOutcomes = outcomesResponse.error ? null : (outcomesResponse.data ?? []) as RemoteOutcome[];
    const remoteInvites = invitesResponse.error ? null : (invitesResponse.data ?? []) as RemoteInvite[];
    const remoteTerritories = territoriesResponse.error ? null : (territoriesResponse.data ?? []) as RemoteTerritory[];
    const remoteNotifications = notificationsResponse.error ? null : (notificationsResponse.data ?? []) as RemoteNotification[];
    const remoteMonthlyTargets = monthlyTargetsResponse.error ? null : (monthlyTargetsResponse.data ?? []) as RemoteMonthlyTarget[];
    const remoteMonthlyPerformance = monthlyPerformanceResponse.error ? null : (monthlyPerformanceResponse.data ?? []) as RemoteMonthlyPerformance[];
    const remotePlans = plansResponse.error ? null : (plansResponse.data ?? []) as RemotePlan[];
    remoteAccounts?.forEach((account) => { if (account.local_ref) remoteAccountIds.current[account.local_ref] = account.id; });
    setData((current) => {
      const sharedAccounts = remoteAccounts?.map((account) => {
        const type = accountTypeFromRemote[account.account_type] ?? "موزع";
        const localId = account.local_ref || `remote-${account.id}`;
        const cached = current.accounts.find((item) => item.id === localId);
        return { ...cached, id: localId, name: account.name, type, specialty: account.specialty ?? undefined, state: account.state, city: account.city, area: account.area ?? "", address: account.address ?? "", contact: account.phone ?? "", lastVisit: cached?.lastVisit ?? "لم تتم زيارة", priority: cached?.priority ?? "اعتيادية", initials: initialsFor(account.name), accent: accentForAccountType[type] } as Account;
      });
      const pendingLocalAccounts = current.accounts.filter((account) => account.id.startsWith("a-") && !sharedAccounts?.some((item) => item.id === account.id));
      const sharedBoundaries = remoteTerritories?.flatMap((territory) => {
        if (!territory.client_key || territory.center_latitude == null || territory.center_longitude == null || !territory.radius_meters) return [];
        return [{ territoryId: territory.client_key, name: territory.name, state: territory.state, city: territory.city, centerLatitude: String(territory.center_latitude), centerLongitude: String(territory.center_longitude), radiusMeters: territory.radius_meters, polygonPoints: polygonPointsFromRemote(territory.boundary_geojson), notes: current.boundaries.find((item) => item.territoryId === territory.client_key)?.notes, updatedAt: new Date(territory.updated_at).toLocaleDateString("ar") } satisfies TerritoryBoundary];
      });
      const sharedTerritories = remoteTerritories?.flatMap((territory) => {
        if (!territory.client_key) return [];
        const cached = current.territories.find((item) => item.id === territory.client_key);
        return [{ id: territory.client_key, name: territory.name, state: territory.state, city: territory.city, assignees: cached?.assignees ?? [], accounts: cached?.accounts ?? 0, coverage: cached?.coverage ?? 0 } satisfies Territory];
      });
      const sharedPlans = remotePlans?.map((plan) => {
        const details = plan.scheduled_visits ?? [];
        const schedule = Array.from(new Set(details.map((visit) => visit.scheduled_for.slice(0, 10)))).map((date) => ({
          id: `${plan.id}-${date}`,
          label: weekdayForPlan(date),
          dateLabel: dateLabelForPlan(date),
          visitIds: details.filter((visit) => visit.scheduled_for.slice(0, 10) === date).map((visit) => visit.id),
        }));
        const localPlan = current.plans.find((item) => item.remoteId === plan.id);
        return { id: localPlan?.id ?? `remote-plan-${plan.id}`, remoteId: plan.id, title: plan.title, period: planPeriodFromRemote(plan), kind: plan.plan_type === "monthly" ? "شهرية" : "أسبوعية", status: planStatusFromRemote[plan.status], repName: plan.owner_name, territory: plan.owner_territory ?? "غير محددة", startsOn: plan.starts_on, endsOn: plan.ends_on, visitIds: details.map((visit) => visit.id), schedule, scheduledVisitDetails: details.map((visit) => ({ id: visit.id, accountId: visit.account_id, accountName: visit.account_name, scheduledFor: visit.scheduled_for })), repSnapshot: { completedVisits: Number(plan.completed_visits) || 0, needsReviewVisits: Number(plan.needs_review_visits) || 0, lastVisitName: plan.last_visit_name ?? undefined, lastVisitAt: plan.last_visit_at ?? undefined }, managerNote: plan.manager_note ?? undefined, submittedAt: new Date(plan.created_at).toLocaleDateString("ar-SD") } satisfies Plan;
      });
      const unsyncedCurrentPlans = current.plans.filter((plan) => !plan.remoteId && plan.id.startsWith("p-") && plan.submittedAt === "الآن");
      const next: CrmData = {
        ...current,
        accounts: sharedAccounts ? [...sharedAccounts, ...pendingLocalAccounts] : current.accounts,
        visitResults: remoteOutcomes ? remoteOutcomes.filter((outcome) => outcome.is_active).map((outcome) => outcome.label) : current.visitResults,
        invites: remoteInvites ? remoteInvites.map((invite) => ({ id: invite.id, email: invite.email, role: roleFromRemote[invite.role_key] ?? "مندوب مبيعات", territory: invite.territory_label ?? "غير محددة", territoryId: invite.territory_key ?? undefined, territoryIds: invite.territory_keys ?? (invite.territory_key ? [invite.territory_key] : []), territories: invite.territory_label?.split("، ") ?? [], status: inviteStatusFromRemote[invite.status] ?? "بانتظار الرد", sentAt: "", expiresAt: new Date(invite.expires_at).toLocaleDateString("ar"), acceptUrl: buildInviteAcceptUrl(invite.invite_token) })) : current.invites,
        boundaries: sharedBoundaries?.length ? sharedBoundaries : current.boundaries,
        territories: sharedTerritories?.length ? sharedTerritories : current.territories,
        notifications: remoteNotifications ? [...remoteNotifications.map((notification) => ({ id: notification.id, title: notification.title, body: notification.body, time: new Date(notification.created_at).toLocaleString("ar"), kind: notification.kind === "duty" || notification.kind === "alert" ? "تنبيه" : notification.kind === "plan" ? "خطة" : notification.kind === "visit" ? "زيارة" : "فريق", readAt: notification.read_at ?? undefined } satisfies CrmNotification)), ...current.notifications.filter((notification) => !remoteNotifications.some((remote) => remote.id === notification.id))] : current.notifications,
        monthlyTargets: remoteMonthlyTargets ? remoteMonthlyTargets.map((target) => ({ id: target.id, monthStart: target.month_start, targetType: target.target_type === "rep" ? "مندوب" : "منطقة", targetKey: target.target_key, targetValue: Number(target.target_value), metric: target.metric === "collection" || target.metric === "revenue" ? target.metric : "visits", alertThreshold: Math.min(100, Math.max(1, Number(target.alert_threshold) || 70)), updatedAt: target.updated_at } satisfies MonthlyTarget)) : current.monthlyTargets,
        monthlyPerformance: remoteMonthlyPerformance ? remoteMonthlyPerformance.map((item) => ({ monthStart: item.month_start, targetType: item.target_type === "rep" ? "مندوب" : "منطقة", targetKey: item.target_key, metric: item.metric === "collection" || item.metric === "revenue" ? item.metric : "visits", actualValue: Number(item.actual_value) || 0 } satisfies MonthlyPerformance)) : current.monthlyPerformance,
        plans: sharedPlans ? [...sharedPlans, ...unsyncedCurrentPlans] : current.plans,
      };
      void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, [isReady, user]);
  useEffect(() => { void refreshSharedCatalog(); }, [refreshSharedCatalog]);
  const send = (title: string, body: string) => void sendOperationalNotification(title, body);
  const syncAccount = useCallback(async (account: Account) => {
    if (!supabase || !user) return null;
    if (remoteAccountIds.current[account.id]) return remoteAccountIds.current[account.id];
    const { data: remoteId, error } = await supabase.rpc("tips_crm_sync_account", { local_ref_input: account.id, account_type: accountTypeToRemote[account.type], account_name: account.name, account_specialty: account.specialty ?? "", account_state: account.state, account_city: account.city, account_area: account.area, account_address: account.address, account_phone: account.contact });
    if (error || !remoteId) return null;
    remoteAccountIds.current[account.id] = remoteId as string;
    return remoteId as string;
  }, [user]);
  const profileId = profile?.id ?? user?.id;
  const syncSingleOfflineVisitDraft = useCallback(async (draft: OfflineVisitDraft) => {
    if (!supabase || !user) throw new Error("جلسة المستخدم غير متاحة للمزامنة.");
    const account = data.accounts.find((item) => item.id === draft.accountId);
    if (!account) throw new Error("تعذر العثور على الجهة المرتبطة بالمسودة.");
    const remoteAccountId = await syncAccount(account);
    if (!remoteAccountId) throw new Error("تعذر مزامنة الجهة قبل إرسال التقرير.");
    const payload = draft.payload;
    const { data: remoteVisitId, error } = await supabase.rpc("tips_crm_save_visit_report", { account_uuid: remoteAccountId, visit_status: payload.isInsideTerritory ? "completed" : "needs_review", visit_outcome: payload.result, visit_notes: payload.note, follow_up_action_input: payload.followUpAction?.trim() || null, follow_up_on_input: payload.followUpDate || null, visit_priority_input: payload.reportPriority === "عالية" ? "high" : payload.reportPriority === "منخفضة" ? "low" : "medium", latitude: payload.location?.latitude ?? null, longitude: payload.location?.longitude ?? null, accuracy: payload.location?.accuracy ?? null, collection_amount_input: payload.collectionAmount ?? 0, revenue_amount_input: payload.revenueAmount ?? 0, receipt_reference_input: payload.receiptReference?.trim() || null, medical_interaction_type_input: payload.medicalInteractionType ? medicalInteractionToRemote[payload.medicalInteractionType] : null, medical_visit_goal_input: payload.medicalVisitGoal ? medicalGoalToRemote[payload.medicalVisitGoal] : null, promoted_product_input: payload.promotedProduct?.trim() || null, scientific_message_input: payload.scientificMessage?.trim() || null, doctor_interest_input: payload.doctorInterest ? doctorInterestToRemote[payload.doctorInterest] : null, medical_feedback_input: payload.medicalFeedback?.trim() || null, offline_client_ref_input: draft.id });
    if (error || !remoteVisitId) throw new Error(error?.message || "تعذر إرسال تقرير الزيارة.");
    const uploaded = payload.attachments?.length ? await uploadVisitAttachments({ visitId: remoteVisitId as string, profileId: user.id, attachments: payload.attachments }) : [];
    if (uploaded.some((item) => item.localUri && !item.remotePath)) throw new Error("تم حفظ التقرير لكن بعض المرفقات ستعاد محاولتها عند توفر اتصال ثابت.");
    return { remoteVisitId: remoteVisitId as string, attachments: uploaded };
  }, [data.accounts, syncAccount, user]);
  const syncOfflineVisitDrafts = useCallback(async () => {
    if (!profileId || !isOnline) return;
    const pending = await listOfflineVisitDrafts(profileId);
    setOfflineVisitDrafts(pending);
    let syncedCount = 0;
    for (const draft of pending) {
      try {
        const synced = await syncSingleOfflineVisitDraft(draft);
        await removeOfflineVisitDraft(profileId, draft.id);
        syncedCount += 1;
        const history = await recordVisitSyncHistory({ profileId, draft, status: "synced", attempt: draft.attempts + 1, message: "تم إرسال تقرير الزيارة إلى الإدارة بنجاح." }).catch(() => null);
        if (history) setOfflineVisitSyncHistory(history);
        if (synced.attachments.length) commit((current) => ({ ...current, visits: current.visits.map((visit) => visit.id === draft.visitId ? { ...visit, attachments: synced.attachments } : visit) }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "تعذر الاتصال بخدمة المزامنة.";
        await markOfflineVisitDraftFailed(profileId, draft.id, message);
        const history = await recordVisitSyncHistory({ profileId, draft, status: "failed", attempt: draft.attempts + 1, message }).catch(() => null);
        if (history) setOfflineVisitSyncHistory(history);
      }
    }
    const remaining = await listOfflineVisitDrafts(profileId);
    setOfflineVisitDrafts(remaining);
    void listVisitSyncHistory(profileId).then(setOfflineVisitSyncHistory).catch(() => undefined);
    if (syncedCount) {
      const notice = { count: syncedCount, syncedAt: new Date().toISOString() };
      setOfflineVisitSyncNotice(notice);
      commit((current) => ({ ...current, notifications: [notify("اكتملت مزامنة التقارير", syncedCount === 1 ? "تم إرسال تقرير زيارة مؤجل بنجاح." : `تم إرسال ${syncedCount} تقارير زيارة مؤجلة بنجاح.`, "زيارة"), ...current.notifications] }));
      void notifyOfflineVisitSyncSuccess(syncedCount);
    }
  }, [commit, isOnline, profileId, syncSingleOfflineVisitDraft]);
  const discardOfflineVisitDraft = useCallback(async (draftId: string) => {
    if (!profileId) return;
    setOfflineVisitDrafts(await removeOfflineVisitDraft(profileId, draftId));
  }, [profileId]);
  const clearOfflineVisitSyncNotice = useCallback(() => setOfflineVisitSyncNotice(null), []);
  const queueOrSyncVisit = useCallback(async (visitId: string, accountId: string, payload: OfflineVisitPayload) => {
    if (!profileId) return "queued" as const;
    const draft = createOfflineVisitDraft({ id: `offline-visit-${visitId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, visitId, accountId, profileId, payload });
    if (!isOnline) {
      setOfflineVisitDrafts(await saveOfflineVisitDraft(draft));
      return "queued" as const;
    }
    try {
      const synced = await syncSingleOfflineVisitDraft(draft);
      if (synced.attachments.length) commit((current) => ({ ...current, visits: current.visits.map((visit) => visit.id === visitId ? { ...visit, attachments: synced.attachments } : visit) }));
      return "synced" as const;
    } catch (error) {
      setOfflineVisitDrafts(await saveOfflineVisitDraft(draft));
      return "queued" as const;
    }
  }, [commit, isOnline, profileId, syncSingleOfflineVisitDraft]);
  useEffect(() => {
    const updateNetwork = (state: Network.NetworkState) => setIsOnline(state.isInternetReachable !== false && state.isConnected !== false);
    void Network.getNetworkStateAsync().then(updateNetwork).catch(() => setIsOnline(true));
    const subscription = Network.addNetworkStateListener(updateNetwork);
    return () => subscription.remove();
  }, []);
  useEffect(() => { if (!profileId) { setOfflineVisitDrafts([]); setOfflineVisitSyncHistory([]); return; } void Promise.all([listOfflineVisitDrafts(profileId), listVisitSyncHistory(profileId)]).then(([drafts, history]) => { setOfflineVisitDrafts(drafts); setOfflineVisitSyncHistory(history); }).catch(() => { setOfflineVisitDrafts([]); setOfflineVisitSyncHistory([]); }); }, [profileId]);
  useEffect(() => { if (isOnline && offlineVisitDrafts.length) void syncOfflineVisitDrafts(); }, [isOnline, offlineVisitDrafts.length, syncOfflineVisitDrafts]);
  const value = useMemo<CrmContextValue>(() => ({
    data, isReady, role, activeMemberId, isOnline, offlineVisitDrafts, offlineVisitSyncHistory, offlineVisitSyncNotice, syncOfflineVisitDrafts, discardOfflineVisitDraft, clearOfflineVisitSyncNotice, unreadNotificationCount: data.notifications.filter((item) => !item.readAt).length,
    setRole: (nextRole) => commit((current) => ({ ...current, teamMembers: current.teamMembers.map((member) => member.id === activeMemberId ? { ...member, role: nextRole } : member) })),
    selectTeamMember: setActiveMemberId,
    updateTeamMemberRole: (id, nextRole) => commit((current) => ({ ...current, teamMembers: current.teamMembers.map((member) => member.id === id ? { ...member, role: nextRole } : member) })),
    createRole: (input) => commit((current) => ({ ...current, roleDefinitions: [{ ...input, id: `r-${Date.now()}`, isSystem: false, isActive: true }, ...current.roleDefinitions] })),
    updateRoleDefinition: (id, input) => commit((current) => ({ ...current, roleDefinitions: current.roleDefinitions.map((roleDefinition) => roleDefinition.id === id ? { ...roleDefinition, ...input } : roleDefinition) })),
    toggleRoleDefinition: (id) => commit((current) => ({ ...current, roleDefinitions: current.roleDefinitions.map((roleDefinition) => roleDefinition.id === id && !roleDefinition.isSystem ? { ...roleDefinition, isActive: !roleDefinition.isActive } : roleDefinition) })),
    removeRoleDefinition: (id) => commit((current) => ({ ...current, roleDefinitions: current.roleDefinitions.filter((roleDefinition) => roleDefinition.id !== id || roleDefinition.isSystem) })),
    accountById: (id) => data.accounts.find((account) => account.id === id),
    visitsForAccount: (accountId) => data.visits.filter((visit) => visit.accountId === accountId),
    addAccount: (account) => {
      const duplicate = findDuplicateAccount(data.accounts, account);
      if (duplicate) {
        commit((current) => ({ ...current, notifications: [notify("تم منع تكرار جهة", `${duplicate.name} مسجلة مسبقاً في ${duplicate.city}.`, "تنبيه"), ...current.notifications] }));
        return { accepted: false, duplicate };
      }
      const created: Account = { ...account, id: `a-${Date.now()}`, lastVisit: "لم تتم زيارة", initials: initialsFor(account.name), accent: accentForAccountType[account.type] };
      commit((current) => ({ ...current, accounts: [created, ...current.accounts] }));
      void syncAccount(created).then(() => refreshSharedCatalog());
      return { accepted: true };
    },
    completeVisit: async (visitId, completion) => {
      const currentVisit = data.visits.find((visit) => visit.id === visitId); const account = currentVisit ? data.accounts.find((item) => item.id === currentVisit.accountId) : undefined;
      if (!currentVisit || !account) return { delivery: "queued" as const };
      const payload: OfflineVisitPayload = { result: completion.result, note: completion.note, followUpAction: completion.followUpAction?.trim() || undefined, followUpDate: completion.followUpDate, reportPriority: completion.reportPriority ?? "متوسطة", attachments: completion.attachments, location: completion.location, isInsideTerritory: completion.isInsideTerritory, collectionAmount: completion.collectionAmount ?? 0, revenueAmount: completion.revenueAmount ?? 0, receiptReference: completion.receiptReference?.trim() || undefined, medicalInteractionType: completion.medicalInteractionType, medicalVisitGoal: completion.medicalVisitGoal, promotedProduct: completion.promotedProduct?.trim() || undefined, scientificMessage: completion.scientificMessage?.trim() || undefined, doctorInterest: completion.doctorInterest, medicalFeedback: completion.medicalFeedback?.trim() || undefined };
      commit((current) => ({ ...current, visits: current.visits.map((visit) => visit.id === visitId ? { ...visit, status: completion.isInsideTerritory ? "مكتملة" : "تحتاج مراجعة", result: completion.result, note: completion.note, followUpAction: payload.followUpAction, followUpDate: payload.followUpDate, reportPriority: payload.reportPriority, attachments: payload.attachments, location: payload.location, isInsideTerritory: payload.isInsideTerritory, collectionAmount: payload.collectionAmount, revenueAmount: payload.revenueAmount, receiptReference: payload.receiptReference, medicalInteractionType: payload.medicalInteractionType, medicalVisitGoal: payload.medicalVisitGoal, promotedProduct: payload.promotedProduct, scientificMessage: payload.scientificMessage, doctorInterest: payload.doctorInterest, medicalFeedback: payload.medicalFeedback, checkedInAt: new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }), completedAt: new Date().toISOString() } : visit), notifications: [...(completion.followUpDate ? [notify("متابعة مجدولة", `${account.name}: ${completion.followUpAction?.trim() || "راجع الخطوة التالية"} في ${completion.followUpDate}.`, "تنبيه")] : []), ...current.notifications] }));
      if (completion.followUpDate && account) void scheduleFollowUpReminder({ accountName: account.name, action: completion.followUpAction?.trim() || "راجع الخطوة التالية", dueDate: completion.followUpDate });
      const delivery = await queueOrSyncVisit(visitId, account.id, payload);
      commit((current) => ({ ...current, notifications: [notify(delivery === "synced" ? "تم توثيق ومزامنة الزيارة" : "حُفظت الزيارة دون إنترنت", delivery === "synced" ? `${completion.result} تم إرساله للإدارة.` : "سيُرسل التقرير تلقائياً عند عودة اتصال الإنترنت.", "زيارة"), ...current.notifications] }));
      return { delivery };
    },
    submitPlan: (input) => { const plan: Plan = { id: `p-${Date.now()}`, title: input.title, period: input.period, kind: input.kind, status: "بانتظار الاعتماد", repName: data.teamMembers.find((member) => member.id === activeMemberId)?.name ?? "مندوب", visitIds: input.visitIds, schedule: input.schedule, submittedAt: "الآن" }; commit((current) => { const plannedVisits = (input.plannedVisits ?? []).filter((visit) => !current.visits.some((existing) => existing.id === visit.id)).map((visit) => ({ ...visit, status: "مجدولة" as const })); return { ...current, visits: [...plannedVisits, ...current.visits], plans: [plan, ...current.plans], notifications: [notify("خطة جديدة بانتظار الاعتماد", `${plan.repName} أرسل ${plan.title}.`, "خطة"), ...current.notifications] }; }); send("خطة جديدة بانتظار الاعتماد", plan.title); if (supabase && user) void (async () => { const startsOn = input.startsOn ?? new Date().toISOString().slice(0, 10); const fallbackEnd = new Date(`${startsOn}T12:00:00`); fallbackEnd.setDate(fallbackEnd.getDate() + (input.kind === "أسبوعية" ? 6 : 30)); const { data: remoteId } = await supabase.rpc("tips_crm_create_plan", { plan_title: input.title, plan_type: input.kind === "أسبوعية" ? "weekly" : "monthly", starts_on: startsOn, ends_on: input.endsOn ?? fallbackEnd.toISOString().slice(0, 10) }); if (!remoteId) return; commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === plan.id ? { ...item, remoteId: remoteId as string } : item) })); const entries = (await Promise.all((input.plannedVisits ?? []).map(async (visit) => { const account = data.accounts.find((item) => item.id === visit.accountId); const accountId = account ? await syncAccount(account) : null; return accountId && visit.scheduledFor ? { account_id: accountId, scheduled_for: `${visit.scheduledFor}T09:00:00+00:00` } : null; }))).filter((item): item is { account_id: string; scheduled_for: string } => Boolean(item)); if (entries.length) await supabase.rpc("tips_crm_save_plan_visits", { target_plan_id: remoteId as string, planned_visits: entries }); if (session?.access_token) void fetch(`${getApiBaseUrl()}/api/plan-submission-email`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: remoteId as string, supabaseAccessToken: session.access_token }) }); await refreshSharedCatalog(); })(); },
    approvePlan: async (planId) => { const plan = data.plans.find((item) => item.id === planId); if (!plan) return false; if (plan.remoteId && supabase && user) { const { data: approved, error } = await supabase.rpc("tips_crm_review_plan", { target_plan_id: plan.remoteId, next_status: "approved", note: null }); if (error || !approved) return false; await refreshSharedCatalog(); return true; } commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === planId ? { ...item, status: "معتمدة", managerNote: undefined } : item), notifications: [notify("تم اعتماد الخطة", `${plan.title} أصبحت جاهزة للتنفيذ.`, "خطة"), ...current.notifications] })); return true; },
    returnPlan: async (planId, note) => { const plan = data.plans.find((item) => item.id === planId); if (!plan) return false; if (plan.remoteId && supabase && user) { const { data: returned, error } = await supabase.rpc("tips_crm_review_plan", { target_plan_id: plan.remoteId, next_status: "returned", note }); if (error || !returned) return false; await refreshSharedCatalog(); return true; } commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === planId ? { ...item, status: "معادة للمراجعة", managerNote: note } : item), notifications: [notify("تمت إعادة الخطة للمراجعة", `${plan.title}: ${note}`, "خطة"), ...current.notifications] })); return true; },
    updatePlanSchedule: async (planId, visits, managerNote) => { const plan = data.plans.find((item) => item.id === planId); if (!plan || plan.status !== "بانتظار الاعتماد") return false; if (plan.remoteId && supabase && user) { const payload = (await Promise.all(visits.map(async (visit) => { if (!visit.accountId) return null; const localAccount = data.accounts.find((account) => account.id === visit.accountId); const accountId = localAccount ? await syncAccount(localAccount) : visit.accountId; return accountId ? { account_id: accountId, scheduled_for: visit.scheduledFor } : null; }))).filter((item): item is { account_id: string; scheduled_for: string } => Boolean(item)); if (!payload.length) return false; const { error } = await supabase.rpc("tips_crm_update_plan_by_manager", { target_plan_id: plan.remoteId, planned_visits: payload, manager_note_input: managerNote.trim() || null }); if (error) return false; await refreshSharedCatalog(); return true; } const schedule = Array.from(new Set(visits.map((visit) => visit.scheduledFor.slice(0, 10)))).map((date) => ({ id: `${plan.id}-${date}`, label: weekdayForPlan(date), dateLabel: dateLabelForPlan(date), visitIds: visits.filter((visit) => visit.scheduledFor.slice(0, 10) === date).map((visit) => visit.id) })); commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === planId ? { ...item, schedule, visitIds: visits.map((visit) => visit.id), scheduledVisitDetails: visits, managerNote: managerNote.trim() || undefined } : item), notifications: [notify("تم تعديل خطة قبل الاعتماد", `${plan.title} تم تعديل توزيعها بواسطة الإدارة.`, "خطة"), ...current.notifications] })); return true; },
    addVisitResult: (label) => { const item = label.trim(); if (!item) return; commit((current) => current.visitResults.includes(item) ? current : { ...current, visitResults: [...current.visitResults, item] }); if (supabase && user) void supabase.rpc("tips_crm_save_visit_outcome", { outcome_label: item, outcome_sort_order: data.visitResults.length * 10 + 10 }).then(() => refreshSharedCatalog()); },
    createInvite: async (input) => { let invite: TeamInvite = { ...input, id: `i-${Date.now()}`, status: "بانتظار الرد", sentAt: "الآن", expiresAt: "بعد 7 أيام" }; if (supabase && user) { const { data: remoteInvite, error } = await supabase.rpc("tips_crm_create_invite", { invitee_email: input.email, invite_role_key: roleToRemote[input.role], invite_territory: input.territory, invite_territory_key: input.territoryId ?? null, invite_territory_keys: input.territoryIds ?? (input.territoryId ? [input.territoryId] : []) }); if (error || !remoteInvite?.[0]) return null; const result = remoteInvite[0] as { invite_id: string; invite_token: string; expires_at: string }; invite = { ...invite, id: result.invite_id, expiresAt: new Date(result.expires_at).toLocaleDateString("ar"), acceptUrl: buildInviteAcceptUrl(result.invite_token) }; } commit((current) => ({ ...current, invites: [invite, ...current.invites], notifications: [notify("تم إرسال دعوة للفريق", `تمت دعوة ${invite.email}.`, "فريق"), ...current.notifications] })); return invite; },
    resendInvite: async (invite) => { if (!supabase || !user) return null; const { data: response, error } = await supabase.rpc("tips_crm_resend_invite", { invite_id: invite.id }); if (error || !response?.[0]) return null; const result = response[0] as { invite_token: string; expires_at: string }; const updated: TeamInvite = { ...invite, status: "بانتظار الرد", sentAt: "الآن", expiresAt: new Date(result.expires_at).toLocaleDateString("ar"), acceptUrl: buildInviteAcceptUrl(result.invite_token) }; commit((current) => ({ ...current, invites: current.invites.map((item) => item.id === invite.id ? updated : item), notifications: [notify("أعيد إرسال الدعوة", `تم تمديد رابط دعوة ${invite.email}.`, "فريق"), ...current.notifications] })); return updated; },
    revokeInvite: async (inviteId) => { if (!supabase || !user) return false; const { data: revoked, error } = await supabase.rpc("tips_crm_revoke_invite", { invite_id: inviteId }); if (error || !revoked) return false; commit((current) => ({ ...current, invites: current.invites.map((item) => item.id === inviteId ? { ...item, status: "ملغاة" } : item), notifications: [notify("تم إلغاء الدعوة", "أصبح رابط الدعوة غير صالح للاستخدام.", "فريق"), ...current.notifications] })); return true; },
    updateBoundary: (boundary) => commit((current) => ({ ...current, boundaries: current.boundaries.some((item) => item.territoryId === boundary.territoryId) ? current.boundaries.map((item) => item.territoryId === boundary.territoryId ? boundary : item) : [...current.boundaries, boundary] })),
    createCentralNotification: (input) => { commit((current) => ({ ...current, notifications: [notify(input.title, input.body, input.kind), ...current.notifications] })); send(input.title, input.body); },
    refreshSharedCatalog,
    setTeamMemberTerritories: async (memberId, territoryIds) => {
      const territoryLabels = territoryIds.map((territoryId) => data.territories.find((item) => item.id === territoryId)?.name).filter((name): name is string => Boolean(name));
      if (supabase && user) { const { error } = await supabase.rpc("tips_crm_set_profile_territories", { target_profile_id: memberId, selected_territory_keys: territoryIds }); if (error) return false; }
      commit((current) => ({ ...current, teamMembers: current.teamMembers.map((member) => member.id === memberId ? { ...member, territoryId: territoryIds[0], territoryIds, territories: territoryLabels, territory: territoryLabels.join("، ") || "غير محددة" } : member) }));
      return true;
    },
    setMonthlyTarget: async (input) => {
      const targetValue = Math.max(0, input.metric === "visits" ? Math.floor(input.targetValue) : Math.round(input.targetValue * 100) / 100);
      const alertThreshold = Math.min(100, Math.max(1, Math.round(input.alertThreshold)));
      if (supabase && user) {
        const { error } = await supabase.schema("tips_crm").from("monthly_targets").upsert({ month_start: input.monthStart, target_type: input.targetType === "مندوب" ? "rep" : "territory", target_key: input.targetKey, target_value: targetValue, metric: input.metric, alert_threshold: alertThreshold, created_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "month_start,target_type,target_key,metric" });
        if (error) return false;
      }
      const localTarget: MonthlyTarget = { ...input, targetValue, alertThreshold, id: `${input.monthStart}-${input.targetType}-${input.targetKey}-${input.metric}`, updatedAt: new Date().toISOString() };
      commit((current) => ({ ...current, monthlyTargets: [...current.monthlyTargets.filter((target) => !(target.monthStart === input.monthStart && target.targetType === input.targetType && target.targetKey === input.targetKey && target.metric === input.metric)), localTarget], notifications: [notify("تم تحديث هدف الشهر", `${input.targetType}: ${targetValue} ${targetMetricMeta[input.metric].unit} مستهدفة · تنبيه عند ${alertThreshold}%.`, "تنبيه"), ...current.notifications] }));
      return true;
    },
    recordDutyPoint: (point) => {
      const activeMember = data.teamMembers.find((item) => item.id === activeMemberId);
      const activeTerritoryIds = activeMember?.territoryIds?.length ? activeMember.territoryIds : activeMember?.territoryId ? [activeMember.territoryId] : [];
      const activeBoundaries = data.boundaries.filter((item) => activeTerritoryIds.includes(item.territoryId));
      const activeBoundary = activeBoundaries[0];
      const previousDuty = data.dutyStatuses.find((status) => status.memberId === activeMemberId);
      const isOutsideActiveTerritory = activeBoundaries.length > 0 && !activeBoundaries.some((boundary) => isInsideTerritory(point, boundary));
      const elapsedSinceLastAlert = previousDuty?.lastTerritoryAlertAt ? new Date(point.capturedAt).getTime() - new Date(previousDuty.lastTerritoryAlertAt).getTime() : Number.POSITIVE_INFINITY;
      const shouldSendAlert = isOutsideActiveTerritory && (!previousDuty?.isOutsideTerritory || elapsedSinceLastAlert >= 10 * 60 * 1000);
      const operationalAlert = shouldSendAlert && activeMember && activeBoundaries.length ? { title: "مندوب خارج نطاق المناطق", body: `${activeMember.name} خارج مناطق العمل المعيّنة (${activeBoundaries.map((boundary) => boundary.name).join("، ")}) أثناء الدوام المباشر.`, kind: "تنبيه" as const } : null;
      commit((current) => {
        const member = current.teamMembers.find((item) => item.id === activeMemberId);
        const territoryIds = member?.territoryIds?.length ? member.territoryIds : member?.territoryId ? [member.territoryId] : [];
        const boundaries = current.boundaries.filter((item) => territoryIds.includes(item.territoryId));
        const isOutsideTerritory = boundaries.length > 0 && !boundaries.some((boundary) => isInsideTerritory(point, boundary));
        const previous = current.dutyStatuses.find((status) => status.memberId === activeMemberId);
        const currentElapsedSinceLastAlert = previous?.lastTerritoryAlertAt ? new Date(point.capturedAt).getTime() - new Date(previous.lastTerritoryAlertAt).getTime() : Number.POSITIVE_INFINITY;
        const shouldAlert = isOutsideTerritory && (!previous?.isOutsideTerritory || currentElapsedSinceLastAlert >= 10 * 60 * 1000);
        const currentAlert = shouldAlert && member && boundaries.length ? { title: "مندوب خارج نطاق المناطق", body: `${member.name} خارج مناطق العمل المعيّنة (${boundaries.map((boundary) => boundary.name).join("، ")}) أثناء الدوام المباشر.`, kind: "تنبيه" as const } : null;
        const nextStatus: RepDutyStatus = { memberId: activeMemberId, isOnDuty: true, lastPoint: point, path: appendDutyPoint(previous?.path ?? [], point), isOutsideTerritory, outsideSince: isOutsideTerritory ? (previous?.isOutsideTerritory ? previous.outsideSince : point.capturedAt) : undefined, lastTerritoryAlertAt: shouldAlert ? point.capturedAt : previous?.lastTerritoryAlertAt };
        return { ...current, dutyStatuses: previous ? current.dutyStatuses.map((status) => status.memberId === activeMemberId ? nextStatus : status) : [...current.dutyStatuses, nextStatus], notifications: currentAlert ? [notify(currentAlert.title, currentAlert.body, currentAlert.kind), ...current.notifications] : current.notifications };
      });
      if (operationalAlert) {
        send(operationalAlert.title, operationalAlert.body);
        if (supabase && activeBoundary) void supabase.rpc("tips_crm_raise_territory_exit_alert", { territory_key: activeBoundary.territoryId, captured_at_input: point.capturedAt });
      }
    },
    markAllNotificationsRead: () => commit((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? "الآن" })) })),
  }), [data, isReady, role, activeMemberId, user, refreshSharedCatalog, isOnline, offlineVisitDrafts, offlineVisitSyncHistory, offlineVisitSyncNotice, syncOfflineVisitDrafts, discardOfflineVisitDraft, clearOfflineVisitSyncNotice, queueOrSyncVisit]);
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() { const context = useContext(CrmContext); if (!context) throw new Error("useCrm must be used within CrmProvider"); return context; }
