import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Discipline } from "../shared/auth/legacy-role-key";
import { canGrant } from "../shared/auth/resolve";
import { SYSTEM_ROLE_PERMISSIONS, type SystemRoleName } from "../shared/auth/roles";
import { requireCompanyPermission } from "./_core/authorize";
import { ENV } from "./_core/env";

// owner is deliberately excluded: ownership is assigned deliberately, never handed out
// through the staff-creation flow (docs/authorization-model.md "System Role bundles").
export const CREATABLE_ROLES = ["manager", "supervisor", "rep", "accountant"] as const satisfies readonly SystemRoleName[];
export type CreatableRole = (typeof CREATABLE_ROLES)[number];

export const DISCIPLINES = ["sales", "medical"] as const satisfies readonly Discipline[];

export type TemporaryEmployeeInput = {
  fullName: string;
  email: string;
  password: string;
  role: CreatableRole;
  disciplines: Discipline[];
  reportsToProfileId?: string;
  territoryLabel?: string;
  territoryLabels?: string[];
  territoryId?: string;
  territoryIds?: string[];
  forcePasswordChange: boolean;
};

export type EmployeeDirectoryEntry = {
  id: string;
  fullName: string;
  email: string;
  roleKey: string;
  mustChangePassword: boolean;
  temporaryPasswordIssuedAt: string | null;
  lastSignedInAt: string | null;
  emailConfirmed: boolean;
};

export type ResetEmployeePasswordInput = { password: string; forcePasswordChange: boolean };
export type AvailableTerritory = { id: string; client_key: string | null; name: string };

export function validateTemporaryEmployeeInput(input: TemporaryEmployeeInput) {
  if (input.fullName.trim().length < 2) return "اكتب الاسم الكامل للموظف.";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return "اكتب بريداً إلكترونياً صحيحاً.";
  if (input.password.length < 8) return "كلمة المرور المؤقتة يجب أن تتكون من 8 أحرف على الأقل.";
  if (!CREATABLE_ROLES.includes(input.role)) return "الدور المحدد غير متاح لإنشاء حساب موظف.";
  const disciplines = Array.from(new Set(input.disciplines ?? []));
  if (!disciplines.every((discipline) => (DISCIPLINES as readonly string[]).includes(discipline))) return "الاختصاص المحدد غير صحيح.";
  const needsOneDiscipline = input.role === "rep" || input.role === "supervisor";
  if (needsOneDiscipline && disciplines.length !== 1) return "اختر اختصاصاً واحداً (مبيعات أو طبي) لهذا الدور.";
  if (!needsOneDiscipline && disciplines.length !== 0) return "هذا الدور لا يقبل تحديد اختصاص.";
  const territoryIds = input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : []);
  if (input.role === "rep" && territoryIds.length === 0) return "اختر منطقة عمل واحدة على الأقل للمندوب.";
  return null;
}

export function resolveEmployeeTerritories(territoryKeys: string[], territoryLabels: string[], availableTerritories: AvailableTerritory[]) {
  const selected = territoryKeys.map((territoryKey, index) => availableTerritories.find((territory) => territory.client_key === territoryKey || territory.name === territoryLabels[index])).filter((territory): territory is AvailableTerritory & { client_key: string } => Boolean(territory?.client_key));
  return { selected, keys: selected.map((territory) => territory.client_key), labels: selected.map((territory) => territory.name) };
}

function requireAdminConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) {
    throw new Error("إعدادات إنشاء حسابات الموظفين غير مكتملة.");
  }
}

function validateResetEmployeePasswordInput(input: ResetEmployeePasswordInput) {
  if (input.password.length < 8) return "كلمة المرور المؤقتة يجب أن تتكون من 8 أحرف على الأقل.";
  return null;
}

// Shared with the rest of server/: employee.manage is read from membership_permissions
// (materialized by trigger), not from the actor's own single-role legacy permissions column.
async function requireEmployeeManager(authorization?: string) {
  requireAdminConfig();
  const actor = await requireCompanyPermission(authorization, "employee.manage", {
    configMissing: "إعدادات إنشاء حسابات الموظفين غير مكتملة.",
    sessionRequired: "جلسة الإدارة مطلوبة لإنشاء حساب الموظف.",
    rpcError: () => "تعذر التحقق من صلاحية الإدارة.",
    profileMissing: "تعذر التحقق من صلاحية الإدارة.",
    permissionDenied: "لا تملك صلاحية إدارة حسابات الموظفين.",
    noActiveCompany: "اختر الشركة النشطة قبل إدارة الحسابات.",
  });
  const actorId = actor.profile.id;
  if (typeof actorId !== "string" || !actorId) throw new Error("تعذر التحقق من صلاحية الإدارة.");
  const adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { actorClient: actor.actorClient, actorPermissions: actor.permissions, actorId, adminClient, activeCompanyId: actor.activeCompanyId };
}

