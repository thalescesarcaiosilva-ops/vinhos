CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

DO $$ BEGIN CREATE TYPE public.app_role AS ENUM ('admin','customer','support'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.coupon_type AS ENUM ('fixed','percent','free_shipping','first_purchase'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.order_status AS ENUM ('pending','confirmed','shipped','delivered','cancelled','paid','separating','invoiced','out_for_delivery','refunded'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.product_type_enum AS ENUM ('vinho','espumante','sangria','destilado','cerveja','suco','acessorio','gourmet','kit','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.wine_color_enum AS ENUM ('tinto','branco','rose','misto','na'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public."user_roles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "role" app_role NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."categories" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "parent_id" uuid,
  "banner_image" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "kind" text
);

CREATE TABLE IF NOT EXISTS public."brands" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."grapes" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."regions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "country" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."collections" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "slug" text NOT NULL,
  "name" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."products" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "short_description" text,
  "description" text,
  "country" text,
  "region" text,
  "grape" text,
  "wine_type" text,
  "classification" text,
  "brand" text,
  "vintage" text,
  "wine_style" text,
  "serving_temp" text,
  "glass_type" text,
  "decanting" text,
  "harmonization" text,
  "visual_notes" text,
  "nose_notes" text,
  "palate_notes" text,
  "vivino_rating" numeric(3,1),
  "sku" text,
  "price" numeric(10,2) NOT NULL,
  "compare_at_price" numeric(10,2),
  "stock" integer NOT NULL DEFAULT 0,
  "image_url" text,
  "gallery" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "category_id" uuid,
  "featured" boolean NOT NULL DEFAULT false,
  "best_seller" boolean NOT NULL DEFAULT false,
  "is_active" boolean NOT NULL DEFAULT true,
  "rating" numeric(2,1),
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "product_type" product_type_enum,
  "color" wine_color_enum,
  "is_zero_alcohol" boolean NOT NULL DEFAULT false,
  "harmonizacao" text[] NOT NULL DEFAULT '{}'::text[],
  "selo" text[] NOT NULL DEFAULT '{}'::text[],
  "brand_id" uuid,
  "region_id" uuid,
  "collection_id" uuid,
  "video_url" text,
  "aging" text,
  "alcohol_content" text,
  "gtin" text
);

CREATE TABLE IF NOT EXISTS public."banners" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "title" text,
  "subtitle" text,
  "cta_label" text,
  "image_url" text NOT NULL,
  "link_url" text,
  "position" text NOT NULL DEFAULT 'home_hero'::text,
  "sort_order" integer NOT NULL DEFAULT 0,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."product_categories" (
  "product_id" uuid NOT NULL,
  "category_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public."product_grapes" (
  "product_id" uuid NOT NULL,
  "grape_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS public."product_suggestions" (
  "product_id" uuid NOT NULL,
  "suggested_product_id" uuid NOT NULL,
  "sort_order" integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public."profiles" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "first_name" text,
  "last_name" text,
  "cpf" text,
  "birth_date" date,
  "phone" text,
  "avatar_url" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."addresses" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "label" text,
  "recipient_name" text NOT NULL,
  "zipcode" text NOT NULL,
  "street" text NOT NULL,
  "number" text NOT NULL,
  "complement" text,
  "neighborhood" text NOT NULL,
  "city" text NOT NULL,
  "state" text NOT NULL,
  "country" text NOT NULL DEFAULT 'BR'::text,
  "is_default" boolean NOT NULL DEFAULT false,
  "is_billing" boolean NOT NULL DEFAULT false,
  "is_shipping" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."favorites" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."reviews" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "product_id" uuid NOT NULL,
  "rating" integer NOT NULL,
  "title" text,
  "comment" text,
  "photos" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "is_approved" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."coupons" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "code" text NOT NULL,
  "description" text,
  "type" coupon_type NOT NULL,
  "value" numeric NOT NULL DEFAULT 0,
  "min_order_value" numeric,
  "max_uses" integer,
  "max_uses_per_user" integer DEFAULT 1,
  "uses_count" integer NOT NULL DEFAULT 0,
  "starts_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."coupon_redemptions" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "coupon_id" uuid NOT NULL,
  "user_id" uuid,
  "order_id" uuid,
  "discount_value" numeric NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."orders" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "order_number" text NOT NULL DEFAULT (('VP'::text || to_char(now(), 'YYYYMMDD'::text)) || lpad((floor((random() * (100000)::double precision)))::text, 5, '0'::text)),
  "customer_name" text NOT NULL,
  "customer_email" text NOT NULL,
  "customer_phone" text,
  "customer_doc" text,
  "shipping_address" jsonb NOT NULL,
  "subtotal" numeric(10,2) NOT NULL,
  "shipping" numeric(10,2) NOT NULL DEFAULT 0,
  "total" numeric(10,2) NOT NULL,
  "status" order_status NOT NULL DEFAULT 'pending'::order_status,
  "notes" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "user_id" uuid,
  "tracking_code" text,
  "carrier" text,
  "estimated_delivery" date,
  "coupon_code" text,
  "discount" numeric NOT NULL DEFAULT 0,
  "pagou_transaction_id" text,
  "payment_method" text,
  "payment_status" text,
  "pix_qr_code" text,
  "pix_expiration" timestamp with time zone,
  "pix_receipt_path" text,
  "pix_receipt_mime" text,
  "pix_receipt_uploaded_at" timestamp with time zone,
  "pix_receipt_token" text
);

CREATE TABLE IF NOT EXISTS public."order_items" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "product_id" uuid,
  "product_name" text NOT NULL,
  "product_image" text,
  "unit_price" numeric(10,2) NOT NULL,
  "quantity" integer NOT NULL,
  "total" numeric(10,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public."order_status_history" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "order_id" uuid NOT NULL,
  "status" order_status NOT NULL,
  "note" text,
  "created_by" uuid,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."newsletter_subscribers" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text,
  "email" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "phone" text
);

CREATE TABLE IF NOT EXISTS public."store_settings" (
  "id" text NOT NULL,
  "data" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."webhook_events" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "pagou_event_id" text,
  "event_type" text,
  "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "processed" boolean NOT NULL DEFAULT false,
  "error" text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."contact_messages" (
  "id" uuid NOT NULL DEFAULT gen_random_uuid(),
  "name" text NOT NULL,
  "email" text NOT NULL,
  "phone" text,
  "subject" text NOT NULL,
  "message" text NOT NULL,
  "status" text NOT NULL DEFAULT 'new'::text,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."support_order_contacts" (
  "order_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "contacted_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."_seed_sql_parts" (
  "file_name" text NOT NULL,
  "part_no" integer NOT NULL,
  "payload" text NOT NULL
);
