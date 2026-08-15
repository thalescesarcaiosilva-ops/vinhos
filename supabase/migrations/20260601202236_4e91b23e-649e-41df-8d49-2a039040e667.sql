
-- Junction table
CREATE TABLE public.product_categories (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

GRANT SELECT ON public.product_categories TO anon, authenticated;
GRANT ALL ON public.product_categories TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product_categories"
ON public.product_categories FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins write product_categories"
ON public.product_categories FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_product_categories_category ON public.product_categories(category_id);

-- Insert "Vinhos" umbrella + country categories
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('vinhos', 'Vinhos', 0),
  ('brasil', 'Brasil', 100),
  ('argentina', 'Argentina', 101),
  ('chile', 'Chile', 102),
  ('franca', 'França', 103),
  ('italia', 'Itália', 104),
  ('portugal', 'Portugal', 105),
  ('espanha', 'Espanha', 106),
  ('alemanha', 'Alemanha', 107),
  ('nova-zelandia', 'Nova Zelândia', 108),
  ('uruguai', 'Uruguai', 109),
  ('africa-do-sul', 'África do Sul', 110),
  ('australia', 'Austrália', 111),
  ('eua', 'Estados Unidos', 112)
ON CONFLICT (slug) DO NOTHING;

-- Backfill: preserve existing single category
INSERT INTO public.product_categories (product_id, category_id)
SELECT id, category_id FROM public.products WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: add "Vinhos" for every wine (anything with wine_type)
INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM public.products p, public.categories c
WHERE c.slug = 'vinhos' AND p.wine_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: tipo de vinho
INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM public.products p
JOIN public.categories c ON c.slug = CASE p.wine_type
  WHEN 'Tinto' THEN 'tintos'
  WHEN 'Branco' THEN 'brancos'
  WHEN 'Rosé' THEN 'roses'
  WHEN 'Espumante' THEN 'espumantes'
END
WHERE p.wine_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: país
INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM public.products p
JOIN public.categories c ON c.slug = CASE p.country
  WHEN 'Brasil' THEN 'brasil'
  WHEN 'Argentina' THEN 'argentina'
  WHEN 'Chile' THEN 'chile'
  WHEN 'França' THEN 'franca'
  WHEN 'Itália' THEN 'italia'
  WHEN 'Portugal' THEN 'portugal'
  WHEN 'Espanha' THEN 'espanha'
  WHEN 'Alemanha' THEN 'alemanha'
  WHEN 'Nova Zelândia' THEN 'nova-zelandia'
  WHEN 'Uruguai' THEN 'uruguai'
  WHEN 'África do Sul' THEN 'africa-do-sul'
  WHEN 'Austrália' THEN 'australia'
  WHEN 'Estados Unidos' THEN 'eua'
  WHEN 'EUA' THEN 'eua'
END
WHERE p.country IS NOT NULL
ON CONFLICT DO NOTHING;
