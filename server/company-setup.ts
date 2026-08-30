import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type CompanyOperationalSetup = {
  companyId: string;
  companyName: string;
  legalName: string;
  activityType: string;
  businessPhone: string;
  supportEmail: string;
  timezone: string;
  workingDays: string[];
  workdayStartsAt: string;
  workdayEndsAt: string;
  gpsTrackingRequired: boolean;
  outsideVisitTracking: boolean;
  geofenceEnforcement: boolean;
  isSetupComplete: boolean;
  completedAt: string | null;
  territoryCount: number;
  teamMemberCount: number;
  accountCount: number;
};

export type SaveCompanyOperationalSetupInput = Omit<CompanyOperationalSetup, "companyId" | "timezone" | "isSetupComplete" | "completedAt" | "territoryCount" | "teamMemberCount" | "accountCount">;

function requireConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("إعدادات الشركة غير مكتملة.");
}

function tokenFromHeader(authorization?: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("جلسة مدير الشركة مطلوبة لتنفيذ هذا الإجراء.");
  return token;
}

function createActorClient(authorization?: string) {
  requireConfig();
  return createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${tokenFromHeader(authorization)}` } },
  });
}

export function validateCompanyOperationalSetup(input: Partial<SaveCompanyOperationalSetupInput>) {
  if (!input.companyName?.trim() || input.companyName.trim().length < 2) return "اكتب اسم الشركة بصورة صحيحة.";
  if (!input.activityType?.trim() || input.activityType.trim().length < 2) return "اكتب طبيعة نشاط الشركة.";
  if (!input.workingDays?.length) return "اختر يوماً واحداً على الأقل للعمل.";
  if (!input.workdayStartsAt || !input.workdayEndsAt || input.workdayStartsAt >= input.workdayEndsAt) return "تحقق من وقت بداية ونهاية الدوام.";
  if (input.supportEmail?.trim() && !/^\S+@\S+\.\S+$/.test(input.supportEmail.trim())) return "اكتب بريد دعم صحيحاً أو اترك الحقل فارغاً.";
  return null;
}

async function requireCompanyManager(authorization?: string) {
  const actorClient = createActorClient(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_my_profile_v2");
  const profile = (data as Array<{ role_key: string; active_company_id: string | null; is_platform_admin?: boolean }> | null)?.[0];
  const validRole = ["company_manager", "sales_manager", "system_admin"].includes(profile?.role_key ?? "");
  if (error || !profile?.active_company_id || profile.is_platform_admin || !validRole) throw new Error("هذه العملية مخصصة لمدير الشركة فقط.");
  return actorClient;
}

function mapSetup(row: Record<string, unknown>): CompanyOperationalSetup {
  return {
    companyId: String(row.company_id ?? ""), companyName: String(row.company_name ?? ""), legalName: String(row.legal_name ?? ""), activityType: String(row.activity_type ?? ""), businessPhone: String(row.business_phone ?? ""), supportEmail: String(row.support_email ?? ""), timezone: String(row.timezone ?? "Africa/Khartoum"), workingDays: Array.isArray(row.working_days) ? row.working_days.map(String) : [], workdayStartsAt: String(row.workday_starts_at ?? "08:00"), workdayEndsAt: String(row.workday_ends_at ?? "17:00"), gpsTrackingRequired: Boolean(row.gps_tracking_required), outsideVisitTracking: Boolean(row.outside_visit_tracking), geofenceEnforcement: Boolean(row.geofence_enforcement), isSetupComplete: Boolean(row.is_setup_complete), completedAt: row.completed_at ? String(row.completed_at) : null, territoryCount: Number(row.territory_count ?? 0), teamMemberCount: Number(row.team_member_count ?? 0), accountCount: Number(row.account_count ?? 0),
  };
}

export async function getCompanyOperationalSetup(authorization?: string) {
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_get_company_operational_setup");
  const row = (data as Array<Record<string, unknown>> | null)?.[0];
  if (error || !row) throw new Error("تعذر تحميل إعدادات الشركة. حدّث الصفحة ثم أعد المحاولة.");
  return mapSetup(row);
}

export async function saveCompanyOperationalSetup(input: SaveCompanyOperationalSetupInput, authorization?: string) {
  const validationError = validateCompanyOperationalSetup(input);
  if (validationError) throw new Error(validationError);
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_save_company_operational_setup", {
    input_company_name: input.companyName.trim(),
    input_legal_name: String(input.legalName ?? "").trim(),
    input_activity_type: input.activityType.trim(),
    input_business_phone: String(input.businessPhone ?? "").trim(),
    input_support_email: String(input.supportEmail ?? "").trim(),
    input_working_days: input.workingDays,
    input_workday_starts_at: input.workdayStartsAt,
    input_workday_ends_at: input.workdayEndsAt,
    input_gps_tracking_required: input.gpsTrackingRequired,
    input_outside_visit_tracking: input.outsideVisitTracking,
    input_geofence_enforcement: input.geofenceEnforcement,
  });
  if (error || !data) throw new Error("تعذر حفظ إعدادات الشركة. تأكد من البيانات ثم حاول مرة أخرى.");
  return getCompanyOperationalSetup(authorization);
}
