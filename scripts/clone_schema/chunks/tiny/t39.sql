-- >>> 20260621000000_newsletter_phone.sql
ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS phone TEXT;


