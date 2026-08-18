import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type ApproveCompanyRequestInput = {
  requestId: string;
  companySlug: string;
  managerFullName: string;
  managerEmail: string;
  managerPassword: string;
  planKey?: string;
};

export type CreateCompanyDirectInput = {
  companyName: string;
  companySlug: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  expectedUserCount?: number | null;
  notes?: string;
  managerFullName: string;
  managerEmail: string;
  managerPassword: string;
  planKey?: string;
};

export type ReviewCompanyRequestInput = {
  requestId: string;
  status: "rejected" | "cancelled";
  reviewNote?: string;
};

function requireConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) {
    throw new Error("إعدادات إدارة المنصة غير مكتملة.");
  }
}

function tokenFromHeader(authorization?: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("جلسة مدير المنصة مطلوبة لتنفيذ هذا الإجراء.");
  return token;
}

function validSlug(value: string) {
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(value);
}

function normalizeSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function validateApproval(input: ApproveCompanyRequestInput) {
  if (!input.requestId.trim()) return "معرّف طلب الشركة غير موجود.";
  if (input.managerFullName.trim().length < 2) return "اكتب الاسم الكامل لمدير الشركة.";
  if (!/^\S+@\S+\.\S+$/.test(input.managerEmail.trim())) return "اكتب بريداً إلكترونياً صحيحاً لمدير الشركة.";
  if (input.managerPassword.length < 8) return "كلمة المرور المؤقتة يجب أن تتكون من 8 أحرف على الأقل.";
  if (!validSlug(normalizeSlug(input.companySlug))) return "رمز الشركة يجب أن يتكون من أحرف إنجليزية صغيرة أو أرقام أو شرطات.";
  return null;
}

async function requirePlatformAdmin(authorization?: string) {
  requireConfig();
  const actorClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${tokenFromHeader(authorization)}` } },
  });
  const { data, error } = await actorClient.rpc("tips_crm_my_profile");
  const profile = (data as Array<{ id: string; is_platform_admin?: boolean }> | null)?.[0];
  if (error || !profile?.is_platform_admin) throw new Error("هذه العملية مخصصة لمدير المنصة فقط.");
  const adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return { actorClient, adminClient };
}

async function approvePreparedRequest(input: ApproveCompanyRequestInput, authorization?: string) {
  const validationError = validateApproval(input);
  if (validationError) throw new Error(validationError);
  const { actorClient, adminClient } = await requirePlatformAdmin(authorization);
  const email = input.managerEmail.trim().toLowerCase();
  const slug = normalizeSlug(input.companySlug);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: input.managerPassword,
    email_confirm: true,
    user_metadata: { full_name: input.managerFullName.trim() },
  });
  if (createError || !created.user) {
    if (createError?.message?.toLowerCase().includes("already")) throw new Error("يوجد حساب مسجل بهذا البريد الإلكتروني.");
    throw new Error("تعذر إنشاء حساب مدير الشركة.");
  }
  const { data: companyId, error: approvalError } = await actorClient.rpc("tips_crm_approve_company_request", {
    target_request_id: input.requestId,
    target_profile_id: created.user.id,
    approved_slug: slug,
    manager_full_name: input.managerFullName.trim(),
    manager_email: email,
    selected_plan_key: input.planKey?.trim() || "standard",
  });
  if (approvalError || !companyId) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    throw new Error("تعذر اعتماد الشركة وربط مديرها؛ لم يُحتفظ بحساب المدير.");
  }
  return { companyId: String(companyId), managerEmail: email, companySlug: slug };
}

export async function approveCompanyRequest(input: ApproveCompanyRequestInput, authorization?: string) {
  return approvePreparedRequest(input, authorization);
}

export async function createCompanyDirect(input: CreateCompanyDirectInput, authorization?: string) {
  if (input.companyName.trim().length < 2) throw new Error("اكتب اسم الشركة.");
  if (input.contactName.trim().length < 2) throw new Error("اكتب اسم جهة الاتصال.");
  if (!/^\S+@\S+\.\S+$/.test(input.contactEmail.trim())) throw new Error("اكتب بريد جهة اتصال صحيحاً.");
  const approvalError = validateApproval({
    requestId: "direct",
    companySlug: input.companySlug,
    managerFullName: input.managerFullName,
    managerEmail: input.managerEmail,
    managerPassword: input.managerPassword,
    planKey: input.planKey,
  });
  if (approvalError) throw new Error(approvalError);
  const { adminClient } = await requirePlatformAdmin(authorization);
  const { data: request, error: requestError } = await adminClient.schema("tips_crm").from("company_requests").insert({
    company_name: input.companyName.trim(),
    requested_slug: normalizeSlug(input.companySlug),
    contact_name: input.contactName.trim(),
    contact_email: input.contactEmail.trim().toLowerCase(),
    contact_phone: input.contactPhone?.trim() || null,
    expected_user_count: input.expectedUserCount ?? null,
    notes: input.notes?.trim() || null,
    status: "pending",
  }).select("id").single();
  if (requestError || !request) throw new Error("تعذر تجهيز الشركة الجديدة.");
  try {
    return await approvePreparedRequest({
      requestId: request.id,
      companySlug: input.companySlug,
      managerFullName: input.managerFullName,
      managerEmail: input.managerEmail,
      managerPassword: input.managerPassword,
      planKey: input.planKey,
    }, authorization);
  } catch (error) {
    await adminClient.schema("tips_crm").from("company_requests").delete().eq("id", request.id).eq("status", "pending");
    throw error;
  }
}

export async function reviewCompanyRequest(input: ReviewCompanyRequestInput, authorization?: string) {
  if (!input.requestId.trim()) throw new Error("معرّف طلب الشركة غير موجود.");
  const { actorClient } = await requirePlatformAdmin(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_review_company_request", {
    target_request_id: input.requestId,
    next_status: input.status,
    next_review_note: input.reviewNote?.trim() || null,
  });
  if (error || !data) throw new Error("تعذر تحديث حالة طلب الشركة. حدّث الصفحة ثم أعد المحاولة.");
  return true;
}
