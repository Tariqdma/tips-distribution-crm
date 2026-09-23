import { ENV } from "./_core/env";

type PreparedInvite = { invite_id: string; recipient_email: string; role_label: string; territory_label: string | null; invite_token: string; expires_at: string; sender_name?: string; reply_to?: string | null; invite_subject?: string; invite_intro?: string; invite_action_label?: string };

function requireMailConfig() {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("Invite email service is not configured");
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("Supabase runtime configuration is missing");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function personalize(template: string, invite: PreparedInvite, link: string, expiry: string) {
  return template.replaceAll("{{role}}", invite.role_label).replaceAll("{{territory}}", invite.territory_label || "سيتم تحديدها من الإدارة").replaceAll("{{accept_link}}", link).replaceAll("{{expiry_date}}", expiry);
}

function senderAddress(senderName: string) {
  const address = ENV.resendFromEmail.match(/<([^>]+)>/)?.[1] ?? ENV.resendFromEmail;
  return `${senderName} <${address}>`;
}

async function recordDelivery(input: { inviteId: string; email: string; status: "accepted_by_provider" | "failed"; supabaseAccessToken: string; providerMessageId?: string | null; failureReason?: string | null }) {
  try {
    const response = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_record_invite_email_delivery`, { method: "POST", headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" }, body: JSON.stringify({ target_invite_id: input.inviteId, target_email: input.email, next_status: input.status, provider_id: input.providerMessageId ?? null, error_reason: input.failureReason ?? null }) });
    if (!response.ok) console.warn("[invite-email] Failed to store delivery status");
  } catch { console.warn("[invite-email] Delivery status could not be stored"); }
}

async function resendFailureReason(response: Response) {
  try { const body = (await response.json()) as { message?: string; name?: string }; return String(body.message ?? body.name ?? `Resend HTTP ${response.status}`).slice(0, 500); }
  catch { return `Resend HTTP ${response.status}`; }
}

export function buildInvitationEmail(invite: PreparedInvite) {
  const link = `${ENV.crmPublicUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(invite.invite_token)}`;
  const expiry = new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(new Date(invite.expires_at));
  const senderName = invite.sender_name?.trim() || "Tips CRM";
  const subject = personalize(invite.invite_subject?.trim() || "دعوة للانضمام إلى Tips CRM", invite, link, expiry);
  const intro = personalize(invite.invite_intro?.trim() || "تمت دعوتك للانضمام إلى النظام. اضغط الزر لتسجيل الدخول أو إنشاء حسابك، وسيتم تعيين دورك تلقائياً بعد قبول الدعوة.", invite, link, expiry);
  const actionLabel = invite.invite_action_label?.trim() || "قبول الدعوة";
  const role = escapeHtml(invite.role_label); const territory = escapeHtml(invite.territory_label || "سيتم تحديدها من الإدارة");
  const text = `مرحباً،\n\nتمت دعوتك للانضمام إلى Tips CRM بدور ${invite.role_label} ضمن منطقة ${invite.territory_label || "سيتم تحديدها من الإدارة"}.\n\n${intro}\n\n${actionLabel}:\n${link}\n\nصلاحية الرابط تنتهي في ${expiry}.\n\n${senderName}`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">${escapeHtml(senderName)} · دعوة فريق</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">مرحباً بك في فريق Tips</h1><p style="font-size:15px;line-height:1.8">تمت دعوتك للانضمام إلى النظام بدور <strong>${role}</strong> ضمن منطقة <strong>${territory}</strong>.</p><p style="font-size:14px;line-height:1.8;color:#597068">${escapeHtml(intro).replace(/\n/g, "<br/>")}</p><p style="margin:26px 0;text-align:center"><a href="${link}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;line-height:1.7;color:#7c8c87">صلاحية الرابط تنتهي في ${escapeHtml(expiry)}. إذا لم تكن تتوقع هذه الدعوة، يمكنك تجاهل هذه الرسالة.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html, from: senderAddress(senderName), replyTo: invite.reply_to?.trim() || undefined };
}

export async function sendInvitationEmail(input: { inviteId: string; supabaseAccessToken: string }) {
  requireMailConfig(); let invite: PreparedInvite | undefined; let recorded = false;
  try {
    const preparation = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_prepare_invite_email`, { method: "POST", headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" }, body: JSON.stringify({ target_invite_id: input.inviteId }) });
    if (!preparation.ok) throw new Error("You are not allowed to send this invitation");
    const prepared = (await preparation.json()) as PreparedInvite[]; invite = prepared[0]; if (!invite) throw new Error("Invitation is unavailable or no longer pending");
    const message = buildInvitationEmail(invite);
    const delivery = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" }, body: JSON.stringify({ from: message.from, to: invite.recipient_email, subject: message.subject, html: message.html, text: message.text, ...(message.replyTo ? { reply_to: message.replyTo } : {}), tags: [{ name: "category", value: "team-invite" }, { name: "invite_id", value: invite.invite_id }] }) });
    if (!delivery.ok) { const reason = await resendFailureReason(delivery); await recordDelivery({ inviteId: invite.invite_id, email: invite.recipient_email, status: "failed", supabaseAccessToken: input.supabaseAccessToken, failureReason: reason }); recorded = true; throw new Error(`Email delivery failed: ${reason}`); }
    const result = (await delivery.json()) as { id?: string }; await recordDelivery({ inviteId: invite.invite_id, email: invite.recipient_email, status: "accepted_by_provider", supabaseAccessToken: input.supabaseAccessToken, providerMessageId: result.id ?? null }); recorded = true;
    return { sent: true, messageId: result.id ?? null, recipient: invite.recipient_email };
  } catch (error) {
    if (invite && !recorded) await recordDelivery({ inviteId: invite.invite_id, email: invite.recipient_email, status: "failed", supabaseAccessToken: input.supabaseAccessToken, failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error" });
    throw error;
  }
}
