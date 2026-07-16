
ALTER TABLE public.pack_purchases
  ADD COLUMN IF NOT EXISTS reward_paid boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reward_tx_hash text;

CREATE OR REPLACE FUNCTION public.claim_pack_purchase_for_reward(
  _wallet text,
  _pack_id text,
  _order_id text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  updated_id uuid;
BEGIN
  UPDATE public.pack_purchases
    SET reward_paid = true
    WHERE user_id = profile_id
      AND pack_id = _pack_id
      AND order_id = _order_id
      AND reward_paid = false
    RETURNING id INTO updated_id;
  RETURN updated_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_pack_purchase_exists(
  _wallet text,
  _pack_id text,
  _order_id text
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pack_purchases
    WHERE user_id = public.wallet_profile_id(_wallet)
      AND pack_id = _pack_id
      AND order_id = _order_id
      AND reward_paid = false
  );
$$;

GRANT EXECUTE ON FUNCTION public.claim_pack_purchase_for_reward(text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_pack_purchase_exists(text, text, text) TO anon, authenticated, service_role;
