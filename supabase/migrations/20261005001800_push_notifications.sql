-- Real push notifications. Every row inserted into tips_crm.notifications (plan
-- approved, plan edited, territory exit, ...) is also sent to the recipient's
-- phones through the Expo push service. Android delivery goes through Firebase
-- (FCM V1 credentials uploaded to the Expo project).

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS tips_crm.push_tokens (
  token text PRIMARY KEY,
  profile_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid REFERENCES tips_crm.companies(id) ON DELETE CASCADE,
  platform text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_tokens_profile_idx ON tips_crm.push_tokens(profile_id);
-- Read and written only through the functions below.
ALTER TABLE tips_crm.push_tokens ENABLE ROW LEVEL SECURITY;

-- A device belongs to whoever signed in on it last.
CREATE OR REPLACE FUNCTION public.tips_crm_register_push_token(token_input text, platform_input text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF token_input !~ '^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]+\]$' THEN
    RAISE EXCEPTION 'Invalid push token';
  END IF;
  INSERT INTO tips_crm.push_tokens(token, profile_id, company_id, platform, updated_at)
  VALUES (token_input, auth.uid(), tips_crm.my_company_id(), left(platform_input, 20), now())
  ON CONFLICT (token) DO UPDATE
    SET profile_id = EXCLUDED.profile_id, company_id = EXCLUDED.company_id,
        platform = EXCLUDED.platform, updated_at = now();
  RETURN true;
END;
$$;

-- On sign-out the device stops receiving the previous user's notifications.
CREATE OR REPLACE FUNCTION public.tips_crm_unregister_push_token(token_input text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, auth, public
AS $$
BEGIN
  UPDATE tips_crm.push_tokens SET profile_id = NULL, company_id = NULL, updated_at = now()
  WHERE token = token_input AND profile_id = auth.uid();
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.tips_crm_register_push_token(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.tips_crm_unregister_push_token(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tips_crm_register_push_token(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tips_crm_unregister_push_token(text) TO authenticated;

-- Fire-and-forget: pg_net sends after the transaction commits, and any failure
-- here is swallowed so a push problem can never block the notification itself.
CREATE OR REPLACE FUNCTION tips_crm.send_notification_push()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = tips_crm, extensions, public
AS $$
DECLARE
  messages jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object(
           'to', pt.token,
           'title', NEW.title,
           'body', NEW.body,
           'sound', 'default',
           'channelId', 'tips-operations',
           'priority', 'high',
           'data', jsonb_build_object('notificationId', NEW.id, 'kind', NEW.kind)))
  INTO messages
  FROM tips_crm.push_tokens pt
  WHERE pt.profile_id = NEW.recipient_id
    AND (pt.company_id IS NULL OR NEW.company_id IS NULL OR pt.company_id = NEW.company_id);

  IF messages IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := messages,
      headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION tips_crm.send_notification_push() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER send_notification_push AFTER INSERT ON tips_crm.notifications
  FOR EACH ROW EXECUTE FUNCTION tips_crm.send_notification_push();
