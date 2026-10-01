import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { permissionsFromMembership } from "../../shared/auth/permission-set";
import type { Permission } from "../../shared/auth/permissions";
import { hasPermission } from "../../shared/auth/resolve";
import { AppError } from "./app-error";
import { ENV } from "./env";

export type ActorProfileRow = {
  role_key?: string | null;
  is_platform_admin?: boolean;
  active_company_id?: string | null;
  membership_permissions?: string[] | null;
  [key: string]: unknown;
};

export type Actor = {
  actorClient: SupabaseClient;
  profile: ActorProfileRow;
  permissions: ReadonlySet<Permission>;
};

// Every message is overridable because the five guards this replaces disagree, word for
// word, on what they tell the user for the same failure — this module must not flatten that.
export type AuthorizeMessages = {
  configMissing?: string;
  sessionRequired?: string;
  rpcError?: (message: string) => string;
  profileMissing?: string;
  permissionDenied?: string;
};

const DEFAULT_MESSAGES: Required<AuthorizeMessages> = {
  configMissing: "إعدادات الخادم غير مكتملة.",
  sessionRequired: "الجلسة مطلوبة لتنفيذ هذا الإجراء.",
  rpcError: (message) => `تعذر التحقق من صلاحية المستخدم: ${message}`,
  profileMissing: "تعذر العثور على ملف المستخدم الحالي.",
  permissionDenied: "لا تملك صلاحية تنفيذ هذا الإجراء.",
};

function tokenFromHeader(authorization: string | undefined, message: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) throw new AppError(message, 401);
  return token;
}

export async function resolveActor(authorization: string | undefined, messages?: AuthorizeMessages): Promise<Actor> {
  const resolved = { ...DEFAULT_MESSAGES, ...messages };
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey) throw new Error(resolved.configMissing);

  const actorClient = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${tokenFromHeader(authorization, resolved.sessionRequired)}` } },
  });

  const { data, error } = await actorClient.rpc("tips_crm_my_profile");
  if (error) throw new Error(resolved.rpcError(error.message));

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  const profile = rows[0] as ActorProfileRow | undefined;
  if (!profile) throw new Error(resolved.profileMissing);

  const permissions = permissionsFromMembership({
    membershipPermissions: profile.membership_permissions,
    isPlatformAdmin: profile.is_platform_admin,
  });
  return { actorClient, profile, permissions };
}

export async function requirePermission(authorization: string | undefined, permission: Permission, messages?: AuthorizeMessages): Promise<Actor> {
  const resolved = { ...DEFAULT_MESSAGES, ...messages };
  const actor = await resolveActor(authorization, resolved);
  if (!hasPermission(actor.permissions, permission)) throw new AppError(resolved.permissionDenied, 403);
  return actor;
}

export async function requireCompanyPermission(
  authorization: string | undefined,
  permission: Permission,
  messages: AuthorizeMessages & { noActiveCompany: string },
): Promise<Actor & { activeCompanyId: string }> {
  const actor = await requirePermission(authorization, permission, messages);
  if (!actor.profile.active_company_id) throw new Error(messages.noActiveCompany);
  return { ...actor, activeCompanyId: actor.profile.active_company_id };
}
