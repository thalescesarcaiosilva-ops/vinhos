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