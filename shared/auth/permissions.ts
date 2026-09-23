const portalEntryPermissions = [
  "portal.platform.enter",
  "portal.company.enter",
  "portal.supervisor.enter",
  "portal.rep.enter",
] as const;

const ownershipPermissions = [
  "company.subscription.manage",
  "company.billing.read",
  "company.transfer",
  "company.delete",
] as const;

const companyAdministrationPermissions = [
  "company.profile.update",
  "employee.manage",
  "role.assign",
  "role.custom.manage",
  "territory.manage",
  "team.assign",
  "catalogue.manage",
] as const;

const cataloguePermissions = ["catalogue.read"] as const;

const accountPermissions = [
  "account.read.assigned",
  "account.read.team",
  "account.read.company",
  "account.create",
  "account.update",
  "account.import",
] as const;

const planPermissions = [
  "plan.create.own",
  "plan.read.own",
  "plan.read.team",
  "plan.read.company",
  "plan.approve.team",
  "plan.approve.company",
] as const;

const visitPermissions = [
  "visit.record",
  "visit.read.own",
  "visit.read.team",
  "visit.read.company",
  "visit.review",
] as const;

const telemetryPermissions = ["telemetry.read.team", "telemetry.read.company"] as const;

const financePermissions = ["credit_limit.manage", "finance.reconcile"] as const;

const reportAndAuditPermissions = [
  "report.read.team",
  "report.read.company",
  "audit.read.company",
] as const;

const platformOnlyPermissions = [
  "platform.company.review",
  "platform.company.suspend",
  "platform.package.manage",
  "platform.audit.read",
] as const;

export const ALL_PERMISSIONS = [
  ...portalEntryPermissions,
  ...ownershipPermissions,
  ...companyAdministrationPermissions,
  ...cataloguePermissions,
  ...accountPermissions,
  ...planPermissions,
  ...visitPermissions,
  ...telemetryPermissions,
  ...financePermissions,
  ...reportAndAuditPermissions,
  ...platformOnlyPermissions,
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// Typed as the widened Permission[] (not the literal tuple) so .includes() checks
// against any Permission, not just this group's own five-or-fewer literals.
export const PORTAL_ENTRY_PERMISSIONS: readonly Permission[] = portalEntryPermissions;

export const OWNERSHIP_PERMISSIONS: readonly Permission[] = ownershipPermissions;

// Platform.enter is grouped here, not with the other three portal-entry permissions, because
// this set exists to answer "does is_platform_admin cover this permission?" — the spec's
// Platform Admin set (docs/authorization-model.md) is exactly these five.
export const PLATFORM_PERMISSIONS: readonly Permission[] = [
  "portal.platform.enter",
  ...platformOnlyPermissions,
];
