// server/_core/index.ts
import "dotenv/config";
import express from "express";
import { createServer } from "http";
import fs from "fs";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/_core/env.ts
var ENV = {
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "",
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  crmPublicUrl: (process.env.TIPS_CRM_PUBLIC_URL ?? process.env.PUBLIC_APP_URL ?? "https://tipscrm-vevc4ncu.manus.space").replace(/\/+$/, "")
};

// server/_core/storageProxy.ts
function registerStorageProxy(app) {
  app.get("/manus-storage/*", async (req, res) => {
    const key = req.params[0];
    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }
    if (!ENV.forgeApiUrl || !ENV.forgeApiKey) {
      res.status(500).send("Storage proxy not configured");
      return;
    }
    try {
      const forgeUrl = new URL(
        "v1/storage/presign/get",
        ENV.forgeApiUrl.replace(/\/+$/, "") + "/"
      );
      forgeUrl.searchParams.set("path", key);
      const forgeResp = await fetch(forgeUrl, {
        headers: { Authorization: `Bearer ${ENV.forgeApiKey}` }
      });
      if (!forgeResp.ok) {
        const body = await forgeResp.text().catch(() => "");
        console.error(`[StorageProxy] forge error: ${forgeResp.status} ${body}`);
        res.status(502).send("Storage backend error");
        return;
      }
      const { url } = await forgeResp.json();
      if (!url) {
        res.status(502).send("Empty signed URL from backend");
        return;
      }
      res.set("Cache-Control", "no-store");
      res.redirect(307, url);
    } catch (err) {
      console.error("[StorageProxy] failed:", err);
      res.status(502).send("Storage proxy error");
    }
  });
}

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;

// server/routers.ts
import { z as z2 } from "zod";

// server/_core/cookies.ts
var LOCAL_HOSTS = /* @__PURE__ */ new Set(["localhost", "127.0.0.1", "::1"]);
function isIpAddress(host) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getParentDomain(hostname) {
  if (LOCAL_HOSTS.has(hostname) || isIpAddress(hostname)) {
    return void 0;
  }
  const parts = hostname.split(".");
  if (parts.length < 3) {
    return void 0;
  }
  return "." + parts.slice(-2).join(".");
}
function getSessionCookieOptions(req) {
  const hostname = req.hostname;
  const domain = getParentDomain(hostname);
  return {
    domain,
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/trpc.ts
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  }))
});

// server/invite-email.ts
function requireMailConfig() {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("Invite email service is not configured");
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error("Supabase runtime configuration is missing");
}
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}
function personalize(template, invite, link, expiry) {
  return template.replaceAll("{{role}}", invite.role_label).replaceAll("{{territory}}", invite.territory_label || "\u0633\u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062F\u0647\u0627 \u0645\u0646 \u0627\u0644\u0625\u062F\u0627\u0631\u0629").replaceAll("{{accept_link}}", link).replaceAll("{{expiry_date}}", expiry);
}
function senderAddress(senderName) {
  const address = ENV.resendFromEmail.match(/<([^>]+)>/)?.[1] ?? ENV.resendFromEmail;
  return `${senderName} <${address}>`;
}
async function recordDelivery(input) {
  try {
    const response = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_record_invite_email_delivery`, { method: "POST", headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" }, body: JSON.stringify({ target_invite_id: input.inviteId, target_email: input.email, next_status: input.status, provider_id: input.providerMessageId ?? null, error_reason: input.failureReason ?? null }) });
    if (!response.ok) console.warn("[invite-email] Failed to store delivery status");
  } catch {
    console.warn("[invite-email] Delivery status could not be stored");
  }
}
async function resendFailureReason(response) {
  try {
    const body = await response.json();
    return String(body.message ?? body.name ?? `Resend HTTP ${response.status}`).slice(0, 500);
  } catch {
    return `Resend HTTP ${response.status}`;
  }
}
function buildInvitationEmail(invite) {
  const link = `${ENV.crmPublicUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(invite.invite_token)}`;
  const expiry = new Intl.DateTimeFormat("ar", { dateStyle: "long" }).format(new Date(invite.expires_at));
  const senderName = invite.sender_name?.trim() || "Tips CRM";
  const subject = personalize(invite.invite_subject?.trim() || "\u062F\u0639\u0648\u0629 \u0644\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0625\u0644\u0649 Tips CRM", invite, link, expiry);
  const intro = personalize(invite.invite_intro?.trim() || "\u062A\u0645\u062A \u062F\u0639\u0648\u062A\u0643 \u0644\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0625\u0644\u0649 \u0627\u0644\u0646\u0638\u0627\u0645. \u0627\u0636\u063A\u0637 \u0627\u0644\u0632\u0631 \u0644\u062A\u0633\u062C\u064A\u0644 \u0627\u0644\u062F\u062E\u0648\u0644 \u0623\u0648 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628\u0643\u060C \u0648\u0633\u064A\u062A\u0645 \u062A\u0639\u064A\u064A\u0646 \u062F\u0648\u0631\u0643 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0628\u0639\u062F \u0642\u0628\u0648\u0644 \u0627\u0644\u062F\u0639\u0648\u0629.", invite, link, expiry);
  const actionLabel = invite.invite_action_label?.trim() || "\u0642\u0628\u0648\u0644 \u0627\u0644\u062F\u0639\u0648\u0629";
  const role = escapeHtml(invite.role_label);
  const territory = escapeHtml(invite.territory_label || "\u0633\u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062F\u0647\u0627 \u0645\u0646 \u0627\u0644\u0625\u062F\u0627\u0631\u0629");
  const text2 = `\u0645\u0631\u062D\u0628\u0627\u064B\u060C

\u062A\u0645\u062A \u062F\u0639\u0648\u062A\u0643 \u0644\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0625\u0644\u0649 Tips CRM \u0628\u062F\u0648\u0631 ${invite.role_label} \u0636\u0645\u0646 \u0645\u0646\u0637\u0642\u0629 ${invite.territory_label || "\u0633\u064A\u062A\u0645 \u062A\u062D\u062F\u064A\u062F\u0647\u0627 \u0645\u0646 \u0627\u0644\u0625\u062F\u0627\u0631\u0629"}.

${intro}

${actionLabel}:
${link}

\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0631\u0627\u0628\u0637 \u062A\u0646\u062A\u0647\u064A \u0641\u064A ${expiry}.

${senderName}`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">${escapeHtml(senderName)} \xB7 \u062F\u0639\u0648\u0629 \u0641\u0631\u064A\u0642</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">\u0645\u0631\u062D\u0628\u0627\u064B \u0628\u0643 \u0641\u064A \u0641\u0631\u064A\u0642 Tips</h1><p style="font-size:15px;line-height:1.8">\u062A\u0645\u062A \u062F\u0639\u0648\u062A\u0643 \u0644\u0644\u0627\u0646\u0636\u0645\u0627\u0645 \u0625\u0644\u0649 \u0627\u0644\u0646\u0638\u0627\u0645 \u0628\u062F\u0648\u0631 <strong>${role}</strong> \u0636\u0645\u0646 \u0645\u0646\u0637\u0642\u0629 <strong>${territory}</strong>.</p><p style="font-size:14px;line-height:1.8;color:#597068">${escapeHtml(intro).replace(/\n/g, "<br/>")}</p><p style="margin:26px 0;text-align:center"><a href="${link}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">${escapeHtml(actionLabel)}</a></p><p style="font-size:12px;line-height:1.7;color:#7c8c87">\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0631\u0627\u0628\u0637 \u062A\u0646\u062A\u0647\u064A \u0641\u064A ${escapeHtml(expiry)}. \u0625\u0630\u0627 \u0644\u0645 \u062A\u0643\u0646 \u062A\u062A\u0648\u0642\u0639 \u0647\u0630\u0647 \u0627\u0644\u062F\u0639\u0648\u0629\u060C \u064A\u0645\u0643\u0646\u0643 \u062A\u062C\u0627\u0647\u0644 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text: text2, html, from: senderAddress(senderName), replyTo: invite.reply_to?.trim() || void 0 };
}
async function sendInvitationEmail(input) {
  requireMailConfig();
  let invite;
  let recorded = false;
  try {
    const preparation = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_prepare_invite_email`, { method: "POST", headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" }, body: JSON.stringify({ target_invite_id: input.inviteId }) });
    if (!preparation.ok) throw new Error("You are not allowed to send this invitation");
    const prepared = await preparation.json();
    invite = prepared[0];
    if (!invite) throw new Error("Invitation is unavailable or no longer pending");
    const message = buildInvitationEmail(invite);
    const delivery = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" }, body: JSON.stringify({ from: message.from, to: invite.recipient_email, subject: message.subject, html: message.html, text: message.text, ...message.replyTo ? { reply_to: message.replyTo } : {}, tags: [{ name: "category", value: "team-invite" }, { name: "invite_id", value: invite.invite_id }] }) });
    if (!delivery.ok) {
      const reason = await resendFailureReason(delivery);
      await recordDelivery({ inviteId: invite.invite_id, email: invite.recipient_email, status: "failed", supabaseAccessToken: input.supabaseAccessToken, failureReason: reason });
      recorded = true;
      throw new Error(`Email delivery failed: ${reason}`);
    }
    const result = await delivery.json();
    await recordDelivery({ inviteId: invite.invite_id, email: invite.recipient_email, status: "accepted_by_provider", supabaseAccessToken: input.supabaseAccessToken, providerMessageId: result.id ?? null });
    recorded = true;
    return { sent: true, messageId: result.id ?? null, recipient: invite.recipient_email };
  } catch (error) {
    if (invite && !recorded) await recordDelivery({ inviteId: invite.invite_id, email: invite.recipient_email, status: "failed", supabaseAccessToken: input.supabaseAccessToken, failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown delivery error" });
    throw error;
  }
}

// server/routers.ts
var appRouter = router({
  // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    })
  }),
  crmInviteEmail: router({
    send: publicProcedure.input(z2.object({ inviteId: z2.string().uuid(), supabaseAccessToken: z2.string().min(20) })).mutation(({ input }) => sendInvitationEmail(input))
  })
});

// server/_core/context.ts
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res
  };
}

// server/employee-account.ts
import { createClient as createClient2 } from "@supabase/supabase-js";

// shared/auth/permissions.ts
var portalEntryPermissions = [
  "portal.platform.enter",
  "portal.company.enter",
  "portal.supervisor.enter",
  "portal.rep.enter"
];
var ownershipPermissions = [
  "company.subscription.manage",
  "company.billing.read",
  "company.transfer",
  "company.delete"
];
var companyAdministrationPermissions = [
  "company.profile.update",
  "employee.manage",
  "employee.read.team",
  "role.assign",
  "role.custom.manage",
  "territory.manage",
  "team.assign",
  "catalogue.manage"
];
var cataloguePermissions = ["catalogue.read"];
var accountPermissions = [
  "account.read.assigned",
  "account.read.team",
  "account.read.company",
  "account.create",
  "account.update",
  "account.import"
];
var planPermissions = [
  "plan.create.own",
  "plan.read.own",
  "plan.read.team",
  "plan.read.company",
  "plan.approve.team",
  "plan.approve.company"
];
var visitPermissions = [
  "visit.record",
  "visit.read.own",
  "visit.read.team",
  "visit.read.company",
  "visit.review"
];
var telemetryPermissions = ["telemetry.read.team", "telemetry.read.company"];
var financePermissions = ["credit_limit.manage", "finance.reconcile"];
var notificationPermissions = ["notification.send.team"];
var reportAndAuditPermissions = [
  "report.read.team",
  "report.read.company",
  "report.export",
  "audit.read.company"
];
var platformOnlyPermissions = [
  "platform.company.review",
  "platform.company.suspend",
  "platform.package.manage",
  "platform.audit.read"
];
var ALL_PERMISSIONS = [
  ...portalEntryPermissions,
  ...ownershipPermissions,
  ...companyAdministrationPermissions,
  ...cataloguePermissions,
  ...accountPermissions,
  ...planPermissions,
  ...visitPermissions,
  ...telemetryPermissions,
  ...financePermissions,
  ...notificationPermissions,
  ...reportAndAuditPermissions,
  ...platformOnlyPermissions
];
var OWNERSHIP_PERMISSIONS = ownershipPermissions;
var PLATFORM_PERMISSIONS = [
  "portal.platform.enter",
  ...platformOnlyPermissions
];

// shared/auth/roles.ts
var ownerPermissions = [
  "portal.company.enter",
  "company.subscription.manage",
  "company.billing.read",
  "company.transfer",
  "company.delete"
];
var supervisorPermissions = [
  "portal.supervisor.enter",
  "catalogue.read",
  "employee.read.team",
  "account.read.team",
  "plan.read.team",
  "plan.approve.team",
  "visit.read.team",
  "visit.review",
  "telemetry.read.team",
  "notification.send.team",
  "report.read.team"
];
var accountantPermissions = [
  "portal.company.enter",
  "account.read.company",
  "visit.read.company",
  "credit_limit.manage",
  "finance.reconcile",
  "report.read.company"
];
var repPermissions = [
  "portal.rep.enter",
  "catalogue.read",
  "account.read.assigned",
  "account.create",
  "account.update",
  "plan.create.own",
  "plan.read.own",
  "visit.record",
  "visit.read.own"
];
var managerExclusions = /* @__PURE__ */ new Set([
  ...OWNERSHIP_PERMISSIONS,
  ...PLATFORM_PERMISSIONS,
  "role.custom.manage"
]);
var managerPermissions = ALL_PERMISSIONS.filter((permission) => !managerExclusions.has(permission));
var SYSTEM_ROLE_PERMISSIONS = {
  owner: ownerPermissions,
  manager: managerPermissions,
  supervisor: supervisorPermissions,
  rep: repPermissions,
  accountant: accountantPermissions
};
var PLATFORM_ADMIN_PERMISSIONS = PLATFORM_PERMISSIONS;

