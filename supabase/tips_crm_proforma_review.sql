-- توثيق تأكيد العميل ومراجعة مدير الشركة للفواتير المبدئية غير المحاسبية.
CREATE TABLE IF NOT EXISTS tips_crm.proforma_confirmation_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  proforma_id uuid NOT NULL REFERENCES tips_crm.proformas(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES tips_crm.profiles(id) ON DELETE RESTRICT,
  bucket_path text NOT NULL UNIQUE,
  file_name text NOT NULL CHECK (char_length(trim(file_name)) BETWEEN 1 AND 120),
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  file_size integer CHECK (file_size IS NULL OR (file_size > 0 AND file_size <= 5242880)),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proforma_confirmation_attachments_proforma_idx ON tips_crm.proforma_confirmation_attachments(proforma_id, created_at DESC);
ALTER TABLE tips_crm.proforma_confirmation_attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS proforma_confirmation_attachments_read ON tips_crm.proforma_confirmation_attachments;
DROP POLICY IF EXISTS proforma_confirmation_attachments_write ON tips_crm.proforma_confirmation_attachments;
CREATE POLICY proforma_confirmation_attachments_read ON tips_crm.proforma_confirmation_attachments
  FOR SELECT TO authenticated USING (company_id = tips_crm.current_actor_company_id() AND (profile_id = auth.uid() OR tips_crm.can_manage_product_catalog()));
CREATE POLICY proforma_confirmation_attachments_write ON tips_crm.proforma_confirmation_attachments
  FOR INSERT TO authenticated WITH CHECK (
    company_id = tips_crm.current_actor_company_id() AND profile_id = auth.uid()
    AND EXISTS (SELECT 1 FROM tips_crm.proformas p WHERE p.id = proforma_id AND p.company_id = tips_crm.current_actor_company_id() AND p.created_by = auth.uid() AND p.status = 'issued')
  );

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('proforma-evidence', 'proforma-evidence', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 5242880, allowed_mime_types = EXCLUDED.allowed_mime_types;
DROP POLICY IF EXISTS proforma_evidence_company_read ON storage.objects;
DROP POLICY IF EXISTS proforma_evidence_company_upload ON storage.objects;
CREATE POLICY proforma_evidence_company_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'proforma-evidence' AND (storage.foldername(name))[1] = tips_crm.current_actor_company_id()::text);
CREATE POLICY proforma_evidence_company_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'proforma-evidence' AND (storage.foldername(name))[1] = tips_crm.current_actor_company_id()::text);

