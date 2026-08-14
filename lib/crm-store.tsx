import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { sendOperationalNotification } from "@/lib/notifications";
import { stateForCity } from "@/lib/sudan-locations";
import { appendDutyPoint } from "@/lib/duty-logic";
import { supabase } from "@/lib/supabase-client";
import { useSupabaseAuth } from "@/lib/supabase-auth";

export type AccountType = "طبيب" | "صيدلية" | "مستشفى" | "موزع";
export type VisitStatus = "مجدولة" | "مكتملة" | "تحتاج مراجعة";
export type PlanStatus = "مسودة" | "بانتظار الاعتماد" | "معتمدة" | "معادة للمراجعة";
export type AppRole = "مدير" | "مندوب مبيعات" | "مندوب طبي";
export type VisitResult = string;

export type Account = { id: string; name: string; type: AccountType; specialty?: string; state: string; area: string; city: string; address: string; contact: string; lastVisit: string; priority: "عالية" | "متوسطة" | "اعتيادية"; initials: string; accent: string };
export type Visit = { id: string; accountId: string; date: string; time: string; status: VisitStatus; result?: VisitResult; note?: string; checkedInAt?: string; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory?: boolean };
export type PlanScheduleDay = { id: string; label: string; dateLabel: string; visitIds: string[] };
export type Plan = { id: string; remoteId?: string; title: string; period: string; kind: "أسبوعية" | "شهرية"; status: PlanStatus; repName: string; visitIds: string[]; schedule?: PlanScheduleDay[]; managerNote?: string; submittedAt: string };
export type Territory = { id: string; name: string; state: string; city: string; assignees: string[]; accounts: number; coverage: number };
export type TeamMember = { id: string; name: string; initials: string; role: AppRole; type: string; territory: string };
export type RoleDefinition = { id: string; name: string; description: string; permissions: string[]; isSystem: boolean; isActive: boolean };
export type CrmNotification = { id: string; title: string; body: string; time: string; kind: "خطة" | "زيارة" | "تنبيه" | "فريق"; readAt?: string };
export type TeamInvite = { id: string; email: string; role: AppRole; territory: string; status: "بانتظار الرد" | "مقبولة" | "ملغاة"; sentAt: string; expiresAt: string; acceptUrl?: string };
export type TerritoryBoundary = { territoryId: string; name: string; state: string; city: string; centerLatitude: string; centerLongitude: string; radiusMeters: number; notes?: string; updatedAt: string };
export type DutyTrackPoint = { latitude: number; longitude: number; accuracyMeters?: number | null; speedMetersPerSecond?: number | null; capturedAt: string; source: "foreground" | "background" };
export type RepDutyStatus = { memberId: string; isOnDuty: boolean; lastPoint?: DutyTrackPoint; path: DutyTrackPoint[] };
export type CrmData = { accounts: Account[]; visits: Visit[]; plans: Plan[]; territories: Territory[]; visitResults: VisitResult[]; teamMembers: TeamMember[]; roleDefinitions: RoleDefinition[]; notifications: CrmNotification[]; invites: TeamInvite[]; boundaries: TerritoryBoundary[]; dutyStatuses: RepDutyStatus[] };

