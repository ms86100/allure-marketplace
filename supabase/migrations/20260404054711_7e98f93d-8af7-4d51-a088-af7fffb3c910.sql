
-- 1. Add default_action_type column to seller_profiles
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS default_action_type text;

-- 2. Store-level validation trigger (fires on INSERT, UPDATE of action_type or seller_id)
CREATE OR REPLACE FUNCTION public.validate_product_store_action_type()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  _store_default text;
  _store_checkout_mode text;
  _product_checkout_mode text;
BEGIN
  SELECT default_action_type INTO _store_default
  FROM public.seller_profiles WHERE id = NEW.seller_id;

  IF _store_default IS NULL THEN RETURN NEW; END IF;

  SELECT checkout_mode INTO _store_checkout_mode
  FROM public.action_type_workflow_map WHERE action_type = _store_default;

  SELECT checkout_mode INTO _product_checkout_mode
  FROM public.action_type_workflow_map WHERE action_type = NEW.action_type;

  IF _store_checkout_mode IS DISTINCT FROM _product_checkout_mode THEN
    RAISE EXCEPTION 'Product action_type "%" conflicts with store default "%". Checkout modes must match.',
      NEW.action_type, _store_default;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_product_store_action_type ON public.products;
CREATE TRIGGER trg_validate_product_store_action_type
  BEFORE INSERT OR UPDATE OF action_type, seller_id
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_product_store_action_type();
