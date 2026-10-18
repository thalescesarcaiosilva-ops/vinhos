-- >>> 20260601200428_adfeeea1-a75d-4fb2-ae7b-45ed1cb2de8a.sql
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ CATEGORIES ============
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active categories" ON public.categories FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  -- ficha técnica
  country TEXT,
  region TEXT,
  grape TEXT,
  wine_type TEXT,         -- tinto, branco, rosé, espumante, etc
  classification TEXT,    -- D.O.C, IGP etc
  brand TEXT,
  vintage TEXT,
  wine_style TEXT,
  serving_temp TEXT,
  glass_type TEXT,
  decanting TEXT,
  harmonization TEXT,
  visual_notes TEXT,
  nose_notes TEXT,
  palate_notes TEXT,
  vivino_rating NUMERIC(3,1),
  -- comercial
  sku TEXT,
  price NUMERIC(10,2) NOT NULL,
  compare_at_price NUMERIC(10,2),
  stock INT NOT NULL DEFAULT 0,
  -- imagens
  image_url TEXT,
  gallery JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- catálogo
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  featured BOOLEAN NOT NULL DEFAULT false,
  best_seller BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rating NUMERIC(2,1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_featured ON public.products(featured) WHERE featured = true;
CREATE INDEX idx_products_best_seller ON public.products(best_seller) WHERE best_seller = true;
GRANT SELECT ON public.products TO anon, authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active products" ON public.products FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ BANNERS ============
CREATE TABLE public.banners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  subtitle TEXT,
  cta_label TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  position TEXT NOT NULL DEFAULT 'home_hero', -- home_hero | home_strip
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT ALL ON public.banners TO service_role;
ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read active banners" ON public.banners FOR SELECT TO anon, authenticated USING (is_active = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins write banners" ON public.banners FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT NOT NULL UNIQUE DEFAULT ('VP' || to_char(now(),'YYYYMMDD') || lpad((floor(random()*100000))::text, 5, '0')),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  customer_doc TEXT,
  shipping_address JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  shipping NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT INSERT ON public.orders TO anon, authenticated;
GRANT SELECT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create order" ON public.orders FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read all orders" ON public.orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update orders" ON public.orders FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ ORDER ITEMS ============
CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_image TEXT,
  unit_price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL,
  total NUMERIC(10,2) NOT NULL
);
GRANT INSERT ON public.order_items TO anon, authenticated;
GRANT SELECT ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can insert order items" ON public.order_items FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Admins read order items" ON public.order_items FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images', 'product-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('banner-images', 'banner-images', true) ON CONFLICT DO NOTHING;

CREATE POLICY "Public read product images" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "Admins upload product images" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update product images" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins delete product images" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'product-images' AND public.has_role(auth.uid(), 'admin'));

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