// shared/auth/resolve.ts
function hasPermission(permissions, permission) {
  return permissions.has(permission);
}
function canGrant(actorPermissions, targetPermissions) {
  return targetPermissions.every((permission) => actorPermissions.has(permission));
}

// server/_core/authorize.ts
import { createClient } from "@supabase/supabase-js";

// shared/auth/permission-set.ts
var ALL_PERMISSIONS_SET = new Set(ALL_PERMISSIONS);
function isPermission(value) {
  return ALL_PERMISSIONS_SET.has(value);
}
function permissionsFromMembership(input) {
  if (input.isPlatformAdmin) return new Set(PLATFORM_ADMIN_PERMISSIONS);
  return new Set((input.membershipPermissions ?? []).filter(isPermission));
}

// server/_core/app-error.ts
var AppError = class extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
    this.name = "AppError";
  }
};

// server/_core/authorize.ts
var DEFAULT_MESSAGES = {
  configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062E\u0627\u062F\u0645 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
  sessionRequired: "\u0627\u0644\u062C\u0644\u0633\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
  rpcError: (message) => `\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645: ${message}`,
  profileMissing: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0644\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u062D\u0627\u0644\u064A.",
  permissionDenied: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621."
};
function tokenFromHeader(authorization, message) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AppError(message, 401);
  return token;
}
async function resolveActor(authorization, messages) {
  const resolved = { ...DEFAULT_MESSAGES, ...messages };
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error(resolved.configMissing);
  const actorClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${tokenFromHeader(authorization, resolved.sessionRequired)}` } }
  });
  const { data, error } = await actorClient.rpc("tips_crm_my_profile");
  if (error) throw new Error(resolved.rpcError(error.message));
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const profile = rows[0];
  if (!profile) throw new Error(resolved.profileMissing);
  const permissions = permissionsFromMembership({
    membershipPermissions: profile.membership_permissions,
    isPlatformAdmin: profile.is_platform_admin
  });
  return { actorClient, profile, permissions };
}
async function requirePermission(authorization, permission, messages) {
  const resolved = { ...DEFAULT_MESSAGES, ...messages };
  const actor = await resolveActor(authorization, resolved);
  if (!hasPermission(actor.permissions, permission)) throw new AppError(resolved.permissionDenied, 403);
  return actor;
}
async function requireCompanyPermission(authorization, permission, messages) {
  const actor = await requirePermission(authorization, permission, messages);
  if (!actor.profile.active_company_id) throw new Error(messages.noActiveCompany);
  return { ...actor, activeCompanyId: actor.profile.active_company_id };
}

// server/employee-account.ts
var CREATABLE_ROLES = ["manager", "supervisor", "rep", "accountant"];
var DISCIPLINES = ["sales", "medical"];
function validateTemporaryEmployeeInput(input) {
  if (input.fullName.trim().length < 2) return "\u0627\u0643\u062A\u0628 \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0644\u0645\u0648\u0638\u0641.";
  if (!/^\S+@\S+\.\S+$/.test(input.email.trim())) return "\u0627\u0643\u062A\u0628 \u0628\u0631\u064A\u062F\u0627\u064B \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B.";
  if (input.password.length < 8) return "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0624\u0642\u062A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062A\u0643\u0648\u0646 \u0645\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.";
  if (!CREATABLE_ROLES.includes(input.role)) return "\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0645\u0648\u0638\u0641.";
  const disciplines = Array.from(new Set(input.disciplines ?? []));
  if (!disciplines.every((discipline) => DISCIPLINES.includes(discipline))) return "\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0635 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0635\u062D\u064A\u062D.";
  const needsOneDiscipline = input.role === "rep" || input.role === "supervisor";
  if (needsOneDiscipline && disciplines.length !== 1) return "\u0627\u062E\u062A\u0631 \u0627\u062E\u062A\u0635\u0627\u0635\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B (\u0645\u0628\u064A\u0639\u0627\u062A \u0623\u0648 \u0637\u0628\u064A) \u0644\u0647\u0630\u0627 \u0627\u0644\u062F\u0648\u0631.";
  if (!needsOneDiscipline && disciplines.length !== 0) return "\u0647\u0630\u0627 \u0627\u0644\u062F\u0648\u0631 \u0644\u0627 \u064A\u0642\u0628\u0644 \u062A\u062D\u062F\u064A\u062F \u0627\u062E\u062A\u0635\u0627\u0635.";
  const territoryIds = input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : []);
  if (input.role === "rep" && territoryIds.length === 0) return "\u0627\u062E\u062A\u0631 \u0645\u0646\u0637\u0642\u0629 \u0639\u0645\u0644 \u0648\u0627\u062D\u062F\u0629 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0644\u0645\u0646\u062F\u0648\u0628.";
  return null;
}
function resolveEmployeeTerritories(territoryKeys, territoryLabels, availableTerritories) {
  const selected = territoryKeys.map((territoryKey, index) => availableTerritories.find((territory) => territory.client_key === territoryKey || territory.name === territoryLabels[index])).filter((territory) => Boolean(territory?.client_key));
  return { selected, keys: selected.map((territory) => territory.client_key), labels: selected.map((territory) => territory.name) };
}
function requireAdminConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) {
    throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  }
}
function validateResetEmployeePasswordInput(input) {
  if (input.password.length < 8) return "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0624\u0642\u062A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062A\u0643\u0648\u0646 \u0645\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.";
  return null;
}
async function requireEmployeeManager(authorization) {
  requireAdminConfig();
  const actor = await requireCompanyPermission(authorization, "employee.manage", {
    configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
    sessionRequired: "\u062C\u0644\u0633\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641.",
    rpcError: () => "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.",
    profileMissing: "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.",
    permissionDenied: "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0625\u062F\u0627\u0631\u0629 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646.",
    noActiveCompany: "\u0627\u062E\u062A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0634\u0637\u0629 \u0642\u0628\u0644 \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A."
  });
  const actorId = actor.profile.id;
  if (typeof actorId !== "string" || !actorId) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629.");
  const adminClient = createClient2(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return { actorClient: actor.actorClient, actorPermissions: actor.permissions, actorId, adminClient, activeCompanyId: actor.activeCompanyId };
}
async function rollbackEmployeeCreation(adminClient, userId) {
  await adminClient.auth.admin.deleteUser(userId);
  throw new Error("\u062A\u0639\u0630\u0631 \u062A\u0639\u064A\u064A\u0646 \u0635\u0644\u0627\u062D\u064A\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641 \u0648\u0645\u0646\u0627\u0637\u0642 \u0639\u0645\u0644\u0647\u061B \u0644\u0645 \u064A\u064F\u062D\u062A\u0641\u0638 \u0628\u0627\u0644\u062D\u0633\u0627\u0628.");
}
async function createTemporaryEmployeeAccount(input, authorization) {
  const validationError = validateTemporaryEmployeeInput(input);
  if (validationError) throw new Error(validationError);
  const { actorClient, actorPermissions, actorId: managerId, adminClient, activeCompanyId } = await requireEmployeeManager(authorization);
  const targetPermissions = SYSTEM_ROLE_PERMISSIONS[input.role];
  if (!canGrant(actorPermissions, targetPermissions)) {
    throw new Error("\u0627\u0644\u062F\u0648\u0631 \u0627\u0644\u0645\u062D\u062F\u062F \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0645\u0648\u0638\u0641.");
  }
  const [companyRes, membershipCountRes] = await Promise.all([
    adminClient.schema("tips_crm").from("companies").select("max_user_limit, payment_tier_key").eq("id", activeCompanyId).maybeSingle(),
    adminClient.schema("tips_crm").from("company_memberships").select("id", { count: "exact", head: true }).eq("company_id", activeCompanyId).eq("is_active", true)
  ]);
  const maxLimit = companyRes.data?.max_user_limit ?? 20;
  const currentCount = membershipCountRes.count ?? 0;
  if (currentCount >= maxLimit) {
    throw new Error(`\u062A\u062C\u0627\u0648\u0632\u062A \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647 \u0645\u0646 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u0641\u064A \u0628\u0627\u0642\u062A\u0647\u0627 \u0627\u0644\u062D\u0627\u0644\u064A\u0629 (\u0627\u0644\u062D\u062F \u0627\u0644\u0645\u0633\u0645\u0648\u062D: ${maxLimit} \u0645\u0648\u0638\u0641 / \u0627\u0644\u0645\u0633\u062C\u0644 \u062D\u0627\u0644\u064A\u0627\u064B: ${currentCount}). \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 \u0644\u062A\u0631\u0642\u064A\u0629 \u0627\u0644\u0628\u0627\u0642\u0629 \u0623\u0648 \u0632\u064A\u0627\u062F\u0629 \u0627\u0644\u0633\u0639\u0629.`);
  }
  const normalizedEmail = input.email.trim().toLowerCase();
  const disciplines = Array.from(new Set(input.disciplines ?? []));
  const territoryKeys = Array.from(new Set(input.territoryIds?.map((territoryId) => territoryId.trim()).filter(Boolean) ?? (input.territoryId?.trim() ? [input.territoryId.trim()] : [])));
  const submittedLabels = input.territoryLabels?.map((label) => label.trim()).filter(Boolean) ?? [];
  const territoryLabelsFromInput = submittedLabels.length ? submittedLabels : (input.territoryLabel ?? "").split("\u060C").map((label) => label.trim()).filter(Boolean);
  const { data: availableTerritories, error: territoriesError } = await actorClient.rpc("tips_crm_list_territories");
  if (territoriesError) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644 \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  const resolvedTerritories = resolveEmployeeTerritories(territoryKeys, territoryLabelsFromInput, availableTerritories ?? []);
  if (territoryKeys.length && resolvedTerritories.selected.length !== territoryKeys.length) throw new Error("\u0625\u062D\u062F\u0649 \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644 \u0644\u0645 \u062A\u0639\u062F \u0645\u062A\u0627\u062D\u0629. \u062D\u062F\u0651\u062B \u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u0645\u0646\u0627\u0637\u0642 \u062B\u0645 \u0627\u062E\u062A\u0631 \u0645\u0646\u0627\u0637\u0642 \u0645\u0639\u062A\u0645\u062F\u0629.");
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { full_name: input.fullName.trim(), territory_id: resolvedTerritories.keys[0] ?? null, territory_ids: resolvedTerritories.keys, territory_label: resolvedTerritories.labels.join("\u060C ") || (input.territoryLabel?.trim() || null), territory_labels: resolvedTerritories.labels }
  });
  if (createError || !created.user) {
    const detail = createError?.message?.toLowerCase().includes("already") ? "\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0645\u0633\u062C\u0644 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A." : "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641.";
    throw new Error(detail);
  }
  const { error: profileError } = await adminClient.schema("tips_crm").from("profiles").update({
    full_name: input.fullName.trim(),
    email: normalizedEmail,
    role_key: input.role,
    must_change_password: input.forcePasswordChange,
    temporary_password_issued_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", created.user.id);
  if (profileError) return rollbackEmployeeCreation(adminClient, created.user.id);
  const { error: membershipError } = await adminClient.schema("tips_crm").from("company_memberships").insert({
    company_id: activeCompanyId,
    profile_id: created.user.id,
    role_key: input.role,
    disciplines,
    is_active: true,
    reports_to_profile_id: input.reportsToProfileId ?? null
  });
  if (membershipError) return rollbackEmployeeCreation(adminClient, created.user.id);
  const { error: roleError } = await adminClient.schema("tips_crm").from("membership_roles").insert({
    company_id: activeCompanyId,
    profile_id: created.user.id,
    role_key: input.role,
    granted_by: managerId
  });
  if (roleError) return rollbackEmployeeCreation(adminClient, created.user.id);
  if (resolvedTerritories.selected.length) {
    const { error: territoryInsertError } = await adminClient.schema("tips_crm").from("territory_assignments").insert(
      resolvedTerritories.selected.map((territory) => ({ territory_id: territory.id, profile_id: created.user.id, company_id: activeCompanyId, assigned_by: managerId }))
    );
    if (territoryInsertError) return rollbackEmployeeCreation(adminClient, created.user.id);
  }
  await adminClient.schema("tips_crm").from("audit_log").insert({ actor_id: managerId, action: "employee_account_created", entity_type: "profile", entity_id: created.user.id, details: { email: normalizedEmail, role_key: input.role, disciplines, territory_keys: resolvedTerritories.keys, force_password_change: input.forcePasswordChange } });
  return { id: created.user.id, email: normalizedEmail, fullName: input.fullName.trim(), role: input.role, disciplines, forcePasswordChange: input.forcePasswordChange };
}
async function listEmployeeAccounts(authorization) {
  const { adminClient, activeCompanyId } = await requireEmployeeManager(authorization);
  const { data: membershipRows, error: membershipsError } = await adminClient.schema("tips_crm").from("company_memberships").select("profile_id").eq("company_id", activeCompanyId).eq("is_active", true);
  if (membershipsError) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0639\u0636\u0648\u064A\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629.");
  const profileIds = (membershipRows ?? []).map((membership) => membership.profile_id);
  if (!profileIds.length) return [];
  const [profilesResponse, usersResponse] = await Promise.all([
    adminClient.schema("tips_crm").from("profiles").select("id,full_name,email,role_key,must_change_password,temporary_password_issued_at").in("id", profileIds).order("full_name", { ascending: true }),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 200 })
  ]);
  if (profilesResponse.error || usersResponse.error) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u062F\u0644\u064A\u0644 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646.");
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
      emailConfirmed: Boolean(user?.email_confirmed_at)
    };
  });
}
async function resetEmployeePassword(employeeId, input, authorization) {
  const validationError = validateResetEmployeePasswordInput(input);
  if (validationError) throw new Error(validationError);
  const { actorId: managerId, adminClient, activeCompanyId } = await requireEmployeeManager(authorization);
  const { data: membership, error: membershipError } = await adminClient.schema("tips_crm").from("company_memberships").select("profile_id").eq("company_id", activeCompanyId).eq("profile_id", employeeId).eq("is_active", true).maybeSingle();
  if (membershipError || !membership) throw new Error("\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0636\u0645\u0646 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0646\u0634\u0637\u0629.");
  const { data: targetProfile, error: profileError } = await adminClient.schema("tips_crm").from("profiles").select("id,email,full_name").eq("id", employeeId).maybeSingle();
  if (profileError || !targetProfile) throw new Error("\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  const { error: updateError } = await adminClient.auth.admin.updateUserById(employeeId, { password: input.password, email_confirm: true });
  if (updateError) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0648\u0638\u0641.");
  const { error: profileUpdateError } = await adminClient.schema("tips_crm").from("profiles").update({ must_change_password: input.forcePasswordChange, temporary_password_issued_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", employeeId);
  if (profileUpdateError) throw new Error("\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0643\u0646 \u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u062D\u0633\u0627\u0628.");
  await adminClient.schema("tips_crm").from("audit_log").insert({ actor_id: managerId, action: "employee_password_reset", entity_type: "profile", entity_id: employeeId, details: { email: targetProfile.email, force_password_change: input.forcePasswordChange } });
  return { id: employeeId, email: targetProfile.email, fullName: targetProfile.full_name, forcePasswordChange: input.forcePasswordChange };
}

// server/plan-submission-email.ts
function escapeHtml2(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
function senderAddress2() {
  const address = ENV.resendFromEmail.match(/<([^>]+)>/)?.[1] ?? ENV.resendFromEmail;
  return `Tips CRM <${address}>`;
}
async function sendPlanSubmissionEmail(input) {
  if (!ENV.resendApiKey || !ENV.resendFromEmail || !ENV.supabaseUrl || !ENV.supabaseAnonKey) return { sent: 0, skipped: true };
  const prepared = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/tips_crm_prepare_plan_submission_email`, { method: "POST", headers: { apikey: ENV.supabaseAnonKey, Authorization: `Bearer ${input.supabaseAccessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ target_plan_id: input.planId }) });
  if (!prepared.ok) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u062E\u0637\u0629 \u0642\u0628\u0644 \u0625\u0631\u0633\u0627\u0644 \u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u0645\u062F\u064A\u0631.");
  const recipients = await prepared.json();
  await Promise.all(recipients.map(async (recipient) => {
    const subject = `\u062E\u0637\u0629 \u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u062C\u062F\u064A\u062F\u0629 \u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F \u2014 ${recipient.rep_name}`;
    const text2 = `\u0645\u0631\u062D\u0628\u0627\u064B ${recipient.manager_name}\u060C

\u0623\u0631\u0633\u0644 ${recipient.rep_name} \u062E\u0637\u0629 \xAB${recipient.plan_title}\xBB \u0644\u0644\u0641\u062A\u0631\u0629 ${recipient.period_label}.

\u0627\u0641\u062A\u062D \u0644\u0648\u062D\u0629 Tips CRM \u062B\u0645 \xAB\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062E\u0637\u0637\xBB \u0644\u0645\u0631\u0627\u062C\u0639\u062A\u0647\u0627 \u0648\u0627\u062A\u062E\u0627\u0630 \u0627\u0644\u0642\u0631\u0627\u0631.`;
    const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#143d35"><div style="max-width:560px;margin:32px auto;background:#fff;border:1px solid #dfebe6;border-radius:20px;padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">Tips CRM \xB7 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062E\u0637\u0637</div><h1 style="font-size:23px">\u062E\u0637\u0629 \u0623\u0633\u0628\u0648\u0639\u064A\u0629 \u062C\u062F\u064A\u062F\u0629 \u0628\u0627\u0646\u062A\u0638\u0627\u0631\u0643</h1><p>\u0645\u0631\u062D\u0628\u0627\u064B ${escapeHtml2(recipient.manager_name)}\u060C \u0623\u0631\u0633\u0644 <strong>${escapeHtml2(recipient.rep_name)}</strong> \u062E\u0637\u0629 <strong>${escapeHtml2(recipient.plan_title)}</strong> \u0644\u0644\u0641\u062A\u0631\u0629 ${escapeHtml2(recipient.period_label)}.</p><p style="color:#597068;line-height:1.8">\u0627\u0641\u062A\u062D \u0628\u0648\u0627\u0628\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u062B\u0645 \u0635\u0641\u062D\u0629 \xAB\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062E\u0637\u0637\xBB \u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u062A\u0648\u0632\u064A\u0639 \u0627\u0644\u0632\u064A\u0627\u0631\u0627\u062A \u0648\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062E\u0637\u0629 \u0623\u0648 \u0625\u0639\u0627\u062F\u062A\u0647\u0627 \u0644\u0644\u0645\u0646\u062F\u0648\u0628 \u0628\u0633\u0628\u0628 \u0648\u0627\u0636\u062D.</p><p style="text-align:center;margin-top:28px"><a href="${ENV.crmPublicUrl.replace(/\/$/, "")}/admin/weekly-plans" style="display:inline-block;background:#0d8068;color:#fff;padding:13px 22px;border-radius:10px;text-decoration:none;font-weight:700">\u0641\u062A\u062D \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u062E\u0637\u0637</a></p></div></body></html>`;
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: senderAddress2(), to: recipient.manager_email, subject, text: text2, html, tags: [{ name: "category", value: "plan-submitted" }, { name: "plan_id", value: input.planId }] }) });
    if (!response.ok) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u0633\u0644\u064A\u0645 \u0628\u0631\u064A\u062F \u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u062E\u0637\u0629 \u0625\u0644\u0649 \u0623\u062D\u062F \u0627\u0644\u0645\u062F\u064A\u0631\u064A\u0646.");
  }));
  return { sent: recipients.length, skipped: false };
}