async function rollbackEmployeeCreation(adminClient: SupabaseClient, userId: string): Promise<never> {
  await adminClient.auth.admin.deleteUser(userId);
  throw new Error("تعذر تعيين صلاحيات الموظف ومناطق عمله؛ لم يُحتفظ بالحساب.");
}

export async function createTemporaryEmployeeAccount(input: TemporaryEmployeeInput, authorization?: string) {
  const validationError = validateTemporaryEmployeeInput(input);
  if (validationError) throw new Error(validationError);

  const { actorClient, actorPermissions, actorId: managerId, adminClient, activeCompanyId } = await requireEmployeeManager(authorization);

  const targetPermissions = SYSTEM_ROLE_PERMISSIONS[input.role];
  if (!canGrant(actorPermissions, targetPermissions)) {
    throw new Error("الدور المحدد غير متاح لإنشاء حساب موظف.");
  }

  // Check company user limit before creating account
  const [companyRes, membershipCountRes] = await Promise.all([
    adminClient.schema("tips_crm").from("companies").select("max_user_limit, payment_tier_key").eq("id", activeCompanyId).maybeSingle(),
    adminClient.schema("tips_crm").from("company_memberships").select("id", { count: "exact", head: true }).eq("company_id", activeCompanyId).eq("is_active", true),
  ]);

  const maxLimit = companyRes.data?.max_user_limit ?? 20;
  const currentCount = membershipCountRes.count ?? 0;

  if (currentCount >= maxLimit) {
    throw new Error(`تجاوزت الشركة الحد الأقصى المسموح به من الموظفين في باقتها الحالية (الحد المسموح: ${maxLimit} موظف / المسجل حالياً: ${currentCount}). تواصل مع مدير المنصة لترقية الباقة أو زيادة السعة.`);
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const disciplines = Array.from(new Set(input.disciplines ?? []));
  const territoryKeys = Array.from(new Set(input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : [])));
  const submittedLabels = input.territoryLabels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const territoryLabelsFromInput = submittedLabels.length ? submittedLabels : (input.territoryLabel ?? "").split("،").map((label) => label.trim()).filter(Boolean);
  const { data: availableTerritories, error: territoriesError } = await actorClient.rpc("tips_crm_list_territories");
  if (territoriesError) throw new Error("تعذر التحقق من مناطق العمل المعتمدة. حدّث الصفحة ثم أعد المحاولة.");
  const resolvedTerritories = resolveEmployeeTerritories(territoryKeys, territoryLabelsFromInput, (availableTerritories ?? []) as AvailableTerritory[]);
  if (territoryKeys.length && resolvedTerritories.selected.length !== territoryKeys.length) throw new Error("إحدى مناطق العمل لم تعد متاحة. حدّث قائمة المناطق ثم اختر مناطق معتمدة.");
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), territory_id: resolvedTerritories.keys[0] ?? null, territory_ids: resolvedTerritories.keys, territory_label: resolvedTerritories.labels.join("، ") || (input.territoryLabel?.trim() || null), territory_labels: resolvedTerritories.labels },
  });

  if (createError || !created.user) {
    const detail = createError?.message?.toLowerCase().includes("already") ? "يوجد حساب مسجل بهذا البريد الإلكتروني." : "تعذر إنشاء حساب الموظف.";
    throw new Error(detail);
  }

  // The auth trigger already inserted a default profiles row for created.user.id; write the
  // Role and Discipline set directly. company_memberships must be written before
  // membership_roles: the recompute trigger on membership_roles reads membership_roles joined
  // to roles for that (company_id, profile_id) pair, which requires the membership row to
  // already exist. membership_permissions itself is never written here — the trigger derives it.
  const { error: profileError } = await adminClient.schema("tips_crm").from("profiles").update({
    full_name: input.fullName.trim(),
    email: normalizedEmail,
    role_key: input.role,
    must_change_password: input.forcePasswordChange,
    temporary_password_issued_at: new Date().toISOString(),
  }).eq("id", created.user.id);
  if (profileError) return rollbackEmployeeCreation(adminClient, created.user.id);

  const { error: membershipError } = await adminClient.schema("tips_crm").from("company_memberships").insert({
    company_id: activeCompanyId,
    profile_id: created.user.id,
    role_key: input.role,
    disciplines,
    is_active: true,
    reports_to_profile_id: input.reportsToProfileId ?? null,
  });
  if (membershipError) return rollbackEmployeeCreation(adminClient, created.user.id);

  const { error: roleError } = await adminClient.schema("tips_crm").from("membership_roles").insert({
    company_id: activeCompanyId,
    profile_id: created.user.id,
    role_key: input.role,
    granted_by: managerId,
  });
  if (roleError) return rollbackEmployeeCreation(adminClient, created.user.id);

  if (resolvedTerritories.selected.length) {
    const { error: territoryInsertError } = await adminClient.schema("tips_crm").from("territory_assignments").insert(
      resolvedTerritories.selected.map((territory) => ({ territory_id: territory.id, profile_id: created.user.id, company_id: activeCompanyId, assigned_by: managerId }))
    );
    if (territoryInsertError) return rollbackEmployeeCreation(adminClient, created.user.id);
  }

  await adminClient.schema("tips_crm").from("audit_log").insert({ actor_id: managerId, action: "employee_account_created", entity_type: "profile", entity_id: created.user.id, details: { email: normalizedEmail, role_key: input.role, disciplines, territory_keys: resolvedTerritories.keys, force_password_change: input.forcePasswordChange } });

  return { id: created.user.id, email: normalizedEmail, fullName: input.fullName.trim(), role: input.role, disciplines, forcePasswordChange: input.forcePasswordChange };
}

