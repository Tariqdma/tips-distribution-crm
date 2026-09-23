# Tips CRM

A multi-tenant field operations platform for pharmaceutical, medical-supply, and FMCG distribution companies. Tips operates the platform; subscribing companies run their own territories, catalogues, plans, and field staff inside it.

Every term carries three names: the Arabic name used in the interface, the English name used in conversation and documentation, and the code identifier. All three refer to the same concept.

## Language

### Access structure

**Tier** — «الطبقة» — code: `tier`:
A tenancy and security layer. There are exactly three: Platform, Company, and Field. The Tier boundary is what isolation rules enforce — it answers "whose data is this?".
_Avoid_: level, layer, portal (a Portal is a different thing)

**Platform Tier** — «طبقة المنصة» — code: `platform`:
The layer belonging to Tips itself, which administers the platform and its subscribing companies. It holds no customer-company data of its own.

**Company Tier** — «طبقة الشركة» — code: `company`:
The layer belonging to a single subscribing company: its territories, catalogue, accounts, staff, and finances. One Company Tier never sees another's data.

**Field Tier** — «الطبقة الميدانية» — code: `field`:
The layer belonging to a company's field staff — the people who plan and perform visits, and the people who supervise them. It sits inside a single Company Tier.

**Portal** — «البوابة» — code: `portal`:
An interface and route namespace serving one audience. There are four: `/platform`, `/company`, `/supervisor`, `/rep`. A Portal belongs to exactly one Tier, but a Tier may contain several Portals — the Supervisor Portal and the Rep Portal both sit in the Field Tier.
_Avoid_: dashboard, app, interface, tier (a Tier is a different thing)

### People and permission

**Person** — «الشخص» — code: `profile`:
A human being with an account on the platform. A Person exists independently of any company.
_Avoid_: user, account (an Account is a customer, not a person)

**Membership** — «العضوية» — code: `company_membership`:
A Person's association with one Company. Roles are held by the Membership, not by the Person, so the same Person may hold different Roles in different Companies.

**Role** — «الدور» — code: `role`:
A named bundle of permissions, assigned to a Membership. A Role determines **what a Person may do** — never which data they may see. One Membership may hold several Roles at once, and its permissions are the union of them.
_Avoid_: job title, position, permission (a Role bundles permissions; it is not one)

**Permission** — «الصلاحية» — code: `permission`:
A single named capability, such as reviewing a team's Plans. The vocabulary of Permissions is fixed and defined in code. Permissions are the only thing authorization ever tests — a guard asks whether a Permission is held, never which Roles are held. A Permission is held either through a Membership's Roles or, for a Platform Admin, through the account itself.
_Avoid_: right, privilege, access, role (a Role bundles Permissions; it is not one)

**System Role** — «دور النظام» — code: `system_role`:
One of the five Roles that ship with the product and exist in every Company: Owner, Manager, Supervisor, Rep, Accountant.

**Custom Role** — «دور مخصص» — code: `custom_role`:
A Role a Company defines for itself as a bundle of existing Permissions. A Custom Role belongs to the Company that created it and can introduce no Permission that the code does not already define.

**Entry Permission** — «صلاحية الدخول» — code: `entry_permission`:
The single Permission a Portal declares as the condition for reaching it. A Portal appears to a Membership that holds its Entry Permission, and to no other.

**Active Company** — «الشركة النشطة» — code: `active_company_id`:
The one Company a Person is currently working inside, chosen from the Companies they hold a Membership in. It is the tenant boundary that isolation rules read, so it may never point at a Company where the Person holds no Membership.

**Discipline** — «التخصص» — code: `discipline`:
The line of field work a Membership covers, as a set of zero or more of `sales` and `medical`. Discipline determines **which data a Person may reach**, alongside Territory. It is never part of a Role's name, and an Accountant or Owner may hold none.
_Avoid_: type, specialty (`specialty` is a property of a doctor Account), department

**Platform Admin** — «مدير المنصة» — code: `is_platform_admin`:
A Person who administers the Tips platform itself. This is a property of the Person's account, not a Role — administering the platform grants no Membership in any customer Company. Their Permissions come from a fixed set attached to that property.
_Avoid_: system admin, super admin, `system_admin`

**Subset Rule** — «قاعدة الاحتواء» — code: `subset_rule`:
The constraint that a Person may only grant a Role, or create or edit one, whose Permissions they already hold themselves. It governs every write to a Role's Permission set, not only the creation of new ones. It is what prevents privilege escalation, and it is why a Manager holds the Permissions of every Role they are able to create.

### Roles

**Owner** — «المالك» — code: `owner`:
The Role holding a Company's non-operational powers: its subscription, its billing, and its existence. Distinct from Manager so that operational administration can be delegated without handing over the Company.

**Manager** — «المدير» — code: `manager`:
The Role administering a Company's operations: Territories, staff, catalogue, Account imports, and Plan approval.
_Avoid_: company manager, sales manager, admin

**Supervisor** — «المشرف» — code: `supervisor`:
The Role overseeing a Team of Reps: reviewing their Plans, and following their field coverage.
_Avoid_: sales supervisor, medical supervisor (the line of work is a Discipline, not a Role)

**Rep** — «المندوب» — code: `rep`:
The Role performing field work: planning Visits, attending Accounts, and recording Outcomes.
_Avoid_: sales rep, medical rep, representative, agent

**Accountant** — «المحاسب» — code: `accountant`:
The Role responsible for a Company's financial oversight: credit limits, and reconciling the collections and invoices that Visits report.

### Field work

**Account** — «الجهة» — code: `account`:
A customer or target of field work: a Doctor, Pharmacy, Hospital, or Distributor. An Account belongs to one Company and sits at known coordinates.
_Avoid_: client, customer, entity, outlet

**Team** — «الفريق» — code: `team`:
The set of Rep Memberships explicitly assigned to one Supervisor. Membership of a Team is always assigned, never inferred from shared Territory or Discipline — so who reviews a given Person's Plans is a fact someone recorded, not a side effect of a logistics change.
_Avoid_: squad, group, reports

**Territory** — «المنطقة» — code: `territory`:
A geographic area of responsibility within a Company, defined as a centre point with a radius or as a polygon. Memberships are assigned to Territories to keep field coverage from overlapping.
_Avoid_: region, zone, area

**Plan** — «الخطة» — code: `plan`:
A Person's proposed schedule of Visits over a week or a month, submitted for approval before its Visits become actionable.
_Avoid_: schedule, itinerary, route

**Visit** — «الزيارة» — code: `visit`:
One documented interaction with an Account at a point in time, carrying proof of attendance and an Outcome.
_Avoid_: call, appointment, check-in

**Outcome** — «النتيجة» — code: `outcome`:
What a completed Visit produced: follow-up, invoice created, payment collected, or medical discussion / sample delivery. The Outcome records that something happened in the field; it is not the invoice or payment itself.
_Avoid_: result, status (a Visit's status is separate from its Outcome)

**Needs Review** — «تحتاج مراجعة» — code: `needs_review`:
The state of a Visit whose proof of attendance falls outside the expected geographic bounds. It is a Visit awaiting judgement, not a rejected one, and it does not count toward coverage.
