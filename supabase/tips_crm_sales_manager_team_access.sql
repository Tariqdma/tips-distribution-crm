-- Align the sales manager role with the company-team management flow.
-- This only adds the existing manage_users permission; it does not change data ownership.
UPDATE tips_crm.roles
SET permissions = ARRAY(
  SELECT DISTINCT permission
  FROM unnest(permissions || ARRAY['manage_users']::text[]) AS permission
)
WHERE key = 'sales_manager'
  AND NOT ('manage_users' = ANY(permissions));

COMMENT ON TABLE tips_crm.roles IS 'System roles and permissions. Sales managers may manage company team accounts within their active company.';
