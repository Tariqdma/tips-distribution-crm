import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type CompanyTeamSetupMember = {
  profileId: string;
  fullName: string;
  email: string;
  roleKey: string;
  reportsToProfileId: string | null;
  reportsToName: string | null;
  isActive: boolean;
};

export type CompanyTeamSetup = {
  members: CompanyTeamSetupMember[];
  salesSupervisors: CompanyTeamSetupMember[];
  medicalSupervisors: CompanyTeamSetupMember[];
  accountants: CompanyTeamSetupMember[];
  salesRepresentatives: CompanyTeamSetupMember[];
  medicalRepresentatives: CompanyTeamSetupMember[];
  eligibleSalesManagers: CompanyTeamSetupMember[];
  eligibleMedicalManagers: CompanyTeamSetupMember[];
  isTeamSetupStarted: boolean;
};

type TeamSetupRow = {
  profile_id: string;
  full_name: string;
  email: string;
  role_key: string;
  reports_to_profile_id: string | null;
  reports_to_name: string | null;
  is_active: boolean;
};

function requireConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("إعدادات فريق الشركة غير مكتملة.");
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

async function requireCompanyManager(authorization?: string) {
  const actorClient = createActorClient(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_my_profile_v2");
  const profile = (data as Array<{ role_key: string; active_company_id: string | null; is_platform_admin?: boolean }> | null)?.[0];
  const validRole = ["company_manager", "sales_manager", "system_admin"].includes(profile?.role_key ?? "");
  if (error || !profile?.active_company_id || profile.is_platform_admin || !validRole) throw new Error("هذه العملية مخصصة لمدير الشركة فقط.");
  return actorClient;
}

function mapMember(row: TeamSetupRow): CompanyTeamSetupMember {
  return {
    profileId: row.profile_id,
    fullName: row.full_name,
    email: row.email,
    roleKey: row.role_key,
    reportsToProfileId: row.reports_to_profile_id,
    reportsToName: row.reports_to_name,
    isActive: Boolean(row.is_active),
  };
}

export function buildCompanyTeamSetup(rows: TeamSetupRow[]): CompanyTeamSetup {
  const members = rows.filter((row) => row.is_active).map(mapMember);
  const byRole = (roleKey: string) => members.filter((member) => member.roleKey === roleKey);
  const salesSupervisors = byRole("sales_supervisor");
  const medicalSupervisors = byRole("medical_supervisor");
  const accountants = byRole("accountant");
  const salesRepresentatives = byRole("sales_rep");
  const medicalRepresentatives = byRole("medical_rep");
  const companyManagers = byRole("company_manager");
  return {
    members,
    salesSupervisors,
    medicalSupervisors,
    accountants,
    salesRepresentatives,
    medicalRepresentatives,
    eligibleSalesManagers: members.filter((member) => ["company_manager", "sales_supervisor"].includes(member.roleKey)),
    eligibleMedicalManagers: members.filter((member) => ["company_manager", "medical_supervisor"].includes(member.roleKey)),
    isTeamSetupStarted: salesSupervisors.length + medicalSupervisors.length + accountants.length + salesRepresentatives.length + medicalRepresentatives.length > 0,
  };
}

export async function getCompanyTeamSetup(authorization?: string): Promise<CompanyTeamSetup> {
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("get_company_team_setup");
  if (error) throw new Error("تعذر تحميل هيكل فريق الشركة. حدّث الصفحة ثم أعد المحاولة.");
  return buildCompanyTeamSetup((data ?? []) as TeamSetupRow[]);
}
