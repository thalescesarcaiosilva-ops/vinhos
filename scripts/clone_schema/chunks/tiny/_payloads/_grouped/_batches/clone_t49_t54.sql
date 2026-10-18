-- >>> 20260825140000_country_categories_kind_and_sync.sql
-- País como coleção: coluna kind + sync de product_categories por country
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS kind text;

COMMENT ON COLUMN public.categories.kind IS 'country | type | combo | null (legado)';

-- Marcar categorias-país existentes
UPDATE public.categories
SET kind = 'country'
WHERE slug IN (
  'africa-do-sul','alemanha','argentina','australia','austria','brasil','bulgaria',
  'chile','eslovenia','espanha','eua','franca','israel','italia','macedonia-do-norte',
  'marrocos','moldavia','nova-zelandia','portugal','uruguai'
);

-- Tipos / combos
UPDATE public.categories
SET kind = 'type'
WHERE slug IN (
  'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
  'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
  'so-sangrias','sangrias'
)
AND kind IS NULL;

UPDATE public.categories
SET kind = 'combo'
WHERE slug LIKE 'combos%'
AND kind IS NULL;

-- Sync: inclui categoria-país a partir de products.country (além de tipo/combo)
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
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-brancos-roses'];
      ELSIF has_t           THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-tintos'];
      ELSIF has_b           THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-brancos'];
      ELSIF has_r           THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-vinhos-zero-alcool']; END IF;
    END IF;
  END IF;

  -- Categoria-país (coleção adicional) a partir de products.country
  country_label := trim(coalesce(p.country, ''));
  IF country_label IN ('EUA', 'USA', 'eua') THEN
    country_label := 'Estados Unidos';
  END IF;
  IF country_label <> '' THEN
    SELECT c.slug INTO country_slug
      FROM public.categories c
     WHERE c.kind = 'country'
       AND c.is_active = true
       AND (
         c.name = country_label
         OR (country_label = 'Estados Unidos' AND c.slug = 'eua')
       )
     LIMIT 1;
    IF country_slug IS NOT NULL THEN
      cat_slugs := cat_slugs || ARRAY[country_slug];
    END IF;
  END IF;

  -- Remove só vínculos derivados (tipo/combo/país), preserva seleções manuais fora desta lista
  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (
       c.kind = 'country'
       OR c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias'
     ])
     );

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;  END IF;
END;
$function$;


-- >>> 20260907220000_banners_intrinsic_size.sql
-- Dimensões da arte original de cada banner.
-- Sem elas o <img> do hero não reserva altura e a home sofre CLS de ~0,39
-- quando o banner termina de carregar e empurra o conteúdo abaixo.
alter table public.banners
  add column if not exists width integer,
  add column if not exists height integer;

comment on column public.banners.width is
  'Largura em px da arte original. Usada para reservar a caixa do banner (CLS) e limitar o srcset.';
comment on column public.banners.height is
  'Altura em px da arte original. Usada junto com width para a proporção exata (nunca corta).';


-- >>> 20260918165917_enable_rls_seed_sql_parts.sql
-- Tabela auxiliar de seed: não deve ser acessível via Data API pública.
alter table public._seed_sql_parts enable row level security;

revoke all on table public._seed_sql_parts from anon, authenticated, public;

-- Sem policies: apenas service_role/postgres (bypassrls) acessam.


-- >>> 20260926160500_add_support_app_role.sql
-- Papel exclusivo do painel de suporte. Não concede acesso ao admin da loja.
-- Novo valor de enum só pode ser usado depois deste comando estar commitado.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'support';


-- >>> 20260926160600_support_unpaid_orders_rls.sql
-- Pedidos visíveis ao suporte: gerados, ainda pendentes, sem pagamento, há mais de 15 minutos.
CREATE OR REPLACE FUNCTION public.order_is_unpaid_followup(
  p_status public.order_status,
  p_payment_status text,
  p_created_at timestamptz
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    p_status = 'pending'::public.order_status
    AND p_created_at <= (now() - interval '15 minutes')
    AND (
      p_payment_status IS NULL
      OR lower(btrim(p_payment_status)) IN ('pending', 'waiting', 'waiting_payment', 'processing')
    );
$$;

REVOKE ALL ON FUNCTION public.order_is_unpaid_followup(public.order_status, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.order_is_unpaid_followup(public.order_status, text, timestamptz) TO authenticated, service_role;

DROP POLICY IF EXISTS "Support reads abandoned unpaid orders" ON public.orders;
CREATE POLICY "Support reads abandoned unpaid orders"
  ON public.orders
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND public.order_is_unpaid_followup(status, payment_status, created_at)
  );

DROP POLICY IF EXISTS "Support reads items of abandoned unpaid orders" ON public.order_items;
CREATE POLICY "Support reads items of abandoned unpaid orders"
  ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    (SELECT public.has_role((SELECT auth.uid()), 'support'::public.app_role))
    AND EXISTS (
      SELECT 1
      FROM public.orders o
      WHERE o.id = order_items.order_id
        AND public.order_is_unpaid_followup(o.status, o.payment_status, o.created_at)
    )
  );

CREATE INDEX IF NOT EXISTS idx_orders_pending_created_at
  ON public.orders (created_at DESC)
  WHERE status = 'pending';


