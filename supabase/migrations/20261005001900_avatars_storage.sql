-- Profile photos go to Storage; only their short public URL is kept in the
-- user metadata. Storing the image itself there (base64) put it inside every
-- access token: a 566 KB photo made all API requests from that account fail.
-- Existing inline images were copied to tips_crm.avatar_metadata_backup and
-- removed from the metadata.

CREATE TABLE IF NOT EXISTS tips_crm.avatar_metadata_backup (
  user_id uuid PRIMARY KEY,
  avatar_data_url text NOT NULL,
  moved_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tips_crm.avatar_metadata_backup ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = true, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- Each user writes only inside a folder named after their own id.
CREATE POLICY avatars_insert_own ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_update_own ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY avatars_delete_own ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
-- Overwriting the same file (upsert) also needs to read it.
CREATE POLICY avatars_select_own ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
