-- >>> 20261018010000_import_splendore_categories.sql
-- Categorias para catálogo Splendore (destilados, acessórios, cervejas, gourmet) + países faltantes.

INSERT INTO public.categories (name, slug, kind, parent_id, sort_order, is_active)
SELECT v.name, v.slug, v.kind, NULL, v.sort_order, true
FROM (VALUES
  ('Destilados', 'destilados', 'type', 40),
  ('Acessórios', 'acessorios', 'type', 50),
  ('Cervejas', 'cervejas', 'type', 60),
  ('Gourmet', 'gourmet', 'type', 70),
  ('Escócia', 'escocia', 'country', 200),
  ('Inglaterra', 'inglaterra', 'country', 201),
  ('Reino Unido', 'reino-unido', 'country', 202),
  ('México', 'mexico', 'country', 203),
  ('Japão', 'japao', 'country', 204),
  ('Holanda', 'holanda', 'country', 205),
  ('Suécia', 'suecia', 'country', 206),
  ('Polônia', 'polonia', 'country', 207),
  ('Irlanda', 'irlanda', 'country', 208),
  ('Canadá', 'canada', 'country', 209),
  ('Croácia', 'croacia', 'country', 210),
  ('Cuba', 'cuba', 'country', 211),
  ('Grécia', 'grecia', 'country', 212)
) AS v(name, slug, kind, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.slug = v.slug
);

INSERT INTO public.categories (name, slug, kind, parent_id, sort_order, is_active)
SELECT v.name, v.slug, 'type', p.id, v.sort_order, true
FROM (VALUES
  ('Whisky', 'whisky', 'destilados', 1),
  ('Gin', 'gin', 'destilados', 2),
  ('Vodka', 'vodka', 'destilados', 3),
  ('Rum', 'rum', 'destilados', 4),
  ('Tequila', 'tequila', 'destilados', 5),
  ('Cachaça', 'cachaca', 'destilados', 6),
  ('Licor', 'licor', 'destilados', 7),
  ('Conhaque e Brandy', 'conhaque-brandy', 'destilados', 8),
  ('Pisco', 'pisco', 'destilados', 9),
  ('Outros destilados', 'outros-destilados', 'destilados', 10),
  ('Taças', 'tacas', 'acessorios', 1),
  ('Acessórios para Garrafas', 'acessorios-garrafas', 'acessorios', 2)
) AS v(name, slug, parent_slug, sort_order)
JOIN public.categories p ON p.slug = v.parent_slug
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.slug = v.slug
);

