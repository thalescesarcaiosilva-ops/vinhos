-- Normaliza image_url e gallery para caminhos relativos do site.
-- Formato canônico: /storage/v1/object/public/product-images/{arquivo}
-- O domínio (vinellevinhos.com.br, Vercel, etc.) é resolvido em runtime pelo app.

-- image_url
UPDATE public.products
SET image_url = '/storage/v1/object/public/product-images/' ||
  (regexp_match(image_url, '([^/]+\.(jpg|jpeg|png|webp))', 'i'))[1]
WHERE image_url IS NOT NULL
  AND image_url !~ '^/storage/v1/object/public/product-images/[^/]+\.(jpg|jpeg|png|webp)$'
  AND image_url ~* '\.(jpg|jpeg|png|webp)';

-- gallery (qualquer host legado ou absoluto)
UPDATE public.products
SET gallery = sub.normalized
FROM (
  SELECT
    p.id,
    coalesce(
      jsonb_agg(
        to_jsonb(
          '/storage/v1/object/public/product-images/' ||
          (regexp_match(elem #>> '{}', '([^/]+\.(jpg|jpeg|png|webp))', 'i'))[1]
        )
      ) FILTER (WHERE elem #>> '{}' ~* '\.(jpg|jpeg|png|webp)'),
      '[]'::jsonb
    ) AS normalized
  FROM public.products p
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(p.gallery) = 'array' THEN p.gallery ELSE '[]'::jsonb END
  ) elem
  WHERE p.gallery IS NOT NULL
    AND jsonb_typeof(p.gallery) = 'array'
    AND p.gallery::text != '[]'
  GROUP BY p.id
) sub
WHERE products.id = sub.id
  AND products.gallery IS DISTINCT FROM sub.normalized;

-- Limpar image_url inválida
UPDATE public.products
SET image_url = NULL
WHERE image_url IS NOT NULL
  AND image_url !~ '^/storage/v1/object/public/product-images/[^/]+\.(jpg|jpeg|png|webp)$';

-- Conferência
SELECT
  count(*) FILTER (WHERE image_url LIKE '/storage/v1/object/public/product-images/%') AS urls_relativas,
  count(*) FILTER (WHERE image_url LIKE 'https://%') AS urls_absolutas,
  count(*) FILTER (WHERE image_url LIKE '%vinellevinhos%') AS urls_vinelle,
  count(*) FILTER (WHERE image_url LIKE '%supabase.co%') AS urls_supabase
FROM public.products
WHERE image_url IS NOT NULL;
