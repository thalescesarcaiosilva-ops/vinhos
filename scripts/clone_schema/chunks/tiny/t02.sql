
CREATE POLICY "Public read banner images" ON storage.objects FOR SELECT USING (bucket_id = 'banner-images');
CREATE POLICY "Admins upload banner images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'banner-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update banner images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'banner-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete banner images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'banner-images' AND public.has_role(auth.uid(), 'admin'));

-- ============ SEED CATEGORIES + PRODUCTS DE EXEMPLO ============
INSERT INTO public.categories (name, slug, sort_order) VALUES
  ('Tintos', 'tintos', 1),
  ('Brancos', 'brancos', 2),
  ('Espumantes', 'espumantes', 3),
  ('Rosés', 'roses', 4),
  ('Kits & Combos', 'kits', 5),
  ('Espaço Gourmet', 'gourmet', 6);