-- Amplia sync automático para destilados, acessórios, cervejas e gourmet.
CREATE OR REPLACE FUNCTION public.sync_product_categories(_product_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  p RECORD;
  cat_slugs text[];
  nm text;
  has_esp boolean;
  has_sang boolean;
  has_t boolean;
  has_b boolean;
  has_r boolean;
  color_count int;
  country_slug text;
  country_label text;
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name, country
    INTO p FROM public.products WHERE id = _product_id;
  IF p IS NULL THEN RETURN; END IF;

  cat_slugs := ARRAY[]::text[];
  nm := lower(coalesce(p.name,''));

  IF p.product_type = 'vinho' THEN
    IF p.color = 'tinto'  THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','tintos']; END IF;
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-vinhos','roses']; END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['vinhos-zero-alcool']; END IF;

  ELSIF p.product_type = 'espumante' THEN
    cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['espumantes-brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['espumantes-roses']; END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'cerveja' THEN
    cat_slugs := cat_slugs || ARRAY['cervejas'];

  ELSIF p.product_type = 'gourmet' THEN
    cat_slugs := cat_slugs || ARRAY['gourmet'];

  ELSIF p.product_type = 'acessorio' THEN
    cat_slugs := cat_slugs || ARRAY['acessorios'];
    IF nm ~ '(ta[cç]a|copo|glass)' THEN
      cat_slugs := cat_slugs || ARRAY['tacas'];
    ELSIF nm ~ '(saca.?rolha|decanter|abridor|dosador|bico|coqueteleira|peneira|case porta)' THEN
      cat_slugs := cat_slugs || ARRAY['acessorios-garrafas'];
    END IF;

  ELSIF p.product_type = 'destilado' THEN
    cat_slugs := cat_slugs || ARRAY['destilados'];
    IF nm ~ 'whisky|whiskey|bourbon|scotch' THEN
      cat_slugs := cat_slugs || ARRAY['whisky'];
    ELSIF nm ~ '\mgin\M' OR nm ~ '^gin ' THEN
      cat_slugs := cat_slugs || ARRAY['gin'];
    ELSIF nm ~ 'vodka' THEN
      cat_slugs := cat_slugs || ARRAY['vodka'];
    ELSIF nm ~ '\mrum\M|rhum' THEN
      cat_slugs := cat_slugs || ARRAY['rum'];
    ELSIF nm ~ 'tequila|mezcal' THEN
      cat_slugs := cat_slugs || ARRAY['tequila'];
    ELSIF nm ~ 'cacha[cç]a' THEN
      cat_slugs := cat_slugs || ARRAY['cachaca'];
    ELSIF nm ~ 'licor|liqueur|amaro|aperitivo' THEN
      cat_slugs := cat_slugs || ARRAY['licor'];
    ELSIF nm ~ 'conhaque|cognac|brandy|armagnac' THEN
      cat_slugs := cat_slugs || ARRAY['conhaque-brandy'];
    ELSIF nm ~ 'pisco' THEN
      cat_slugs := cat_slugs || ARRAY['pisco'];
    ELSE
      cat_slugs := cat_slugs || ARRAY['outros-destilados'];
    END IF;

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti|moscatel)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';

    has_t := (nm ~ '\m(tinto|tintos|red)\M')
          OR (nm ~ '\m(malbec|cabernet|merlot|pinot noir|primitivo|zinfandel|syrah|shiraz|tempranillo|sangiovese|nebbiolo|carmen[eè]re|tannat|bonarda|garnacha|grenache|montepulciano|nero d''avola|aglianico|appassimento|barbera|petit verdot|carignan)\M');
    has_b := (nm ~ '\m(branco|brancos|blanc|bianco|white)\M')
          OR (nm ~ '\m(chardonnay|sauvignon blanc|gewurztraminer|gew[uü]rztraminer|riesling|pinot gris|pinot grigio|vinho verde|viognier|alvarinho|albari[ñn]o|verdejo|fian[oô]|trebbiano|torront[eé]s|moscato|sem[ií]llon|gr[uü]ner|vermentino)\M')
          OR (nm ~ '\mvinho verde\M');
    has_r := (nm ~ '\m(ros[eé]|ros[eé]s|rosato|rosado)\M');

    IF nm ~ '\m(branco|brancos|blanc|bianco)\M.*(\+|\se\s|,).*(ros[eé]|rosato|rosado)' THEN
      has_b := true; has_r := true;
    END IF;
    IF nm ~ '\m(ros[eé]|rosato|rosado)\M.*(\+|\se\s|,).*(branco|brancos|blanc|bianco)' THEN
      has_b := true; has_r := true;
    END IF;

    IF has_sang AND NOT has_esp AND NOT has_t AND NOT has_b AND NOT (nm ~ '\m(vinho|vinhos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-sangrias','combos-sangrias'];

    ELSIF has_esp AND NOT has_t AND NOT (nm ~ '\m(vinho|vinhos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-zero-alcool']; END IF;

    ELSIF has_esp AND (has_t OR (nm ~ '\m(vinho|vinhos)\M')) THEN
      cat_slugs := cat_slugs || ARRAY['combos-vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-brancos-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-ve-zero-alcool']; END IF;

    ELSE
      cat_slugs := cat_slugs || ARRAY['combos-so-vinhos'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses'];