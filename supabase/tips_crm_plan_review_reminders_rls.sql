ALTER TABLE tips_crm.plan_review_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_review_reminders_manager_read ON tips_crm.plan_review_reminders;

CREATE POLICY plan_review_reminders_manager_read
ON tips_crm.plan_review_reminders
FOR SELECT
TO authenticated
USING (
  manager_id = auth.uid()
  AND tips_crm.has_permission('approve_plans')
);

REVOKE INSERT, UPDATE, DELETE ON tips_crm.plan_review_reminders FROM authenticated;
