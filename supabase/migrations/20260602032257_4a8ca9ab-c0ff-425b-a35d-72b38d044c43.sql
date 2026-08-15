
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
  has_branco boolean;
  has_rose boolean;
BEGIN
  n := lower(coalesce(NEW.name,''));
  d := lower(coalesce(NEW.description,'') || ' ' || coalesce(NEW.short_description,''));
  full_text := n || ' ' || d;

  -- product_type
  IF NEW.product_type IS NULL THEN
    NEW.product_type := CASE
      WHEN n ~ '\m(kit|combo|conjunto)\M' THEN 'kit'::product_type_enum
      WHEN n ~ '\m(sangria)\M' THEN 'sangria'::product_type_enum
      WHEN n ~ '\m(espumante|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti)\M'
           OR lower(coalesce(NEW.wine_type,'')) = 'espumante' THEN 'espumante'::product_type_enum
      WHEN n ~ '\m(whisky|whiskey|vodka|gin|rum|tequila|cacha[çc]a|conhaque|cognac|bourbon|aguardente|licor|absinto|grappa|sake)\M'
        THEN 'destilado'::product_type_enum
      WHEN n ~ '\m(cerveja|beer|ipa|lager|pilsen|stout|weiss|porter|ale)\M' THEN 'cerveja'::product_type_enum
      WHEN n ~ '\m(suco|juice|uva integral|n[ée]ctar)\M' THEN 'suco'::product_type_enum
      WHEN n ~ '\m(ta[çc]a|saca[- ]?rolha|decantador|abridor|aerador|term[oô]metro|balde|porta[- ]?garrafa)\M'
        THEN 'acessorio'::product_type_enum
      WHEN n ~ '\m(azeite|conserva|azeitona|chocolate|cacau|queijo|cheese|mel|geleia|biscoito|pasta|bombom|trufa|gourmet)\M'
        THEN 'gourmet'::product_type_enum
      WHEN lower(coalesce(NEW.wine_type,'')) IN ('tinto','branco','rosé','rose') THEN 'vinho'::product_type_enum
      ELSE 'vinho'::product_type_enum
    END;
  END IF;

  -- color
  IF NEW.color IS NULL THEN
    has_tinto  := (n ~ '\m(tinto|tintos)\M') OR lower(coalesce(NEW.wine_type,'')) = 'tinto';
    has_branco := (n ~ '\m(branco|brancos|white)\M') OR lower(coalesce(NEW.wine_type,'')) = 'branco';
    has_rose   := (n ~ '\m(ros[ée]|ros[ée]s)\M') OR lower(coalesce(NEW.wine_type,'')) IN ('rosé','rose');

    IF NEW.product_type = 'kit' THEN
      NEW.color := CASE
        WHEN (has_tinto::int + has_branco::int + has_rose::int) >= 2 THEN 'misto'::wine_color_enum
        WHEN has_tinto  THEN 'tinto'::wine_color_enum
        WHEN has_branco THEN 'branco'::wine_color_enum
        WHEN has_rose   THEN 'rose'::wine_color_enum
        ELSE 'misto'::wine_color_enum
      END;
    ELSIF NEW.product_type IN ('vinho','espumante') THEN
      NEW.color := CASE
        WHEN has_tinto  THEN 'tinto'::wine_color_enum
        WHEN has_branco THEN 'branco'::wine_color_enum
        WHEN has_rose   THEN 'rose'::wine_color_enum
        ELSE 'na'::wine_color_enum
      END;
    ELSE
      NEW.color := 'na'::wine_color_enum;
    END IF;
  END IF;

  -- zero álcool
  NEW.is_zero_alcohol := (full_text ~ '\m(sem [aá]lcool|zero [aá]lcool|n[aã]o[- ]alco[oó]lico|non[- ]alcoholic|0[,\.]0\s*%?)\M');

  -- harmonização (heurística leve)
  IF NEW.harmonizacao IS NULL OR array_length(NEW.harmonizacao,1) IS NULL THEN
    NEW.harmonizacao := ARRAY(
      SELECT DISTINCT h FROM (VALUES
        ('Carnes vermelhas', d ~ '\m(carne vermelha|bife|churrasco|cordeiro|costela|file|filé|picanha|bovina|cordeiro)\M'),
        ('Carnes brancas',   d ~ '\m(frango|aves|porco|su[íi]no|peru|coelho)\M'),
        ('Peixes & frutos do mar', d ~ '\m(peixe|salm[aã]o|atum|fruto do mar|camar[aã]o|ostra|polvo|lula|bacalhau)\M'),
        ('Massas',           d ~ '\m(massa|macarr[aã]o|pasta|lasanha|risoto|risotto)\M'),
        ('Queijos',          d ~ '\m(queijo|cheese|brie|gorgonzola|parmes[aã]o)\M'),
        ('Sobremesas',       d ~ '\m(sobremesa|chocolate|doce|dessert|p[âa]tisserie|torta)\M'),
        ('Aperitivo',        d ~ '\m(aperitivo|petisco|antepasto|happy hour|tapas)\M')
      ) AS m(h,match) WHERE m.match
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 9) Trigger BEFORE INSERT/UPDATE em products
DROP TRIGGER IF EXISTS trg_derive_product_taxonomy ON public.products;
CREATE TRIGGER trg_derive_product_taxonomy
  BEFORE INSERT OR UPDATE OF name, description, short_description, wine_type, product_type, color
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.derive_product_taxonomy();