// server/password-recovery-email.ts
var RESET_REQUEST_WINDOW_MS = 10 * 60 * 1e3;
var MAX_REQUESTS_PER_WINDOW = 3;
var recentRequests = /* @__PURE__ */ new Map();
function escapeHtml3(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
function getResetUrl(tokenHash) {
  const url = new URL(`${ENV.crmPublicUrl.replace(/\/+$/, "")}/reset-password`);
  url.searchParams.set("token_hash", tokenHash);
  url.searchParams.set("type", "recovery");
  return url.toString();
}
function checkRateLimit(email) {
  const now = Date.now();
  const validRequests = (recentRequests.get(email) ?? []).filter((timestamp) => now - timestamp < RESET_REQUEST_WINDOW_MS);
  if (validRequests.length >= MAX_REQUESTS_PER_WINDOW) return false;
  recentRequests.set(email, [...validRequests, now]);
  return true;
}
function requireConfiguration() {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u062F\u0627\u0631\u0629 Supabase \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0628\u0631\u064A\u062F \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
}
function buildPasswordRecoveryEmail(recipient, resetUrl) {
  const subject = "\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u2014 Tips CRM";
  const text2 = `\u0645\u0631\u062D\u0628\u0627\u064B\u060C

\u0648\u0635\u0644\u0646\u0627 \u0637\u0644\u0628 \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u062D\u0633\u0627\u0628\u0643 \u0641\u064A Tips CRM.

\u0627\u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u062A\u0627\u0644\u064A \u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629:
${resetUrl}

\u062A\u0646\u062A\u0647\u064A \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0631\u0627\u0628\u0637 \u0642\u0631\u064A\u0628\u0627\u064B. \u0625\u0630\u0627 \u0644\u0645 \u062A\u0637\u0644\u0628 \u0630\u0644\u0643\u060C \u064A\u0645\u0643\u0646\u0643 \u062A\u062C\u0627\u0647\u0644 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0628\u0623\u0645\u0627\u0646.`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">Tips CRM \xB7 \u0623\u0645\u0627\u0646 \u0627\u0644\u062D\u0633\u0627\u0628</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631</h1><p style="font-size:15px;line-height:1.8">\u0648\u0635\u0644\u0646\u0627 \u0637\u0644\u0628 \u0644\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u062D\u0633\u0627\u0628\u0643. \u0627\u0636\u063A\u0637 \u0627\u0644\u0632\u0631 \u0623\u062F\u0646\u0627\u0647 \u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062C\u062F\u064A\u062F\u0629.</p><p style="margin:26px 0;text-align:center"><a href="${escapeHtml3(resetUrl)}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">\u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631</a></p><p style="font-size:12px;line-height:1.7;color:#7c8c87">\u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0631\u0627\u0628\u0637 \u0642\u0635\u064A\u0631\u0629. \u0625\u0630\u0627 \u0644\u0645 \u062A\u0637\u0644\u0628 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646\u060C \u064A\u0645\u0643\u0646\u0643 \u062A\u062C\u0627\u0647\u0644 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0628\u0623\u0645\u0627\u0646.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text: text2, html, recipient };
}
async function sendManagedPasswordRecoveryEmail(rawEmail) {
  const email = rawEmail.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("\u0623\u062F\u062E\u0644 \u0628\u0631\u064A\u062F\u0627\u064B \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B.");
  if (!checkRateLimit(email)) return { sent: true, throttled: true };
  requireConfiguration();
  const generated = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: ENV.supabaseServiceRoleKey, Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ type: "recovery", email })
  });
  if (!generated.ok) return { sent: true, recipientExists: false };
  const payload = await generated.json();
  if (!payload.hashed_token) return { sent: true, recipientExists: false };
  const message = buildPasswordRecoveryEmail(email, getResetUrl(payload.hashed_token));
  const delivery = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${ENV.resendApiKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ from: ENV.resendFromEmail, to: message.recipient, subject: message.subject, html: message.html, text: message.text, tags: [{ name: "category", value: "password-recovery" }] })
  });
  if (!delivery.ok) throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629. \u062D\u0627\u0648\u0644 \u0644\u0627\u062D\u0642\u0627\u064B \u0623\u0648 \u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0646\u0638\u0627\u0645.");
  return { sent: true, recipientExists: true };
}

// server/platform-company.ts
import { createClient as createClient4 } from "@supabase/supabase-js";

