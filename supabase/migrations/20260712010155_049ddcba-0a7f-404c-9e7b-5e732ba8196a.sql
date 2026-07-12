ALTER TABLE public.reward_auth
  ADD COLUMN IF NOT EXISTS claim_id text,
  ADD COLUMN IF NOT EXISTS payout_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS tx_hash text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS reward_auth_claim_id_unique
  ON public.reward_auth (claim_id)
  WHERE claim_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS reward_auth_wallet_created_idx
  ON public.reward_auth (wallet, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_reward_auth_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS reward_auth_touch_updated_at ON public.reward_auth;
CREATE TRIGGER reward_auth_touch_updated_at
BEFORE UPDATE ON public.reward_auth
FOR EACH ROW
EXECUTE FUNCTION public.touch_reward_auth_updated_at();