-- >>> 20260601202236_4e91b23e-649e-41df-8d49-2a039040e667.sql
-- Junction table
CREATE TABLE public.product_categories (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

GRANT SELECT ON public.product_categories TO anon, authenticated;
GRANT ALL ON public.product_categories TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;

ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read product_categories"
ON public.product_categories FOR SELECT
TO anon, authenticated
USING (true);

CREATE POLICY "Admins write product_categories"
ON public.product_categories FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_product_categories_category ON public.product_categories(category_id);

-- Insert "Vinhos" umbrella + country categories
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('vinhos', 'Vinhos', 0),
  ('brasil', 'Brasil', 100),
  ('argentina', 'Argentina', 101),
  ('chile', 'Chile', 102),
  ('franca', 'França', 103),
  ('italia', 'Itália', 104),
  ('portugal', 'Portugal', 105),
  ('espanha', 'Espanha', 106),
  ('alemanha', 'Alemanha', 107),
  ('nova-zelandia', 'Nova Zelândia', 108),
  ('uruguai', 'Uruguai', 109),
  ('africa-do-sul', 'África do Sul', 110),
  ('australia', 'Austrália', 111),
  ('eua', 'Estados Unidos', 112)
ON CONFLICT (slug) DO NOTHING;

-- Backfill: preserve existing single category
INSERT INTO public.product_categories (product_id, category_id)
SELECT id, category_id FROM public.products WHERE category_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: add "Vinhos" for every wine (anything with wine_type)
INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM public.products p, public.categories c
WHERE c.slug = 'vinhos' AND p.wine_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: tipo de vinho
INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM public.products p
JOIN public.categories c ON c.slug = CASE p.wine_type
  WHEN 'Tinto' THEN 'tintos'
  WHEN 'Branco' THEN 'brancos'
  WHEN 'Rosé' THEN 'roses'
  WHEN 'Espumante' THEN 'espumantes'
END
WHERE p.wine_type IS NOT NULL
ON CONFLICT DO NOTHING;

-- Backfill: país
INSERT INTO public.product_categories (product_id, category_id)
SELECT p.id, c.id
FROM public.products p
JOIN public.categories c ON c.slug = CASE p.country
  WHEN 'Brasil' THEN 'brasil'
  WHEN 'Argentina' THEN 'argentina'
  WHEN 'Chile' THEN 'chile'
  WHEN 'França' THEN 'franca'
  WHEN 'Itália' THEN 'italia'
  WHEN 'Portugal' THEN 'portugal'
  WHEN 'Espanha' THEN 'espanha'
  WHEN 'Alemanha' THEN 'alemanha'
  WHEN 'Nova Zelândia' THEN 'nova-zelandia'
  WHEN 'Uruguai' THEN 'uruguai'
  WHEN 'África do Sul' THEN 'africa-do-sul'
  WHEN 'Austrália' THEN 'australia'
  WHEN 'Estados Unidos' THEN 'eua'
  WHEN 'EUA' THEN 'eua'
END
WHERE p.country IS NOT NULL
ON CONFLICT DO NOTHING;


-- >>> 20260601215028_4962250b-a60b-4dc7-8fbd-4be190016fa5.sql
-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  cpf TEXT UNIQUE,
  birth_date DATE,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins manage profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, first_name, last_name, cpf, birth_date, phone)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'cpf',
    NULLIF(NEW.raw_user_meta_data->>'birth_date','')::date,
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_touch BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ADDRESSES ============
CREATE TABLE public.addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,
  recipient_name TEXT NOT NULL,
  zipcode TEXT NOT NULL,
  street TEXT NOT NULL,
  number TEXT NOT NULL,
  complement TEXT,
  neighborhood TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'BR',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_billing BOOLEAN NOT NULL DEFAULT false,
  is_shipping BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_addresses_user ON public.addresses(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT ALL ON public.addresses TO service_role;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own addresses" ON public.addresses FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER addresses_touch BEFORE UPDATE ON public.addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ FAVORITES ============
CREATE TABLE public.favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX idx_favorites_user ON public.favorites(user_id);

GRANT SELECT, INSERT, DELETE ON public.favorites TO authenticated;
GRANT ALL ON public.favorites TO service_role;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own favorites" ON public.favorites FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ============ REVIEWS ============
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  comment TEXT,
  photos JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_approved BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);
CREATE INDEX idx_reviews_product ON public.reviews(product_id);

GRANT SELECT ON public.reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT ALL ON public.reviews TO service_role;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read approved reviews" ON public.reviews FOR SELECT TO anon, authenticated
  USING (is_approved = true OR auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

-- Função: usuário comprou esse produto?
CREATE OR REPLACE FUNCTION public.user_has_purchased(_user_id UUID, _product_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE oi.product_id = _product_id
      AND o.customer_email = (SELECT email FROM auth.users WHERE id = _user_id)
      AND o.status IN ('confirmed','shipped','delivered')
  );
$$;

CREATE POLICY "Buyers create reviews" ON public.reviews FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.user_has_purchased(auth.uid(), product_id));
CREATE POLICY "Authors update own reviews" ON public.reviews FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Authors delete own reviews" ON public.reviews FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

CREATE TRIGGER reviews_touch BEFORE UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ COUPONS ============
CREATE TYPE public.coupon_type AS ENUM ('fixed','percent','free_shipping','first_purchase');

CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  type public.coupon_type NOT NULL,
  value NUMERIC NOT NULL DEFAULT 0,
  min_order_value NUMERIC,
  max_uses INTEGER,
  max_uses_per_user INTEGER DEFAULT 1,
  uses_count INTEGER NOT NULL DEFAULT 0,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users read active coupons" ON public.coupons FOR SELECT TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage coupons" ON public.coupons FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  discount_value NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_redemptions_user ON public.coupon_redemptions(user_id);

GRANT SELECT, INSERT ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own redemptions" ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users create own redemptions" ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ============ NEWSLETTER ============
CREATE TABLE public.newsletter_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  email TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.newsletter_subscribers TO authenticated;
GRANT ALL ON public.newsletter_subscribers TO service_role;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone subscribes" ON public.newsletter_subscribers FOR INSERT TO anon, authenticated
  WITH CHECK (true);
CREATE POLICY "Admins read subscribers" ON public.newsletter_subscribers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage subscribers" ON public.newsletter_subscribers FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============ ORDERS: enriquecimento ============
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS estimated_delivery DATE,
  ADD COLUMN IF NOT EXISTS coupon_code TEXT,
  ADD COLUMN IF NOT EXISTS discount NUMERIC NOT NULL DEFAULT 0;

ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'paid';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'separating';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'invoiced';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'out_for_delivery';
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'refunded';

CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON public.orders(customer_email);

-- Permitir cliente ler seus próprios pedidos
DROP POLICY IF EXISTS "Users read own orders" ON public.orders;
CREATE POLICY "Users read own orders" ON public.orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own order items" ON public.order_items;
CREATE POLICY "Users read own order items" ON public.order_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.user_id = auth.uid()));

-- ============ ORDER STATUS HISTORY ============
CREATE TABLE public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  status public.order_status NOT NULL,
  note TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_history ON public.order_status_history(order_id);

GRANT SELECT ON public.order_status_history TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.order_status_history TO authenticated;
GRANT ALL ON public.order_status_history TO service_role;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own order history" ON public.order_status_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE POLICY "Admins write history" ON public.order_status_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trigger: registra mudança de status
CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.order_status_history (order_id, status, created_by)
    VALUES (NEW.id, NEW.status, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS orders_status_log ON public.orders;
CREATE TRIGGER orders_status_log AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();


-- >>> 20260602032257_4a8ca9ab-c0ff-425b-a35d-72b38d044c43.sql
-- ============================================================
-- FASE 1: TAXONOMIAS E HIERARQUIA DE CATEGORIAS
-- ============================================================

-- 1) ENUMS
DO $$ BEGIN
  CREATE TYPE public.product_type_enum AS ENUM
    ('vinho','espumante','sangria','destilado','cerveja','suco','acessorio','gourmet','kit','outro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.wine_color_enum AS ENUM
    ('tinto','branco','rose','misto','na');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) COLUNAS EM products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type public.product_type_enum,
  ADD COLUMN IF NOT EXISTS color public.wine_color_enum,
  ADD COLUMN IF NOT EXISTS is_zero_alcohol boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS harmonizacao text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selo text[] NOT NULL DEFAULT '{}';

-- 3) parent_id em categories (hierarquia)
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

