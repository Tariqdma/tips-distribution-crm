import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";
import { sendApprovalEmail, sendInfoRequestedEmail, sendManagerInvitationEmail, sendRejectionEmail, sendRequestReceivedEmail } from "./company-onboarding-email";

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
  activityType?: string;
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

export type RequestInformationInput = { requestId: string; informationNeeded: string };
export type AddRequestNoteInput = { requestId: string; noteText: string };
export type PublicCompanyRequestInput = {
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  expectedUserCount?: number | null;
  notes?: string;
  activityType?: string;
};

type PlatformRequest = {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  status: string;
  approved_company_id: string | null;
  manager_profile_id: string | null;
};

type ManagerProfile = { full_name: string; email: string };

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

function referenceNumber(requestId: string) {
  return requestId.slice(0, 8).toUpperCase();
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

async function getPlatformRequest(adminClient: SupabaseClient, requestId: string) {
  const { data, error } = await adminClient.schema("tips_crm").from("company_requests")
    .select("id,company_name,contact_name,contact_email,status,approved_company_id,manager_profile_id")
    .eq("id", requestId)
    .maybeSingle();
  if (error || !data) throw new Error("طلب الشركة غير موجود.");
  return data as PlatformRequest;
}

async function getManagerProfile(adminClient: SupabaseClient, managerProfileId: string | null) {
  if (!managerProfileId) throw new Error("حساب مدير الشركة غير متاح لإرسال الدعوة.");
  const { data, error } = await adminClient.schema("tips_crm").from("profiles").select("full_name,email").eq("id", managerProfileId).maybeSingle();
  if (error || !data?.email) throw new Error("بيانات بريد مدير الشركة غير متاحة.");
  return data as ManagerProfile;
}

async function sendManagerSetupInvitation(adminClient: SupabaseClient, request: PlatformRequest, manager: ManagerProfile) {
  const delivery = await sendManagerInvitationEmail({
    requestId: request.id,
    recipientEmail: manager.email,
    recipientName: manager.full_name,
    companyName: request.company_name,
    referenceNumber: referenceNumber(request.id),
  });
  const { error } = await adminClient.schema("tips_crm").from("company_requests").update({
    status: "invitation_sent",
    invitation_sent_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", request.id).in("status", ["approved", "invitation_sent"]);
  if (error) throw new Error("تم إرسال الدعوة لكن تعذر حفظ حالتها. حدّث الصفحة للتحقق.");
  return delivery;
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

  const request = await getPlatformRequest(adminClient, input.requestId);
  const delivery = { approvalEmail: false, managerInvitation: false, warnings: [] as string[] };
  try {
    await sendApprovalEmail({
      requestId: request.id,
      recipientEmail: request.contact_email,
      recipientName: request.contact_name,
      companyName: request.company_name,
      referenceNumber: referenceNumber(request.id),
    });
    delivery.approvalEmail = true;
  } catch (error) {
    delivery.warnings.push(error instanceof Error ? error.message : "تعذر إرسال رسالة الاعتماد.");
  }
  try {
    await sendManagerSetupInvitation(adminClient, request, { full_name: input.managerFullName.trim(), email });
    delivery.managerInvitation = true;
  } catch (error) {
    delivery.warnings.push(error instanceof Error ? error.message : "تعذر إرسال دعوة مدير الشركة.");
  }
  return { companyId: String(companyId), managerEmail: email, companySlug: slug, delivery };
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
    activity_type: input.activityType?.trim() || null,
    status: "submitted",
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
    await adminClient.schema("tips_crm").from("company_requests").delete().eq("id", request.id).eq("status", "submitted");
    throw error;
  }
}

export async function addRequestNote(input: AddRequestNoteInput, authorization?: string) {
  if (!input.requestId.trim()) throw new Error("معرّف طلب الشركة غير موجود.");
  if (input.noteText.trim().length < 1) throw new Error("اكتب الملاحظة أولاً.");
  const { actorClient } = await requirePlatformAdmin(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_add_company_request_note", {
    target_request_id: input.requestId,
    target_note_text: input.noteText.trim(),
    target_is_internal: true,
  });
  if (error || !data) throw new Error("تعذر حفظ الملاحظة. حدّث الصفحة ثم أعد المحاولة.");
  return { noteId: String(data) };
}

export async function requestMoreInfo(input: RequestInformationInput, authorization?: string) {
  if (!input.requestId.trim()) throw new Error("معرّف طلب الشركة غير موجود.");
  if (input.informationNeeded.trim().length < 3) throw new Error("اكتب المعلومات المطلوبة بوضوح.");
  const { actorClient, adminClient } = await requirePlatformAdmin(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_request_company_info", {
    target_request_id: input.requestId,
    information_needed: input.informationNeeded.trim(),
  });
  if (error || !data) throw new Error("تعذر تحويل الطلب إلى حالة استكمال المعلومات.");
  const request = await getPlatformRequest(adminClient, input.requestId);
  try {
    await sendInfoRequestedEmail({
      requestId: request.id,
      recipientEmail: request.contact_email,
      recipientName: request.contact_name,
      companyName: request.company_name,
      referenceNumber: referenceNumber(request.id),
      detail: input.informationNeeded.trim(),
    });
    return { emailSent: true, warning: null };
  } catch (reason) {
    return { emailSent: false, warning: reason instanceof Error ? reason.message : "تعذر إرسال رسالة طلب المعلومات." };
  }
}

