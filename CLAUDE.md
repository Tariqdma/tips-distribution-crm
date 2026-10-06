# CLAUDE.md — Tips CRM

> **ملخص بالعربي:** هذا الملف دليل لأي جلسة Claude قادمة تعمل على المشروع.
> يشرح طريقة البناء والنشر، وقواعد قاعدة البيانات، والأخطاء التي وقعنا فيها سابقاً حتى لا تتكرر.
> اكتب طلبك لـ Claude بشكل عادي، وهو سيقرأ هذا الملف تلقائياً.

Multi-tenant field CRM for distribution companies in Sudan (Arabic, RTL). One codebase serves the
website (crm.tips-sd.com) and the Android app. Read `CONTEXT.md` for the domain vocabulary and
`docs/adr/0001-*.md` + `docs/authorization-model.md` for the permission model before changing access logic.

## Stack

- **App:** Expo SDK 54, React Native 0.81, Expo Router (`app/`), New Architecture on. One codebase for web and Android.
- **Server:** Express + tRPC in `server/`, bundled by esbuild to `dist/index.js`, started through `server.js`.
- **Database:** Supabase project `luqrrjhvaremronfcvaf`. All business tables are in schema `tips_crm`; the app calls
  `public.tips_crm_*` SQL functions (RPCs).
- **Hosting:** Hostinger Node.js app (user `u908949786`, domain `crm.tips-sd.com`), auto-deploys from GitHub
  `Tariqdma/tips-distribution-crm`, branch `authorization-model`. Build script `build`, entry file `server.js`.
- **Android:** EAS project `@taritipss-team/tips-distribution-crm` (id `cef9218e-…`), profile `preview` builds an APK.
- **Monitoring:** Sentry project `tips-crm` (DSN in `shared/sentry.ts`, public by design). Push via Expo + Firebase.

## Commands

```bash
npm run check          # tsc --noEmit
npm run lint           # expo lint (0 errors expected; warnings exist)
npm test               # vitest unit tests (tests/integration is excluded)
npm run test:integration   # needs real Supabase/Resend keys in env
npm run build:server   # esbuild -> dist/index.js
npm run export:web     # expo web export -> public-web/
```

CI (`.github/workflows/ci.yml`) runs check, lint, test and build:server on every push.

## Deploying

1. Commit and push to `authorization-model`. Hostinger builds and restarts on its own (about 1 minute).
2. The web bundle is **also committed**: after UI changes run `npm run export:web`, then copy `public-web/` into
   `public_html/` **keeping `public_html/.htaccess`**, and commit both. Hostinger's build exports again, but keep
   the committed copy in sync.
3. If users still see an old page, clear Hostinger's cache (Hostinger connector: `hosting_cache_clear-website`).
   `.htaccess` sends `no-store` for `.html` so this should be rare.
4. Hostinger's entry file is `server.js` (a one-line `require("./dist/index.js")`). Do not delete it — every
   deploy fails with "Entry file not found" without it.
5. **Never build an APK unless the user asks.** EAS free-tier builds can sit in the queue for 1–2 hours; check
   `build_list` before assuming a build was lost.

## Database rules (important)

- **Every schema change is a file in `supabase/migrations/` AND applied to the database.** Name files
  `YYYYMMDDHHMMSS_description.sql`. The repo folder is the source of truth.
