
REVOKE EXECUTE ON FUNCTION public.derive_product_taxonomy() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_product_categories(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_sync_product_categories() FROM PUBLIC, anon, authenticated;
