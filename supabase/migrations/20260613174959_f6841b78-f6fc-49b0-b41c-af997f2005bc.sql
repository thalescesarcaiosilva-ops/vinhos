UPDATE public.products SET image_url = replace(image_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br') WHERE image_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.products SET video_url = replace(video_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br') WHERE video_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.banners SET image_url = replace(image_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br') WHERE image_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.categories SET banner_image = replace(banner_image, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br') WHERE banner_image LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.profiles SET avatar_url = replace(avatar_url, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br') WHERE avatar_url LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.order_items SET product_image = replace(product_image, 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br') WHERE product_image LIKE 'https://dymhoqxfamosdujzorrl.supabase.co%';
UPDATE public.reviews SET photos = (
  SELECT jsonb_agg(
    CASE WHEN jsonb_typeof(elem) = 'string'
         THEN to_jsonb(replace(elem #>> '{}', 'https://dymhoqxfamosdujzorrl.supabase.co', 'https://vinellevinhos.com.br'))
         ELSE elem END
  )
  FROM jsonb_array_elements(photos) elem
)
WHERE photos::text LIKE '%dymhoqxfamosdujzorrl.supabase.co%' AND jsonb_typeof(photos) = 'array';