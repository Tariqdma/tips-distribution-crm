# Authorization Model

The settled specification for Tiers, Portals, Roles, Permissions, and Discipline. Vocabulary is defined in [`CONTEXT.md`](../CONTEXT.md); the reasoning behind the shape is in [ADR-0001](./adr/0001-membership-roles-and-permission-based-authorization.md). This document is the specification the implementation follows.

Nothing here is implemented yet.

## Structure

```
Person ──< Membership >── Company
              │
              ├── Roles (one or more)  →  Permissions (union)
              └── Disciplines (a set: none, sales, medical, or both)
```

- A **Person** may hold Memberships in several Companies. `profiles.active_company_id` selects which one is in effect, and **must** reference a Company where that Person actually holds a Membership — RLS reads it as the tenant boundary, so a stale value is a cross-tenant read.

  **Enforced by trigger, not convention.** Deleting a Membership nulls `active_company_id` wherever it pointed at that Company. A null forces a company re-pick before the next authorized request, and any cached client permission set is treated as **void, not stale** — the client re-resolves from scratch rather than degrading to its last known set.

- A **Membership** holds one or more Roles. Its Permissions are their union.
- A **Platform Admin** holds no Membership. Their Permissions come from a fixed set attached to `is_platform_admin`.

  **Also enforced by trigger.** A profile may not simultaneously carry `is_platform_admin = true` and any active Membership row. This cannot be a `CHECK` constraint — CHECK cannot subquery — so it needs triggers on both `profiles` and `company_memberships`. Without it, "a Platform Admin holds no Membership" is an assertion the database never tests, while RLS ORs that raw boolean into nearly every policy: one flag flip is unrestricted cross-tenant read and write.

## Tiers and Portals

| Tier | Portals |
|---|---|
| Platform | `/platform` |
| Company | `/company` |
| Field | `/supervisor`, `/rep` |

Each Portal declares exactly one **entry Permission**. A Portal is offered to whoever holds it, and to nobody else. Portals are never mapped to Roles.

**Landing:** a Person lands on the highest-authority Portal they may enter, by the precedence **Platform → Company → Supervisor → Rep**. Thereafter the last Portal used is remembered, and a switcher lists every Portal they may enter. This precedence is a landing convenience and grants nothing.

## Permission vocabulary

Closed and defined in code (`shared/auth/permissions.ts`). A Role may bundle these; nothing may invent a new one. Scope appears in the name only where it is a genuinely different capability. Territory and Discipline narrow data *within* a granted Permission — they never widen it.

**Portal entry (4)**
`portal.platform.enter` · `portal.company.enter` · `portal.supervisor.enter` · `portal.rep.enter`

**Ownership (4)**
`company.subscription.manage` · `company.billing.read` · `company.transfer` · `company.delete`

**Company administration (7)**
`company.profile.update` · `employee.manage` · `role.assign` · `role.custom.manage` · `territory.manage` · `team.assign` · `catalogue.manage`

**Catalogue (1)**
`catalogue.read`

**Accounts (6)**
`account.read.assigned` · `account.read.team` · `account.read.company` · `account.create` · `account.update` · `account.import`

**Plans (6)**
`plan.create.own` · `plan.read.own` · `plan.read.team` · `plan.read.company` · `plan.approve.team` · `plan.approve.company`

**Visits (5)**
`visit.record` · `visit.read.own` · `visit.read.team` · `visit.read.company` · `visit.review`

**Telemetry (2)**
`telemetry.read.team` · `telemetry.read.company`

**Finance (2)**
`credit_limit.manage` · `finance.reconcile`

**Notifications (1)**
`notification.send.team`

**Reports and audit (4)**
`report.read.team` · `report.read.company` · `report.export` · `audit.read.company`

Two of these were added when the RLS audit found old permission strings with no equivalent in the original vocabulary. `send_notifications` became `notification.send.team` — broadcasting to a team is a capability no other permission implies, and a Supervisor needs it for their own team. `export_reports` became `report.export`, kept separate from `report.read.*` so that reading a dashboard and extracting its data can be granted independently. The third, `manage_outcomes`, was folded into `catalogue.manage`: visit-outcome labels are a company-configured list, which is what catalogue management already means.

**Platform (4)** — reachable only through `is_platform_admin`, never through a Role
`platform.company.review` · `platform.company.suspend` · `platform.package.manage` · `platform.audit.read`

## System Role bundles

The five System Roles ship with the product and are **immutable** — a Company that wants something narrower creates a Custom Role instead.

### rep
`portal.rep.enter` · `catalogue.read` · `account.read.assigned` · `account.create` · `account.update` · `plan.create.own` · `plan.read.own` · `visit.record` · `visit.read.own`

### supervisor
`portal.supervisor.enter` · `catalogue.read` · `account.read.team` · `plan.read.team` · `plan.approve.team` · `visit.read.team` · `visit.review` · `telemetry.read.team` · `report.read.team`

