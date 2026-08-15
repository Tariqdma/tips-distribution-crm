import { ENV } from "./_core/env";

type ManagerRecipient = { manager_email: string; manager_name: string; plan_title: string; rep_name: string; period_label: string };

function escapeHtml(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character); }
function senderAddress() { const address = ENV.resendFromEmail.match(/<([^>]+)>/)?.[1] ?? ENV.resendFromEmail; return `Tips CRM <${address}>`; }

export async function sendPlanSubmissionEmail(input: { planId: string; supabaseAccessToken: string }) {
  if (!ENV.resendApiKey || !ENV.resendFromEmail || !ENV.supabaseUrl || !ENV.supabaseAnonKey) return { sent: 0, skipped: true };
  const prepared = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_prepare_plan_submission_email`, { method: "POST", headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ target_plan_id: input.planId }) });
  if (!prepared.ok) throw new Error("تعذر التحقق من الخطة قبل إرسال تنبيه المدير.");
  const recipients = (await prepared.json()) as ManagerRecipient[];
  await Promise.all(recipients.map(async (recipient) => {
    const subject = `خطة أسبوعية جديدة بانتظار الاعتماد — ${recipient.rep_name}`;
    const text = `مرحباً ${recipient.manager_name}،\n\nأرسل ${recipient.rep_name} خطة «${recipient.plan_title}» للفترة ${recipient.period_label}.\n\nافتح لوحة Tips CRM ثم «اعتماد الخطط» لمراجعتها واتخاذ القرار.`;
    const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#143d35"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #dfebe6;border-radius:20px;padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">Tips CRM · اعتماد الخطط</div><h1 style="font-size:23px">خطة أسبوعية جديدة بانتظارك</h1><p>مرحباً ${escapeHtml(recipient.manager_name)}، أرسل <strong>${escapeHtml(recipient.rep_name)}</strong> خطة <strong>${escapeHtml(recipient.plan_title)}</strong> للفترة ${escapeHtml(recipient.period_label)}.</p><p style="color:#597068;line-height:1.8">افتح بوابة الإدارة ثم صفحة «اعتماد الخطط» لمراجعة توزيع الزيارات واعتماد الخطة أو إعادتها للمندوب بسبب واضح.</p><p style="text-align:center;margin-top:28px"><a href="${ENV.crmPublicUrl.replace(/\/$/, "")}/admin/weekly-plans" style="display:inline-block;background:#0d8068;color:#fff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:700">فتح اعتماد الخطط</a></p></div></body></html>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: senderAddress(), to: recipient.manager_email, subject, text, html, tags: [{ name: "category", value: "plan-submitted" }, { name: "plan_id", value: input.planId }] }) });
    if (!response.ok) throw new Error("تعذر تسليم بريد تنبيه الخطة إلى أحد المديرين.");
  }));
  return { sent: recipients.length, skipped: false };
}