export async function reviewCompanyRequest(input: ReviewCompanyRequestInput, authorization?: string) {
  if (!input.requestId.trim()) throw new Error("معرّف طلب الشركة غير موجود.");
  const { actorClient, adminClient } = await requirePlatformAdmin(authorization);
  const request = await getPlatformRequest(adminClient, input.requestId);
  const { data, error } = await actorClient.rpc("tips_crm_review_company_request", {
    target_request_id: input.requestId,
    next_status: input.status,
    next_review_note: input.reviewNote?.trim() || null,
  });
  if (error || !data) throw new Error("تعذر تحديث حالة طلب الشركة. حدّث الصفحة ثم أعد المحاولة.");
  if (input.status !== "rejected") return { emailSent: false, warning: null };
  try {
    await sendRejectionEmail({
      requestId: request.id,
      recipientEmail: request.contact_email,
      recipientName: request.contact_name,
      companyName: request.company_name,
      referenceNumber: referenceNumber(request.id),
      detail: input.reviewNote?.trim() || null,
    });
    return { emailSent: true, warning: null };
  } catch (reason) {
    return { emailSent: false, warning: reason instanceof Error ? reason.message : "تعذر إرسال رسالة الرفض." };
  }
}

export async function resendManagerInvitation(companyId: string, authorization?: string) {
  if (!companyId.trim()) throw new Error("معرّف الشركة غير موجود.");
  const { adminClient } = await requirePlatformAdmin(authorization);
  const { data, error } = await adminClient.schema("tips_crm").from("company_requests")
    .select("id,company_name,contact_name,contact_email,status,approved_company_id,manager_profile_id")
    .eq("approved_company_id", companyId)
    .in("status", ["approved", "invitation_sent"])
    .is("invitation_cancelled_at", null)
    .maybeSingle();
  if (error || !data) throw new Error("لا توجد دعوة نشطة قابلة لإعادة الإرسال لهذه الشركة.");
  const request = data as PlatformRequest;
  const manager = await getManagerProfile(adminClient, request.manager_profile_id);
  const delivery = await sendManagerSetupInvitation(adminClient, request, manager);
  return { delivery, requestId: request.id };
}

export async function cancelManagerInvitation(requestId: string, authorization?: string) {
  return reviewCompanyRequest({ requestId, status: "cancelled", reviewNote: "تم إلغاء دعوة إعداد حساب مدير الشركة بواسطة مدير المنصة." }, authorization);
}

export async function getPublicCompanyRequestStatus(referenceId: string) {
  requireConfig();
  const normalizedReference = referenceId.trim().toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(normalizedReference)) return null;
  const publicClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await publicClient.rpc("tips_crm_get_company_request_public_status", { reference_id: normalizedReference });
  if (error) throw new Error("تعذر التحقق من حالة الطلب الآن.");
  return (data as Array<{ reference_number: string; company_name: string; status: string; submitted_at: string; updated_at: string }> | null)?.[0] ?? null;
}

export async function createPublicCompanyRequest(input: PublicCompanyRequestInput) {
  requireConfig();
  const companyName = input.companyName.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (companyName.length < 2) throw new Error("اكتب اسم الشركة.");
  if (contactName.length < 2) throw new Error("اكتب اسم مسؤول التواصل.");
  if (!/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error("اكتب بريداً إلكترونياً صحيحاً.");
  const expectedUserCount = input.expectedUserCount && input.expectedUserCount > 0 ? input.expectedUserCount : null;
  const publicClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await publicClient.rpc("tips_crm_create_company_request", {
    request_company_name: companyName,
    request_contact_name: contactName,
    request_contact_email: contactEmail,
    request_contact_phone: input.contactPhone?.trim() || null,
    request_expected_user_count: expectedUserCount,
    request_notes: input.notes?.trim() || null,
    request_activity_type: input.activityType?.trim() || null,
  });
  if (error || !data) throw new Error("تعذر إرسال الطلب الآن. تأكد من البيانات وحاول مرة أخرى.");
  const requestId = String(data);
  try {
    await sendRequestReceivedEmail({
      requestId,
      recipientEmail: contactEmail,
      recipientName: contactName,
      companyName,
      referenceNumber: referenceNumber(requestId),
    });
  } catch (reason) {
    console.warn("[company-onboarding] request-received email was not delivered", reason);
  }
  return { requestId, referenceNumber: referenceNumber(requestId) };
}

export type UpdateCompanySubscriptionInput = {
  companyId: string;
  paymentTierKey: string;
  maxUserLimit: number;
};

export async function updateCompanySubscription(input: UpdateCompanySubscriptionInput, authorization?: string) {
  if (!input.companyId?.trim()) throw new Error("معرّف الشركة غير موجود.");
  if (input.maxUserLimit < 1) throw new Error("حد الموظفين يجب أن يكون 1 على الأقل.");
  const { adminClient } = await requirePlatformAdmin(authorization);
  const { error } = await adminClient
    .schema("tips_crm")
    .from("companies")
    .update({
      payment_tier_key: input.paymentTierKey.trim(),
      max_user_limit: input.maxUserLimit,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.companyId);
  if (error) throw new Error("تعذر تحديث باقة وسعة الشركة.");
  return { companyId: input.companyId, paymentTierKey: input.paymentTierKey, maxUserLimit: input.maxUserLimit };
}

