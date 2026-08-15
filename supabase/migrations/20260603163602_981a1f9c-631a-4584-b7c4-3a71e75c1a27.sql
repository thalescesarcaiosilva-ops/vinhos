UPDATE public.products p SET
  country = COALESCE(s.country, p.country),
  region = COALESCE(s.region, p.region),
  brand = COALESCE(s.brand, p.brand),
  wine_type = COALESCE(s.wine_type, p.wine_type),
  classification = COALESCE(s.classification, p.classification),
  aging = COALESCE(s.aging, p.aging),
  grape = COALESCE(s.grape, p.grape),
  alcohol_content = COALESCE(s.alcohol_content, p.alcohol_content),
  serving_temp = COALESCE(s.serving_temp, p.serving_temp),
  visual_notes = COALESCE(s.visual_notes, p.visual_notes),
  nose_notes = COALESCE(s.nose_notes, p.nose_notes),
  palate_notes = COALESCE(s.palate_notes, p.palate_notes),
  harmonization = COALESCE(s.harmonization, p.harmonization)
FROM public._product_chars_stg s
WHERE p.slug = s.slug;

DROP TABLE public._product_chars_stg;