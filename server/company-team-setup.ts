import { legacyRolesFor } from "../shared/auth/legacy";
import { requireCompanyPermission } from "./_core/authorize";

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

async function requireCompanyManager(authorization?: string) {
  const deniedMessage = "هذه العملية مخصصة لمدير الشركة فقط.";
  const actor = await requireCompanyPermission(authorization, "employee.manage", {
    configMissing: "إعدادات فريق الشركة غير مكتملة.",
    sessionRequired: "جلسة مدير الشركة مطلوبة لتنفيذ هذا الإجراء.",
    rpcError: () => deniedMessage,
    profileMissing: deniedMessage,
    permissionDenied: deniedMessage,
    noActiveCompany: deniedMessage,
  });
  return actor.actorClient;
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
  const eligibleForDiscipline = (discipline: "sales" | "medical") =>
    members.filter((member) => {
      const { roles, disciplines } = legacyRolesFor({ roleKey: member.roleKey });
      return roles.includes("manager") || (roles.includes("supervisor") && disciplines.includes(discipline));
    });
  return {
    members,
    salesSupervisors,
    medicalSupervisors,
    accountants,
    salesRepresentatives,
    medicalRepresentatives,
    eligibleSalesManagers: eligibleForDiscipline("sales"),
    eligibleMedicalManagers: eligibleForDiscipline("medical"),
    isTeamSetupStarted: salesSupervisors.length + medicalSupervisors.length + accountants.length + salesRepresentatives.length + medicalRepresentatives.length > 0,
  };
}

export async function getCompanyTeamSetup(authorization?: string): Promise<CompanyTeamSetup> {
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("get_company_team_setup");
  if (error) throw new Error("تعذر تحميل هيكل فريق الشركة. حدّث الصفحة ثم أعد المحاولة.");
  return buildCompanyTeamSetup((data ?? []) as TeamSetupRow[]);
}
