import { ALL_PERMISSIONS, OWNERSHIP_PERMISSIONS, PLATFORM_PERMISSIONS, type Permission } from "./permissions";

export const SYSTEM_ROLE_NAMES = ["owner", "manager", "supervisor", "rep", "accountant"] as const;

export type SystemRoleName = (typeof SYSTEM_ROLE_NAMES)[number];

const ownerPermissions = [
  "portal.company.enter",
  "company.subscription.manage",
  "company.billing.read",
  "company.transfer",
  "company.delete",
] as const satisfies readonly Permission[];

const supervisorPermissions = [
  "portal.supervisor.enter",
  "catalogue.read",
  "account.read.team",
  "plan.read.team",
  "plan.approve.team",
  "visit.read.team",
  "visit.review",
  "telemetry.read.team",
  "notification.send.team",
  "report.read.team",
] as const satisfies readonly Permission[];

const accountantPermissions = [
  "portal.company.enter",
  "account.read.company",
  "visit.read.company",
  "credit_limit.manage",
  "finance.reconcile",
  "report.read.company",
] as const satisfies readonly Permission[];

const repPermissions = [
  "portal.rep.enter",
  "catalogue.read",
  "account.read.assigned",
  "account.create",
  "account.update",
  "plan.create.own",
  "plan.read.own",
  "visit.record",
  "visit.read.own",
] as const satisfies readonly Permission[];

// Manager is every permission except Ownership, the platform set, and (in v1) role.custom.manage —
// derived, not hand-listed, so adding a permission later forces a deliberate decision about it.
const managerExclusions = new Set<Permission>([
  ...OWNERSHIP_PERMISSIONS,
  ...PLATFORM_PERMISSIONS,
  "role.custom.manage",
]);

const managerPermissions = ALL_PERMISSIONS.filter((permission) => !managerExclusions.has(permission));

export const SYSTEM_ROLE_PERMISSIONS: Record<SystemRoleName, readonly Permission[]> = {
  owner: ownerPermissions,
  manager: managerPermissions,
  supervisor: supervisorPermissions,
  rep: repPermissions,
  accountant: accountantPermissions,
};

export const PLATFORM_ADMIN_PERMISSIONS: readonly Permission[] = PLATFORM_PERMISSIONS;

export interface CustomRole {
  readonly kind: "custom";
  readonly companyId: string;
  readonly name: string;
  readonly permissions: readonly Permission[];
}
