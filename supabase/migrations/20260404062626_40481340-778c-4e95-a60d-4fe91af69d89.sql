
CREATE OR REPLACE FUNCTION public.validate_product_seller_category()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _seller_categories text[];
BEGIN
  SELECT categories INTO _seller_categories
  FROM public.seller_profiles WHERE id = NEW.seller_id;

  IF _seller_categories IS NULL OR array_length(_seller_categories, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT (NEW.category = ANY(_seller_categories)) THEN
    RAISE EXCEPTION 'Product category "%" is not in seller''s allowed categories', NEW.category;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_seller_category ON public.products;

CREATE TRIGGER trg_validate_product_seller_category
  BEFORE INSERT OR UPDATE OF category, seller_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_seller_category();