// server/company-onboarding-email.ts
import { createClient as createClient3 } from "@supabase/supabase-js";
function requireMailConfig2() {
  if (!ENV.resendApiKey || !ENV.resendFromEmail) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0628\u0631\u064A\u062F \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
}
function escapeHtml4(value) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}
function statusUrl(referenceNumber2) {
  const url = new URL(`${ENV.crmPublicUrl}/request-status`);
  url.searchParams.set("ref", referenceNumber2);
  return url.toString();
}
function mailContent(input) {
  const name = input.recipientName.trim() || "\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0634\u0631\u0643\u0629";
  const companyName = input.companyName.trim();
  const reference = input.referenceNumber.toUpperCase();
  const publicStatusUrl = statusUrl(reference);
  const detail = input.detail?.trim() || "";
  const config = {
    request_received: {
      eyebrow: "Tips CRM \xB7 \u0637\u0644\u0628 \u0627\u0646\u0636\u0645\u0627\u0645 \u0634\u0631\u0643\u0629",
      title: "\u0627\u0633\u062A\u0644\u0645\u0646\u0627 \u0637\u0644\u0628 \u0627\u0646\u0636\u0645\u0627\u0645 \u0634\u0631\u0643\u062A\u0643",
      intro: `\u0634\u0643\u0631\u0627\u064B \u0644\u062A\u0642\u062F\u064A\u0645 \u0637\u0644\u0628 \u0634\u0631\u0643\u0629 ${companyName}. \u0637\u0644\u0628\u0643 \u0627\u0644\u0622\u0646 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0644\u062F\u0649 \u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629.`,
      actionLabel: "\u0645\u062A\u0627\u0628\u0639\u0629 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628",
      actionUrl: publicStatusUrl,
      footer: "\u0644\u0627 \u062A\u062D\u062A\u0627\u062C \u0625\u0644\u0649 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0645\u0631\u062D\u0644\u0629. \u0633\u0646\u0631\u0633\u0644 \u0631\u0633\u0627\u0644\u0629 \u0639\u0646\u062F \u0648\u062C\u0648\u062F \u062A\u062D\u062F\u064A\u062B \u0623\u0648 \u0639\u0646\u062F \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0637\u0644\u0628."
    },
    info_requested: {
      eyebrow: "Tips CRM \xB7 \u0645\u0637\u0644\u0648\u0628 \u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0645\u0639\u0644\u0648\u0645\u0627\u062A",
      title: "\u0646\u062D\u062A\u0627\u062C \u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0625\u0636\u0627\u0641\u064A\u0629 \u0644\u0625\u0643\u0645\u0627\u0644 \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629",
      intro: `\u0646\u0631\u0627\u062C\u0639 \u0637\u0644\u0628 \u0634\u0631\u0643\u0629 ${companyName} \u0648\u0646\u062D\u062A\u0627\u062C \u0645\u0646\u0643 \u062A\u0648\u0636\u064A\u062D\u0627\u064B \u0623\u0648 \u0627\u0633\u062A\u0643\u0645\u0627\u0644\u0627\u064B \u0642\u0628\u0644 \u0627\u062A\u062E\u0627\u0630 \u0627\u0644\u0642\u0631\u0627\u0631.`,
      actionLabel: "\u0645\u062A\u0627\u0628\u0639\u0629 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628",
      actionUrl: publicStatusUrl,
      footer: detail ? `\u0627\u0644\u0645\u0637\u0644\u0648\u0628: ${detail}` : "\u064A\u0631\u062C\u0649 \u0627\u0644\u0631\u062F \u0639\u0644\u0649 \u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 \u0628\u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629."
    },
    approved: {
      eyebrow: "Tips CRM \xB7 \u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0637\u0644\u0628",
      title: "\u062A\u0645 \u0627\u0639\u062A\u0645\u0627\u062F \u0637\u0644\u0628 \u0634\u0631\u0643\u062A\u0643",
      intro: `\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0627\u0646\u0636\u0645\u0627\u0645 \u0634\u0631\u0643\u0629 ${companyName}. \u0633\u0646\u0631\u0633\u0644 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0631\u0627\u0628\u0637\u0627\u064B \u0622\u0645\u0646\u0627\u064B \u0644\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062D\u0633\u0627\u0628 \u0648\u0627\u0644\u0628\u062F\u0621.`,
      actionLabel: "\u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u062D\u0627\u0644\u0629",
      actionUrl: publicStatusUrl,
      footer: "\u0625\u0630\u0627 \u0643\u0646\u062A \u0623\u0646\u062A \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u060C \u0631\u0627\u0642\u0628 \u0628\u0631\u064A\u062F\u0643 \u0644\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u0631\u0633\u0627\u0644\u0629 \u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062D\u0633\u0627\u0628."
    },
    rejected: {
      eyebrow: "Tips CRM \xB7 \u0646\u062A\u064A\u062C\u0629 \u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0637\u0644\u0628",
      title: "\u062A\u0645 \u0625\u063A\u0644\u0627\u0642 \u0637\u0644\u0628 \u0627\u0644\u0627\u0646\u0636\u0645\u0627\u0645",
      intro: `\u0628\u0639\u062F \u0645\u0631\u0627\u062C\u0639\u0629 \u0637\u0644\u0628 \u0634\u0631\u0643\u0629 ${companyName} \u062A\u0639\u0630\u0631 \u0627\u0639\u062A\u0645\u0627\u062F\u0647 \u0641\u064A \u0627\u0644\u0648\u0642\u062A \u0627\u0644\u062D\u0627\u0644\u064A.`,
      actionLabel: "\u0639\u0631\u0636 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628",
      actionUrl: publicStatusUrl,
      footer: detail ? `\u0633\u0628\u0628 \u0627\u0644\u0642\u0631\u0627\u0631: ${detail}` : "\u064A\u0645\u0643\u0646\u0643 \u0627\u0644\u062A\u0648\u0627\u0635\u0644 \u0645\u0639 \u0641\u0631\u064A\u0642 Tips \u0644\u0644\u062D\u0635\u0648\u0644 \u0639\u0644\u0649 \u062A\u0648\u0636\u064A\u062D \u0625\u0636\u0627\u0641\u064A."
    },
    manager_invitation: {
      eyebrow: "Tips CRM \xB7 \u0625\u0639\u062F\u0627\u062F \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629",
      title: "\u062D\u0633\u0627\u0628\u0643 \u0627\u0644\u0625\u062F\u0627\u0631\u064A \u062C\u0627\u0647\u0632",
      intro: `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0644\u0634\u0631\u0643\u0629 ${companyName}. \u0627\u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0622\u0645\u0646 \u0623\u062F\u0646\u0627\u0647 \u0644\u0627\u062E\u062A\u064A\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631\u0643 \u0648\u0627\u0644\u0628\u062F\u0621.`,
      actionLabel: "\u0625\u0639\u062F\u0627\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0648\u0627\u0644\u062F\u062E\u0648\u0644",
      actionUrl: input.activationUrl || publicStatusUrl,
      footer: "\u0627\u0644\u0631\u0627\u0628\u0637 \u0634\u062E\u0635\u064A \u0648\u0642\u0635\u064A\u0631 \u0627\u0644\u0635\u0644\u0627\u062D\u064A\u0629. \u0644\u0627 \u062A\u0634\u0627\u0631\u0643\u0647 \u0645\u0639 \u0623\u064A \u0634\u062E\u0635. \u0628\u0639\u062F \u0627\u0644\u0625\u0639\u062F\u0627\u062F \u0633\u062A\u062F\u062E\u0644 \u0625\u0644\u0649 \u0644\u0648\u062D\u0629 \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0628\u0627\u0634\u0631\u0629."
    }
  };
  const content = config[input.event];
  const subject = input.event === "manager_invitation" ? `\u0625\u0639\u062F\u0627\u062F \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u2014 ${companyName}` : `${content.title} \u2014 ${companyName}`;
  const text2 = `\u0645\u0631\u062D\u0628\u0627\u064B ${name}\u060C

${content.intro}

\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: ${reference}

${content.actionLabel}:
${content.actionUrl}

${content.footer}

\u0641\u0631\u064A\u0642 Tips CRM`;
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f4f8f6;font-family:Arial,sans-serif;color:#173c34"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border:1px solid #dfebe6;border-radius:20px" cellpadding="0" cellspacing="0"><tr><td style="padding:32px;text-align:right"><div style="font-size:12px;color:#0d8068;font-weight:700">${escapeHtml4(content.eyebrow)}</div><h1 style="font-size:24px;margin:12px 0;color:#143d35">${escapeHtml4(content.title)}</h1><p style="font-size:15px;line-height:1.8">\u0645\u0631\u062D\u0628\u0627\u064B ${escapeHtml4(name)}\u060C</p><p style="font-size:15px;line-height:1.8">${escapeHtml4(content.intro)}</p><div style="background:#e9f8f2;border-radius:10px;padding:10px 12px;font-size:13px;color:#0d8068;font-weight:700">\u0631\u0642\u0645 \u0627\u0644\u0637\u0644\u0628: ${escapeHtml4(reference)}</div><p style="margin:26px 0;text-align:center"><a href="${escapeHtml4(content.actionUrl)}" style="display:inline-block;background:#0d8068;color:#ffffff;text-decoration:none;padding:14px 24px;border-radius:10px;font-weight:700">${escapeHtml4(content.actionLabel)}</a></p><p style="font-size:12px;line-height:1.8;color:#597068">${escapeHtml4(content.footer)}</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text: text2, html };
}
async function responseFailureReason(response) {
  try {
    const payload = await response.json();
    return String(payload.message ?? payload.name ?? `Resend HTTP ${response.status}`).slice(0, 500);
  } catch {
    return `Resend HTTP ${response.status}`;
  }
}
async function recordDelivery2(input) {
  const adminClient = createClient3(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await adminClient.schema("tips_crm").from("company_request_email_deliveries").insert({
    request_id: input.requestId,
    event_type: input.event,
    recipient_email: input.recipientEmail.toLowerCase(),
    delivery_status: input.status,
    provider_message_id: input.providerMessageId ?? null,
    failure_reason: input.failureReason ?? null
  });
  if (error) console.warn("[company-onboarding-email] failed to record delivery", error.message);
}
function buildCompanyOnboardingEmail(input) {
  return { ...mailContent(input), from: ENV.resendFromEmail, to: input.recipientEmail.trim().toLowerCase() };
}
async function sendCompanyOnboardingEmail(input) {
  requireMailConfig2();
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
          { name: "request_id", value: input.requestId }
        ]
      })
    });
    if (!response.ok) {
      const reason = await responseFailureReason(response);
      await recordDelivery2({ ...input, status: "failed", failureReason: reason });
      throw new Error(`\u062A\u0639\u0630\u0631 \u062A\u0633\u0644\u064A\u0645 \u0627\u0644\u0628\u0631\u064A\u062F: ${reason}`);
    }
    const result = await response.json();
    await recordDelivery2({ ...input, status: "accepted_by_provider", providerMessageId: result.id ?? null });
    return { sent: true, messageId: result.id ?? null, recipient: message.to };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("\u062A\u0639\u0630\u0631 \u062A\u0633\u0644\u064A\u0645 \u0627\u0644\u0628\u0631\u064A\u062F:")) throw error;
    const reason = error instanceof Error ? error.message.slice(0, 500) : "\u0641\u0634\u0644 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641";
    await recordDelivery2({ ...input, status: "failed", failureReason: reason });
    throw error;
  }
}
async function generatePasswordSetupUrl(email) {
  requireMailConfig2();
  const response = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: ENV.supabaseServiceRoleKey, Authorization: `Bearer ${ENV.supabaseServiceRoleKey}`, "Content-Type": "application/json", "User-Agent": "Tips-CRM/1.0" },
    body: JSON.stringify({ type: "recovery", email: email.trim().toLowerCase() })
  });
  if (!response.ok) throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637 \u0625\u0639\u062F\u0627\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.");
  const payload = await response.json();
  if (!payload.hashed_token) throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637 \u0625\u0639\u062F\u0627\u062F \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.");
  const url = new URL(`${ENV.crmPublicUrl}/reset-password`);
  url.searchParams.set("token_hash", payload.hashed_token);
  url.searchParams.set("type", "recovery");
  return url.toString();
}
async function sendRequestReceivedEmail(input) {
  return sendCompanyOnboardingEmail({ ...input, event: "request_received" });
}
async function sendInfoRequestedEmail(input) {
  return sendCompanyOnboardingEmail({ ...input, event: "info_requested" });
}
async function sendApprovalEmail(input) {
  return sendCompanyOnboardingEmail({ ...input, event: "approved" });
}
async function sendRejectionEmail(input) {
  return sendCompanyOnboardingEmail({ ...input, event: "rejected" });
}
async function sendManagerInvitationEmail(input) {
  const activationUrl = await generatePasswordSetupUrl(input.recipientEmail);
  return sendCompanyOnboardingEmail({ ...input, event: "manager_invitation", activationUrl });
}

