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
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), territory_label: input.territoryLabel?.trim() || null },
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

  await adminClient.schema("tips_crm").from("audit_log").insert({
    actor_id: actorProfile.id,
    action: "employee_account_created",
    entity_type: "profile",
    entity_id: created.user.id,
    details: { email: normalizedEmail, role_key: input.roleKey, territory_label: input.territoryLabel?.trim() || null, force_password_change: input.forcePasswordChange },
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