-- 4) TABELAS DE TAXONOMIA
CREATE TABLE IF NOT EXISTS public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brands TO anon, authenticated;
GRANT ALL ON public.brands TO service_role;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read brands" ON public.brands;
CREATE POLICY "Public read brands" ON public.brands FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write brands" ON public.brands;
CREATE POLICY "Admins write brands" ON public.brands FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.grapes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.grapes TO anon, authenticated;
GRANT ALL ON public.grapes TO service_role;
ALTER TABLE public.grapes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read grapes" ON public.grapes;
CREATE POLICY "Public read grapes" ON public.grapes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write grapes" ON public.grapes;
CREATE POLICY "Admins write grapes" ON public.grapes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  country text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.regions TO anon, authenticated;
GRANT ALL ON public.regions TO service_role;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read regions" ON public.regions;
CREATE POLICY "Public read regions" ON public.regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write regions" ON public.regions;
CREATE POLICY "Admins write regions" ON public.regions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.collections TO anon, authenticated;
GRANT ALL ON public.collections TO service_role;
ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read collections" ON public.collections;
CREATE POLICY "Public read collections" ON public.collections FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write collections" ON public.collections;
CREATE POLICY "Admins write collections" ON public.collections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) N:N product_grapes
CREATE TABLE IF NOT EXISTS public.product_grapes (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  grape_id uuid NOT NULL REFERENCES public.grapes(id) ON DELETE CASCADE,
  PRIMARY KEY (product_id, grape_id)
);
GRANT SELECT ON public.product_grapes TO anon, authenticated;
GRANT ALL ON public.product_grapes TO service_role;
ALTER TABLE public.product_grapes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read product_grapes" ON public.product_grapes;
CREATE POLICY "Public read product_grapes" ON public.product_grapes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admins write product_grapes" ON public.product_grapes;
CREATE POLICY "Admins write product_grapes" ON public.product_grapes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6) FKs simples em products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS collection_id uuid REFERENCES public.collections(id) ON DELETE SET NULL;

-- 7) ÁRVORE DE CATEGORIAS "TIPOS" (Vinoteca)
-- Top-level
INSERT INTO public.categories (slug, name, sort_order) VALUES
  ('so-vinhos','Só Vinhos',10),
  ('so-espumantes','Só Espumantes',20),
  ('vinhos-espumantes','Vinhos & Espumantes',30),
  ('so-sangrias','Só Sangrias',40)
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Só Vinhos
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('tintos','Tintos',1),
  ('brancos','Brancos',2),
  ('roses','Rosés',3),
  ('tintos-brancos','Tintos e Brancos',4),
  ('tintos-roses','Tintos e Rosés',5),
  ('brancos-roses','Brancos e Rosés',6),
  ('vinhos-zero-alcool','Zero Álcool',7)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'so-vinhos'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Só Espumantes
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('espumantes-brancos','Brancos',1),
  ('espumantes-roses','Rosés',2),
  ('espumantes-brancos-roses','Brancos e Rosés',3),
  ('espumantes-zero-alcool','Zero Álcool',4)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'so-espumantes'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Vinhos & Espumantes (kits)
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('ve-tintos-brancos','Tintos e Brancos',1),
  ('ve-tintos-roses','Tintos e Rosés',2),
  ('ve-brancos-roses','Brancos e Rosés',3),
  ('ve-tintos-brancos-roses','Tintos, Brancos e Rosés',4),
  ('ve-zero-alcool','Zero Álcool',5)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'vinhos-espumantes'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- Sub: Só Sangrias
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT s.slug, s.name, p.id, s.so
FROM (VALUES
  ('sangrias','Sangrias',1)
) AS s(slug,name,so)
JOIN public.categories p ON p.slug = 'so-sangrias'
ON CONFLICT (slug) DO UPDATE
  SET parent_id = EXCLUDED.parent_id, name = EXCLUDED.name, sort_order = EXCLUDED.sort_order;

-- 8) FUNÇÃO DE DERIVAÇÃO (taxonomia automática)
CREATE OR REPLACE FUNCTION public.derive_product_taxonomy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n text;
  d text;
  full_text text;
  has_tinto boolean;
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_sync_categories ON public.products;
CREATE TRIGGER trg_products_sync_categories
  AFTER INSERT OR UPDATE OF product_type, color, is_zero_alcohol, name
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_product_categories();


