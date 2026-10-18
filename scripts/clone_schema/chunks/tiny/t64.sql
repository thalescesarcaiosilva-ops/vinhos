-- >>> clone_storage_extras
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-videos', 'product-videos', false)
ON CONFLICT (id) DO NOTHING;