// server/platform-company.ts
function requireConfig() {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) {
    throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  }
}
function validSlug(value) {
  return /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(value);
}
function normalizeSlug(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}
function referenceNumber(requestId) {
  return requestId.slice(0, 8).toUpperCase();
}
function validateApproval(input) {
  if (!input.requestId.trim()) return "\u0645\u0639\u0631\u0651\u0641 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.";
  if (input.managerFullName.trim().length < 2) return "\u0627\u0643\u062A\u0628 \u0627\u0644\u0627\u0633\u0645 \u0627\u0644\u0643\u0627\u0645\u0644 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.";
  if (!/^\S+@\S+\.\S+$/.test(input.managerEmail.trim())) return "\u0627\u0643\u062A\u0628 \u0628\u0631\u064A\u062F\u0627\u064B \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.";
  if (input.managerPassword.length < 8) return "\u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0624\u0642\u062A\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u062A\u0643\u0648\u0646 \u0645\u0646 8 \u0623\u062D\u0631\u0641 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.";
  if (!validSlug(normalizeSlug(input.companySlug))) return "\u0631\u0645\u0632 \u0627\u0644\u0634\u0631\u0643\u0629 \u064A\u062C\u0628 \u0623\u0646 \u064A\u062A\u0643\u0648\u0646 \u0645\u0646 \u0623\u062D\u0631\u0641 \u0625\u0646\u062C\u0644\u064A\u0632\u064A\u0629 \u0635\u063A\u064A\u0631\u0629 \u0623\u0648 \u0623\u0631\u0642\u0627\u0645 \u0623\u0648 \u0634\u0631\u0637\u0627\u062A.";
  return null;
}
async function requirePlatformPermission(authorization, permission) {
  requireConfig();
  const deniedMessage = "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062E\u0635\u0635\u0629 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 \u0641\u0642\u0637.";
  const actor = await requirePermission(authorization, permission, {
    configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0646\u0635\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
    sessionRequired: "\u062C\u0644\u0633\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
    rpcError: () => deniedMessage,
    profileMissing: deniedMessage,
    permissionDenied: deniedMessage
  });
  const adminClient = createClient4(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
  return { actorClient: actor.actorClient, adminClient };
}
async function getPlatformRequest(adminClient, requestId) {
  const { data, error } = await adminClient.schema("tips_crm").from("company_requests").select("id,company_name,contact_name,contact_email,status,approved_company_id,manager_profile_id").eq("id", requestId).maybeSingle();
  if (error || !data) throw new Error("\u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  return data;
}
async function getManagerProfile(adminClient, managerProfileId) {
  if (!managerProfileId) throw new Error("\u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D \u0644\u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u062F\u0639\u0648\u0629.");
  const { data, error } = await adminClient.schema("tips_crm").from("profiles").select("full_name,email").eq("id", managerProfileId).maybeSingle();
  if (error || !data?.email) throw new Error("\u0628\u064A\u0627\u0646\u0627\u062A \u0628\u0631\u064A\u062F \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D\u0629.");
  return data;
}
async function sendManagerSetupInvitation(adminClient, request, manager) {
  const delivery = await sendManagerInvitationEmail({
    requestId: request.id,
    recipientEmail: manager.email,
    recipientName: manager.full_name,
    companyName: request.company_name,
    referenceNumber: referenceNumber(request.id)
  });
  const { error } = await adminClient.schema("tips_crm").from("company_requests").update({
    status: "invitation_sent",
    invitation_sent_at: (/* @__PURE__ */ new Date()).toISOString(),
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", request.id).in("status", ["approved", "invitation_sent"]);
  if (error) throw new Error("\u062A\u0645 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u062F\u0639\u0648\u0629 \u0644\u0643\u0646 \u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u062D\u0627\u0644\u062A\u0647\u0627. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u0644\u0644\u062A\u062D\u0642\u0642.");
  return delivery;
}
async function approvePreparedRequest(input, authorization) {
  const validationError = validateApproval(input);
  if (validationError) throw new Error(validationError);
  const { actorClient, adminClient } = await requirePlatformPermission(authorization, "platform.company.review");
  const email = input.managerEmail.trim().toLowerCase();
  const slug = normalizeSlug(input.companySlug);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password: input.managerPassword,
    email_confirm: true,
    user_metadata: { full_name: input.managerFullName.trim() }
  });
  if (createError || !created.user) {
    if (createError?.message?.toLowerCase().includes("already")) throw new Error("\u064A\u0648\u062C\u062F \u062D\u0633\u0627\u0628 \u0645\u0633\u062C\u0644 \u0628\u0647\u0630\u0627 \u0627\u0644\u0628\u0631\u064A\u062F \u0627\u0644\u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A.");
    throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.");
  }
  const { data: companyId, error: approvalError } = await actorClient.rpc("tips_crm_approve_company_request", {
    target_request_id: input.requestId,
    target_profile_id: created.user.id,
    approved_slug: slug,
    manager_full_name: input.managerFullName.trim(),
    manager_email: email,
    selected_plan_key: input.planKey?.trim() || "standard"
  });
  if (approvalError || !companyId) {
    await adminClient.auth.admin.deleteUser(created.user.id);
    throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0634\u0631\u0643\u0629 \u0648\u0631\u0628\u0637 \u0645\u062F\u064A\u0631\u0647\u0627\u061B \u0644\u0645 \u064A\u064F\u062D\u062A\u0641\u0638 \u0628\u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u062F\u064A\u0631.");
  }
  const request = await getPlatformRequest(adminClient, input.requestId);
  const delivery = { approvalEmail: false, managerInvitation: false, warnings: [] };
  try {
    await sendApprovalEmail({
      requestId: request.id,
      recipientEmail: request.contact_email,
      recipientName: request.contact_name,
      companyName: request.company_name,
      referenceNumber: referenceNumber(request.id)
    });
    delivery.approvalEmail = true;
  } catch (error) {
    delivery.warnings.push(error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F.");
  }
  try {
    await sendManagerSetupInvitation(adminClient, request, { full_name: input.managerFullName.trim(), email });
    delivery.managerInvitation = true;
  } catch (error) {
    delivery.warnings.push(error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u062F\u0639\u0648\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.");
  }
  return { companyId: String(companyId), managerEmail: email, companySlug: slug, delivery };
}
async function approveCompanyRequest(input, authorization) {
  return approvePreparedRequest(input, authorization);
}
async function createCompanyDirect(input, authorization) {
  if (input.companyName.trim().length < 2) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629.");
  if (input.contactName.trim().length < 2) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u062C\u0647\u0629 \u0627\u0644\u0627\u062A\u0635\u0627\u0644.");
  if (!/^\S+@\S+\.\S+$/.test(input.contactEmail.trim())) throw new Error("\u0627\u0643\u062A\u0628 \u0628\u0631\u064A\u062F \u062C\u0647\u0629 \u0627\u062A\u0635\u0627\u0644 \u0635\u062D\u064A\u062D\u0627\u064B.");
  const approvalError = validateApproval({
    requestId: "direct",
    companySlug: input.companySlug,
    managerFullName: input.managerFullName,
    managerEmail: input.managerEmail,
    managerPassword: input.managerPassword,
    planKey: input.planKey
  });
  if (approvalError) throw new Error(approvalError);
  const { adminClient } = await requirePlatformPermission(authorization, "platform.company.review");
  const { data: request, error: requestError } = await adminClient.schema("tips_crm").from("company_requests").insert({
    company_name: input.companyName.trim(),
    requested_slug: normalizeSlug(input.companySlug),
    contact_name: input.contactName.trim(),
    contact_email: input.contactEmail.trim().toLowerCase(),
    contact_phone: input.contactPhone?.trim() || null,
    expected_user_count: input.expectedUserCount ?? null,
    notes: input.notes?.trim() || null,
    activity_type: input.activityType?.trim() || null,
    status: "submitted"
  }).select("id").single();
  if (requestError || !request) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u0634\u0631\u0643\u0629 \u0627\u0644\u062C\u062F\u064A\u062F\u0629.");
  try {
    return await approvePreparedRequest({
      requestId: request.id,
      companySlug: input.companySlug,
      managerFullName: input.managerFullName,
      managerEmail: input.managerEmail,
      managerPassword: input.managerPassword,
      planKey: input.planKey
    }, authorization);
  } catch (error) {
    await adminClient.schema("tips_crm").from("company_requests").delete().eq("id", request.id).eq("status", "submitted");
    throw error;
  }
}
async function addRequestNote(input, authorization) {
  if (!input.requestId.trim()) throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  if (input.noteText.trim().length < 1) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629 \u0623\u0648\u0644\u0627\u064B.");
  const { actorClient } = await requirePlatformPermission(authorization, "platform.company.review");
  const { data, error } = await actorClient.rpc("tips_crm_add_company_request_note", {
    target_request_id: input.requestId,
    target_note_text: input.noteText.trim(),
    target_is_internal: true
  });
  if (error || !data) throw new Error("\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  return { noteId: String(data) };
}
async function requestMoreInfo(input, authorization) {
  if (!input.requestId.trim()) throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  if (input.informationNeeded.trim().length < 3) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0627\u0644\u0645\u0637\u0644\u0648\u0628\u0629 \u0628\u0648\u0636\u0648\u062D.");
  const { actorClient, adminClient } = await requirePlatformPermission(authorization, "platform.company.review");
  const { data, error } = await actorClient.rpc("tips_crm_request_company_info", {
    target_request_id: input.requestId,
    information_needed: input.informationNeeded.trim()
  });
  if (error || !data) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u0648\u064A\u0644 \u0627\u0644\u0637\u0644\u0628 \u0625\u0644\u0649 \u062D\u0627\u0644\u0629 \u0627\u0633\u062A\u0643\u0645\u0627\u0644 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.");
  const request = await getPlatformRequest(adminClient, input.requestId);
  try {
    await sendInfoRequestedEmail({
      requestId: request.id,
      recipientEmail: request.contact_email,
      recipientName: request.contact_name,
      companyName: request.company_name,
      referenceNumber: referenceNumber(request.id),
      detail: input.informationNeeded.trim()
    });
    return { emailSent: true, warning: null };
  } catch (reason) {
    return { emailSent: false, warning: reason instanceof Error ? reason.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0637\u0644\u0628 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A." };
  }
}
async function reviewCompanyRequest(input, authorization) {
  if (!input.requestId.trim()) throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  const { actorClient, adminClient } = await requirePlatformPermission(authorization, "platform.company.review");
  const request = await getPlatformRequest(adminClient, input.requestId);
  const { data, error } = await actorClient.rpc("tips_crm_review_company_request", {
    target_request_id: input.requestId,
    next_status: input.status,
    next_review_note: input.reviewNote?.trim() || null
  });
  if (error || !data) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  if (input.status !== "rejected") return { emailSent: false, warning: null };
  try {
    await sendRejectionEmail({
      requestId: request.id,
      recipientEmail: request.contact_email,
      recipientName: request.contact_name,
      companyName: request.company_name,
      referenceNumber: referenceNumber(request.id),
      detail: input.reviewNote?.trim() || null
    });
    return { emailSent: true, warning: null };
  } catch (reason) {
    return { emailSent: false, warning: reason instanceof Error ? reason.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0631\u0641\u0636." };
  }
}
async function resendManagerInvitation(companyId, authorization) {
  if (!companyId.trim()) throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  const { adminClient } = await requirePlatformPermission(authorization, "platform.company.review");
  const { data, error } = await adminClient.schema("tips_crm").from("company_requests").select("id,company_name,contact_name,contact_email,status,approved_company_id,manager_profile_id").eq("approved_company_id", companyId).in("status", ["approved", "invitation_sent"]).is("invitation_cancelled_at", null).maybeSingle();
  if (error || !data) throw new Error("\u0644\u0627 \u062A\u0648\u062C\u062F \u062F\u0639\u0648\u0629 \u0646\u0634\u0637\u0629 \u0642\u0627\u0628\u0644\u0629 \u0644\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0625\u0631\u0633\u0627\u0644 \u0644\u0647\u0630\u0647 \u0627\u0644\u0634\u0631\u0643\u0629.");
  const request = data;
  const manager = await getManagerProfile(adminClient, request.manager_profile_id);
  const delivery = await sendManagerSetupInvitation(adminClient, request, manager);
  return { delivery, requestId: request.id };
}
async function cancelManagerInvitation(requestId, authorization) {
  return reviewCompanyRequest({ requestId, status: "cancelled", reviewNote: "\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u062F\u0639\u0648\u0629 \u0625\u0639\u062F\u0627\u062F \u062D\u0633\u0627\u0628 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0628\u0648\u0627\u0633\u0637\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0646\u0635\u0629." }, authorization);
}
async function getPublicCompanyRequestStatus(referenceId) {
  requireConfig();
  const normalizedReference = referenceId.trim().toLowerCase();
  if (!/^[a-f0-9]{8}$/.test(normalizedReference)) return null;
  const publicClient = createClient4(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await publicClient.rpc("tips_crm_get_company_request_public_status", { reference_id: normalizedReference });
  if (error) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0622\u0646.");
  return data?.[0] ?? null;
}
async function createPublicCompanyRequest(input) {
  requireConfig();
  const companyName = input.companyName.trim();
  const contactName = input.contactName.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  if (companyName.length < 2) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629.");
  if (contactName.length < 2) throw new Error("\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u062A\u0648\u0627\u0635\u0644.");
  if (!/^\S+@\S+\.\S+$/.test(contactEmail)) throw new Error("\u0627\u0643\u062A\u0628 \u0628\u0631\u064A\u062F\u0627\u064B \u0625\u0644\u0643\u062A\u0631\u0648\u0646\u064A\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B.");
  const expectedUserCount = input.expectedUserCount && input.expectedUserCount > 0 ? input.expectedUserCount : null;
  const publicClient = createClient4(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await publicClient.rpc("tips_crm_create_company_request", {
    request_company_name: companyName,
    request_contact_name: contactName,
    request_contact_email: contactEmail,
    request_contact_phone: input.contactPhone?.trim() || null,
    request_expected_user_count: expectedUserCount,
    request_notes: input.notes?.trim() || null,
    request_activity_type: input.activityType?.trim() || null
  });
  if (error || !data) throw new Error("\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0627\u0644\u0637\u0644\u0628 \u0627\u0644\u0622\u0646. \u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0648\u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.");
  const requestId = String(data);
  try {
    await sendRequestReceivedEmail({
      requestId,
      recipientEmail: contactEmail,
      recipientName: contactName,
      companyName,
      referenceNumber: referenceNumber(requestId)
    });
  } catch (reason) {
    console.warn("[company-onboarding] request-received email was not delivered", reason);
  }
  return { requestId, referenceNumber: referenceNumber(requestId) };
}
async function updateCompanySubscription(input, authorization) {
  if (!input.companyId?.trim()) throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F.");
  if (input.maxUserLimit < 1) throw new Error("\u062D\u062F \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 1 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644.");
  const { adminClient } = await requirePlatformPermission(authorization, "platform.package.manage");
  const { error } = await adminClient.schema("tips_crm").from("companies").update({
    payment_tier_key: input.paymentTierKey.trim(),
    max_user_limit: input.maxUserLimit,
    updated_at: (/* @__PURE__ */ new Date()).toISOString()
  }).eq("id", input.companyId);
  if (error) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0628\u0627\u0642\u0629 \u0648\u0633\u0639\u0629 \u0627\u0644\u0634\u0631\u0643\u0629.");
  return { companyId: input.companyId, paymentTierKey: input.paymentTierKey, maxUserLimit: input.maxUserLimit };
}

// server/routes/platform-router.ts
import { Router } from "express";
var platformRouter = Router();
platformRouter.post("/company-requests/:requestId/approve", async (req, res) => {
  try {
    const company = await approveCompanyRequest({ ...req.body, requestId: req.params.requestId }, req.header("authorization"));
    res.status(201).json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0627\u0639\u062A\u0645\u0627\u062F \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/company-requests/:requestId/review", async (req, res) => {
  try {
    const review = await reviewCompanyRequest({ requestId: req.params.requestId, status: req.body?.status, reviewNote: req.body?.reviewNote }, req.header("authorization"));
    res.json({ ok: true, review });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0645\u0631\u0627\u062C\u0639\u0629 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/company-requests/:requestId/notes", async (req, res) => {
  try {
    const note = await addRequestNote({ requestId: req.params.requestId, noteText: String(req.body?.noteText ?? "") }, req.header("authorization"));
    res.status(201).json({ note });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0637\u0644\u0628.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/company-requests/:requestId/request-info", async (req, res) => {
  try {
    const result = await requestMoreInfo({ requestId: req.params.requestId, informationNeeded: String(req.body?.informationNeeded ?? "") }, req.header("authorization"));
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0637\u0644\u0628 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0645\u0646 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/company-requests/:requestId/cancel-invitation", async (req, res) => {
  try {
    const result = await cancelManagerInvitation(req.params.requestId, req.header("authorization"));
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0644\u063A\u0627\u0621 \u062F\u0639\u0648\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/companies", async (req, res) => {
  try {
    const company = await createCompanyDirect(req.body, req.header("authorization"));
    res.status(201).json({ company });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/companies/:companyId/resend-invitation", async (req, res) => {
  try {
    const result = await resendManagerInvitation(req.params.companyId, req.header("authorization"));
    res.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0639\u0627\u062F\u0629 \u0625\u0631\u0633\u0627\u0644 \u062F\u0639\u0648\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/companies/:companyId/status", async (req, res) => {
  try {
    const newStatus = req.body?.status;
    if (!["active", "suspended"].includes(newStatus)) {
      res.status(400).json({ message: "\u062D\u0627\u0644\u0629 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629." });
      return;
    }
    const { actorClient } = await requirePermission(req.header("authorization"), "platform.company.suspend");
    const { error } = await actorClient.schema("tips_crm").from("companies").update({ status: newStatus, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", req.params.companyId);
    if (error) throw new AppError("\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0634\u0631\u0643\u0629.", 400);
    res.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u062D\u0627\u0644\u0629 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.post("/companies/:companyId/plan-limit", async (req, res) => {
  try {
    const result = await updateCompanySubscription(
      {
        companyId: req.params.companyId,
        paymentTierKey: String(req.body?.planKey ?? "standard"),
        maxUserLimit: Number(req.body?.maxUserLimit) || 20
      },
      req.header("authorization")
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0628\u0627\u0642\u0629 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});
platformRouter.put("/companies/:companyId/subscription", async (req, res) => {
  try {
    const result = await updateCompanySubscription(
      {
        companyId: req.params.companyId,
        paymentTierKey: String(req.body?.paymentTierKey ?? "standard"),
        maxUserLimit: Number(req.body?.maxUserLimit) || 20
      },
      req.header("authorization")
    );
    res.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0634\u062A\u0631\u0627\u0643 \u0648\u0633\u0639\u0629 \u0627\u0644\u0634\u0631\u0643\u0629.";
    const statusCode = error instanceof AppError ? error.statusCode : 400;
    res.status(statusCode).json({ message });
  }
});

// server/routes/company-router.ts
import { Router as Router2 } from "express";

// server/company-setup.ts
function validateCompanyOperationalSetup(input) {
  if (!input.companyName?.trim() || input.companyName.trim().length < 2) return "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0634\u0631\u0643\u0629 \u0628\u0635\u0648\u0631\u0629 \u0635\u062D\u064A\u062D\u0629.";
  if (!input.activityType?.trim() || input.activityType.trim().length < 2) return "\u0627\u0643\u062A\u0628 \u0637\u0628\u064A\u0639\u0629 \u0646\u0634\u0627\u0637 \u0627\u0644\u0634\u0631\u0643\u0629.";
  if (!input.workingDays?.length) return "\u0627\u062E\u062A\u0631 \u064A\u0648\u0645\u0627\u064B \u0648\u0627\u062D\u062F\u0627\u064B \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0644\u0639\u0645\u0644.";
  if (!input.workdayStartsAt || !input.workdayEndsAt || input.workdayStartsAt >= input.workdayEndsAt) return "\u062A\u062D\u0642\u0642 \u0645\u0646 \u0648\u0642\u062A \u0628\u062F\u0627\u064A\u0629 \u0648\u0646\u0647\u0627\u064A\u0629 \u0627\u0644\u062F\u0648\u0627\u0645.";
  if (input.supportEmail?.trim() && !/^\S+@\S+\.\S+$/.test(input.supportEmail.trim())) return "\u0627\u0643\u062A\u0628 \u0628\u0631\u064A\u062F \u062F\u0639\u0645 \u0635\u062D\u064A\u062D\u0627\u064B \u0623\u0648 \u0627\u062A\u0631\u0643 \u0627\u0644\u062D\u0642\u0644 \u0641\u0627\u0631\u063A\u0627\u064B.";
  return null;
}
async function requireCompanyManager(authorization) {
  const actor = await requireCompanyPermission(authorization, "company.profile.update", {
    configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
    sessionRequired: "\u062C\u0644\u0633\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
    rpcError: (message) => `\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0645\u0644\u0641 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629: ${message}`,
    profileMissing: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0644\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u062D\u0627\u0644\u064A.",
    permissionDenied: "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062E\u0635\u0635\u0629 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0641\u0642\u0637.",
    noActiveCompany: "\u0645\u0644\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0644\u0627 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0634\u0631\u0643\u0629 \u0646\u0634\u0637\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u062F\u0627\u0644\u0629 tips_crm_my_profile \u0641\u064A Supabase."
  });
  return actor.actorClient;
}
function mapSetup(row) {
  return {
    companyId: String(row.company_id ?? ""),
    companyName: String(row.company_name ?? ""),
    legalName: String(row.legal_name ?? ""),
    activityType: String(row.activity_type ?? ""),
    businessPhone: String(row.business_phone ?? ""),
    supportEmail: String(row.support_email ?? ""),
    timezone: String(row.timezone ?? "Africa/Khartoum"),
    workingDays: Array.isArray(row.working_days) ? row.working_days.map(String) : [],
    workdayStartsAt: String(row.workday_starts_at ?? "08:00"),
    workdayEndsAt: String(row.workday_ends_at ?? "17:00"),
    gpsTrackingRequired: Boolean(row.gps_tracking_required),
    outsideVisitTracking: Boolean(row.outside_visit_tracking),
    geofenceEnforcement: Boolean(row.geofence_enforcement),
    isSetupComplete: Boolean(row.is_setup_complete),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    territoryCount: Number(row.territory_count ?? 0),
    teamMemberCount: Number(row.team_member_count ?? 0),
    accountCount: Number(row.account_count ?? 0)
  };
}
async function getCompanyOperationalSetup(authorization) {
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_get_company_operational_setup");
  const row = data?.[0];
  if (error || !row) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  return mapSetup(row);
}
async function saveCompanyOperationalSetup(input, authorization) {
  const validationError = validateCompanyOperationalSetup(input);
  if (validationError) throw new Error(validationError);
  const actorClient = await requireCompanyManager(authorization);
  const { data, error } = await actorClient.rpc("tips_crm_save_company_operational_setup", {
    input_company_name: input.companyName.trim(),
    input_legal_name: String(input.legalName ?? "").trim(),
    input_activity_type: input.activityType.trim(),
    input_business_phone: String(input.businessPhone ?? "").trim(),
    input_support_email: String(input.supportEmail ?? "").trim(),
    input_working_days: input.workingDays,
    input_workday_starts_at: input.workdayStartsAt,
    input_workday_ends_at: input.workdayEndsAt,
    input_gps_tracking_required: input.gpsTrackingRequired,
    input_outside_visit_tracking: input.outsideVisitTracking,
    input_geofence_enforcement: input.geofenceEnforcement
  });
  if (error || !data) throw new Error("\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629. \u062A\u0623\u0643\u062F \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062B\u0645 \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649.");
  return getCompanyOperationalSetup(authorization);
}

// shared/auth/legacy-role-key.ts
var LEGACY_ROLE_MAP = {
  company_manager: { role: "manager", disciplines: [] },
  sales_manager: { role: "manager", disciplines: [] },
  sales_supervisor: { role: "supervisor", disciplines: ["sales"] },
  medical_supervisor: { role: "supervisor", disciplines: ["medical"] },
  sales_rep: { role: "rep", disciplines: ["sales"] },
  medical_rep: { role: "rep", disciplines: ["medical"] },
  accountant: { role: "accountant", disciplines: [] }
};
function legacyRoleMappingFor(roleKey) {
  if (!roleKey) return { role: null, disciplines: [] };
  return LEGACY_ROLE_MAP[roleKey] ?? { role: null, disciplines: [] };
}

// server/company-team-setup.ts
async function requireCompanyManager2(authorization) {
  const deniedMessage = "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062E\u0635\u0635\u0629 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0641\u0642\u0637.";
  const actor = await requireCompanyPermission(authorization, "employee.manage", {
    configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0641\u0631\u064A\u0642 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
    sessionRequired: "\u062C\u0644\u0633\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
    rpcError: () => deniedMessage,
    profileMissing: deniedMessage,
    permissionDenied: deniedMessage,
    noActiveCompany: deniedMessage
  });
  return actor.actorClient;
}
function mapMember(row) {
  return {
    profileId: row.profile_id,
    fullName: row.full_name,
    email: row.email,
    roleKey: row.role_key,
    reportsToProfileId: row.reports_to_profile_id,
    reportsToName: row.reports_to_name,
    isActive: Boolean(row.is_active)
  };
}
function buildCompanyTeamSetup(rows) {
  const members = rows.filter((row) => row.is_active).map(mapMember);
  const byRole = (roleKey) => members.filter((member) => member.roleKey === roleKey);
  const salesSupervisors = byRole("sales_supervisor");
  const medicalSupervisors = byRole("medical_supervisor");
  const accountants = byRole("accountant");
  const salesRepresentatives = byRole("sales_rep");
  const medicalRepresentatives = byRole("medical_rep");
  const eligibleForDiscipline = (discipline) => members.filter((member) => {
    const { role, disciplines } = legacyRoleMappingFor(member.roleKey);
    return role === "manager" || role === "supervisor" && disciplines.includes(discipline);
  });
  return {
    members,
    salesSupervisors,
    medicalSupervisors,
    accountants,
    salesRepresentatives,
    medicalRepresentatives,
    eligibleSalesManagers: eligibleForDiscipline("sales"),
    eligibleMedicalManagers: eligibleForDiscipline("medical"),
    isTeamSetupStarted: salesSupervisors.length + medicalSupervisors.length + accountants.length + salesRepresentatives.length + medicalRepresentatives.length > 0
  };
}
async function getCompanyTeamSetup(authorization) {
  const actorClient = await requireCompanyManager2(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("get_company_team_setup");
  if (error) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0647\u064A\u0643\u0644 \u0641\u0631\u064A\u0642 \u0627\u0644\u0634\u0631\u0643\u0629. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  return buildCompanyTeamSetup(data ?? []);
}

// server/company-territory-setup.ts
async function requireCompanyManager3(authorization) {
  const deniedMessage = "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062E\u0635\u0635\u0629 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0641\u0642\u0637.";
  const actor = await requireCompanyPermission(authorization, "territory.manage", {
    configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0634\u0631\u0643\u0629 \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
    sessionRequired: "\u062C\u0644\u0633\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
    rpcError: () => deniedMessage,
    profileMissing: deniedMessage,
    permissionDenied: deniedMessage,
    noActiveCompany: deniedMessage
  });
  return actor.actorClient;
}
function pointsFromUnknown(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((point) => {
    if (!point || typeof point !== "object") return [];
    const candidate = point;
    const latitude = Number(candidate.latitude);
    const longitude = Number(candidate.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [{ latitude, longitude }] : [];
  });
}
function mapTerritory(row) {
  return { clientKey: row.client_key, name: row.name, state: row.state, city: row.city, centerLatitude: Number(row.center_latitude), centerLongitude: Number(row.center_longitude), radiusMeters: Number(row.radius_meters), polygonPoints: pointsFromUnknown(row.polygon_points), assignedMemberCount: Number(row.assigned_member_count), isBoundaryComplete: Boolean(row.is_boundary_complete) };
}
function validateCompanyTerritory(input) {
  if (!input.name?.trim() || input.name.trim().length < 2) return "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0639\u0645\u0644 \u0628\u0635\u0648\u0631\u0629 \u0648\u0627\u0636\u062D\u0629.";
  if (!input.state?.trim() || !input.city?.trim()) return "\u0627\u062E\u062A\u0631 \u0627\u0644\u0648\u0644\u0627\u064A\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u0642\u0628\u0644 \u0627\u0644\u062D\u0641\u0638.";
  if (!Number.isFinite(input.centerLatitude) || !Number.isFinite(input.centerLongitude) || Math.abs(Number(input.centerLatitude)) > 90 || Math.abs(Number(input.centerLongitude)) > 180) return "\u062D\u062F\u062F \u0645\u0631\u0643\u0632\u0627\u064B \u062C\u063A\u0631\u0627\u0641\u064A\u0627\u064B \u0635\u062D\u064A\u062D\u0627\u064B \u0644\u0644\u0645\u0646\u0637\u0642\u0629.";
  if (!Number.isInteger(input.radiusMeters) || Number(input.radiusMeters) < 100 || Number(input.radiusMeters) > 1e5) return "\u0627\u062E\u062A\u0631 \u0646\u0637\u0627\u0642\u0627\u064B \u062C\u063A\u0631\u0627\u0641\u064A\u0627\u064B \u0628\u064A\u0646 100 \u0645\u062A\u0631 \u0648100 \u0643\u064A\u0644\u0648\u0645\u062A\u0631.";
  const polygonPoints = input.polygonPoints ?? [];
  if (polygonPoints.length > 0 && polygonPoints.length < 3) return "\u0623\u0636\u0641 \u062B\u0644\u0627\u062B \u0646\u0642\u0627\u0637 \u0639\u0644\u0649 \u0627\u0644\u0623\u0642\u0644 \u0644\u0644\u062D\u062F \u0627\u0644\u0645\u0636\u0644\u0639 \u0623\u0648 \u0627\u0645\u0633\u062D \u0627\u0644\u0646\u0642\u0627\u0637 \u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0646\u0637\u0627\u0642 \u0627\u0644\u062F\u0627\u0626\u0631\u064A.";
  if (polygonPoints.some((point) => !Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180)) return "\u062A\u0648\u062C\u062F \u0646\u0642\u0637\u0629 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629 \u0636\u0645\u0646 \u062D\u062F\u0648\u062F \u0627\u0644\u0645\u0646\u0637\u0642\u0629.";
  return null;
}
function buildCompanyTerritorySetup(rows) {
  const territories = rows.map(mapTerritory);
  return { territories, territoryCount: territories.length, assignedTerritoryCount: territories.filter((territory) => territory.assignedMemberCount > 0).length, isTerritorySetupStarted: territories.length > 0 };
}
async function getCompanyTerritorySetup(authorization) {
  const actorClient = await requireCompanyManager3(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("get_company_territory_setup");
  if (error) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  return buildCompanyTerritorySetup(data ?? []);
}
async function saveCompanyTerritory(input, authorization) {
  const validationError = validateCompanyTerritory(input);
  if (validationError) throw new Error(validationError);
  const actorClient = await requireCompanyManager3(authorization);
  const { data, error } = await actorClient.schema("tips_crm").rpc("save_company_territory", { input_client_key: input.clientKey?.trim() || null, input_name: input.name.trim(), input_state: input.state.trim(), input_city: input.city.trim(), input_center_latitude: input.centerLatitude, input_center_longitude: input.centerLongitude, input_radius_meters: input.radiusMeters, input_polygon_points: input.polygonPoints ?? [] });
  const row = data?.[0];
  if (error || !row) throw new Error(error?.message.includes("already exists") ? "\u0647\u0630\u0647 \u0627\u0644\u0645\u0646\u0637\u0642\u0629 \u0645\u0633\u062C\u0644\u0629 \u0628\u0627\u0644\u0641\u0639\u0644 \u0641\u064A \u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u0627\u0644\u0645\u062E\u062A\u0627\u0631\u0629." : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0639\u0645\u0644. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  return mapTerritory(row);
}

// server/company-account-import.ts
var validAccountTypes = /* @__PURE__ */ new Set(["doctor", "pharmacy", "hospital", "distributor"]);
async function requireCompanyManager4(authorization) {
  const deniedMessage = "\u0647\u0630\u0647 \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0645\u062E\u0635\u0635\u0629 \u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0641\u0642\u0637.";
  const actor = await requireCompanyPermission(authorization, "account.import", {
    configMissing: "\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u062C\u0647\u0627\u062A \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.",
    sessionRequired: "\u062C\u0644\u0633\u0629 \u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u062A\u0646\u0641\u064A\u0630 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.",
    rpcError: () => deniedMessage,
    profileMissing: deniedMessage,
    permissionDenied: deniedMessage,
    noActiveCompany: deniedMessage
  });
  return actor.actorClient;
}
var clean = (value) => typeof value === "string" ? value.trim() : "";
function validateCompanyAccountImportRows(rows) {
  if (!Array.isArray(rows)) return { rows: [], errors: ["\u0645\u0644\u0641 \u0627\u0644\u062C\u0647\u0627\u062A \u0644\u0627 \u064A\u062D\u062A\u0648\u064A \u0639\u0644\u0649 \u0635\u0641\u0648\u0641 \u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F."] };
  if (!rows.length) return { rows: [], errors: ["\u0645\u0644\u0641 \u0627\u0644\u062C\u0647\u0627\u062A \u0641\u0627\u0631\u063A."] };
  if (rows.length > 500) return { rows: [], errors: ["\u064A\u0645\u0643\u0646 \u0627\u0633\u062A\u064A\u0631\u0627\u062F 500 \u062C\u0647\u0629 \u0643\u062D\u062F \u0623\u0642\u0635\u0649 \u0641\u064A \u0627\u0644\u0639\u0645\u0644\u064A\u0629 \u0627\u0644\u0648\u0627\u062D\u062F\u0629."] };
  const errors = [];
  const normalized = rows.flatMap((value, index) => {
    if (!value || typeof value !== "object") {
      errors.push(`\u0627\u0644\u0635\u0641 ${index + 1}: \u062A\u0646\u0633\u064A\u0642 \u063A\u064A\u0631 \u0635\u0627\u0644\u062D.`);
      return [];
    }
    const item = value;
    const accountType = clean(item.accountType ?? item.account_type).toLowerCase();
    const name = clean(item.name);
    const state = clean(item.state);
    const city = clean(item.city);
    if (!name || !state || !city || !validAccountTypes.has(accountType)) {
      errors.push(`\u0627\u0644\u0635\u0641 ${index + 1}: \u0623\u062F\u062E\u0644 \u0627\u0644\u0627\u0633\u0645 \u0648\u0627\u0644\u0646\u0648\u0639 \u0648\u0627\u0644\u0648\u0644\u0627\u064A\u0629 \u0648\u0627\u0644\u0645\u062F\u064A\u0646\u0629 \u0628\u0635\u0648\u0631\u0629 \u0635\u062D\u064A\u062D\u0629.`);
      return [];
    }
    return [{ localRef: clean(item.localRef ?? item.local_ref) || `import-${Date.now()}-${index + 1}`, name, accountType, specialty: clean(item.specialty) || void 0, state, city, area: clean(item.area) || void 0, address: clean(item.address) || void 0, phone: clean(item.phone) || void 0, territoryKey: clean(item.territoryKey ?? item.territory_key) || void 0 }];
  });
  return { rows: normalized, errors };
}
function summarizeCompanyAccountImport(results) {
  return { createdCount: results.filter((item) => item.status === "created").length, updatedCount: results.filter((item) => item.status === "updated").length, duplicateCount: results.filter((item) => item.status === "duplicate").length, rejectedCount: results.filter((item) => item.status === "rejected").length };
}
async function getCompanyAccountSetup(authorization) {
  const actorClient = await requireCompanyManager4(authorization);
  const [accountsResponse, territoriesResponse] = await Promise.all([actorClient.rpc("tips_crm_list_accounts"), actorClient.rpc("tips_crm_list_territories")]);
  if (accountsResponse.error || territoriesResponse.error) throw new Error("\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u062C\u0647\u0627\u062A \u0648\u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0639\u0645\u0644. \u062D\u062F\u0651\u062B \u0627\u0644\u0635\u0641\u062D\u0629 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  const accounts = accountsResponse.data ?? [];
  const territories = (territoriesResponse.data ?? []).flatMap((row) => row.client_key ? [{ clientKey: row.client_key, name: row.name, state: row.state, city: row.city }] : []);
  return { accountCount: accounts.length, doctorCount: accounts.filter((item) => item.account_type === "doctor").length, pharmacyCount: accounts.filter((item) => item.account_type === "pharmacy").length, hospitalCount: accounts.filter((item) => item.account_type === "hospital").length, distributorCount: accounts.filter((item) => item.account_type === "distributor").length, territoryChoices: territories, isAccountSetupStarted: accounts.length > 0 };
}
async function importCompanyAccounts(input, authorization) {
  const prepared = validateCompanyAccountImportRows(input.rows);
  if (!prepared.rows.length) throw new Error(prepared.errors[0] ?? "\u0644\u0627 \u062A\u0648\u062C\u062F \u062C\u0647\u0627\u062A \u0635\u0627\u0644\u062D\u0629 \u0644\u0644\u0627\u0633\u062A\u064A\u0631\u0627\u062F.");
  const actorClient = await requireCompanyManager4(authorization);
  const payload = prepared.rows.map((item) => ({ local_ref: item.localRef, name: item.name, account_type: item.accountType, specialty: item.specialty ?? "", state: item.state, city: item.city, area: item.area ?? "", address: item.address ?? "", phone: item.phone ?? "", territory_key: item.territoryKey ?? "" }));
  const { data, error } = await actorClient.schema("tips_crm").rpc("import_company_accounts", { input_accounts: payload });
  if (error) throw new Error(error.message.includes("permission") ? "\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u062C\u0647\u0627\u062A." : "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u062C\u0647\u0627\u062A. \u0631\u0627\u062C\u0639 \u0627\u0644\u0645\u0644\u0641 \u062B\u0645 \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629.");
  const results = (data ?? []).map((item) => ({ itemKey: item.item_key, status: item.status === "created" || item.status === "updated" || item.status === "duplicate" ? item.status : "rejected", accountId: item.account_id ?? void 0, accountName: item.account_name, message: item.message }));
  return { results: [...results, ...prepared.errors.map((message, index) => ({ itemKey: `invalid-${index + 1}`, status: "rejected", accountName: "", message }))], summary: summarizeCompanyAccountImport(results) };
}

// server/routes/company-router.ts
var companyRouter = Router2();
companyRouter.get("/setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyOperationalSetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.put("/setup", async (req, res) => {
  try {
    res.json({ setup: await saveCompanyOperationalSetup(req.body ?? {}, req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.get("/team-setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyTeamSetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0641\u0631\u064A\u0642 \u0627\u0644\u0634\u0631\u0643\u0629.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.get("/territory-setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyTerritorySetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0645\u0646\u0627\u0637\u0642 \u0627\u0644\u0634\u0631\u0643\u0629.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.post("/territory-setup", async (req, res) => {
  try {
    res.status(201).json({ territory: await saveCompanyTerritory(req.body ?? {}, req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0645\u0646\u0637\u0642\u0629 \u0627\u0644\u0639\u0645\u0644.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.get("/account-setup", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ setup: await getCompanyAccountSetup(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u062C\u0647\u0627\u062A \u0627\u0644\u0634\u0631\u0643\u0629.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.post("/account-setup/import", async (req, res) => {
  try {
    res.json(await importCompanyAccounts(req.body ?? {}, req.header("authorization")));
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0627\u0633\u062A\u064A\u0631\u0627\u062F \u0627\u0644\u062C\u0647\u0627\u062A.";
    res.status(message.includes("\u0645\u062F\u064A\u0631 \u0627\u0644\u0634\u0631\u0643\u0629") || message.includes("\u062C\u0644\u0633\u0629") || message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.get("/employee-accounts", async (req, res) => {
  try {
    const accounts = await listEmployeeAccounts(req.header("authorization"));
    res.json({ accounts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u0645\u064A\u0644 \u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646.";
    res.status(message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.post("/employee-accounts", async (req, res) => {
  try {
    const account = await createTemporaryEmployeeAccount(req.body, req.header("authorization"));
    res.status(201).json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641.";
    res.status(message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
companyRouter.post("/employee-accounts/:employeeId/reset-password", async (req, res) => {
  try {
    const account = await resetEmployeePassword(req.params.employeeId, req.body, req.header("authorization"));
    res.json({ account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0639\u0627\u062F\u0629 \u062A\u0639\u064A\u064A\u0646 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u0627\u0644\u0645\u0648\u0638\u0641.";
    res.status(message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});

// server/routes/rep-router.ts
import { Router as Router3 } from "express";

// server/financial-control.ts
import { createClient as createClient5 } from "@supabase/supabase-js";

// server/google-sheets.ts
import { createSign } from "node:crypto";
var base64Url = (value) => Buffer.from(value).toString("base64url");
function readGoogleServiceAccount(raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
  if (!raw) throw new Error("Google service account is not configured");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Google service account JSON is invalid");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Google service account JSON is invalid");
  const value = parsed;
  if (!value.client_email || !value.private_key) throw new Error("Google service account JSON is incomplete");
  return { client_email: value.client_email, private_key: value.private_key, token_uri: value.token_uri };
}
async function getGoogleSheetsAccessToken(raw) {
  const serviceAccount = readGoogleServiceAccount(raw);
  const issuedAt = Math.floor(Date.now() / 1e3);
  const tokenEndpoint = serviceAccount.token_uri || "https://oauth2.googleapis.com/token";
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({ iss: serviceAccount.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly", aud: tokenEndpoint, iat: issuedAt, exp: issuedAt + 3600 }))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const response = await fetch(tokenEndpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  if (!response.ok) throw new Error("Google service account authentication failed");
  const payload = await response.json();
  if (!payload.access_token) throw new Error("Google did not return an access token");
  return payload.access_token;
}

// server/financial-control.ts
var normalizeKey = (value) => String(value ?? "").trim().toLowerCase();
var normalizedCode = (value) => String(value ?? "").trim().toUpperCase();
var text = (value) => String(value ?? "").trim();
var amount = (value) => Number(String(value ?? "0").replace(/,/g, "")) || 0;
function rowsFromValues(values) {
  const [headerRow, ...body] = values ?? [];
  if (!headerRow?.length) return [];
  const headers = headerRow.map(normalizeKey);
  return body.map((row) => Object.fromEntries(headers.map((header, index) => [header, text(row[index])]))).filter((row) => Object.values(row).some(Boolean));
}
function buildFinancialSnapshot({ spreadsheetId, customers, invoices, collections, reconciliations, crmAccounts, refreshedAt = (/* @__PURE__ */ new Date()).toISOString() }) {
  const accountsByCode = new Map(crmAccounts.filter((account) => normalizedCode(account.finance_customer_code)).map((account) => [normalizedCode(account.finance_customer_code), account]));
  const customersByCode = /* @__PURE__ */ new Map();
  customers.forEach((row) => {
    const code = normalizedCode(row.customer_code);
    if (code) customersByCode.set(code, row);
  });
  const reconciliationByReceipt = /* @__PURE__ */ new Map();
  reconciliations.forEach((row) => {
    const receipt = normalizedCode(row.receipt_reference);
    if (receipt) reconciliationByReceipt.set(receipt, row);
  });
  const customerCodes = new Set([...customersByCode.keys(), ...invoices.map((row) => normalizedCode(row.customer_code)), ...collections.map((row) => normalizedCode(row.customer_code))].filter((code) => Boolean(code)));
  const unmatchedCustomerCodes = [...customerCodes].filter((code) => !accountsByCode.has(code)).sort();
  const customerRows = [...customerCodes].sort().map((customerCode) => {
    const customer = customersByCode.get(customerCode);
    const account = accountsByCode.get(customerCode);
    return { customerCode, customerName: text(customer?.customer_name), accountId: account?.id, accountName: account?.name };
  });
  const invoiceRows = invoices.flatMap((row) => {
    const invoiceNumber = text(row.invoice_number);
    const customerCode = normalizedCode(row.customer_code);
    if (!invoiceNumber || !customerCode) return [];
    const account = accountsByCode.get(customerCode);
    const customer = customersByCode.get(customerCode);
    return [{ invoiceNumber, customerCode, customerName: text(customer?.customer_name), accountName: account?.name, invoiceDate: text(row.invoice_date) || void 0, dueDate: text(row.due_date) || void 0, originalAmount: amount(row.original_amount), openBalance: amount(row.open_balance), currency: text(row.currency) || void 0, status: text(row.invoice_status) || void 0 }];
  });
  const collectionRows = collections.flatMap((row) => {
    const receiptReference = text(row.receipt_reference);
    const customerCode = normalizedCode(row.customer_code);
    if (!receiptReference || !customerCode) return [];
    const account = accountsByCode.get(customerCode);
    const customer = customersByCode.get(customerCode);
    const reconciliation = reconciliationByReceipt.get(normalizedCode(receiptReference));
    return [{ receiptReference, invoiceNumber: text(row.invoice_number) || void 0, customerCode, customerName: text(customer?.customer_name), accountName: account?.name, collectionDate: text(row.collection_date) || void 0, collectionAmount: amount(row.collection_amount), currency: text(row.currency) || void 0, repEmail: text(row.rep_email) || void 0, approvalStatus: text(row.approval_status) || void 0, reconciliationStatus: text(reconciliation?.reconciliation_status) || void 0, depositReference: text(reconciliation?.deposit_reference) || void 0 }];
  });
  return {
    source: { spreadsheetId, refreshedAt },
    summary: { customerCount: customerRows.length, mappedCustomerCount: customerRows.filter((customer) => customer.accountId).length, unmatchedCustomerCodes, invoiceCount: invoiceRows.length, collectionCount: collectionRows.length, reconciliationCount: reconciliations.filter((row) => text(row.receipt_reference)).length, originalAmount: invoiceRows.reduce((sum, row) => sum + row.originalAmount, 0), openBalance: invoiceRows.reduce((sum, row) => sum + row.openBalance, 0), approvedCollectionAmount: collectionRows.filter((row) => normalizedCode(row.approvalStatus) === "APPROVED").reduce((sum, row) => sum + row.collectionAmount, 0), matchedCollectionAmount: collectionRows.filter((row) => normalizedCode(row.reconciliationStatus) === "MATCHED").reduce((sum, row) => sum + row.collectionAmount, 0) },
    customers: customerRows,
    invoices: invoiceRows,
    collections: collectionRows,
    mappings: crmAccounts.map((account) => ({ id: account.id, localRef: account.local_ref ?? void 0, name: account.name, financeCustomerCode: account.finance_customer_code ?? void 0 }))
  };
}
function accessTokenFromHeader(authorization) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new Error("\u062C\u0644\u0633\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0645\u0637\u0644\u0648\u0628\u0629 \u0644\u0639\u0631\u0636 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629.");
  return token;
}
async function requireFinancialAccess(authorization) {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !ENV.supabaseServiceRoleKey) throw new Error("\u0625\u0639\u062F\u0627\u062F\u0627\u062A \u0627\u0644\u062E\u0627\u062F\u0645 \u0627\u0644\u0645\u0627\u0644\u064A \u063A\u064A\u0631 \u0645\u0643\u062A\u0645\u0644\u0629.");
  const token = accessTokenFromHeader(authorization);
  const actorClient = createClient5(ENV.supabaseUrl, ENV.supabaseAnonKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await actorClient.rpc("tips_crm_my_profile");
  if (error) throw new Error("\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u0635\u0644\u0627\u062D\u064A\u0629 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629.");
  const profile = data?.[0];
  if (!profile || !profile.permissions.some((permission) => permission === "all" || permission === "export_reports")) throw new Error("\u0644\u0627 \u062A\u0645\u0644\u0643 \u0635\u0644\u0627\u062D\u064A\u0629 \u0639\u0631\u0636 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629.");
  return { actor: profile, adminClient: createClient5(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
}
async function fetchSheetRows(spreadsheetId) {
  const token = await getGoogleSheetsAccessToken();
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet`);
  ["Customers!A:Z", "Invoices!A:Z", "Collections!A:Z", "Reconciliation!A:Z"].forEach((range) => url.searchParams.append("ranges", range));
  url.searchParams.set("valueRenderOption", "UNFORMATTED_VALUE");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0628\u064A\u0627\u0646\u0627\u062A Google Sheets. \u062A\u062D\u0642\u0642 \u0645\u0646 \u0645\u0634\u0627\u0631\u0643\u0629 \u0627\u0644\u0645\u0644\u0641 \u0645\u0639 \u062D\u0633\u0627\u0628 \u0627\u0644\u062E\u062F\u0645\u0629.");
  const payload = await response.json();
  const result = /* @__PURE__ */ new Map();
  payload.valueRanges?.forEach((item) => {
    const name = item.range?.split("!")[0];
    if (name) result.set(name, rowsFromValues(item.values));
  });
  return result;
}
async function writeSyncAudit(adminClient, record) {
  await adminClient.schema("tips_crm").from("financial_sync_audit").insert({ initiated_by: record.initiatedBy, source_type: "google_sheets", status: record.status, summary: record.summary, error_message: record.errorMessage ?? null });
}
async function readFinancialSnapshot(authorization) {
  const { actor, adminClient } = await requireFinancialAccess(authorization);
  const spreadsheetId = process.env.GOOGLE_FINANCIAL_SHEET_ID;
  if (!spreadsheetId) throw new Error("\u0645\u0639\u0631\u0651\u0641 \u0645\u0644\u0641 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u064A \u063A\u064A\u0631 \u0645\u0636\u0628\u0648\u0637.");
  try {
    const [sheetRows, accountResponse] = await Promise.all([fetchSheetRows(spreadsheetId), adminClient.schema("tips_crm").from("accounts").select("id,local_ref,name,finance_customer_code").limit(1e3)]);
    if (accountResponse.error) throw new Error("\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u062C\u0647\u0627\u062A \u0644\u0645\u0637\u0627\u0628\u0642\u0629 \u0623\u0643\u0648\u0627\u062F \u0627\u0644\u0639\u0645\u0644\u0627\u0621.");
    const snapshot = buildFinancialSnapshot({ spreadsheetId, customers: sheetRows.get("Customers") ?? [], invoices: sheetRows.get("Invoices") ?? [], collections: sheetRows.get("Collections") ?? [], reconciliations: sheetRows.get("Reconciliation") ?? [], crmAccounts: accountResponse.data ?? [] });
    await writeSyncAudit(adminClient, { initiatedBy: actor.id, status: "success", summary: { customers: snapshot.summary.customerCount, invoices: snapshot.summary.invoiceCount, collections: snapshot.summary.collectionCount, unmatched_customer_codes: snapshot.summary.unmatchedCustomerCodes.length } });
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062A\u062D\u062F\u064A\u062B \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629.";
    await writeSyncAudit(adminClient, { initiatedBy: actor.id, status: "failed", summary: {}, errorMessage: message }).catch(() => void 0);
    throw new Error(message);
  }
}
async function assignFinanceCustomerCode(input, authorization) {
  const { actor, adminClient } = await requireFinancialAccess(authorization);
  const customerCode = normalizedCode(input.customerCode);
  if (!input.accountId || !customerCode || customerCode.length > 96) throw new Error("\u0623\u062F\u062E\u0644 \u0643\u0648\u062F \u0639\u0645\u064A\u0644 \u0635\u062D\u064A\u062D\u0627\u064B \u0644\u0627 \u064A\u062A\u062C\u0627\u0648\u0632 96 \u062D\u0631\u0641\u0627\u064B.");
  const { error } = await adminClient.schema("tips_crm").from("accounts").update({ finance_customer_code: customerCode, updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", input.accountId);
  if (error) throw new Error("\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0643\u0648\u062F \u0627\u0644\u0639\u0645\u064A\u0644. \u062A\u0623\u0643\u062F \u0645\u0646 \u0639\u062F\u0645 \u0627\u0633\u062A\u062E\u062F\u0627\u0645\u0647 \u0644\u062C\u0647\u0629 \u0623\u062E\u0631\u0649.");
  await writeSyncAudit(adminClient, { initiatedBy: actor.id, status: "success", summary: { mapping_updated: true, customer_code: customerCode } });
  return { accountId: input.accountId, customerCode };
}

// server/routes/rep-router.ts
var repRouter = Router3();
repRouter.post("/plan-submission-email", async (req, res) => {
  try {
    res.json(await sendPlanSubmissionEmail(req.body));
  } catch (error) {
    res.status(400).json({ message: error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u062E\u0637\u0629." });
  }
});
repRouter.post("/auth/password-recovery", async (req, res) => {
  try {
    const email = typeof req.body?.email === "string" ? req.body.email : "";
    await sendManagedPasswordRecoveryEmail(email);
    res.status(202).json({ sent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629.";
    res.status(400).json({ message });
  }
});
repRouter.get("/financial-control", async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ snapshot: await readFinancialSnapshot(req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0642\u0631\u0627\u0621\u0629 \u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0645\u0627\u0644\u064A.";
    res.status(message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});
repRouter.post("/financial-control/customer-mappings", async (req, res) => {
  try {
    const accountId = typeof req.body?.accountId === "string" ? req.body.accountId : "";
    const customerCode = typeof req.body?.customerCode === "string" ? req.body.customerCode : "";
    res.json({ mapping: await assignFinanceCustomerCode({ accountId, customerCode }, req.header("authorization")) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u062D\u0641\u0638 \u0645\u0637\u0627\u0628\u0642\u0629 \u0627\u0644\u0639\u0645\u064A\u0644.";
    res.status(message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
  }
});

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express();
  const server = createServer(app);
  const webDistDirectory = path.resolve(process.cwd(), "public-web");
  const indexHtmlPath = path.join(webDistDirectory, "index.html");
  const sendWebApplication = (_req, res) => {
    if (fs.existsSync(indexHtmlPath)) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.sendFile(indexHtmlPath);
      return;
    }
    res.status(503).type("text/plain").send("\u0648\u0627\u062C\u0647\u0629 Tips CRM \u0642\u064A\u062F \u0627\u0644\u062A\u062C\u0647\u064A\u0632. \u0623\u0639\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0628\u0639\u062F \u0644\u062D\u0638\u0627\u062A.");
  };
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization"
    );
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co https:; font-src 'self' data:;"
    );
    next();
  });
  registerStorageProxy(app);
  app.use(express.static(webDistDirectory, { index: false, maxAge: 0 }));
  app.get("/", sendWebApplication);
  app.get("/vendor/supabase.js", (_req, res) => {
    const localVendor = path.join(process.cwd(), "node_modules", "@supabase", "supabase-js", "dist", "umd", "supabase.js");
    if (fs.existsSync(localVendor)) {
      res.setHeader("Cache-Control", "no-store, max-age=0");
      res.type("application/javascript").sendFile(localVendor);
    } else {
      res.redirect("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js");
    }
  });
  app.get("/reset-password", sendWebApplication);
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });
  app.post("/api/employee-accounts", async (req, res) => {
    try {
      const account = await createTemporaryEmployeeAccount(req.body, req.header("authorization"));
      res.status(201).json({ account });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641.";
      res.status(message.includes("\u0635\u0644\u0627\u062D\u064A\u0629") || message.includes("\u062C\u0644\u0633\u0629") ? 403 : 400).json({ message });
    }
  });
  app.post("/api/plan-submission-email", async (req, res) => {
    try {
      res.json(await sendPlanSubmissionEmail(req.body));
    } catch (error) {
      res.status(400).json({ message: error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u062A\u0646\u0628\u064A\u0647 \u0627\u0644\u062E\u0637\u0629." });
    }
  });
  app.post("/api/auth/password-recovery", async (req, res) => {
    try {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      await sendManagedPasswordRecoveryEmail(email);
      res.status(202).json({ sent: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0631\u0633\u0627\u0644\u0629 \u0627\u0644\u0627\u0633\u062A\u0639\u0627\u062F\u0629.";
      res.status(400).json({ message });
    }
  });
  app.use("/api/platform", platformRouter);
  app.use("/api/company", companyRouter);
  app.use("/api", repRouter);
  app.post("/api/employee-accounts", (req, res, next) => {
    companyRouter(req, res, next);
  });
  app.get("/api/employee-accounts", (req, res, next) => {
    companyRouter(req, res, next);
  });
  app.post("/api/company-requests", async (req, res) => {
    try {
      const request = await createPublicCompanyRequest(req.body ?? {});
      res.status(201).json({ request });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0625\u0631\u0633\u0627\u0644 \u0637\u0644\u0628 \u0627\u0644\u0634\u0631\u0643\u0629.";
      res.status(400).json({ message });
    }
  });
  app.get("/api/company-requests/:referenceId/status", async (req, res) => {
    try {
      const request = await getPublicCompanyRequestStatus(req.params.referenceId);
      res.setHeader("Cache-Control", "no-store");
      res.json({ request });
    } catch (error) {
      const message = error instanceof Error ? error.message : "\u062A\u0639\u0630\u0631 \u0627\u0644\u062A\u062D\u0642\u0642 \u0645\u0646 \u062D\u0627\u0644\u0629 \u0627\u0644\u0637\u0644\u0628.";
      res.status(400).json({ message });
    }
  });
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path === "/api" || req.path.startsWith("/vendor/")) {
      next();
      return;
    }
    sendWebApplication(req, res);
  });
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`[api] server listening on port ${port}`);
  });
}
startServer().catch(console.error);
