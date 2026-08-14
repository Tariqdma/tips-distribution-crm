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

export async function createTemporaryEmployeeAccount(input: TemporaryEmployeeInput, authorization?: string) {
  requireAdminConfig();
  const validationError = validateTemporaryEmployeeInput(input);
  if (validationError) throw new Error(validationError);

  const accessToken = accessTokenFromHeader(authorization);
  const actorClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: profileRows, error: profileError } = await actorClient.rpc("tips_crm_my_profile");
  if (profileError) throw new Error("تعذر التحقق من صلاحية الإدارة.");
  const actorProfile = (profileRows as Array<{ id: string; permissions: string[] }> | null)?.[0];
  if (!actorProfile?.permissions?.some((permission) => permission === "all" || permission === "manage_users")) {
    throw new Error("لا تملك صلاحية إنشاء حسابات الموظفين.");
  }

  const adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
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
