-- Normaliza URLs de imagem legadas (Lovable / vinellevinhos / Supabase antigo)
-- para caminhos do projeto atual: /storage/v1/object/public/product-images/{arquivo}

-- image_url: extrai só o nome do arquivo
UPDATE public.products
SET image_url = '/storage/v1/object/public/product-images/' ||
  (regexp_match(image_url, '([^/]+\.(jpg|jpeg|png|webp))', 'i'))[1]
WHERE image_url IS NOT NULL
  AND image_url !~ '^/storage/v1/object/public/product-images/'
  AND image_url ~* '\.(jpg|jpeg|png|webp)';

-- gallery: substitui hosts legados pelo path local
UPDATE public.products
SET gallery = (
  SELECT coalesce(jsonb_agg(to_jsonb(
    '/storage/v1/object/public/product-images/' ||
    (regexp_match(elem #>> '{}', '([^/]+\.(jpg|jpeg|png|webp))', 'i'))[1]
  )), '[]'::jsonb)
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(gallery) = 'array' THEN gallery ELSE '[]'::jsonb END
  ) elem
  WHERE elem #>> '{}' ~* '\.(jpg|jpeg|png|webp)'
)
WHERE gallery IS NOT NULL
  AND gallery::text ~* '(vinellevinhos|dymhoqxfamosdujzorrl|__l5e|imagens_produtos)';

-- Limpar image_url que não é imagem válida
UPDATE public.products
SET image_url = NULL
WHERE image_url IS NOT NULL
  AND image_url !~* '^/storage/v1/object/public/product-images/[^/]+\.(jpg|jpeg|png|webp)$';

-- Conferência
SELECT
  count(*) FILTER (WHERE is_active) AS ativos,
  count(*) FILTER (WHERE NOT is_active) AS inativos,
  count(*) FILTER (WHERE image_url LIKE '%dymhoqxfamosdujzorrl%') AS urls_lovable,
  count(*) FILTER (WHERE image_url LIKE '/storage/v1/object/public/product-images/%') AS urls_ok
FROM public.products;