type VisitCompletion = { result: VisitResult; note: string; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory: boolean };
type NewPlanInput = { title: string; period: string; kind: Plan["kind"]; visitIds: string[]; schedule?: PlanScheduleDay[] };
type CrmContextValue = {
  data: CrmData; isReady: boolean; role: AppRole; activeMemberId: string; unreadNotificationCount: number;
  setRole: (role: AppRole) => void; selectTeamMember: (id: string) => void; updateTeamMemberRole: (id: string, role: AppRole) => void;
  createRole: (input: Omit<RoleDefinition, "id" | "isSystem" | "isActive">) => void; updateRoleDefinition: (id: string, input: Pick<RoleDefinition, "name" | "description" | "permissions">) => void; toggleRoleDefinition: (id: string) => void; removeRoleDefinition: (id: string) => void;
  accountById: (id: string) => Account | undefined; visitsForAccount: (accountId: string) => Visit[];
  addAccount: (account: Omit<Account, "id" | "lastVisit" | "initials" | "accent">) => void;
  completeVisit: (visitId: string, completion: VisitCompletion) => void; submitPlan: (input: NewPlanInput) => void; approvePlan: (planId: string) => void; returnPlan: (planId: string, note: string) => void;
  addVisitResult: (label: string) => void; createInvite: (input: Omit<TeamInvite, "id" | "status" | "sentAt" | "expiresAt" | "acceptUrl">) => Promise<TeamInvite | null>; updateBoundary: (boundary: TerritoryBoundary) => void;
  createCentralNotification: (input: Pick<CrmNotification, "title" | "body" | "kind">) => void; recordDutyPoint: (point: DutyTrackPoint) => void; markAllNotificationsRead: () => void;
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
  teamMembers: [{ id: "u1", name: "محمد الأمين", initials: "م أ", role: "مدير", type: "مدير مبيعات", territory: "كل المناطق" }, { id: "u2", name: "أحمد فضل", initials: "أ ف", role: "مندوب طبي", type: "المجال الطبي", territory: "العمارات والرياض" }, { id: "u3", name: "سلمى الطيب", initials: "س ط", role: "مندوب مبيعات", type: "توزيع ميداني", territory: "بحري" }],
  roleDefinitions: [{ id: "r1", name: "مدير النظام", description: "إدارة المستخدمين والأدوار وإعدادات الشركة.", permissions: ["إدارة الأدوار", "إدارة المستخدمين", "إدارة الإعدادات"], isSystem: true, isActive: true }, { id: "r2", name: "مدير", description: "متابعة الفريق واعتماد الخطط وإدارة المناطق.", permissions: ["اعتماد الخطط", "إدارة المناطق", "عرض التقارير"], isSystem: true, isActive: true }, { id: "r3", name: "مندوب مبيعات", description: "إدارة زيارات وخطة البيع ضمن المنطقة المعيّنة.", permissions: ["خطتي", "زياراتي", "تتبع الدوام"], isSystem: true, isActive: true }, { id: "r4", name: "مندوب طبي", description: "إدارة زيارة الأطباء والعيادات ضمن المنطقة المعيّنة.", permissions: ["خطتي", "زياراتي", "تتبع الدوام"], isSystem: true, isActive: true }],
  notifications: [{ id: "n1", title: "خطة بانتظار الاعتماد", body: "خطة سبتمبر الطبية لأحمد فضل تحتاج قرارك.", time: "منذ 12 دقيقة", kind: "خطة" }, { id: "n2", title: "تذكير زيارة", body: "زيارة صيدلية السلام مجدولة اليوم عند 11:00 ص.", time: "منذ 35 دقيقة", kind: "زيارة" }],
  invites: [{ id: "i1", email: "medical.rep@tips.sd", role: "مندوب طبي", territory: "العمارات والرياض", status: "بانتظار الرد", sentAt: "اليوم", expiresAt: "بعد 6 أيام" }],
  boundaries: [{ territoryId: "t1", name: "العمارات والرياض", state: "ولاية الخرطوم", city: "الخرطوم", centerLatitude: "15.5581", centerLongitude: "32.5372", radiusMeters: 4200, notes: "تغطية العيادات والصيدليات.", updatedAt: "اليوم" }, { territoryId: "t2", name: "بحري", state: "ولاية الخرطوم", city: "الخرطوم بحري", centerLatitude: "15.6236", centerLongitude: "32.5327", radiusMeters: 3600, notes: "تغطية الموزعين والصيدليات.", updatedAt: "اليوم" }],
  dutyStatuses: [
    { memberId: "u2", isOnDuty: true, lastPoint: { latitude: 15.5581, longitude: 32.5372, accuracyMeters: 24, capturedAt: new Date().toISOString(), source: "foreground" }, path: [{ latitude: 15.5502, longitude: 32.5252, capturedAt: new Date(Date.now() - 80 * 60000).toISOString(), source: "foreground" }, { latitude: 15.5534, longitude: 32.5301, capturedAt: new Date(Date.now() - 45 * 60000).toISOString(), source: "foreground" }, { latitude: 15.5581, longitude: 32.5372, capturedAt: new Date().toISOString(), source: "foreground" }] },
    { memberId: "u3", isOnDuty: true, lastPoint: { latitude: 15.6236, longitude: 32.5327, accuracyMeters: 38, capturedAt: new Date(Date.now() - 4 * 60000).toISOString(), source: "background" }, path: [{ latitude: 15.6154, longitude: 32.5238, capturedAt: new Date(Date.now() - 90 * 60000).toISOString(), source: "background" }, { latitude: 15.6196, longitude: 32.5270, capturedAt: new Date(Date.now() - 42 * 60000).toISOString(), source: "background" }, { latitude: 15.6236, longitude: 32.5327, capturedAt: new Date(Date.now() - 4 * 60000).toISOString(), source: "background" }] },
  ],
};

