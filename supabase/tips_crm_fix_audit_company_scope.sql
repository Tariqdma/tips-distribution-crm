-- Keep audit entries tenant-scoped. Company-scoped actions must carry the actor's active company.
CREATE OR REPLACE FUNCTION tips_crm.log_audit(
  log_action text,
  log_entity_type text,
  log_entity_id text,
  log_details jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
DECLARE actor_company_id uuid;
BEGIN
  actor_company_id := tips_crm.current_actor_company_id();
  IF actor_company_id IS NULL THEN
    RAISE EXCEPTION 'Active company is required for audit logging';
  END IF;
  INSERT INTO tips_crm.audit_log (company_id, actor_id, action, entity_type, entity_id, details)
  VALUES (actor_company_id, auth.uid(), log_action, log_entity_type, log_entity_id, COALESCE(log_details, '{}'::jsonb));
END;
$$;
