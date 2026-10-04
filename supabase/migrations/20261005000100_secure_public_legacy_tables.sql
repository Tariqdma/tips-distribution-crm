-- Legacy tables in the public schema, not used by Tips CRM, were exposed to
-- anyone holding the publishable (anon) key because RLS was disabled.
-- Enabling RLS with no policies closes them to anon/authenticated while
-- service_role keeps full access. No data is changed or deleted.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['bonus_policy_settings','categories','deliveries','delivery_tracking_events','dosage_forms','invoice_items','invoices','pack_sizes','payment_records','products','purchase_invoices','purchase_items','purchase_payments','suppliers'] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;
