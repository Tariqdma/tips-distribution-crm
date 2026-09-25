-- ==============================================================================
-- Tips CRM: move the product catalogue and proformas onto the new vocabulary
--
-- Run AFTER tips_crm_rls_new_vocabulary.sql. That migration deliberately skipped
-- this family, because tips_crm.can_manage_product_catalog() had not been read
-- and a function nobody has looked at should not be rewritten.
--
-- Its current definition is the last role-string check in the database:
--
--   p.role_key IN ('company_manager', 'sales_manager', 'system_admin')
--   OR has_permission('manage_accounts')
--   OR has_permission('view_team_data')
--
-- Two problems. It hardcodes legacy role keys, which is what this whole redesign
-- exists to remove. And `view_team_data` means **every supervisor can currently
-- edit products and prices** — that permission was meant to grant read access to
-- team data, not write access to pricing.
--
-- The helper was also doing two different jobs. On products and price history it
-- means "may manage the catalogue". On the proforma tables it means "may see
-- other people's quotations", which is a finance question. Collapsing both into
-- one predicate is how supervisors ended up with pricing rights.
--
-- So: the helper becomes catalogue.manage (manager only), and the proforma reads
-- additionally accept finance.reconcile so accountants keep sight of quotations —
-- reconciling collections against them is their job.
--
-- NARROWING: supervisors lose product and price-history write. They keep
-- catalogue.read. Confirmed as intended by the product owner.
--
-- current_actor_company_id() is left alone. It RAISES where my_company_id()
-- returns null, and changing that is a separate decision affecting this family
-- only.
--
-- Safe to run twice.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------
-- The helper. is_active on the profile is preserved from the original;
-- has_perm() already implies an active company, since a membership row
-- cannot exist without one.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION tips_crm.can_manage_product_catalog()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'tips_crm', 'auth', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM tips_crm.profiles p
    WHERE p.id = auth.uid() AND p.is_active
  ) AND tips_crm.has_perm('catalogue.manage');
$function$;

-- ------------------------------------------------------------------
-- Proforma reads: a quotation is visible to its author, to whoever
-- manages the catalogue, and to whoever reconciles the money.
-- ------------------------------------------------------------------

DROP POLICY IF EXISTS proformas_company_read ON tips_crm.proformas;
CREATE POLICY proformas_company_read ON tips_crm.proformas FOR SELECT TO authenticated
USING (
  company_id = tips_crm.current_actor_company_id()
  AND (
    created_by = auth.uid()
    OR tips_crm.can_manage_product_catalog()
    OR tips_crm.has_perm('finance.reconcile')
  )
);

DROP POLICY IF EXISTS proforma_lines_company_read ON tips_crm.proforma_lines;
CREATE POLICY proforma_lines_company_read ON tips_crm.proforma_lines FOR SELECT TO authenticated
USING (
  company_id = tips_crm.current_actor_company_id()
  AND EXISTS (
    SELECT 1 FROM tips_crm.proformas p
    WHERE p.id = proforma_lines.proforma_id
      AND (
        p.created_by = auth.uid()
        OR tips_crm.can_manage_product_catalog()
        OR tips_crm.has_perm('finance.reconcile')
      )
  )
);

DROP POLICY IF EXISTS proforma_events_company_read ON tips_crm.proforma_events;
CREATE POLICY proforma_events_company_read ON tips_crm.proforma_events FOR SELECT TO authenticated
USING (
  company_id = tips_crm.current_actor_company_id()
  AND EXISTS (
    SELECT 1 FROM tips_crm.proformas p
    WHERE p.id = proforma_events.proforma_id
      AND (
        p.created_by = auth.uid()
        OR tips_crm.can_manage_product_catalog()
        OR tips_crm.has_perm('finance.reconcile')
      )
  )
);

DROP POLICY IF EXISTS proforma_confirmation_attachments_read ON tips_crm.proforma_confirmation_attachments;
CREATE POLICY proforma_confirmation_attachments_read ON tips_crm.proforma_confirmation_attachments FOR SELECT TO authenticated
USING (
  company_id = tips_crm.current_actor_company_id()
  AND (
    profile_id = auth.uid()
    OR tips_crm.can_manage_product_catalog()
    OR tips_crm.has_perm('finance.reconcile')
  )
);