const CrmContext = createContext<CrmContextValue | null>(null);
const initialsFor = (name: string) => name.replace(/^(د\.|صيدلية|مستشفى|موزع)\s*/, "").split(" ").slice(0, 2).map((part) => part[0]).join(" ");

export function CrmProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CrmData>(initialData);
  const [isReady, setIsReady] = useState(false);
  const [activeMemberId, setActiveMemberId] = useState("u1");
  const { user } = useSupabaseAuth();
  const remoteAccountIds = useRef<Record<string, string>>({});
  useEffect(() => { AsyncStorage.getItem(STORAGE_KEY).then((raw) => { if (!raw) return; const saved = JSON.parse(raw) as Partial<CrmData>; setData({ ...initialData, ...saved, accounts: (saved.accounts ?? initialData.accounts).map((account) => ({ ...account, state: account.state || stateForCity(account.city) })), dutyStatuses: saved.dutyStatuses ?? initialData.dutyStatuses }); }).catch(() => undefined).finally(() => setIsReady(true)); }, []);
  const commit = (updater: (current: CrmData) => CrmData) => setData((current) => { const next = updater(current); void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return next; });
  const role = data.teamMembers.find((member) => member.id === activeMemberId)?.role ?? "مندوب مبيعات";
  const send = (title: string, body: string) => void sendOperationalNotification(title, body);
  const syncAccount = async (account: Account) => {
    if (!supabase || !user) return null;
    if (remoteAccountIds.current[account.id]) return remoteAccountIds.current[account.id];
    const accountType: Record<AccountType, string> = { طبيب: "doctor", صيدلية: "pharmacy", مستشفى: "hospital", موزع: "distributor" };
    const { data: remoteId, error } = await supabase.rpc("tips_crm_sync_account", { local_ref: account.id, account_type: accountType[account.type], account_name: account.name, account_specialty: account.specialty ?? "", account_state: account.state, account_city: account.city, account_area: account.area, account_address: account.address, account_phone: account.contact });
    if (error || !remoteId) return null;
    remoteAccountIds.current[account.id] = remoteId as string;
    return remoteId as string;
  };
  const value = useMemo<CrmContextValue>(() => ({
    data, isReady, role, activeMemberId, unreadNotificationCount: data.notifications.filter((item) => !item.readAt).length,
    setRole: (nextRole) => commit((current) => ({ ...current, teamMembers: current.teamMembers.map((member) => member.id === activeMemberId ? { ...member, role: nextRole } : member) })),
    selectTeamMember: setActiveMemberId,
    updateTeamMemberRole: (id, nextRole) => commit((current) => ({ ...current, teamMembers: current.teamMembers.map((member) => member.id === id ? { ...member, role: nextRole } : member) })),
    createRole: (input) => commit((current) => ({ ...current, roleDefinitions: [{ ...input, id: `r-${Date.now()}`, isSystem: false, isActive: true }, ...current.roleDefinitions] })),
    updateRoleDefinition: (id, input) => commit((current) => ({ ...current, roleDefinitions: current.roleDefinitions.map((roleDefinition) => roleDefinition.id === id ? { ...roleDefinition, ...input } : roleDefinition) })),
    toggleRoleDefinition: (id) => commit((current) => ({ ...current, roleDefinitions: current.roleDefinitions.map((roleDefinition) => roleDefinition.id === id && !roleDefinition.isSystem ? { ...roleDefinition, isActive: !roleDefinition.isActive } : roleDefinition) })),
    removeRoleDefinition: (id) => commit((current) => ({ ...current, roleDefinitions: current.roleDefinitions.filter((roleDefinition) => roleDefinition.id !== id || roleDefinition.isSystem) })),
    accountById: (id) => data.accounts.find((account) => account.id === id),
    visitsForAccount: (accountId) => data.visits.filter((visit) => visit.accountId === accountId),
    addAccount: (account) => { const accent: Record<AccountType, string> = { طبيب: "#0F766E", صيدلية: "#B45309", مستشفى: "#2563EB", موزع: "#7C3AED" }; const created: Account = { ...account, id: `a-${Date.now()}`, lastVisit: "لم تتم زيارة", initials: initialsFor(account.name), accent: accent[account.type] }; commit((current) => ({ ...current, accounts: [created, ...current.accounts] })); void syncAccount(created); },
    completeVisit: (visitId, completion) => { const currentVisit = data.visits.find((visit) => visit.id === visitId); const account = currentVisit ? data.accounts.find((item) => item.id === currentVisit.accountId) : undefined; commit((current) => ({ ...current, visits: current.visits.map((visit) => visit.id === visitId ? { ...visit, status: completion.isInsideTerritory ? "مكتملة" : "تحتاج مراجعة", result: completion.result, note: completion.note, location: completion.location, isInsideTerritory: completion.isInsideTerritory, checkedInAt: new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) } : visit), notifications: [notify("تم توثيق زيارة", completion.result, "زيارة"), ...current.notifications] })); if (account && supabase && user) void (async () => { const remoteAccountId = await syncAccount(account); if (!remoteAccountId) return; await supabase.rpc("tips_crm_save_visit", { account_uuid: remoteAccountId, visit_status: completion.isInsideTerritory ? "completed" : "needs_review", visit_outcome: completion.result, visit_notes: completion.note, latitude: completion.location?.latitude ?? null, longitude: completion.location?.longitude ?? null, accuracy: completion.location?.accuracy ?? null }); })(); },
    submitPlan: (input) => { const plan: Plan = { id: `p-${Date.now()}`, title: input.title, period: input.period, kind: input.kind, status: "بانتظار الاعتماد", repName: data.teamMembers.find((member) => member.id === activeMemberId)?.name ?? "مندوب", visitIds: input.visitIds, schedule: input.schedule, submittedAt: "الآن" }; commit((current) => ({ ...current, plans: [plan, ...current.plans], notifications: [notify("خطة جديدة بانتظار الاعتماد", `${plan.repName} أرسل ${plan.title}.`, "خطة"), ...current.notifications] })); send("خطة جديدة بانتظار الاعتماد", plan.title); if (supabase && user) void (async () => { const start = new Date(); const end = new Date(start); end.setDate(start.getDate() + (input.kind === "أسبوعية" ? 6 : 30)); const { data: remoteId } = await supabase.rpc("tips_crm_create_plan", { plan_title: input.title, plan_type: input.kind === "أسبوعية" ? "weekly" : "monthly", starts_on: start.toISOString().slice(0, 10), ends_on: end.toISOString().slice(0, 10) }); if (remoteId) commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === plan.id ? { ...item, remoteId: remoteId as string } : item) })); })(); },
    approvePlan: (planId) => { const plan = data.plans.find((item) => item.id === planId); commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === planId ? { ...item, status: "معتمدة", managerNote: undefined } : item), notifications: [notify("تم اعتماد الخطة", `${plan?.title ?? "الخطة"} أصبحت جاهزة للتنفيذ.`, "خطة"), ...current.notifications] })); if (plan?.remoteId && supabase && user) void supabase.rpc("tips_crm_review_plan", { target_plan_id: plan.remoteId, next_status: "approved", note: null }); },
    returnPlan: (planId, note) => { const plan = data.plans.find((item) => item.id === planId); commit((current) => ({ ...current, plans: current.plans.map((item) => item.id === planId ? { ...item, status: "معادة للمراجعة", managerNote: note } : item), notifications: [notify("تمت إعادة الخطة للمراجعة", `${plan?.title ?? "الخطة"}: ${note}`, "خطة"), ...current.notifications] })); if (plan?.remoteId && supabase && user) void supabase.rpc("tips_crm_review_plan", { target_plan_id: plan.remoteId, next_status: "returned", note }); },
    addVisitResult: (label) => { const item = label.trim(); if (item) commit((current) => current.visitResults.includes(item) ? current : { ...current, visitResults: [...current.visitResults, item] }); },
    createInvite: async (input) => { let invite: TeamInvite = { ...input, id: `i-${Date.now()}`, status: "بانتظار الرد", sentAt: "الآن", expiresAt: "بعد 7 أيام" }; if (supabase && user) { const roleKey: Record<AppRole, string> = { مدير: "sales_manager", "مندوب مبيعات": "sales_rep", "مندوب طبي": "medical_rep" }; const { data: remoteInvite, error } = await supabase.rpc("tips_crm_create_invite", { invitee_email: input.email, invite_role_key: roleKey[input.role], invite_territory: input.territory }); if (error || !remoteInvite?.[0]) return null; const result = remoteInvite[0] as { invite_token: string; expires_at: string }; invite = { ...invite, id: result.invite_token, expiresAt: new Date(result.expires_at).toLocaleDateString("ar"), acceptUrl: `https://tipscrm-vevc4ncu.manus.space/invite?token=${result.invite_token}` }; } commit((current) => ({ ...current, invites: [invite, ...current.invites], notifications: [notify("تم إرسال دعوة للفريق", `تمت دعوة ${invite.email}.`, "فريق"), ...current.notifications] })); return invite; },
    updateBoundary: (boundary) => commit((current) => ({ ...current, boundaries: current.boundaries.map((item) => item.territoryId === boundary.territoryId ? boundary : item) })),
    createCentralNotification: (input) => { commit((current) => ({ ...current, notifications: [notify(input.title, input.body, input.kind), ...current.notifications] })); send(input.title, input.body); },
    recordDutyPoint: (point) => commit((current) => ({ ...current, dutyStatuses: current.dutyStatuses.some((status) => status.memberId === activeMemberId) ? current.dutyStatuses.map((status) => status.memberId === activeMemberId ? { ...status, isOnDuty: true, lastPoint: point, path: appendDutyPoint(status.path, point) } : status) : [...current.dutyStatuses, { memberId: activeMemberId, isOnDuty: true, lastPoint: point, path: [point] }] })),
    markAllNotificationsRead: () => commit((current) => ({ ...current, notifications: current.notifications.map((item) => ({ ...item, readAt: item.readAt ?? "الآن" })) })),
  }), [data, isReady, role, activeMemberId, user]);
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() { const context = useContext(CrmContext); if (!context) throw new Error("useCrm must be used within CrmProvider"); return context; }
