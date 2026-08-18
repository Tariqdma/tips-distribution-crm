import { ENV } from "./_core/env";

const RESET_REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 3;
const recentRequests = new Map<string, number[]>();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function getResetUrl(tokenHash: string) {
  const url = new URL(`${ENV.crmPublicUrl.replace(/\/+$/, "")}/reset-password`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}

function checkRateLimit(email: string) {
  const now = Date.now();
  const validRequests = (recentRequests.get(email) ?? []).filter((timestamp) => now - timestamp < RESET_REQUEST_WINDOW_MS);
  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recentRequests.set(email, [...validRequests, now]);
  return true;
}

function requireConfiguration() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) throw new Error("إعدادات إدارة Supabase غير مكتملة.");
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("إعدادات إرسال البريد غير مكتملة.");
}

export function buildPasswordRecoveryEmail(recipient: string, resetUrl: string) {
  const subject = "إعادة تعيين كلمة المرور — Tips CRM";
  const text = `مرحباً،\n\nوصلنا طلب لإعادة تعيين كلمة المرور لحسابك في Tips CRM.\n\nافتح الرابط التالي لاختيار كلمة مرور جديدة:\n${resetUrl}\n\nتنتهي صلاحية الرابط قريباً. إذا لم تطلب ذلك، يمكنك تجاهل هذه الرسالة بأمان.`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">Tips CRM · أمان الحساب</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">إعادة تعيين كلمة المرور</h1><p style="font-size:15px;line-height:1.8">وصلنا طلب لإعادة تعيين كلمة المرور لحسابك. اضغط الزر أدناه لاختيار كلمة مرور جديدة.</p><p style="margin:26px 0;text-align:center"><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">إعادة تعيين كلمة المرور</a></p><p style="font-size:12px;line-height:1.7;color:#7c8c87">صلاحية الرابط قصيرة. إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذه الرسالة بأمان.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, recipient };
}

export async function sendManagedPasswordRecoveryEmail(rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("أدخل بريداً إلكترونياً صحيحاً.");
  if (!checkRateLimit(email)) return { sent: true, throttled: true };
  requireConfiguration();

  const generated = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: ENV.supabaseServiceRoleKey, Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ type: "recovery", email }),
  });

  // Keep the response generic so the endpoint does not reveal which addresses have accounts.
  if (!generated.ok) return { sent: true, recipientExists: false };
  const payload = (await generated.json()) as { hashed_token?: string };
  if (!payload.hashed_token) return { sent: true, recipientExists: false };

  const message = buildPasswordRecoveryEmail(email, getResetUrl(payload.hashed_token));
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ from: ENV.resendFromEmail, to: message.recipient, subject: message.subject, html: message.html, text: message.text, tags: [{ name: "category", value: "password-recovery" }] }),
  });
  if (!delivery.ok) throw new Error("تعذر إرسال رسالة الاستعادة. حاول لاحقاً أو تواصل مع مسؤول النظام.");
  return { sent: true, recipientExists: true };
}