COMMIT;

-- ------------------------------------------------------------------
-- products_company_manage, product_price_history_company_read and
-- proforma_confirmation_attachments_write are NOT redefined here: their
-- predicates already read can_manage_product_catalog(), whose meaning
-- this migration changed, so they pick up the new rule unchanged.
-- products_company_read never used the helper and is untouched.
-- ------------------------------------------------------------------

-- ==============================================================================
-- Verification
-- ==============================================================================

-- No policy anywhere in tips_crm should reference has_permission() any more.
-- Expect zero rows.
-- SELECT tablename, policyname FROM pg_policies
-- WHERE schemaname = 'tips_crm'
--   AND coalesce(qual,'') || coalesce(with_check,'') LIKE '%has_permission%';

-- The helper itself must no longer mention role_key or has_permission.
-- SELECT pg_get_functiondef(p.oid)
-- FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'tips_crm' AND p.proname = 'can_manage_product_catalog';

-- Who can still manage the catalogue: expect managers only.
-- SELECT p.email, p.role_key
-- FROM tips_crm.profiles p
-- JOIN tips_crm.membership_permissions mp
--   ON mp.profile_id = p.id AND mp.company_id = p.active_company_id
-- WHERE mp.permission = 'catalogue.manage'
-- ORDER BY p.email;

-- ==============================================================================
-- Rollback — restores the previous behaviour exactly, including the supervisor
-- pricing rights and the hardcoded role keys. Emergency use only.
-- ==============================================================================

-- BEGIN;
-- CREATE OR REPLACE FUNCTION tips_crm.can_manage_product_catalog()
-- RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
-- SET search_path TO 'tips_crm', 'auth', 'public'
-- AS $function$
--   SELECT EXISTS (
--     SELECT 1
--     FROM tips_crm.profiles p
--     WHERE p.id = auth.uid()
--       AND p.is_active
--       AND p.active_company_id IS NOT NULL
--       AND (
--         p.role_key IN ('company_manager', 'sales_manager', 'system_admin')
--         OR tips_crm.has_permission('manage_accounts')
--         OR tips_crm.has_permission('view_team_data')
--       )
--   );
-- $function$;
-- DROP POLICY IF EXISTS proformas_company_read ON tips_crm.proformas;
-- CREATE POLICY proformas_company_read ON tips_crm.proformas FOR SELECT TO authenticated
--   USING (company_id = tips_crm.current_actor_company_id()
--          AND (created_by = auth.uid() OR tips_crm.can_manage_product_catalog()));
-- DROP POLICY IF EXISTS proforma_lines_company_read ON tips_crm.proforma_lines;
-- CREATE POLICY proforma_lines_company_read ON tips_crm.proforma_lines FOR SELECT TO authenticated
--   USING (company_id = tips_crm.current_actor_company_id()
--          AND EXISTS (SELECT 1 FROM tips_crm.proformas p
--                      WHERE p.id = proforma_lines.proforma_id
--                        AND (p.created_by = auth.uid() OR tips_crm.can_manage_product_catalog())));
-- DROP POLICY IF EXISTS proforma_events_company_read ON tips_crm.proforma_events;
-- CREATE POLICY proforma_events_company_read ON tips_crm.proforma_events FOR SELECT TO authenticated
--   USING (company_id = tips_crm.current_actor_company_id()
--          AND EXISTS (SELECT 1 FROM tips_crm.proformas p
--                      WHERE p.id = proforma_events.proforma_id
--                        AND (p.created_by = auth.uid() OR tips_crm.can_manage_product_catalog())));
-- DROP POLICY IF EXISTS proforma_confirmation_attachments_read ON tips_crm.proforma_confirmation_attachments;
-- CREATE POLICY proforma_confirmation_attachments_read ON tips_crm.proforma_confirmation_attachments FOR SELECT TO authenticated
--   USING (company_id = tips_crm.current_actor_company_id()
--          AND (profile_id = auth.uid() OR tips_crm.can_manage_product_catalog()));
-- COMMIT;