A Supervisor cannot create employees, so the subset rule imposes nothing further on them.

### accountant
`portal.company.enter` · `account.read.company` · `visit.read.company` · `credit_limit.manage` · `finance.reconcile` · `report.read.company`

### owner
`portal.company.enter` · `company.subscription.manage` · `company.billing.read` · `company.transfer` · `company.delete`

Deliberately powerless operationally. A real owner holds `owner` + `manager`.

### manager
Every Permission except the four Ownership ones and the platform set — and, in v1, except `role.custom.manage`, which is granted to nobody until Custom Roles ship.

This is not a convenience — it follows from the subset rule. A Manager creates Reps, Supervisors, and Accountants, so a Manager must hold everything those Roles hold, including `visit.record`, `credit_limit.manage`, `portal.rep.enter`, and `portal.supervisor.enter`. It is also what prevents a Manager from granting Ownership: they do not hold the Ownership Permissions, so they cannot pass them on.

### Platform Admin set
`portal.platform.enter` · `platform.company.review` · `platform.company.suspend` · `platform.package.manage` · `platform.audit.read`

## Custom Roles — modelled, not shipped in v1

A Company may define its own Roles as bundles of existing Permissions. A Custom Role belongs to its Company, may be held alongside System Roles, and is bounded by the subset rule — its author cannot put a Permission into it that they do not themselves hold.

**The model supports this from day one; v1 does not ship the UI, and `role.custom.manage` is granted to nobody.** Roles remain data, so enabling it later is a feature flag rather than a migration. Two reasons for deferring: no customer has asked for it, and not shipping it removes the entire attack surface described under "System Role immutability" below.

## System Role immutability — enforced, not asserted

The five System Roles are immutable. That **must be a database trigger** that raises on any `UPDATE` touching `permissions` where `is_system` is true — not a code convention and not a review comment.

The existing `tips_crm_save_role` RPC (`supabase/tips_crm_roles_rpc.sql:34-52`) demonstrates exactly the gap: it protects `is_active` for system roles while overwriting `permissions` unconditionally. Ported forward as-is, a Manager holding `role.custom.manage` could rewrite the `owner` bundle. The subset rule stops them manufacturing `company.delete` out of nothing, but nothing stops them **blanking the Owner's bundle** and stripping the real Owner of `company.transfer` and `company.delete`.

**The subset rule governs editing a Role, not only creating one.** Any write to a Role's Permission set — new or existing, custom or system — is bounded by the Permissions the author holds. The earlier wording covered creation only, which was the ambiguity that made the above possible.

## Scope rules

**Discipline** is a set on the Membership: none, `sales`, `medical`, or both. An **Account** carries its own Discipline set, defaulted from its type at creation or import and editable afterward. An Account is reachable when the two sets intersect.

**Team** is explicit. Rep Memberships are assigned to a Supervisor; supervision is never inferred from shared Territory or Discipline. Deriving it would let a logistics edit silently change who approves whose Plans, and would make a Person holding both `supervisor` and `rep` their own supervisor.

**Territory** narrows field data within whatever scope a Permission already granted.

## Enforcement

Permissions are resolved **in the database**, and RLS and server checks read that resolution. The client fetches a resolved payload purely to decide what to render.

**The client's permission set is advisory.** It decides what is shown, never what is allowed. Every enforcement point re-resolves server-side.

**Resolution is materialized, not computed per row.** A `membership_permissions` table holds the flattened union for each Membership, maintained by trigger on any change to Memberships, Role assignments, or Role Permission sets. RLS reads that table.

Computing the union inside each policy evaluation does not perform: `has_permission()` (`supabase/chunks/02_rls_and_policies.sql:24-33`) is `SECURITY DEFINER`, which Postgres never inlines, so it runs per row. The new model would replace one array-contains check with a Membership → multiple Roles → union walk, ANDed with Discipline intersection and Territory containment — per row, for a Supervisor pulling a month of team visits, over Sudanese mobile data.

Two alternatives were rejected. **Custom JWT claims:** a revoked Role survives until token refresh, the wrong failure direction for a removal. **A session-scoped Postgres GUC set once per request:** correct in principle, but GUC lifetime interacts badly with connection pooling under PgBouncer. A trigger-maintained table invalidates synchronously and survives pooling.

## Offline drafts and permission changes

Visits are recorded offline and synced later. Permissions are resolved server-side at sync time, so a draft can arrive authorized by Permissions its author no longer holds.

**A rejected draft is preserved and raised to the Supervisor as an exception to accept or discard.** The Rep sees an explicit "your access changed" state — never a generic retry error for something they cannot retry.

The work was really done, so the record should not evaporate; but the app must not pretend a revoked Person can resolve it themselves. Authorizing against Permissions held at *record* time was rejected: it lets a revoked Person keep writing indefinitely from a stale device.

## Granting — the subset rule

A Person may grant only those Roles, and create or edit only those Roles, whose Permissions they already hold. No rank ordering, and no exemption for `portal.*`.

