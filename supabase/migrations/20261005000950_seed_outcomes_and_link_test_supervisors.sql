-- Default visit outcomes for companies that have none, so the visit form has choices.
INSERT INTO tips_crm.visit_outcomes(company_id, label, sort_order, is_active)
SELECT c.id, d.label, d.sort_order, true
FROM tips_crm.companies c
CROSS JOIN (VALUES ('متابعة', 10), ('تم إنشاء فاتورة', 20), ('تم تحصيل', 30), ('لا يوجد قرار', 40)) AS d(label, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM tips_crm.visit_outcomes o WHERE o.company_id = c.id)
ON CONFLICT (company_id, label) DO NOTHING;

-- Link reps without a supervisor to the single supervisor of the same discipline
-- in their company (only where exactly one such supervisor exists).
UPDATE tips_crm.company_memberships rep
SET reports_to_profile_id = sup.profile_id, updated_at = now()
FROM tips_crm.company_memberships sup
WHERE rep.company_id = sup.company_id
  AND rep.is_active AND sup.is_active
  AND rep.reports_to_profile_id IS NULL
  AND rep.role_key IN ('sales_rep', 'medical_rep')
  AND sup.role_key IN ('sales_supervisor', 'medical_supervisor')
  AND rep.disciplines && sup.disciplines
  AND (SELECT count(*) FROM tips_crm.company_memberships s2
       WHERE s2.company_id = rep.company_id AND s2.is_active
         AND s2.role_key IN ('sales_supervisor', 'medical_supervisor')
         AND s2.disciplines && rep.disciplines) = 1;
