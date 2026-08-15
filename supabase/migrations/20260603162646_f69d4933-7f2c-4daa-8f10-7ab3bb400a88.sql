ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aging text,
  ADD COLUMN IF NOT EXISTS alcohol_content text;