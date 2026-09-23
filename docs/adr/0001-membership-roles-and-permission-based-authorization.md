---
status: accepted
date: 2026-09-23
---

# Roles are multi-assigned at the Membership, and all authorization is permission-based

A Person's Roles belong to their Membership in a Company rather than to the Person, a Membership may hold **several Roles at once** with permissions taken as the union, and **no guard tests a Role** — every check at every layer (RLS, server, client) asks only whether a Permission is held. Roles exist solely to bundle Permissions onto a Membership.

That last claim describes the **end state**. The MySQL-backed tRPC procedures for duty tracking and notifications are deliberately out of scope for the first pass and still guard on role strings (`server/routers.ts:13`); closing that carve-out is tracked debt, not a standing exception.

We decided this because the target customers are small and mid-size distribution companies where one person genuinely wears several hats: the owner is often also the accountant, sometimes a supervisor, occasionally a field rep. A single-role model cannot express that without duplicate accounts, and role-string guards break outright under multiple roles — an Owner + Accountant fails a `role_key !== 'company_manager'` test that they should obviously pass. Permissions form a union cleanly; Roles do not.

## Considered options

- **One Role per Person** — rejected. It is the assumption behind most of the pre-2026-09 code, and it cannot represent the owner-who-also-collects-payments without a second login.
- **One Role plus capability flags** — rejected explicitly. Flags let authorization logic drift away from Roles until neither is authoritative, and the flag set grows without anyone owning it.
- **Role checks widened to "holds any of these Roles"** — rejected. Every new Role combination would mean editing guard lists, which are currently duplicated across `app/`, `apps/web/`, `apps/mobile/`, `lib/`, and `shared/`.
- **Encoding the line of work into the Role name** (`sales_supervisor`, `medical_supervisor`) — rejected. It conflates what a person may *do* with what they may *see*; that split is now Role vs Discipline, defined in `CONTEXT.md`.

## Consequences

- The **Permission vocabulary is closed and code-defined**, so it can be referenced safely and a typo fails loudly. The **Role set is open**: the five system Roles (`owner`, `manager`, `supervisor`, `rep`, `accountant`) ship with the product, and a Company may define custom Roles as bundles of existing Permissions.
- Each Portal declares exactly one **entry Permission** that decides whether it appears. Portals are never mapped to Roles.
- Login no longer resolves to a single destination. A Person lands on the highest-authority Portal they may enter — precedence Platform → Company → Supervisor → Rep — after which the last Portal used is remembered, and a switcher lists all Portals they may enter. This precedence is a landing convenience only and grants nothing.
- `profiles.active_company_id` remains the tenant boundary that RLS reads, and therefore **requires a strict integrity rule**: it may only reference a Company where the Person actually holds a Membership. Without that rule a stale value is a cross-tenant read.
- Platform administration is deliberately outside this model. It is an account-level property (`is_platform_admin`), never a Role, so that platform access can never be granted by a row in a customer Company's tables. Because Permissions are otherwise held through a Membership and a Platform Admin has none, that property **resolves to a fixed, code-defined platform Permission set**. Guards are unchanged — they still only ask whether a Permission is held; only the source of the answer differs. Platform access is never a boolean special case in a guard, and there is no synthetic platform Company.
- Privilege escalation is closed by a **subset rule**: a Person may grant only those Roles, and build only those Custom Roles, whose Permissions they already hold. This has a consequence that will look wrong to a future reader and is deliberate: **Manager holds the Permissions of every Role it can create**, so a Manager holds `visit.record`, `credit_limit.manage`, and the Rep and Supervisor portal entry Permissions. Manager therefore holds every Permission except the four Ownership ones and the platform set — which is also what stops a Manager from granting Ownership. Separation of duties between Manager and Accountant is consequently conventional, not enforced. A later review proposed splitting "may grant" from "may do" to restore it; we rejected that because it does not close the hole — `employee.manage` also lets a Manager set a new employee's temporary password, so a Manager can create an Accountant and sign in as them regardless. The wall was already absent, and a second resolution path would have hidden that rather than fixed it. **Audit logging on Role grants is the control instead.** A customer who genuinely needs the wall needs `accountant` to be Owner-grantable only *and* Managers to lose password-setting — a different decision, not a tweak to this one. A cluttered Portal switcher for Managers is a presentation problem and must not be solved by exempting `portal.*` from the subset rule.
- Seven role keys are retired: `system_admin`, `company_manager`, `sales_manager`, `sales_supervisor`, `medical_supervisor`, `sales_rep`, `medical_rep`.
