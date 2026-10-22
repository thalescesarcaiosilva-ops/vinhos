INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('product-videos', 'product-videos', true, 52428800, ARRAY['video/mp4']::text[])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public reads product videos" ON storage.objects;
CREATE POLICY "Public reads product videos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'product-videos');
