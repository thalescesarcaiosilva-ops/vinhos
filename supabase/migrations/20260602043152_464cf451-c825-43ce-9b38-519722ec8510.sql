-- 14 novas categorias espelhando o site fonte
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('vinhos-brancos','Vinhos Brancos',10),
  ('vinhos-roses','Vinhos Rosés',11),
  ('vinhos-frisantes','Vinhos Frisantes',12),
  ('vinhos-licorosos','Vinhos Licorosos',13),
  ('vinhos-sem-alcool','Vinhos Sem Álcool',14),
  ('champanhes','Champanhes',20),
  ('espumantes-brut','Espumantes Brut',21),
  ('espumantes-extra-brut','Espumantes Extra Brut',22),
  ('espumantes-secos','Espumantes Secos',23),
  ('espumantes-demi-sec','Espumantes Demi-Sec',24),
  ('espumantes-sem-alcool','Espumantes Sem Álcool',25),
  ('kits-de-vinhos-com-3-garrafas','Kits de Vinhos com 3 Garrafas',30),
  ('kits-de-vinhos-com-4-garrafas','Kits de Vinhos com 4 Garrafas',31),
  ('kits-de-vinhos-com-6-garrafas','Kits de Vinhos com 6 Garrafas',32)
ON CONFLICT (slug) DO NOTHING;