export async function listEmployeeAccounts(authorization?: string): Promise<EmployeeDirectoryEntry[]> {
  const { adminClient, activeCompanyId } = await requireEmployeeManager(authorization);
  const { data: membershipRows, error: membershipsError } = await adminClient.schema("tips_crm").from("company_memberships").select("profile_id").eq("company_id", activeCompanyId).eq("is_active", true);
  if (membershipsError) throw new Error("تعذر التحقق من عضويات الشركة.");
  const profileIds = (membershipRows ?? []).map((membership) => membership.profile_id);
  if (!profileIds.length) return [];
  const [profilesResponse, usersResponse] = await Promise.all([
    adminClient.schema("tips_crm").from("profiles").select("id,full_name,email,role_key,must_change_password,temporary_password_issued_at").in("id", profileIds).order("full_name", { ascending: true }),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 200 }),
  ]);
  if (profilesResponse.error || usersResponse.error) throw new Error("تعذر تحميل دليل حسابات الموظفين.");
  const usersById = new Map((usersResponse.data.users ?? []).map((user) => [user.id, user]));
  return (profilesResponse.data ?? []).map((profile) => {
    const user = usersById.get(profile.id);
    return {
      id: profile.id,
      fullName: profile.full_name,
      email: profile.email,
      roleKey: profile.role_key,
      mustChangePassword: Boolean(profile.must_change_password),
      temporaryPasswordIssuedAt: profile.temporary_password_issued_at ?? null,
      lastSignedInAt: user?.last_sign_in_at ?? null,
      emailConfirmed: Boolean(user?.email_confirmed_at),
    };
  });
}

export async function resetEmployeePassword(employeeId: string, input: ResetEmployeePasswordInput, authorization?: string) {
  const validationError = validateResetEmployeePasswordInput(input);
  if (validationError) throw new Error(validationError);
  const { actorId: managerId, adminClient, activeCompanyId } = await requireEmployeeManager(authorization);
  const { data: membership, error: membershipError } = await adminClient.schema("tips_crm").from("company_memberships").select("profile_id").eq("company_id", activeCompanyId).eq("profile_id", employeeId).eq("is_active", true).maybeSingle();
  if (membershipError || !membership) throw new Error("حساب الموظف غير موجود ضمن الشركة النشطة.");
  const { data: targetProfile, error: profileError } = await adminClient.schema("tips_crm").from("profiles").select("id,email,full_name").eq("id", employeeId).maybeSingle();
  if (profileError || !targetProfile) throw new Error("حساب الموظف غير موجود.");
  const { error: updateError } = await adminClient.auth.admin.updateUserById(employeeId, { password: input.password, email_confirm: true });
  if (updateError) throw new Error("تعذر تحديث كلمة مرور الموظف.");
  const { error: profileUpdateError } = await adminClient.schema("tips_crm").from("profiles").update({ must_change_password: input.forcePasswordChange, temporary_password_issued_at: new Date().toISOString() }).eq("id", employeeId);
  if (profileUpdateError) throw new Error("تم تحديث كلمة المرور لكن تعذر تحديث حالة الحساب.");
  await adminClient.schema("tips_crm").from("audit_log").insert({ actor_id: managerId, action: "employee_password_reset", entity_type: "profile", entity_id: employeeId, details: { email: targetProfile.email, force_password_change: input.forcePasswordChange } });
  return { id: employeeId, email: targetProfile.email, fullName: targetProfile.full_name, forcePasswordChange: input.forcePasswordChange };
}

export { validateResetEmployeePasswordInput };
