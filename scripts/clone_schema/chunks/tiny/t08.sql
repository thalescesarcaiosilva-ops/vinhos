  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_sync_categories ON public.products;
CREATE TRIGGER trg_products_sync_categories
  AFTER INSERT OR UPDATE OF product_type, color, is_zero_alcohol, name
  ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.trg_sync_product_categories();


