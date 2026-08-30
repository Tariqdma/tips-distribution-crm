-- إيقاف المنتج يحافظ على تاريخه ولا يحذفه، ويمنع ظهوره في اختيار المندوب والفاتورة الجديدة.
CREATE OR REPLACE FUNCTION public.tips_crm_set_catalog_product_active(target_product_id uuid, next_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = tips_crm, auth, public
AS $$
DECLARE
  caller_company_id uuid;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_manage_product_catalog() THEN
    RAISE EXCEPTION 'Product catalog management permission required';
  END IF;
  UPDATE tips_crm.products
  SET is_active = next_active, updated_at = now()
  WHERE id = target_product_id AND company_id = caller_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product is not available for the active company';
  END IF;
  PERFORM tips_crm.log_audit(
    CASE WHEN next_active THEN 'product_catalog_activated' ELSE 'product_catalog_deactivated' END,
    'product', target_product_id::text, jsonb_build_object('company_id', caller_company_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_set_catalog_product_active(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_set_catalog_product_active(uuid, boolean) TO authenticated;