-- 10) FUNÇÃO QUE SINCRONIZA product_categories DE 1 PRODUTO
CREATE OR REPLACE FUNCTION public.sync_product_categories(_product_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  cat_slugs text[];
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name
    INTO p FROM public.products WHERE id = _product_id;
  IF p IS NULL THEN RETURN; END IF;

  cat_slugs := ARRAY[]::text[];

  IF p.product_type = 'vinho' THEN
    IF p.color = 'tinto'  THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','tintos']; END IF;
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','roses']; END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['vinhos-zero-alcool']; END IF;

  ELSIF p.product_type = 'espumante' THEN
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-roses']; END IF;
    IF p.color = 'misto'  THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos-roses']; END IF;
    IF p.color NOT IN ('tinto','branco','rose','misto') OR p.color IS NULL THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['vinhos-espumantes'];
    -- decidir subcategoria pelas cores presentes no nome
    DECLARE
      has_t boolean := lower(p.name) ~ '\m(tinto|tintos)\M';
      has_b boolean := lower(p.name) ~ '\m(branco|brancos)\M';
      has_r boolean := lower(p.name) ~ '\m(ros[ée])\M';
    BEGIN
      IF has_t AND has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b        THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos'];
      ELSIF has_t AND has_r        THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-roses'];
      ELSIF has_b AND has_r        THEN cat_slugs := cat_slugs || ARRAY['ve-brancos-roses'];
      ELSIF has_t                  THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','tintos'];
      ELSIF has_b                  THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','brancos'];
      ELSIF has_r                  THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','roses'];
      ELSE                              cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos-roses'];
      END IF;
    END;
    IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['ve-zero-alcool']; END IF;
  END IF;

  -- limpar associações com categorias da árvore TIPOS
  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','tintos-brancos','tintos-roses','brancos-roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-brancos-roses','espumantes-zero-alcool',
       'vinhos-espumantes','ve-tintos-brancos','ve-tintos-roses','ve-brancos-roses','ve-tintos-brancos-roses','ve-zero-alcool',
       'so-sangrias','sangrias'
     ]));

  -- inserir as novas
  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

-- 11) Trigger AFTER INSERT/UPDATE para manter product_categories sincronizado
CREATE OR REPLACE FUNCTION public.trg_sync_product_categories()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.sync_product_categories(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_sync_categories ON public.products;
CREATE TRIGGER trg_products_sync_categories
  AFTER INSERT OR UPDATE OF product_type, color, is_zero_alcohol, name
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_product_categories();
