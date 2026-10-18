-- >>> 20260603162646_f69d4933-7f2c-4daa-8f10-7ab3bb400a88.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aging text,
  ADD COLUMN IF NOT EXISTS alcohol_content text;