CREATE OR REPLACE FUNCTION tips_crm.can_review_proformas()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public AS $$
  SELECT EXISTS (SELECT 1 FROM tips_crm.profiles p WHERE p.id = auth.uid() AND p.is_active AND p.active_company_id IS NOT NULL AND p.role_key IN ('company_manager', 'sales_manager', 'system_admin'));
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_confirm_proforma_client(
  target_proforma_id uuid,
  confirmation_method_input text,
  confirmer_name_input text,
  confirmed_at_input timestamptz,
  confirmation_note_input text,
  attachment_path_input text DEFAULT NULL
)
RETURNS TABLE(id uuid, status text, client_confirmed_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public AS $$
DECLARE caller_company_id uuid; normalized_method text := trim(coalesce(confirmation_method_input, '')); normalized_name text := trim(coalesce(confirmer_name_input, '')); normalized_note text := nullif(trim(coalesce(confirmation_note_input, '')), ''); normalized_path text := nullif(trim(coalesce(attachment_path_input, '')), ''); confirmed_at_value timestamptz := coalesce(confirmed_at_input, now());
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_create_proforma() THEN RAISE EXCEPTION 'Only an active sales representative can record client confirmation'; END IF;
  IF normalized_method NOT IN ('phone', 'whatsapp', 'in_person', 'email', 'other') OR char_length(normalized_name) < 2 OR char_length(normalized_name) > 160 OR coalesce(char_length(normalized_note), 0) > 2000 THEN RAISE EXCEPTION 'Client confirmation details are invalid'; END IF;
  IF confirmed_at_value > now() + interval '15 minutes' OR confirmed_at_value < now() - interval '365 days' THEN RAISE EXCEPTION 'Client confirmation time is outside its permitted range'; END IF;
  IF normalized_path IS NOT NULL AND NOT EXISTS (SELECT 1 FROM tips_crm.proforma_confirmation_attachments a WHERE a.proforma_id = target_proforma_id AND a.company_id = caller_company_id AND a.profile_id = auth.uid() AND a.bucket_path = normalized_path) THEN RAISE EXCEPTION 'Client confirmation attachment is not available'; END IF;
  UPDATE tips_crm.proformas p SET status = 'pending_approval', client_confirmation_method = normalized_method, client_confirmer_name = normalized_name, client_confirmed_at = confirmed_at_value, client_confirmation_note = normalized_note, client_confirmation_attachment_path = normalized_path, updated_at = now()
  WHERE p.id = target_proforma_id AND p.company_id = caller_company_id AND p.created_by = auth.uid() AND p.status = 'issued';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only an issued proforma owned by the representative can be confirmed'; END IF;
  INSERT INTO tips_crm.proforma_events(company_id, proforma_id, actor_id, event_type, details) VALUES (caller_company_id, target_proforma_id, auth.uid(), 'client_confirmed', jsonb_build_object('method', normalized_method, 'confirmer_name', normalized_name, 'has_attachment', normalized_path IS NOT NULL));
  INSERT INTO tips_crm.proforma_events(company_id, proforma_id, actor_id, event_type) VALUES (caller_company_id, target_proforma_id, auth.uid(), 'submitted_for_approval');
  INSERT INTO tips_crm.notifications(company_id, recipient_id, title, body, kind, created_by) SELECT caller_company_id, profile.id, 'فاتورة مبدئية بانتظار الاعتماد', 'تم تسجيل تأكيد العميل لفاتورة مبدئية جديدة وتحتاج قرارك.', 'alert', auth.uid() FROM tips_crm.profiles profile WHERE profile.active_company_id = caller_company_id AND profile.role_key IN ('company_manager', 'sales_manager') AND profile.is_active;
  PERFORM tips_crm.log_audit('proforma_client_confirmed', 'proforma', target_proforma_id::text, jsonb_build_object('company_id', caller_company_id, 'method', normalized_method));
  RETURN QUERY SELECT p.id, p.status, p.client_confirmed_at, p.updated_at FROM tips_crm.proformas p WHERE p.id = target_proforma_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_review_proforma(target_proforma_id uuid, decision_input text, manager_note_input text DEFAULT NULL)
RETURNS TABLE(id uuid, status text, reviewed_at timestamptz, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public AS $$
DECLARE caller_company_id uuid; normalized_decision text := trim(coalesce(decision_input, '')); normalized_note text := nullif(trim(coalesce(manager_note_input, '')), ''); next_status text; event_name text; title_text text; body_text text;
BEGIN
  caller_company_id := tips_crm.current_actor_company_id();
  IF NOT tips_crm.can_review_proformas() THEN RAISE EXCEPTION 'Company manager permission is required to review proformas'; END IF;
  IF normalized_decision NOT IN ('approved', 'returned', 'cancelled') THEN RAISE EXCEPTION 'Invalid proforma review decision'; END IF;
  IF coalesce(char_length(normalized_note), 0) > 2000 OR (normalized_decision IN ('returned', 'cancelled') AND coalesce(char_length(normalized_note), 0) < 5) THEN RAISE EXCEPTION 'A concise manager note is required for a returned or cancelled proforma'; END IF;
  next_status := normalized_decision; event_name := normalized_decision; title_text := CASE normalized_decision WHEN 'approved' THEN 'تم اعتماد الفاتورة المبدئية' WHEN 'returned' THEN 'أعيدت الفاتورة المبدئية للتعديل' ELSE 'أُلغيت الفاتورة المبدئية' END; body_text := CASE WHEN normalized_note IS NULL THEN 'راجع سجل الفواتير المبدئية للاطلاع على القرار.' ELSE normalized_note END;
  UPDATE tips_crm.proformas p SET status = next_status, reviewed_by = auth.uid(), reviewed_at = now(), manager_note = normalized_note, updated_at = now() WHERE p.id = target_proforma_id AND p.company_id = caller_company_id AND p.status = 'pending_approval';
  IF NOT FOUND THEN RAISE EXCEPTION 'Only a proforma pending approval can be reviewed'; END IF;
  INSERT INTO tips_crm.proforma_events(company_id, proforma_id, actor_id, event_type, details) VALUES (caller_company_id, target_proforma_id, auth.uid(), event_name, jsonb_build_object('manager_note', normalized_note));
  INSERT INTO tips_crm.notifications(company_id, recipient_id, title, body, kind, created_by) SELECT p.company_id, p.created_by, title_text, body_text, 'alert', auth.uid() FROM tips_crm.proformas p WHERE p.id = target_proforma_id;
  PERFORM tips_crm.log_audit('proforma_reviewed', 'proforma', target_proforma_id::text, jsonb_build_object('company_id', caller_company_id, 'decision', normalized_decision));
  RETURN QUERY SELECT p.id, p.status, p.reviewed_at, p.updated_at FROM tips_crm.proformas p WHERE p.id = target_proforma_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tips_crm_list_review_proformas()
RETURNS TABLE(id uuid, proforma_number bigint, status text, account_id uuid, account_name text, account_type text, rep_id uuid, rep_name text, notes text, subtotal numeric, currency text, issued_at timestamptz, client_confirmed_at timestamptz, client_confirmation_method text, client_confirmer_name text, client_confirmation_note text, client_confirmation_attachment_path text, manager_note text, updated_at timestamptz, created_at timestamptz, lines jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = tips_crm, auth, public AS $$
  SELECT p.id, p.proforma_number, p.status, p.account_id, a.name, a.account_type, p.created_by, rep.full_name, p.notes, p.subtotal, p.currency, p.issued_at, p.client_confirmed_at, p.client_confirmation_method, p.client_confirmer_name, p.client_confirmation_note, p.client_confirmation_attachment_path, p.manager_note, p.updated_at, p.created_at, coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'product_id', l.catalog_product_id, 'sku', l.sku_snapshot, 'name', l.product_name_snapshot, 'unit_label', l.unit_label_snapshot, 'quantity', l.quantity, 'unit_price', l.unit_price, 'line_total', l.line_total) ORDER BY l.created_at) FILTER (WHERE l.id IS NOT NULL), '[]'::jsonb)
  FROM tips_crm.proformas p JOIN tips_crm.accounts a ON a.id = p.account_id AND a.company_id = p.company_id JOIN tips_crm.profiles rep ON rep.id = p.created_by LEFT JOIN tips_crm.proforma_lines l ON l.proforma_id = p.id AND l.company_id = p.company_id
  WHERE p.company_id = tips_crm.current_actor_company_id() AND tips_crm.can_review_proformas()
  GROUP BY p.id, a.id, rep.id ORDER BY CASE WHEN p.status = 'pending_approval' THEN 0 ELSE 1 END, p.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_confirm_proforma_client(uuid, text, text, timestamptz, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_review_proforma(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tips_crm_list_review_proformas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tips_crm_confirm_proforma_client(uuid, text, text, timestamptz, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_review_proforma(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_list_review_proformas() TO authenticated;
