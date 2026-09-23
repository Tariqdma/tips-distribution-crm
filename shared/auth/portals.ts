import type { Permission } from "./permissions";

export const PORTALS = ["platform", "company", "supervisor", "rep"] as const;

export type Portal = (typeof PORTALS)[number];

export const PORTAL_ENTRY_PERMISSION: Record<Portal, Permission> = {
  platform: "portal.platform.enter",
  company: "portal.company.enter",
  supervisor: "portal.supervisor.enter",
  rep: "portal.rep.enter",
};

// Landing precedence, Platform -> Company -> Supervisor -> Rep. A convenience for choosing
// where to land a multi-portal Person; it grants nothing on its own.
export const PORTAL_LANDING_PRECEDENCE: readonly Portal[] = PORTALS;
