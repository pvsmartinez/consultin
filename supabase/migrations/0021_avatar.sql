-- Migration: 0021_avatar
-- Adds avatar_url to user_profiles and sets up the 'avatars' storage bucket.

-- ─── 1. Column ────────────────────────────────────────────────────────────────
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- ─── 2. Storage bucket ────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- ─── 3. Storage RLS ───────────────────────────────────────────────────────────
-- Users can only write to their own subfolder: avatars/{uid}/...
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'avatars: public read'
  ) THEN
    CREATE POLICY "avatars: public read"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'avatars');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'avatars: owner insert'
  ) THEN
    CREATE POLICY "avatars: owner insert"
      ON storage.objects FOR INSERT
      WITH CHECK (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'avatars: owner update'
  ) THEN
    CREATE POLICY "avatars: owner update"
      ON storage.objects FOR UPDATE
      USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
    AND policyname = 'avatars: owner delete'
  ) THEN
    CREATE POLICY "avatars: owner delete"
      ON storage.objects FOR DELETE
      USING (
        bucket_id = 'avatars'
        AND auth.uid()::text = (storage.foldername(name))[1]
      );
  END IF;
END $$;