-- >>> 20260602032350_456bc037-2d3f-4a9e-8295-ed2d4e53c212.sql
REVOKE EXECUTE ON FUNCTION public.derive_product_taxonomy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_categories(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_product_categories() FROM PUBLIC, anon, authenticated;


-- >>> 20260602035247_c0fa0b0b-bf06-420b-9293-167da99dbf00.sql
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
  has_vinho boolean;
  has_t boolean;
  has_b boolean;
  has_r boolean;
  color_count int;
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name
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
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';
    has_vinho := nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos|ros[eé]|ros[eé]s)\M' AND NOT has_esp AND NOT has_sang;
    has_t := nm ~ '\m(tinto|tintos)\M';
    has_b := nm ~ '\m(branco|brancos)\M';
    has_r := nm ~ '\m(ros[eé])\M';

    -- Sangria-only kits
    IF has_sang AND NOT has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

    -- Espumante-only kits
    ELSIF has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

    -- Mixed wine + sparkling kits
    ELSIF has_esp AND (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['ve-brancos-roses'];
      ELSE                       cat_slugs := cat_slugs || ARRAY['ve-tintos-brancos-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['ve-zero-alcool']; END IF;

    -- Wine-only kits (default)
    ELSE
      cat_slugs := cat_slugs || ARRAY['so-vinhos'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['tintos','brancos','roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['brancos-roses'];
      ELSIF has_t           THEN cat_slugs := cat_slugs || ARRAY['tintos'];
      ELSIF has_b           THEN cat_slugs := cat_slugs || ARRAY['brancos'];
      ELSIF has_r           THEN cat_slugs := cat_slugs || ARRAY['roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['vinhos-zero-alcool']; END IF;
    END IF;
  END IF;

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

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

-- Re-sync all kits with the new logic
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE product_type='kit' LOOP
    PERFORM public.sync_product_categories(r.id);
  END LOOP;
END $$;


-- >>> 20260602035710_fb2e7556-1f1b-42c6-85a5-d338747d32f3.sql
-- Parent
INSERT INTO public.categories (slug, name, sort_order) VALUES ('combos','Combos', 5)
ON CONFLICT (slug) DO NOTHING;

-- Group categories (children of combos)
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos'), v.so
FROM (VALUES
  ('combos-so-vinhos','Só Vinhos',1),
  ('combos-so-espumantes','Só Espumantes',2),
  ('combos-vinhos-espumantes','Vinhos & Espumantes',3),
  ('combos-so-sangrias','Só Sangrias',4)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Só Vinhos sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos-so-vinhos'), v.so
FROM (VALUES
  ('combos-vinhos-tintos','Tintos',1),
  ('combos-vinhos-brancos','Brancos',2),
  ('combos-vinhos-roses','Rosés',3),
  ('combos-vinhos-tintos-brancos','Tintos e Brancos',4),
  ('combos-vinhos-tintos-roses','Tintos e Rosés',5),
  ('combos-vinhos-brancos-roses','Brancos e Rosés',6),
  ('combos-vinhos-zero-alcool','Zero Álcool',7)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Só Espumantes sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos-so-espumantes'), v.so
FROM (VALUES
  ('combos-espumantes-brancos','Brancos',1),
  ('combos-espumantes-roses','Rosés',2),
  ('combos-espumantes-brancos-roses','Brancos e Rosés',3),
  ('combos-espumantes-zero-alcool','Zero Álcool',4)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Vinhos & Espumantes sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT v.slug, v.name, (SELECT id FROM public.categories WHERE slug='combos-vinhos-espumantes'), v.so
FROM (VALUES
  ('combos-ve-tintos-brancos','Tintos e Brancos',1),
  ('combos-ve-tintos-roses','Tintos e Rosés',2),
  ('combos-ve-brancos-roses','Brancos e Rosés',3),
  ('combos-ve-tintos-brancos-roses','Tintos, Brancos e Rosés',4),
  ('combos-ve-zero-alcool','Zero Álcool',5)
) AS v(slug,name,so)
ON CONFLICT (slug) DO NOTHING;

-- Só Sangrias sub
INSERT INTO public.categories (slug, name, parent_id, sort_order)
SELECT 'combos-sangrias','Sangrias',(SELECT id FROM public.categories WHERE slug='combos-so-sangrias'),1
ON CONFLICT (slug) DO NOTHING;

-- Updated sync function: combos go ONLY to combos-* categories
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
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name
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
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';
    has_t := nm ~ '\m(tinto|tintos)\M';
    has_b := nm ~ '\m(branco|brancos)\M';
    has_r := nm ~ '\m(ros[eé])\M';

    IF has_sang AND NOT has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-sangrias','combos-sangrias'];

    ELSIF has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-zero-alcool']; END IF;

    ELSIF has_esp AND (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-brancos-roses'];
      ELSE                       cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
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

  -- Limpa todas as categorias gerenciadas (vinhos, espumantes, sangrias E combos)
  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','tintos-brancos','tintos-roses','brancos-roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-brancos-roses','espumantes-zero-alcool',
       'vinhos-espumantes','ve-tintos-brancos','ve-tintos-roses','ve-brancos-roses','ve-tintos-brancos-roses','ve-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias'
     ]));

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


-- >>> 20260602040312_bf9afee9-d8f6-4c4a-9083-41edd5f601b6.sql
-- Remove legacy/orphan categories that were replaced by the combos-* tree
DELETE FROM public.product_categories
 WHERE category_id IN (
   SELECT id FROM public.categories
    WHERE slug IN ('vinhos-espumantes','ve-tintos-brancos','ve-tintos-roses','ve-brancos-roses',
                   've-tintos-brancos-roses','ve-zero-alcool','tintos-brancos','tintos-roses',
                   'brancos-roses','espumantes-brancos-roses')
 );

DELETE FROM public.categories
 WHERE slug IN ('vinhos-espumantes','ve-tintos-brancos','ve-tintos-roses','ve-brancos-roses',
                've-tintos-brancos-roses','ve-zero-alcool','tintos-brancos','tintos-roses',
                'brancos-roses','espumantes-brancos-roses');

-- Update sync function to stop referencing the removed slugs
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
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name
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
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-roses']; END IF;
    IF p.color NOT IN ('tinto','branco','rose','misto') OR p.color IS NULL THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';
    has_t := nm ~ '\m(tinto|tintos)\M';
    has_b := nm ~ '\m(branco|brancos)\M';
    has_r := nm ~ '\m(ros[eé])\M';

    IF has_sang AND NOT has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos|branco|brancos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-sangrias','combos-sangrias'];

    ELSIF has_esp AND NOT (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-so-espumantes'];
      IF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos-roses'];
      ELSIF has_b        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-brancos'];
      ELSIF has_r        THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-roses'];
      END IF;
      IF p.is_zero_alcohol THEN cat_slugs := cat_slugs || ARRAY['combos-espumantes-zero-alcool']; END IF;

    ELSIF has_esp AND (nm ~ '\m(vinho|vinhos|tinto|tintos)\M') THEN
      cat_slugs := cat_slugs || ARRAY['combos-vinhos-espumantes'];
      color_count := (has_t::int + has_b::int + has_r::int);
      IF color_count >= 3 THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
      ELSIF has_t AND has_b THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos'];
      ELSIF has_t AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-roses'];
      ELSIF has_b AND has_r THEN cat_slugs := cat_slugs || ARRAY['combos-ve-brancos-roses'];
      ELSE                       cat_slugs := cat_slugs || ARRAY['combos-ve-tintos-brancos-roses'];
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

  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias'
     ]));

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;


-- >>> 20260602040608_8c48e45a-8cd6-4eb9-bb00-432a943db4a1.sql
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
BEGIN
  SELECT id, product_type, color, is_zero_alcohol, name
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
    IF p.color = 'branco' THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-brancos']; END IF;
    IF p.color = 'rose'   THEN cat_slugs := cat_slugs || ARRAY['so-espumantes','espumantes-roses']; END IF;
    IF p.color NOT IN ('tinto','branco','rose','misto') OR p.color IS NULL THEN
      cat_slugs := cat_slugs || ARRAY['so-espumantes'];
    END IF;
    IF p.is_zero_alcohol  THEN cat_slugs := cat_slugs || ARRAY['espumantes-zero-alcool']; END IF;

  ELSIF p.product_type = 'sangria' THEN
    cat_slugs := cat_slugs || ARRAY['so-sangrias','sangrias'];

  ELSIF p.product_type = 'kit' THEN
    cat_slugs := cat_slugs || ARRAY['combos'];
    has_esp   := nm ~ '\m(espumante|espumantes|champagne|champanhe|prosecco|cava|lambrusco|frisante|cre[mn]ant|asti|moscatel)\M';
    has_sang  := nm ~ '\m(sangria|sangrias)\M';

    -- cor por palavra OU por varietal/uva
    has_t := (nm ~ '\m(tinto|tintos|red)\M')
          OR (nm ~ '\m(malbec|cabernet|merlot|pinot noir|primitivo|zinfandel|syrah|shiraz|tempranillo|sangiovese|nebbiolo|carmen[eè]re|tannat|bonarda|garnacha|grenache|montepulciano|nero d''avola|aglianico|appassimento|barbera|petit verdot|carignan)\M');
    has_b := (nm ~ '\m(branco|brancos|blanc|bianco|white)\M')
          OR (nm ~ '\m(chardonnay|sauvignon blanc|gewurztraminer|gew[uü]rztraminer|riesling|pinot gris|pinot grigio|vinho verde|viognier|alvarinho|albari[ñn]o|verdejo|fian[oô]|trebbiano|torront[eé]s|moscato|sem[ií]llon|gr[uü]ner|vermentino)\M')
          OR (nm ~ '\mvinho verde\M');
    has_r := (nm ~ '\m(ros[eé]|ros[eé]s|rosato|rosado)\M');

    -- distingue "branco + rosé" / "branco e rosé" / "rosé e branco" reforçando ambos
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

  DELETE FROM public.product_categories pc
   USING public.categories c
   WHERE pc.product_id = _product_id
     AND pc.category_id = c.id
     AND (c.slug = ANY (ARRAY[
       'so-vinhos','tintos','brancos','roses','vinhos-zero-alcool',
       'so-espumantes','espumantes-brancos','espumantes-roses','espumantes-zero-alcool',
       'so-sangrias','sangrias',
       'combos','combos-so-vinhos','combos-so-espumantes','combos-vinhos-espumantes','combos-so-sangrias',
       'combos-vinhos-tintos','combos-vinhos-brancos','combos-vinhos-roses','combos-vinhos-tintos-brancos',
       'combos-vinhos-tintos-roses','combos-vinhos-brancos-roses','combos-vinhos-zero-alcool',
       'combos-espumantes-brancos','combos-espumantes-roses','combos-espumantes-brancos-roses','combos-espumantes-zero-alcool',
       'combos-ve-tintos-brancos','combos-ve-tintos-roses','combos-ve-brancos-roses','combos-ve-tintos-brancos-roses','combos-ve-zero-alcool',
       'combos-sangrias'
     ]));

  IF array_length(cat_slugs,1) IS NOT NULL THEN
    INSERT INTO public.product_categories (product_id, category_id)
    SELECT _product_id, c.id
      FROM public.categories c
     WHERE c.slug = ANY (cat_slugs)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$function$;

-- Re-sync all kits with the improved classifier
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.products WHERE product_type = 'kit' LOOP
    PERFORM public.sync_product_categories(r.id);
  END LOOP;
END $$;


-- >>> 20260602043152_464cf451-c825-43ce-9b38-519722ec8510.sql
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


-- >>> 20260602162713_31025469-cbbc-4b51-b701-be7d3bb30481.sql
-- 1) store_settings: single-row key/value JSONB storage
CREATE TABLE IF NOT EXISTS public.store_settings (
  id text PRIMARY KEY,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.store_settings TO anon;
GRANT SELECT, INSERT, UPDATE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read store settings" ON public.store_settings;
CREATE POLICY "Public read store settings"
  ON public.store_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins write store settings" ON public.store_settings;
CREATE POLICY "Admins write store settings"
  ON public.store_settings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Seed defaults
INSERT INTO public.store_settings (id, data) VALUES (
  'singleton',
  jsonb_build_object(
    'shipping', jsonb_build_object(
      'freeShippingFrom', 300,
      'flatShipping', 29.9,
      'expressShipping', 49.9
    ),
    'payments', jsonb_build_object(
      'pixEnabled', true,
      'pixDiscount', 5,
      'boletoEnabled', true,
      'cardEnabled', true,
      'maxInstallments', 6,
      'minInstallment', 30,
      'interestFreeUpTo', 6,
      'monthlyInterest', 0
    ),
    'colors', jsonb_build_object(
      'primary', '#5a1a1f',
      'accent', '#c9a86a',
      'buy', '#2f9e4f'
    )
  )
) ON CONFLICT (id) DO NOTHING;

-- 2) categories: add banner_url
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS banner_url text;


-- >>> 20260603160545_598d9114-ea33-483c-a5cb-6300098e9dfe.sql
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS video_url text;


-- >>> 20260603161235_de40078d-f9fc-4859-8bba-7c36e1a64105.sql
UPDATE public.products SET video_url = '/__l5e/assets-v1/8dd2a1bc-a017-43ea-a005-a42884c98682/casa-valduga-premivm-extra-brut.mp4' WHERE slug = 'casa-valduga-premivm-extra-brut';


-- >>> 20260603162646_f69d4933-7f2c-4daa-8f10-7ab3bb400a88.sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aging text,
  ADD COLUMN IF NOT EXISTS alcohol_content text;


-- >>> 20260603163525_4a8997f7-162d-4f11-bb3a-efa4e1a86ba8.sql
CREATE TABLE IF NOT EXISTS public._product_chars_stg(
  slug text PRIMARY KEY,
  country text, region text, brand text, wine_type text,
  classification text, aging text, grape text, alcohol_content text,
  serving_temp text, visual_notes text, nose_notes text,
  palate_notes text, harmonization text
);
GRANT ALL ON public._product_chars_stg TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._product_chars_stg TO authenticated;
ALTER TABLE public._product_chars_stg ENABLE ROW LEVEL SECURITY;


-- >>> 20260603163602_981a1f9c-631a-4584-b7c4-3a71e75c1a27.sql
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


-- >>> 20260603180151_8080578e-2863-43b5-8566-e1e4f8d15f5f.sql
-- Legacy Lovable admin UUID; skip on fresh Supabase (admin is created in 20260611143701).
INSERT INTO public.user_roles (user_id, role)
SELECT 'c9ea104e-b169-4084-873f-52407ddd51ae', 'admin'
WHERE EXISTS (
  SELECT 1 FROM auth.users WHERE id = 'c9ea104e-b169-4084-873f-52407ddd51ae'
)
ON CONFLICT (user_id, role) DO NOTHING;


-- >>> 20260604000904_ad3c6fd7-c14b-4363-8662-7c7c81060be2.sql
ALTER TABLE public.categories RENAME COLUMN banner_url TO banner_image;


-- >>> 20260604001026_0c858eee-e41f-469e-a0a2-d85869214d9d.sql
ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS touch_categories_updated_at ON public.categories;
CREATE TRIGGER touch_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();


-- >>> 20260604020352_19cb24f0-cdf3-41df-a4f6-f4c49d707bcc.sql
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_product_categories() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.derive_product_taxonomy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_categories(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_has_purchased(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;

DROP POLICY IF EXISTS "Anyone can create order" ON public.orders;
CREATE POLICY "Anyone can create order"
  ON public.orders FOR INSERT TO anon, authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

DROP POLICY IF EXISTS "Anyone can insert order items" ON public.order_items;
CREATE POLICY "Anyone can insert order items"
  ON public.order_items FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id
        AND (o.user_id IS NULL OR o.user_id = auth.uid())
        AND o.created_at > now() - interval '1 hour'
    )
  );

CREATE POLICY "Admins read product videos" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins upload product videos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins update product videos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "Admins delete product videos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-videos' AND public.has_role(auth.uid(), 'admin'::public.app_role));


-- >>> 20260604020416_8e64911b-fbcc-4f78-b5d4-238aad561c76.sql
DROP POLICY IF EXISTS "Anyone subscribes" ON public.newsletter_subscribers;
CREATE POLICY "Anyone subscribes"
  ON public.newsletter_subscribers FOR INSERT TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND length(email) BETWEEN 5 AND 320
    AND email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
    AND is_active = true
  );
