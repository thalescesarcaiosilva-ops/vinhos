-- >>> 20260602032257_4a8ca9ab-c0ff-425b-a35d-72b38d044c43.sql
-- ============================================================
-- FASE 1: TAXONOMIAS E HIERARQUIA DE CATEGORIAS
-- ============================================================

-- 1) ENUMS
DO $$ BEGIN
  CREATE TYPE public.product_type_enum AS ENUM
    ('vinho','espumante','sangria','destilado','cerveja','suco','acessorio','gourmet','kit','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wine_color_enum AS ENUM
    ('tinto','branco','rose','misto','na');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) COLUNAS EM products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type public.product_type_enum,
  ADD COLUMN IF NOT EXISTS color public.wine_color_enum,
  ADD COLUMN IF NOT EXISTS is_zero_alcohol boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS harmonizacao text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selo text[] NOT NULL DEFAULT '{}';

-- 3) parent_id em categories (hierarquia)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- 4) TABELAS DE TAXONOMIA
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write brands" ON public.brands;
CREATE POLICY "Admins write brands" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.grapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grapes TO anon, authenticated;
GRANT ALL ON public.grapes TO service_role;
ALTER TABLE public.grapes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read grapes" ON public.grapes;
CREATE POLICY "Public read grapes" ON public.grapes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write grapes" ON public.grapes;
CREATE POLICY "Admins write grapes" ON public.grapes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regions TO anon, authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read regions" ON public.regions;
CREATE POLICY "Public read regions" ON public.regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write regions" ON public.regions;
CREATE POLICY "Admins write regions" ON public.regions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.collections TO anon, authenticated;
GRANT ALL ON public.collections TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read collections" ON public.collections;
CREATE POLICY "Public read collections" ON public.collections FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write collections" ON public.collections;
CREATE POLICY "Admins write collections" ON public.collections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) N:N product_grapes
CREATE TABLE IF NOT EXISTS public.product_grapes (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  grape_id uuid NOT NULL REFERENCES public.grapes(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, grape_id)
);
GRANT SELECT ON public.product_grapes TO anon, authenticated;
GRANT ALL ON public.product_grapes TO service_role;
ALTER TABLE public.product_grapes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read product_grapes" ON public.product_grapes;
CREATE POLICY "Public read product_grapes" ON public.product_grapes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write product_grapes" ON public.product_grapes;
CREATE POLICY "Admins write product_grapes" ON public.product_grapes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6) FKs simples em products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL;

-- 7) ÁRVORE DE CATEGORIAS "TIPOS" (Vinoteca)
-- Top-level
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('so-vinhos','Só Vinhos',10),
  ('so-espumantes','Só Espumantes',20),
  ('vinhos-espumantes','Vinhos & Espumantes',30),
  ('so-sangrias','Só Sangrias',40)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Só Vinhos
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('tintos','Tintos',1),
  ('brancos','Brancos',2),
  ('roses','Rosés',3),
  ('tintos-brancos','Tintos e Brancos',4),
  ('tintos-roses','Tintos e Rosés',5),
  ('brancos-roses','Brancos e Rosés',6),
  ('vinhos-zero-alcool','Zero Álcool',7)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'so-vinhos'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Só Espumantes
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('espumantes-brancos','Brancos',1),
  ('espumantes-roses','Rosés',2),
  ('espumantes-brancos-roses','Brancos e Rosés',3),
  ('espumantes-zero-alcool','Zero Álcool',4)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'so-espumantes'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Vinhos & Espumantes (kits)
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('ve-tintos-brancos','Tintos e Brancos',1),
  ('ve-tintos-roses','Tintos e Rosés',2),
  ('ve-brancos-roses','Brancos e Rosés',3),
  ('ve-tintos-brancos-roses','Tintos, Brancos e Rosés',4),
  ('ve-zero-alcool','Zero Álcool',5)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'vinhos-espumantes'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Só Sangrias
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('sangrias','Sangrias',1)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'so-sangrias'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- 8) FUNÇÃO DE DERIVAÇÃO (taxonomia automática)
CREATE OR REPLACE FUNCTION public.derive_product_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text;
  d text;
  full_text text;
  has_tinto boolean;