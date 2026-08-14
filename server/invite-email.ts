import { ENV } from "./_core/env";

type PreparedInvite = { invite_id: string; recipient_email: string; role_label: string; territory_label: string | null; invite_token: string; expires_at: string };

function requireMailConfig() {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("Invite email service is not configured");
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("Supabase runtime configuration is missing");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

export function buildInvitationEmail(invite: PreparedInvite) {
  const link = `${ENV.crmPublicUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(invite.invite_token)}`;
  const role = escapeHtml(invite.role_label);
  const territory = escapeHtml(invite.territory_label || "سيتم تحديدها من الإدارة");
  const expiry = new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(new Date(invite.expires_at));
  const subject = "دعوة للانضمام إلى Tips CRM";
  const text = `مرحباً،\n\nتمت دعوتك للانضمام إلى Tips CRM بدور ${invite.role_label} ضمن منطقة ${invite.territory_label || "سيتم تحديدها من الإدارة"}.\n\nاقبل الدعوة من الرابط التالي:\n${link}\n\nصلاحية الرابط تنتهي في ${expiry}.\n\nفريق Tips للتوزيع`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">TIPS CRM · دعوة فريق</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">مرحباً بك في فريق Tips</h1><p style="font-size:15px;line-height:1.8">تمت دعوتك للانضمام إلى النظام بدور <strong>${role}</strong> ضمن منطقة <strong>${territory}</strong>.</p><p style="font-size:14px;line-height:1.8;color:#597068">اضغط الزر لتسجيل الدخول أو إنشاء حسابك. سيتم تعيين دورك تلقائياً بعد قبول الدعوة.</p><p style="margin:26px 0;text-align:center"><a href="${link}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">قبول الدعوة</a></p><p style="font-size:12px;line-height:1.7;color:#7c8c87">صلاحية الرابط تنتهي في ${escapeHtml(expiry)}. إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

export async function sendInvitationEmail(input: { inviteId: string; supabaseAccessToken: string }) {
  requireMailConfig();
  const preparation = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_prepare_invite_email`, {
    method: "POST",
    headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ target_invite_id: input.inviteId }),
  });
  if (!preparation.ok) throw new Error("You are not allowed to send this invitation");
  const prepared = (await preparation.json()) as PreparedInvite[];
  const invite = prepared[0];
  if (!invite) throw new Error("Invitation is unavailable or no longer pending");

  const message = buildInvitationEmail(invite);
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ from: ENV.resendFromEmail, to: invite.recipient_email, subject: message.subject, html: message.html, text: message.text, tags: [{ name: "category", value: "team-invite" }, { name: "invite_id", value: invite.invite_id }] }),
  });
  if (!delivery.ok) throw new Error("Email delivery failed");
  const result = (await delivery.json()) as { id?: string };
  return { sent: true, messageId: result.id ?? null, recipient: invite.recipient_email };
}
