
DROP TRIGGER IF EXISTS products_derive_taxonomy ON public.products;
CREATE TRIGGER products_derive_taxonomy
BEFORE INSERT OR UPDATE OF name, description, short_description, wine_type, product_type, color
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.derive_product_taxonomy();

DROP TRIGGER IF EXISTS products_sync_categories ON public.products;
CREATE TRIGGER products_sync_categories
AFTER INSERT OR UPDATE OF product_type, color, is_zero_alcohol, name
ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trg_sync_product_categories();
