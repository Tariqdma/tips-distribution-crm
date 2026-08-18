import { createClient } from "@supabase/supabase-js";
import { ENV } from "./_core/env";

export type CompanyOnboardingEmailEvent = "request_received" | "info_requested" | "approved" | "rejected" | "manager_invitation";

export type CompanyOnboardingEmailInput = {
  requestId: string;
  event: CompanyOnboardingEmailEvent;
  recipientEmail: string;
  recipientName: string;
  companyName: string;
  referenceNumber: string;
  detail?: string | null;
  activationUrl?: string | null;
};

function requireMailConfig() {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("إعدادات إرسال البريد غير مكتملة.");
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) throw new Error("إعدادات قاعدة البيانات غير مكتملة.");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function statusUrl(referenceNumber: string) {
  const url = new URL(`${ENV.crmPublicUrl}/request-status`);
  url.searchParams.set("ref", referenceNumber);
  return url.toString();
}

function mailContent(input: CompanyOnboardingEmailInput) {
  const name = input.recipientName.trim() || "مسؤول الشركة";
  const companyName = input.companyName.trim();
  const reference = input.referenceNumber.toUpperCase();
  const publicStatusUrl = statusUrl(reference);
  const detail = input.detail?.trim() || "";

  const config: Record<CompanyOnboardingEmailEvent, { eyebrow: string; title: string; intro: string; actionLabel: string; actionUrl: string; footer: string }> = {
    request_received: {
      eyebrow: "Tips CRM · طلب انضمام شركة",
      title: "استلمنا طلب انضمام شركتك",
      intro: `شكراً لتقديم طلب شركة ${companyName}. طلبك الآن قيد المراجعة لدى مدير المنصة.`,
      actionLabel: "متابعة حالة الطلب",
      actionUrl: publicStatusUrl,
      footer: "لا تحتاج إلى إنشاء حساب في هذه المرحلة. سنرسل رسالة عند وجود تحديث أو عند اعتماد الطلب.",
    },
    info_requested: {
      eyebrow: "Tips CRM · مطلوب استكمال معلومات",
      title: "نحتاج معلومات إضافية لإكمال المراجعة",
      intro: `نراجع طلب شركة ${companyName} ونحتاج منك توضيحاً أو استكمالاً قبل اتخاذ القرار.`,
      actionLabel: "متابعة حالة الطلب",
      actionUrl: publicStatusUrl,
      footer: detail ? `المطلوب: ${detail}` : "يرجى الرد على مدير المنصة بالمعلومات المطلوبة.",
    },
    approved: {
      eyebrow: "Tips CRM · تم اعتماد الطلب",
      title: "تم اعتماد طلب شركتك",
      intro: `تمت الموافقة على انضمام شركة ${companyName}. سنرسل لمدير الشركة رابطاً آمناً لإعداد الحساب والبدء.`,
      actionLabel: "متابعة الحالة",
      actionUrl: publicStatusUrl,
      footer: "إذا كنت أنت مدير الشركة المحدد، راقب بريدك للحصول على رسالة إعداد الحساب.",
    },
    rejected: {
      eyebrow: "Tips CRM · نتيجة مراجعة الطلب",
      title: "تم إغلاق طلب الانضمام",
      intro: `بعد مراجعة طلب شركة ${companyName} تعذر اعتماده في الوقت الحالي.`,
      actionLabel: "عرض حالة الطلب",
      actionUrl: publicStatusUrl,
      footer: detail ? `سبب القرار: ${detail}` : "يمكنك التواصل مع فريق Tips للحصول على توضيح إضافي.",
    },
    manager_invitation: {
      eyebrow: "Tips CRM · إعداد حساب مدير الشركة",
      title: "حسابك الإداري جاهز",
      intro: `تم إنشاء حساب مدير الشركة لشركة ${companyName}. افتح الرابط الآمن أدناه لاختيار كلمة مرورك والبدء.`,
      actionLabel: "إعداد كلمة المرور والدخول",
      actionUrl: input.activationUrl || publicStatusUrl,
      footer: "الرابط شخصي وقصير الصلاحية. لا تشاركه مع أي شخص. بعد الإعداد ستدخل إلى لوحة الشركة مباشرة.",
    },
  };

  const content = config[input.event];
  const subject = input.event === "manager_invitation"
    ? `إعداد حساب مدير الشركة — ${companyName}`
    : `${content.title} — ${companyName}`;
  const text = `مرحباً ${name}،\n\n${content.intro}\n\nرقم الطلب: ${reference}\n\n${content.actionLabel}:\n${content.actionUrl}\n\n${content.footer}\n\nفريق Tips CRM`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">${escapeHtml(content.eyebrow)}</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">${escapeHtml(content.title)}</h1><p style="font-size:15px;line-height:1.8">مرحباً ${escapeHtml(name)}،</p><p style="font-size:15px;line-height:1.8">${escapeHtml(content.intro)}</p><div style="background:#e9f8f2;border-radius:10px;padding:10px 12px;font-size:13px;color:#0d8068;font-weight:700">رقم الطلب: ${escapeHtml(reference)}</div><p style="margin:26px 0;text-align:center"><a href="${escapeHtml(content.actionUrl)}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">${escapeHtml(content.actionLabel)}</a></p><p style="font-size:12px;line-height:1.8;color:#597068">${escapeHtml(content.footer)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function responseFailureReason(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string; name?: string };
    return String(payload.message ?? payload.name ?? `Resend HTTP ${response.status}`).slice(0, 500);
  } catch {
    return `Resend HTTP ${response.status}`;
  }
}

