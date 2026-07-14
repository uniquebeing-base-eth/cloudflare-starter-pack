-- 1) Add avatar_url to profiles and tx_hash to discoveries
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE public.discoveries ADD COLUMN IF NOT EXISTS tx_hash text;

-- 2) Fix upsert_wallet_profile so it never zeroes xp/packs_shredded/level.
--    Also accept an optional avatar_url. Only overwrite fields when the
--    caller explicitly passes a non-null value.
CREATE OR REPLACE FUNCTION public.upsert_wallet_profile(
  _wallet text,
  _username text DEFAULT NULL,
  _xp bigint DEFAULT NULL,
  _packs_shredded integer DEFAULT NULL,
  _level integer DEFAULT NULL,
  _avatar_url text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  normalized_wallet text := lower(trim(_wallet));
  existing public.profiles;
  saved public.profiles;
  next_xp bigint;
  next_packs integer;
  next_level integer;
  next_username text;
  next_avatar text;
BEGIN
  IF _username IS NOT NULL AND (length(_username) < 1 OR length(_username) > 32) THEN
    RAISE EXCEPTION 'Invalid username';
  END IF;
  IF _avatar_url IS NOT NULL AND length(_avatar_url) > 60000 THEN
    RAISE EXCEPTION 'Avatar too large';
  END IF;

  SELECT * INTO existing FROM public.profiles WHERE id = profile_id;

  next_xp    := COALESCE(_xp, existing.xp, 0);
  next_packs := COALESCE(_packs_shredded, existing.packs_shredded, 0);
  next_level := COALESCE(_level, existing.level, GREATEST(1, (next_xp / 500)::integer + 1));
  next_username := COALESCE(NULLIF(_username, ''), existing.username);
  next_avatar   := COALESCE(NULLIF(_avatar_url, ''), existing.avatar_url);

  INSERT INTO public.profiles(id, wallet, username, xp, packs_shredded, level, avatar_url, updated_at)
  VALUES (profile_id, normalized_wallet, next_username, next_xp, next_packs, next_level, next_avatar, now())
  ON CONFLICT (id) DO UPDATE SET
    wallet = EXCLUDED.wallet,
    username = EXCLUDED.username,
    xp = EXCLUDED.xp,
    packs_shredded = EXCLUDED.packs_shredded,
    level = EXCLUDED.level,
    avatar_url = EXCLUDED.avatar_url,
    updated_at = now()
  RETURNING * INTO saved;

  RETURN saved;
END;
$function$;

-- 3) Backfill: derive packs_shredded and xp from discoveries so historical
--    users appear correctly in the leaderboard (fixes "0 packs" bug).
WITH agg AS (
  SELECT
    user_id,
    count(DISTINCT (pack_id, date_trunc('second', created_at))) AS packs,
    COALESCE(SUM(CASE WHEN kind = 'XP' THEN amount ELSE 0 END), 0)::bigint AS xp_total
  FROM public.discoveries
  GROUP BY user_id
)
UPDATE public.profiles p
SET packs_shredded = GREATEST(p.packs_shredded, agg.packs::int),
    xp = GREATEST(p.xp, agg.xp_total),
    level = GREATEST(p.level, (GREATEST(p.xp, agg.xp_total) / 500)::int + 1),
    updated_at = now()
FROM agg
WHERE p.id = agg.user_id;

-- 4) Function to attach a payout tx_hash to the most recent USDM discovery.
CREATE OR REPLACE FUNCTION public.set_reward_tx_hash(_wallet text, _amount numeric, _tx_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  target_id uuid;
BEGIN
  IF _tx_hash IS NULL OR _tx_hash !~ '^0x[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid tx hash';
  END IF;

  SELECT id INTO target_id
  FROM public.discoveries
  WHERE user_id = profile_id
    AND kind = 'USDM'
    AND tx_hash IS NULL
  ORDER BY (CASE WHEN amount = _amount THEN 0 ELSE 1 END), created_at DESC
  LIMIT 1;

  IF target_id IS NOT NULL THEN
    UPDATE public.discoveries SET tx_hash = _tx_hash WHERE id = target_id;
  END IF;
END;
$function$;