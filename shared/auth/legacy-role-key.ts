import type { Permission } from "./permissions";
import { resolvePermissions } from "./resolve";
import type { SystemRoleName } from "./roles";

export type Discipline = "sales" | "medical";

export interface LegacyRoleMapping {
  readonly role: SystemRoleName | null;
  readonly disciplines: readonly Discipline[];
}

// company_memberships.role_key no longer drives permission resolution (that reads
// tips_crm.membership_permissions), but employee creation and team setup still choose and
// display a single legacy role_key, since neither has migrated to the Role picker yet
// (docs/authorization-model.md "Migration from the legacy role keys"). This is that table,
// and nothing else — no permission resolution lives here anymore.
const LEGACY_ROLE_MAP: Record<string, LegacyRoleMapping> = {
  company_manager: { role: "manager", disciplines: [] },
  sales_manager: { role: "manager", disciplines: [] },
  sales_supervisor: { role: "supervisor", disciplines: ["sales"] },
  medical_supervisor: { role: "supervisor", disciplines: ["medical"] },
  sales_rep: { role: "rep", disciplines: ["sales"] },
  medical_rep: { role: "rep", disciplines: ["medical"] },
  accountant: { role: "accountant", disciplines: [] },
};

export function legacyRoleMappingFor(roleKey: string | null | undefined): LegacyRoleMapping {
  if (!roleKey) return { role: null, disciplines: [] };
  return LEGACY_ROLE_MAP[roleKey] ?? { role: null, disciplines: [] };
}

// Returns null rather than an empty set for an unrecognised key: an empty set would satisfy
// canGrant vacuously, so a caller that forgot to check would let an unknown role key through the
// subset rule. Callers must handle the null.
export function permissionsForLegacyRoleKey(roleKey: string | null | undefined): ReadonlySet<Permission> | null {
  const { role } = legacyRoleMappingFor(roleKey);
  return role ? resolvePermissions([role]) : null;
}