async function recordDelivery(input: Pick<CompanyOnboardingEmailInput, "requestId" | "event" | "recipientEmail"> & { status: "accepted_by_provider" | "failed"; providerMessageId?: string | null; failureReason?: string | null }) {
  const adminClient = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await adminClient.schema("tips_crm").from("company_request_email_deliveries").insert({
    request_id: input.requestId,
    event_type: input.event,
    recipient_email: input.recipientEmail.toLowerCase(),
    delivery_status: input.status,
    provider_message_id: input.providerMessageId ?? null,
    failure_reason: input.failureReason ?? null,
  });
  if (error) console.warn("[company-onboarding-email] failed to record delivery", error.message);
}

export function buildCompanyOnboardingEmail(input: CompanyOnboardingEmailInput) {
  return { ...mailContent(input), from: ENV.resendFromEmail, to: input.recipientEmail.trim().toLowerCase() };
}

export async function sendCompanyOnboardingEmail(input: CompanyOnboardingEmailInput) {
  requireMailConfig();
  const message = buildCompanyOnboardingEmail(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
      body: JSON.stringify({
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: [
          { name: "category", value: "company-onboarding" },
          { name: "event", value: input.event },
          { name: "request_id", value: input.requestId },
        ],
      }),
    });
    if (!response.ok) {
      const reason = await responseFailureReason(response);
      await recordDelivery({ ...input, status: "failed", failureReason: reason });
      throw new Error(`تعذر تسليم البريد: ${reason}`);
    }
    const result = (await response.json()) as { id?: string };
    await recordDelivery({ ...input, status: "accepted_by_provider", providerMessageId: result.id ?? null });
    return { sent: true, messageId: result.id ?? null, recipient: message.to };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("تعذر تسليم البريد:")) throw error;
    const reason = error instanceof Error ? error.message.slice(0, 500) : "فشل غير معروف";
    await recordDelivery({ ...input, status: "failed", failureReason: reason });
    throw error;
  }
}

export async function generatePasswordSetupUrl(email: string) {
  requireMailConfig();
  const response = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: ENV.supabaseServiceRoleKey, Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ type: "recovery", email: email.trim().toLowerCase() }),
  });
  if (!response.ok) throw new Error("تعذر إنشاء رابط إعداد كلمة المرور لمدير الشركة.");
  const payload = (await response.json()) as { hashed_token?: string };
  if (!payload.hashed_token) throw new Error("تعذر إنشاء رابط إعداد كلمة المرور لمدير الشركة.");
  const url = new URL(`${ENV.crmPublicUrl}/reset-password`);
  url.searchParams.set("token_hash", payload.hashed_token);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

export async function sendRequestReceivedEmail(input: Omit<CompanyOnboardingEmailInput, "event">) {
  return sendCompanyOnboardingEmail({ ...input, event: "request_received" });
}

export async function sendInfoRequestedEmail(input: Omit<CompanyOnboardingEmailInput, "event">) {
  return sendCompanyOnboardingEmail({ ...input, event: "info_requested" });
}

export async function sendApprovalEmail(input: Omit<CompanyOnboardingEmailInput, "event">) {
  return sendCompanyOnboardingEmail({ ...input, event: "approved" });
}

export async function sendRejectionEmail(input: Omit<CompanyOnboardingEmailInput, "event">) {
  return sendCompanyOnboardingEmail({ ...input, event: "rejected" });
}

export async function sendManagerInvitationEmail(input: Omit<CompanyOnboardingEmailInput, "event" | "activationUrl">) {
  const activationUrl = await generatePasswordSetupUrl(input.recipientEmail);
  return sendCompanyOnboardingEmail({ ...input, event: "manager_invitation", activationUrl });
}
