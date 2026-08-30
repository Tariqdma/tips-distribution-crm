import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export const EMPLOYEE_ROLE_KEYS = ["sales_manager", "company_manager", "sales_supervisor", "medical_supervisor", "accountant", "sales_rep", "medical_rep"] as const;
export type EmployeeRoleKey = (typeof EMPLOYEE_ROLE_KEYS)[number];

export type TemporaryEmployeeInput = {
  fullName: string;
  email: string;
  password: string;
  roleKey: EmployeeRoleKey;
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
export type AvailableTerritory = { client_key: string | null; name: string };

export function validateTemporaryEmployeeInput(input: TemporaryEmployeeInput) {
  if (input.fullName.trim().length < 2) return "اكتب الاسم الكامل للموظف.";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return "اكتب بريداً إلكترونياً صحيحاً.";
  if (input.password.length < 8) return "كلمة المرور المؤقتة يجب أن تتكون من 8 أحرف على الأقل.";
  if (!EMPLOYEE_ROLE_KEYS.includes(input.roleKey)) return "الدور المحدد غير متاح لإنشاء حساب موظف.";
  const territoryIds = input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : []);
  if ((input.roleKey === "sales_rep" || input.roleKey === "medical_rep") && territoryIds.length === 0) return "اختر منطقة عمل واحدة على الأقل للمندوب.";
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

function accessTokenFromHeader(authorization?: string) {
  const match = authorization?.match(/^Bearer\s+(.+)$/i);
  if (!match?.[1]) throw new Error("جلسة الإدارة مطلوبة لإنشاء حساب الموظف.");
  return match[1];
}

function validateResetEmployeePasswordInput(input: ResetEmployeePasswordInput) {
  if (input.password.length < 8) return "كلمة المرور المؤقتة يجب أن تتكون من 8 أحرف على الأقل.";
  return null;
}

async function requireUserManager(authorization?: string) {
  requireAdminConfig();
  const accessToken = accessTokenFromHeader(authorization);
  const actorClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: profileRows, error: profileError } = await actorClient.rpc("tips_crm_my_profile_v2");
  if (profileError) throw new Error("تعذر التحقق من صلاحية الإدارة.");
  const actorProfile = (profileRows as Array<{ id: string; permissions: string[]; active_company_id: string | null }> | null)?.[0];
  if (!actorProfile?.permissions?.some((permission) => permission === "all" || permission === "manage_users")) {
    throw new Error("لا تملك صلاحية إدارة حسابات الموظفين.");
  }
  if (!actorProfile.active_company_id) throw new Error("اختر الشركة النشطة قبل إدارة الحسابات.");
  const adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { actorClient, actorProfile, adminClient, activeCompanyId: actorProfile.active_company_id };
}

export async function createTemporaryEmployeeAccount(input: TemporaryEmployeeInput, authorization?: string) {
  const validationError = validateTemporaryEmployeeInput(input);
  if (validationError) throw new Error(validationError);

  const { actorClient, adminClient, activeCompanyId } = await requireUserManager(authorization);

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

  const finalizeParameters = {
    target_profile_id: created.user.id,
    employee_full_name: input.fullName.trim(),
    employee_email: normalizedEmail,
    employee_role_key: input.roleKey,
    employee_territory_keys: resolvedTerritories.keys,
    employee_force_password_change: input.forcePasswordChange,
  };
  const { error: finalizeError } = await actorClient.rpc("tips_crm_finalize_employee_account", input.reportsToProfileId ? { ...finalizeParameters, employee_reports_to_profile_id: input.reportsToProfileId } : finalizeParameters);
  if (finalizeError) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    throw new Error("تعذر تعيين صلاحيات الموظف ومناطق عمله؛ لم يُحتفظ بالحساب.");
  }

  return { id: created.user.id, email: normalizedEmail, fullName: input.fullName.trim(), roleKey: input.roleKey, forcePasswordChange: input.forcePasswordChange };
}

export async function listEmployeeAccounts(authorization?: string): Promise<EmployeeDirectoryEntry[]> {
  const { adminClient, activeCompanyId } = await requireUserManager(authorization);
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
  const { actorProfile, adminClient, activeCompanyId } = await requireUserManager(authorization);
  const { data: membership, error: membershipError } = await adminClient.schema("tips_crm").from("company_memberships").select("profile_id").eq("company_id", activeCompanyId).eq("profile_id", employeeId).eq("is_active", true).maybeSingle();
  if (membershipError || !membership) throw new Error("حساب الموظف غير موجود ضمن الشركة النشطة.");
  const { data: targetProfile, error: profileError } = await adminClient.schema("tips_crm").from("profiles").select("id,email,full_name").eq("id", employeeId).maybeSingle();
  if (profileError || !targetProfile) throw new Error("حساب الموظف غير موجود.");
  const { error: updateError } = await adminClient.auth.admin.updateUserById(employeeId, { password: input.password, email_confirm: true });
  if (updateError) throw new Error("تعذر تحديث كلمة مرور الموظف.");
  const { error: profileUpdateError } = await adminClient.schema("tips_crm").from("profiles").update({ must_change_password: input.forcePasswordChange, temporary_password_issued_at: new Date().toISOString() }).eq("id", employeeId);
  if (profileUpdateError) throw new Error("تم تحديث كلمة المرور لكن تعذر تحديث حالة الحساب.");
  await adminClient.schema("tips_crm").from("audit_log").insert({ actor_id: actorProfile.id, action: "employee_password_reset", entity_type: "profile", entity_id: employeeId, details: { email: targetProfile.email, force_password_change: input.forcePasswordChange } });
  return { id: employeeId, email: targetProfile.email, fullName: targetProfile.full_name, forcePasswordChange: input.forcePasswordChange };
}

export { validateResetEmployeePasswordInput };
