
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  wallet TEXT UNIQUE,
  username TEXT UNIQUE,
  xp BIGINT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 1,
  packs_shredded INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Discoveries
CREATE TABLE public.discoveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  sub TEXT NOT NULL,
  rarity TEXT NOT NULL DEFAULT 'Common',
  amount NUMERIC(24,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX discoveries_user_idx ON public.discoveries(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.discoveries TO authenticated;
GRANT ALL ON public.discoveries TO service_role;
ALTER TABLE public.discoveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own discoveries read" ON public.discoveries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own discoveries insert" ON public.discoveries FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Pack purchases
CREATE TABLE public.pack_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  pack_id TEXT NOT NULL,
  order_id TEXT NOT NULL,
  tx_hash TEXT,
  price_usdm NUMERIC(24,6) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, order_id)
);
GRANT SELECT, INSERT ON public.pack_purchases TO authenticated;
GRANT ALL ON public.pack_purchases TO service_role;
ALTER TABLE public.pack_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own purchases read" ON public.pack_purchases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own purchases insert" ON public.pack_purchases FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Reward authorizations (signed by backend signer)
CREATE TABLE public.reward_auth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  wallet TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  amount_usdm NUMERIC(24,6) NOT NULL,
  nonce TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, nonce)
);
GRANT SELECT, INSERT ON public.reward_auth TO authenticated;
GRANT ALL ON public.reward_auth TO service_role;
ALTER TABLE public.reward_auth ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reward_auth read" ON public.reward_auth FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own reward_auth insert" ON public.reward_auth FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Stats increment RPC
CREATE OR REPLACE FUNCTION public.increment_shred_stats(_user UUID, _xp BIGINT, _pack TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, xp, packs_shredded)
  VALUES (_user, GREATEST(_xp, 0), 1)
  ON CONFLICT (id) DO UPDATE
    SET xp = public.profiles.xp + GREATEST(_xp, 0),
        packs_shredded = public.profiles.packs_shredded + 1,
        level = 1 + (public.profiles.xp + GREATEST(_xp, 0)) / 2000,
        updated_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.increment_shred_stats(UUID, BIGINT, TEXT) TO authenticated, service_role;

-- Leaderboard view (materialize per-range XP totals)
CREATE OR REPLACE VIEW public.leaderboard_view AS
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

-- Auto profile row on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles(id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