**Role grants are audited.** Every assignment and revocation is recorded with actor, subject, Role, and time, readable through `audit.read.company`.

**Separation of duties between Manager and Accountant is not enforced, deliberately.** The subset rule means a Manager holds `credit_limit.manage` and `finance.reconcile` in order to be able to create Accountants. Splitting "may grant" from "may do" was considered and rejected, because it does not close the hole it targets: `employee.manage` lets a Manager create staff **and set their temporary passwords** (`SYSTEM_GUIDE_AND_TEST_ACCOUNTS.md` §6), so a Manager wanting finance access can create an Accountant and sign in as them. The wall was already absent; a second resolution path would only have hidden that.

Audit logging is therefore the control. Should a real customer need the wall, the effective fix is making `accountant` Owner-grantable only **and** removing Managers' ability to set passwords — not a parallel permission set.

## Migration from the legacy role keys

| Legacy | Becomes |
|---|---|
| `company_manager` | `manager` |
| `sales_manager` | `manager` |
| `sales_supervisor` | `supervisor` + Discipline `{sales}` |
| `medical_supervisor` | `supervisor` + Discipline `{medical}` |
| `sales_rep` | `rep` + Discipline `{sales}` |
| `medical_rep` | `rep` + Discipline `{medical}` |
| `accountant` | `accountant` + Discipline `{}` |
| `system_admin` | `is_platform_admin = true`, Membership dropped |

**No legacy key maps to `owner`.** Every existing Company must be given an Owner explicitly, decided against real company-creation records — never invented automatically.

**This is a structural change, not only a data remapping.** `company_memberships.role_key` is a single nullable column that is written (`supabase/fix_company_manager_access.sql:63`) but never read — no RLS policy, no `has_permission`, no profile query consults it. Multi-role requires replacing it with a membership-to-roles join table, plus the `membership_permissions` materialization and its triggers. That DDL is its own migration step and must land before any data mapping.

**Audit the `is_platform_admin()` bypass while migrating.** Coverage is already inconsistent: the bypass appears on `territories`, `accounts`, `plans`, and `team_invites` in `supabase/tips_crm_company_isolation.sql`, but is absent from `visits`, `plan_visits`, `duty_sessions`, `duty_location_points`, and `notifications`. Whatever the new model decides, that inconsistency should not be carried forward unexamined.

**Gated on a fact not yet established:** whether `crm.tips-sd.com` holds real customer data. Verify first, then choose — pre-launch means a clean rebuild; real production data means in-place migration; mixed means preserve the real and rebuild the disposable.

## Sequencing

1. `git init`, baseline commit, add `.env.example` documenting `DATABASE_URL` and the Supabase variables. No redesign work before this.
2. Delete `apps/web/` and `apps/mobile/`. They declare no dependencies, have no `node_modules`, are wired into no workspace, and build nothing — while `npm run check` still type-checks them. Root `app/` is the single tree; platform differences are handled by platform-conditional routing, not copied directories.
3. Consolidate authorization into one module under `shared/`, and migrate consumers to it. Resolve the existing divergence between `apps/web/app/index.tsx` and `shared/lib/post-login-route.ts` as part of this.
4. Repoint tRPC's `createContext` at Supabase auth, retiring the legacy OAuth + MySQL `users` identity path, and delete the role resolution in `hooks/use-operational-role.ts`.
5. Implement the model, in this order:
   - Structural DDL: membership-to-roles join table, `membership_permissions` materialization and its triggers.
   - Integrity triggers: System Role immutability, platform-admin/Membership exclusivity, `active_company_id` nulling on Membership delete. **These are tested before any UI ships** — each one is an assertion the rest of the model leans on.
   - RLS rewritten against `membership_permissions`, with the `is_platform_admin()` bypass coverage made consistent.
   - Portal entry, landing precedence and switcher.
   - Offline draft rejection path and the Supervisor exception queue.
   - Role-grant audit log.
   - Seed and test data — rewritten, since the accounts in `SYSTEM_GUIDE_AND_TEST_ACCOUNTS.md` are all named after retired role keys.

The MySQL-backed tRPC *data* procedures — duty tracking and notifications — stay out of scope. They are live but degrade silently with no `DATABASE_URL` configured, which is tracked separately from this work.

**Known contradiction, accepted with eyes open.** Those procedures guard on role strings (`server/routers.ts:13`, `profile?.crmRole !== "manager"`). While the carve-out stands, ADR-0001's "no guard anywhere tests a Role" describes the **end state**, not the state after this work lands. That carve-out must close before the claim becomes true; it is a tracked debt, not a silent exception.

Client-side migration is also understated by "migrate consumers" above: `lib/crm-store.tsx:20,96-97` bakes Discipline into Arabic role labels (`"مشرف مبيعات"` / `"مشرف طبي"`) — precisely what ADR-0001 rejects. Unpicking that is real UI and copy work across every screen that renders a role.
