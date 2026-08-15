import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export const EMPLOYEE_ROLE_KEYS = ["sales_manager", "sales_rep", "medical_rep"] as const;
export type EmployeeRoleKey = (typeof EMPLOYEE_ROLE_KEYS)[number];

export type TemporaryEmployeeInput = {
  fullName: string;
  email: string;
  password: string;
  roleKey: EmployeeRoleKey;
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

export function validateTemporaryEmployeeInput(input: TemporaryEmployeeInput) {
  if (input.fullName.trim().length < 2) return "اكتب الاسم الكامل للموظف.";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return "اكتب بريداً إلكترونياً صحيحاً.";
  if (input.password.length < 8) return "كلمة المرور المؤقتة يجب أن تتكون من 8 أحرف على الأقل.";
  if (!EMPLOYEE_ROLE_KEYS.includes(input.roleKey)) return "الدور المحدد غير متاح لإنشاء حساب موظف.";
  const territoryIds = input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : []);
  if (input.roleKey !== "sales_manager" && territoryIds.length === 0) return "اختر منطقة عمل واحدة على الأقل للمندوب.";
  return null;
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
  const { data: profileRows, error: profileError } = await actorClient.rpc("tips_crm_my_profile");
  if (profileError) throw new Error("تعذر التحقق من صلاحية الإدارة.");
  const actorProfile = (profileRows as Array<{ id: string; permissions: string[] }> | null)?.[0];
  if (!actorProfile?.permissions?.some((permission) => permission === "all" || permission === "manage_users")) {
    throw new Error("لا تملك صلاحية إدارة حسابات الموظفين.");
  }
  const adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { actorProfile, adminClient };
}

export async function createTemporaryEmployeeAccount(input: TemporaryEmployeeInput, authorization?: string) {
  const validationError = validateTemporaryEmployeeInput(input);
  if (validationError) throw new Error(validationError);

  const { actorProfile, adminClient } = await requireUserManager(authorization);
  const normalizedEmail = input.email.trim().toLowerCase();
  const territoryKeys = Array.from(new Set(input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : [])));
  const submittedLabels = input.territoryLabels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const territoryLabelsFromInput = submittedLabels.length ? submittedLabels : (input.territoryLabel ?? "").split("،").map((label) => label.trim()).filter(Boolean);
  const uuidTerritoryKeys = territoryKeys.filter((key) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key));
  const [byClientKey, byId, byName] = await Promise.all([
    territoryKeys.length ? adminClient.schema("tips_crm").from("territories").select("id,name,client_key").in("client_key", territoryKeys).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
    uuidTerritoryKeys.length ? adminClient.schema("tips_crm").from("territories").select("id,name,client_key").in("id", uuidTerritoryKeys).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
    territoryLabelsFromInput.length ? adminClient.schema("tips_crm").from("territories").select("id,name,client_key").in("name", territoryLabelsFromInput).eq("is_active", true) : Promise.resolve({ data: [], error: null }),
  ]);
  if (byClientKey.error || byId.error || byName.error) throw new Error("تعذر التحقق من مناطق العمل المعتمدة. حدّث الصفحة ثم أعد المحاولة.");
  const territories = [...(byClientKey.data ?? []), ...(byId.data ?? []), ...(byName.data ?? [])].filter((territory, index, all) => all.findIndex((item) => item.id === territory.id) === index);
  const sortedTerritories = territoryKeys.map((territoryKey, index) => territories.find((territory) => territory.client_key === territoryKey || territory.id === territoryKey || territory.name === territoryLabelsFromInput[index])).filter((territory): territory is NonNullable<typeof territory> => Boolean(territory));
  if (territoryKeys.length && sortedTerritories.length !== territoryKeys.length) throw new Error("إحدى مناطق العمل لم تعد متاحة. حدّث قائمة المناطق ثم اختر مناطق معتمدة.");
  const territoryLabels = sortedTerritories.map((territory) => territory.name);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), territory_id: territoryKeys[0] ?? null, territory_ids: territoryKeys, territory_label: territoryLabels.join("، ") || (input.territoryLabel?.trim() || null), territory_labels: territoryLabels },
  });

  if (createError || !created.user) {
    const detail = createError?.message?.toLowerCase().includes("already") ? "يوجد حساب مسجل بهذا البريد الإلكتروني." : "تعذر إنشاء حساب الموظف.";
    throw new Error(detail);
  }

  const { error: profileUpdateError } = await adminClient.schema("tips_crm").from("profiles").update({
    full_name: input.fullName.trim(),
    email: normalizedEmail,
    role_key: input.roleKey,
    must_change_password: input.forcePasswordChange,
    temporary_password_issued_at: new Date().toISOString(),
  }).eq("id", created.user.id);
  if (profileUpdateError) throw new Error("تم إنشاء الحساب لكن تعذر تعيين صلاحيات الموظف.");
  if (sortedTerritories.length) {
    const { error: assignmentError } = await adminClient.schema("tips_crm").from("territory_assignments").upsert(sortedTerritories.map((territory) => ({ territory_id: territory.id, profile_id: created.user.id, assigned_by: actorProfile.id })), { onConflict: "territory_id,profile_id" });
    if (assignmentError) throw new Error("تم إنشاء الحساب لكن تعذر ربطه بمناطق العمل المحددة.");
  }

  await adminClient.schema("tips_crm").from("audit_log").insert({
    actor_id: actorProfile.id,
    action: "employee_account_created",
    entity_type: "profile",
    entity_id: created.user.id,
    details: { email: normalizedEmail, role_key: input.roleKey, territory_keys: territoryKeys, territory_labels: territoryLabels, force_password_change: input.forcePasswordChange },
  });

  return { id: created.user.id, email: normalizedEmail, fullName: input.fullName.trim(), roleKey: input.roleKey, forcePasswordChange: input.forcePasswordChange };
}

export async function listEmployeeAccounts(authorization?: string): Promise<EmployeeDirectoryEntry[]> {
  const { adminClient } = await requireUserManager(authorization);
  const [profilesResponse, usersResponse] = await Promise.all([
    adminClient.schema("tips_crm").from("profiles").select("id,full_name,email,role_key,must_change_password,temporary_password_issued_at").order("full_name", { ascending: true }),
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
  const { actorProfile, adminClient } = await requireUserManager(authorization);
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
