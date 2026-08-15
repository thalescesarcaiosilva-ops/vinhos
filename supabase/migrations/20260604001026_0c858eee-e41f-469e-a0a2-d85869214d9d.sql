ALTER TABLE public.categories
ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS touch_categories_updated_at ON public.categories;
CREATE TRIGGER touch_categories_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();