-- >>> 20260603163525_4a8997f7-162d-4f11-bb3a-efa4e1a86ba8.sql
CREATE TABLE IF NOT EXISTS public._product_chars_stg(
  slug text PRIMARY KEY,
  country text, region text, brand text, wine_type text,
  classification text, aging text, grape text, alcohol_content text,
  serving_temp text, visual_notes text, nose_notes text,
  palate_notes text, harmonization text
);
GRANT ALL ON public._product_chars_stg TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._product_chars_stg TO authenticated;
ALTER TABLE public._product_chars_stg ENABLE ROW LEVEL SECURITY;


