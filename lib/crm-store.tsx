import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { stateForCity } from "@/lib/sudan-locations";

export type AccountType = "طبيب" | "صيدلية" | "مستشفى" | "موزع";
export type VisitStatus = "مجدولة" | "مكتملة" | "تحتاج مراجعة";
export type PlanStatus = "مسودة" | "بانتظار الاعتماد" | "معتمدة" | "معادة للمراجعة";
export type VisitResult = string;
export type AppRole = "مندوب" | "مدير";

export type Account = { id: string; name: string; type: AccountType; specialty?: string; state: string; area: string; city: string; address: string; contact: string; lastVisit: string; priority: "عالية" | "متوسطة" | "اعتيادية"; initials: string; accent: string };
export type Visit = { id: string; accountId: string; date: string; time: string; status: VisitStatus; result?: VisitResult; note?: string; checkedInAt?: string; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory?: boolean };
export type PlanScheduleDay = { id: string; label: string; dateLabel: string; visitIds: string[] };
export type Plan = { id: string; title: string; period: string; kind: "أسبوعية" | "شهرية"; status: PlanStatus; repName: string; visitIds: string[]; schedule?: PlanScheduleDay[]; managerNote?: string; submittedAt: string };
export type Territory = { id: string; name: string; state: string; city: string; assignees: string[]; accounts: number; coverage: number };
export type CrmData = { accounts: Account[]; visits: Visit[]; plans: Plan[]; territories: Territory[]; visitResults: VisitResult[] };

type VisitCompletion = { result: VisitResult; note: string; location?: { latitude: number; longitude: number; accuracy?: number | null }; isInsideTerritory: boolean };
type NewPlanInput = { title: string; period: string; kind: Plan["kind"]; visitIds: string[]; schedule?: PlanScheduleDay[] };
type CrmContextValue = { data: CrmData; isReady: boolean; role: AppRole; setRole: (role: AppRole) => void; accountById: (id: string) => Account | undefined; visitsForAccount: (accountId: string) => Visit[]; addAccount: (account: Omit<Account, "id" | "lastVisit" | "initials" | "accent">) => void; completeVisit: (visitId: string, completion: VisitCompletion) => void; submitPlan: (input: NewPlanInput) => void; approvePlan: (planId: string) => void; returnPlan: (planId: string, note: string) => void; addVisitResult: (label: string) => void };

const STORAGE_KEY = "tips-crm-demo-data-v2";
const defaultVisitResults = ["متابعة", "تم إنشاء فاتورة", "تم تحصيل", "لا يوجد قرار"];

const initialData: CrmData = {
  accounts: [
    { id: "a1", name: "د. سارة عثمان", type: "طبيب", specialty: "باطنية", state: "ولاية الخرطوم", area: "العمارات", city: "الخرطوم", address: "عيادة النخبة، شارع 27", contact: "0912 000 225", lastVisit: "قبل 8 أيام", priority: "عالية", initials: "س ع", accent: "#0F766E" },
    { id: "a2", name: "صيدلية السلام", type: "صيدلية", state: "ولاية الخرطوم", area: "العمارات", city: "الخرطوم", address: "العمارات، شارع 15", contact: "0918 662 100", lastVisit: "قبل يومين", priority: "عالية", initials: "ص س", accent: "#0D9488" },
    { id: "a3", name: "مستشفى الحياة", type: "مستشفى", state: "ولاية الخرطوم", area: "الرياض", city: "الخرطوم", address: "الرياض، شارع المطار", contact: "0183 200 700", lastVisit: "قبل 6 أيام", priority: "متوسطة", initials: "م ح", accent: "#2563EB" },
    { id: "a4", name: "د. معتصم إبراهيم", type: "طبيب", specialty: "أطفال", state: "ولاية الخرطوم", area: "الرياض", city: "الخرطوم", address: "مركز الحياة الطبي، الرياض", contact: "0994 021 900", lastVisit: "قبل 13 يوماً", priority: "متوسطة", initials: "م إ", accent: "#7C3AED" },
    { id: "a5", name: "موزع الولاية", type: "موزع", state: "ولاية الخرطوم", area: "بحري", city: "الخرطوم بحري", address: "المنطقة الصناعية، مربع 8", contact: "0911 006 610", lastVisit: "أمس", priority: "عالية", initials: "م و", accent: "#B45309" },
    { id: "a6", name: "صيدلية الندى", type: "صيدلية", state: "ولاية الخرطوم", area: "بحري", city: "الخرطوم بحري", address: "السوق المركزي، بحري", contact: "0920 780 500", lastVisit: "قبل 3 أيام", priority: "اعتيادية", initials: "ص ن", accent: "#C2410C" },
  ],
  visits: [
    { id: "v1", accountId: "a1", date: "اليوم", time: "09:30 ص", status: "مكتملة", result: "متابعة", note: "مراجعة ملاحظات اللقاء السابق وتحديد موعد متابعة الأسبوع القادم.", checkedInAt: "09:33 ص", location: { latitude: 15.5542, longitude: 32.5331, accuracy: 28 }, isInsideTerritory: true },
    { id: "v2", accountId: "a2", date: "اليوم", time: "11:00 ص", status: "مجدولة" },
    { id: "v3", accountId: "a3", date: "اليوم", time: "01:15 م", status: "مجدولة" },
    { id: "v4", accountId: "a5", date: "اليوم", time: "03:30 م", status: "مجدولة" },
    { id: "v5", accountId: "a4", date: "غداً", time: "10:00 ص", status: "مجدولة" },
    { id: "v6", accountId: "a6", date: "الخميس", time: "12:30 م", status: "مجدولة" },
  ],
  plans: [
    { id: "p1", title: "خطة أسبوع 18 أغسطس", period: "18–22 أغسطس", kind: "أسبوعية", status: "معتمدة", repName: "محمد الأمين", visitIds: ["v1", "v2", "v3", "v4", "v5"], submittedAt: "16 أغسطس" },
    { id: "p2", title: "خطة سبتمبر الطبية", period: "سبتمبر 2026", kind: "شهرية", status: "بانتظار الاعتماد", repName: "أحمد فضل", visitIds: ["v2", "v3", "v6"], submittedAt: "14 أغسطس" },
    { id: "p3", title: "تغطية بحري", period: "18–22 أغسطس", kind: "أسبوعية", status: "معادة للمراجعة", repName: "سلمى الطيب", visitIds: ["v4", "v6"], managerNote: "يرجى توزيع الزيارات على أيام الأسبوع بدلاً من تركيزها في يومين.", submittedAt: "13 أغسطس" },
  ],
  territories: [
    { id: "t1", name: "العمارات والرياض", state: "ولاية الخرطوم", city: "الخرطوم", assignees: ["محمد الأمين", "أحمد فضل"], accounts: 34, coverage: 78 },
    { id: "t2", name: "بحري", state: "ولاية الخرطوم", city: "الخرطوم بحري", assignees: ["سلمى الطيب"], accounts: 21, coverage: 61 },
  ],
  visitResults: defaultVisitResults,
};

