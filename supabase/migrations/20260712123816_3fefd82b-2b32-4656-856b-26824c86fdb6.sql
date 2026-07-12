CREATE TABLE public.profiles (
  id UUID PRIMARY KEY,
  wallet TEXT UNIQUE,
  username TEXT UNIQUE,
  xp BIGINT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  packs_shredded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by all" ON public.profiles FOR SELECT USING (true);

CREATE TABLE public.discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pack_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  sub TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'Common',
  amount NUMERIC(24,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX discoveries_user_idx ON public.discoveries(user_id, created_at DESC);
GRANT SELECT ON public.discoveries TO anon, authenticated;
GRANT ALL ON public.discoveries TO service_role;
ALTER TABLE public.discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "discoveries read all" ON public.discoveries FOR SELECT USING (true);

CREATE TABLE public.pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  pack_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  tx_hash TEXT,
  price_usdm NUMERIC(24,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);
GRANT SELECT ON public.pack_purchases TO anon, authenticated;
GRANT ALL ON public.pack_purchases TO service_role;
ALTER TABLE public.pack_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases read" ON public.pack_purchases FOR SELECT USING (true);

CREATE TABLE public.reward_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  amount_usdm NUMERIC(24,6) NOT NULL,
  nonce TEXT NOT NULL,
  claim_id text,
  payout_status text NOT NULL DEFAULT 'pending',
  tx_hash text,
  error_message text,
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, nonce)
);
CREATE UNIQUE INDEX reward_auth_claim_id_unique ON public.reward_auth (claim_id) WHERE claim_id IS NOT NULL;
CREATE INDEX reward_auth_wallet_created_idx ON public.reward_auth (wallet, created_at DESC);
GRANT SELECT ON public.reward_auth TO anon, authenticated;
GRANT ALL ON public.reward_auth TO service_role;
ALTER TABLE public.reward_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward_auth read" ON public.reward_auth FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.touch_reward_auth_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER reward_auth_touch_updated_at BEFORE UPDATE ON public.reward_auth
FOR EACH ROW EXECUTE FUNCTION public.touch_reward_auth_updated_at();

CREATE TABLE public.pack_stats (
  pack_id text PRIMARY KEY,
  owners integer NOT NULL DEFAULT 0,
  shreds integer NOT NULL DEFAULT 0,
  drops integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.pack_stats TO anon, authenticated;
GRANT ALL ON public.pack_stats TO service_role;
ALTER TABLE public.pack_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pack_stats read" ON public.pack_stats FOR SELECT USING (true);
INSERT INTO public.pack_stats (pack_id) VALUES ('starter'),('mystery'),('alpha'),('legendary'),('explorer');

CREATE TABLE public.global_stats (
  id integer PRIMARY KEY DEFAULT 1,
  shredders integer NOT NULL DEFAULT 0,
  packs_shredded integer NOT NULL DEFAULT 0,
  discoveries integer NOT NULL DEFAULT 0,
  rewards_usdm numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);
GRANT SELECT ON public.global_stats TO anon, authenticated;
GRANT ALL ON public.global_stats TO service_role;
ALTER TABLE public.global_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "global_stats read" ON public.global_stats FOR SELECT USING (true);
INSERT INTO public.global_stats (id) VALUES (1);

CREATE TABLE public.live_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  wallet text,
  pack_id text,
  kind text NOT NULL,
  text text NOT NULL,
  amount numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX live_feed_created_idx ON public.live_feed (created_at DESC);
GRANT SELECT ON public.live_feed TO anon, authenticated;
GRANT ALL ON public.live_feed TO service_role;
ALTER TABLE public.live_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_feed read" ON public.live_feed FOR SELECT USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.pack_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_feed;

CREATE VIEW public.leaderboard_view WITH (security_invoker = true) AS
WITH ranges AS (
  SELECT * FROM (VALUES
    ('daily',   now() - INTERVAL '1 day'),
    ('weekly',  now() - INTERVAL '7 days'),
    ('monthly', now() - INTERVAL '30 days'),
    ('all',     'epoch'::timestamptz)
  ) AS r(range, cutoff)
),
xp_per_user AS (
  SELECT d.user_id, r.range,
         COALESCE(SUM(d.amount) FILTER (WHERE d.kind = 'XP'), 0)::bigint AS xp,
         COUNT(DISTINCT d.pack_id || '|' || d.created_at::text) AS packs_shredded
  FROM ranges r
  LEFT JOIN public.discoveries d ON d.created_at >= r.cutoff
  GROUP BY d.user_id, r.range
)
SELECT p.username, p.wallet, x.xp, x.packs_shredded, x.range
FROM xp_per_user x
JOIN public.profiles p ON p.id = x.user_id
WHERE x.user_id IS NOT NULL;
GRANT SELECT ON public.leaderboard_view TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.increment_shred_stats(_user UUID, _xp BIGINT, _pack TEXT)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id, xp, packs_shredded)
  VALUES (_user, GREATEST(_xp, 0), 1)
  ON CONFLICT (id) DO UPDATE
    SET xp = public.profiles.xp + GREATEST(_xp, 0),
        packs_shredded = public.profiles.packs_shredded + 1,
        level = 1 + (public.profiles.xp + GREATEST(_xp, 0)) / 2000,
        updated_at = now();
END; $$;
REVOKE ALL ON FUNCTION public.increment_shred_stats(UUID, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_shred_stats(UUID, BIGINT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_shred(
  _pack_id text, _drops integer, _rewards_usdm numeric,
  _is_new_owner boolean, _is_new_shredder boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.pack_stats(pack_id, owners, shreds, drops)
  VALUES (_pack_id, CASE WHEN _is_new_owner THEN 1 ELSE 0 END, 1, GREATEST(_drops, 0))
  ON CONFLICT (pack_id) DO UPDATE
    SET shreds = pack_stats.shreds + 1,
        drops = pack_stats.drops + GREATEST(_drops, 0),
        owners = pack_stats.owners + CASE WHEN _is_new_owner THEN 1 ELSE 0 END,
        updated_at = now();
  UPDATE public.global_stats
    SET packs_shredded = packs_shredded + 1,
        discoveries = discoveries + GREATEST(_drops, 0),
        rewards_usdm = rewards_usdm + GREATEST(_rewards_usdm, 0),
        shredders = shredders + CASE WHEN _is_new_shredder THEN 1 ELSE 0 END,
        updated_at = now()
    WHERE id = 1;
END; $$;
REVOKE ALL ON FUNCTION public.apply_shred(text,integer,numeric,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shred(text,integer,numeric,boolean,boolean) TO service_role;