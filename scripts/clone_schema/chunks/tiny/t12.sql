
  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

-- Re-sync all kits
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE product_type='kit' LOOP
    PERFORM public.sync_product_categories(r.id);
  END LOOP;
END $$;