const CrmContext = createContext<CrmContextValue | null>(null);
const initialsFor = (name: string) => name.replace(/^(د\.|صيدلية|مستشفى|موزع)\s*/, "").split(" ").slice(0, 2).map((part) => part[0]).join(" ");

export function CrmProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<CrmData>(initialData);
  const [isReady, setIsReady] = useState(false);
  const [role, setRole] = useState<AppRole>("مندوب");
  useEffect(() => { AsyncStorage.getItem(STORAGE_KEY).then((saved) => { if (saved) { const parsed = JSON.parse(saved) as CrmData; setData({ ...initialData, ...parsed, accounts: parsed.accounts.map((account) => ({ ...account, state: account.state || stateForCity(account.city) })), visitResults: parsed.visitResults?.length ? parsed.visitResults : defaultVisitResults }); } }).catch(() => undefined).finally(() => setIsReady(true)); }, []);
  const commit = (updater: (current: CrmData) => CrmData) => setData((current) => { const next = updater(current); void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return next; });
  const value = useMemo<CrmContextValue>(() => ({
    data, isReady, role, setRole,
    accountById: (id) => data.accounts.find((account) => account.id === id),
    visitsForAccount: (accountId) => data.visits.filter((visit) => visit.accountId === accountId),
    addAccount: (account) => { const accents: Record<AccountType, string> = { طبيب: "#0F766E", صيدلية: "#B45309", مستشفى: "#2563EB", موزع: "#7C3AED" }; const created: Account = { ...account, id: `a-${Date.now()}`, lastVisit: "لم تتم زيارة", initials: initialsFor(account.name), accent: accents[account.type] }; commit((current) => ({ ...current, accounts: [created, ...current.accounts] })); },
    completeVisit: (visitId, completion) => commit((current) => ({ ...current, visits: current.visits.map((visit) => visit.id === visitId ? { ...visit, status: completion.isInsideTerritory ? "مكتملة" : "تحتاج مراجعة", result: completion.result, note: completion.note, location: completion.location, checkedInAt: new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }), isInsideTerritory: completion.isInsideTerritory } : visit) })),
    submitPlan: (input) => { const plan: Plan = { id: `p-${Date.now()}`, title: input.title, period: input.period, kind: input.kind, status: "بانتظار الاعتماد", repName: "محمد الأمين", visitIds: input.visitIds, schedule: input.schedule, submittedAt: "الآن" }; commit((current) => ({ ...current, plans: [plan, ...current.plans], visits: input.schedule ? current.visits.map((visit) => { const slot = input.schedule?.find((day) => day.visitIds.includes(visit.id)); return slot ? { ...visit, date: slot.label } : visit; }) : current.visits })); },
    approvePlan: (planId) => commit((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === planId ? { ...plan, status: "معتمدة", managerNote: undefined } : plan) })),
    returnPlan: (planId, note) => commit((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === planId ? { ...plan, status: "معادة للمراجعة", managerNote: note } : plan) })),
    addVisitResult: (label) => { const value = label.trim(); if (value) commit((current) => current.visitResults.includes(value) ? current : { ...current, visitResults: [...current.visitResults, value] }); },
  }), [data, isReady, role]);
  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}
export function useCrm() { const context = useContext(CrmContext); if (!context) throw new Error("useCrm must be used within CrmProvider"); return context; }