- **The app never reads or writes tables directly.** Add a `public.tips_crm_*` function instead:
  `LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public`, then
  `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`.
  (`tips_crm` is now exposed to the API for the server's service-role calls, but client code must still use RPCs.)
- **Tenant isolation:** filter every query by `company_id = tips_crm.my_company_id()`. Platform-admin functions
  check `tips_crm.is_platform_admin()` instead.
- **Permissions:** check `tips_crm.has_perm('<permission>')` using the vocabulary in `shared/auth/permissions.ts`.
  The legacy `tips_crm.has_permission('manage_*')` still exists; accept it as a fallback only where the old
  roles need it.
- **Scope helper:** `tips_crm.visible_profile_ids(team_perm, company_perm)` returns self (rep), direct reports
  (supervisor) or the whole company (manager).
- `tips_crm.log_audit(...)` **raises** when the caller has no active company (platform admins). Guard it with
  `IF tips_crm.my_company_id() IS NOT NULL`.
- `tips_crm.current_actor_company_id()` raises too; `tips_crm.my_company_id()` returns NULL. Prefer the latter.
- In PL/pgSQL, `FOUND` is overwritten by a later `PERFORM` — copy it to a variable first.
- The Supabase MCP `apply_migration` times out on SQL containing `DELETE` or `DROP`. Write those into a
  `*_run_manually_*.sql` migration and ask the user to run it in the SQL Editor. Use `CREATE OR REPLACE TRIGGER`
  instead of `DROP TRIGGER` + `CREATE TRIGGER`.
- Test functions as a real user inside a rolled-back transaction:
  ```sql
  begin;
  select set_config('request.jwt.claims', '{"sub":"<profile uuid>","role":"authenticated"}', true);
  set local role authenticated;
  select * from public.tips_crm_some_function();
  rollback;
  ```

## Roles and permissions

- System roles: `owner`, `manager`, `supervisor`, `rep`, `accountant` (membership roles, `tips_crm.membership_roles`).
  Legacy keys (`company_manager`, `sales_rep`, …) still live on `company_memberships.role_key` / `profiles.role_key`
  and map through `shared/auth/legacy-role-key.ts`.
- `tips_crm.roles` is **shared by all companies**; only platform admins may edit it, and system roles are
  immutable. Custom per-company roles are intentionally **not shipped** (ADR-0001) — the roles screen stays gated.
- Disciplines (`sales` / `medical`) decide what a supervisor or rep sees, separately from roles.

## Mistakes we already made — check these first

1. **Client and server field names must match.** Several platform buttons failed silently because the page sent
   `requestedInfo`/`decision` while the API read `informationNeeded`/`status`. When adding an API call, open the
   route in `server/routes/*.ts` and copy the exact field names. Same for RPC argument names (`pg_proc.proargnames`).
2. **Show errors where the user is looking.** On the web `Alert.alert` does nothing, and page-level errors hide behind
   modals. Render the error inside the modal or screen; use `describeError()` from `lib/error-message.ts`
   (Supabase errors are not `Error` instances).
3. **Never store large data in `auth.users` metadata** (`supabase.auth.updateUser({ data })`). It is copied into every
   access token; a 566 KB base64 avatar made every request from that account fail. Avatars go to the `avatars`
   Storage bucket (`lib/avatar-upload.ts`) and only the URL is stored.
4. **Use `Platform.OS === "web"`, not `typeof window !== "undefined"`** — React Native defines `window`, and
   `localStorage` access crashed the Android app.
5. **The UI is light-only.** Text colors from `palette` in `components/crm-ui.tsx` assume a light background.
   Near-white text (`#E9F8F2`, `#FFFFFF`) is only for dark/colored cards — it made form labels invisible before.
6. **Demo data:** `lib/crm-store.tsx` seeds demo members, visits and duty paths for signed-out/offline use.
   When signed in, server data must replace it (team members, duty, visits already do).
7. **RPCs that return one row per user** may hit permission errors for some roles; the store treats an RPC error as
   "no data" (`response.error ? null : …`). Keep that pattern so one denied call does not break the screen.

## Where things live

| Area | Files |
|---|---|
| Global data/sync for the app | `lib/crm-store.tsx` (large; offline drafts, visits, plans, team, duty) |
| Auth/profile | `lib/supabase-auth.tsx`, `lib/supabase-client.ts`, RPC `tips_crm_my_profile` |
| Permissions | `shared/auth/*`, `hooks/use-permissions.ts`, `shared/lib/post-login-route.ts` |
| Platform portal (web only) | `app/platform/index.tsx`, `server/platform-company.ts`, `server/routes/platform-router.ts` |
| Company portal | `app/company/*`, setup wizards `app/company-*-setup.tsx`, `server/company-*.ts` |
| Rep / supervisor | `app/(tabs)/*`, `app/supervisor`, `app/visit`, `app/plan`, `app/medical-tools.tsx` |
| Duty GPS tracking | `lib/duty-tracker.ts` → RPCs `tips_crm_start_duty_session` / `tips_crm_record_duty_points` |
| Push notifications | `lib/push-registration.ts`; DB trigger `send_notification_push` on `tips_crm.notifications` |
| Crash reporting | `lib/sentry.ts`, `server/_core/instrument.ts` |
| Plans and docs | `docs/DEVELOPMENT_PLAN.md`, `docs/IMPROVEMENT_PROPOSALS.md`, `docs/push-and-sentry-setup.md` |

## Configuration and secrets

- Never commit secrets. Public values that are fine in code: Supabase URL + anon key, Sentry DSN,
  `google-services.json`.
- Hostinger env vars (hPanel → Node.js → Environment variables): `SUPABASE_SERVICE_ROLE_KEY` (set),
  `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (needed for all outgoing emails), optional `SENTRY_DSN`.
  The Hostinger API **replaces the whole set** when writing env vars and cannot read values back — do not write
  them from Claude; ask the user.
- EAS/expo.dev: FCM V1 service-account key (Credentials → Android) for push; optional `SENTRY_AUTH_TOKEN`.

## Working with the user

- The user writes in Sudanese Arabic; answer in the same style, short and concrete, with exact click paths when
  they must do something in a dashboard.
- Work on branch `authorization-model` only; no pull requests unless asked.
- After a fix, verify it (SQL as a real user, `npm run check`, tests, a headless browser for web pages) before
  saying it works.
