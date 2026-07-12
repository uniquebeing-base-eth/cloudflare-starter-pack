CREATE OR REPLACE FUNCTION public.wallet_profile_id(_wallet text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  normalized text := lower(trim(coalesce(_wallet, '')));
  hash bigint := 2166136261;
  bytes bytea;
  i integer;
  hex text;
  tail text;
BEGIN
  IF normalized !~ '^0x[0-9a-f]{40}$' THEN
    RAISE EXCEPTION 'Invalid wallet address';
  END IF;

  bytes := convert_to(normalized, 'UTF8');
  FOR i IN 0..length(bytes)-1 LOOP
    hash := ((hash # get_byte(bytes, i)) * 16777619) % 4294967296;
  END LOOP;

  hex := lpad(to_hex(hash), 8, '0');
  tail := substring(repeat(hex, 4) from 1 for 32);
  RETURN (
    substring(tail from 1 for 8) || '-' ||
    substring(tail from 9 for 4) || '-' ||
    '4' || substring(tail from 14 for 3) || '-' ||
    '8' || substring(tail from 18 for 3) || '-' ||
    substring(tail from 21 for 12)
  )::uuid;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_wallet_profile(
  _wallet text,
  _username text DEFAULT NULL,
  _xp bigint DEFAULT NULL,
  _packs_shredded integer DEFAULT NULL,
  _level integer DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  normalized_wallet text := lower(trim(_wallet));
  existing public.profiles;
  saved public.profiles;
  next_xp bigint;
  next_packs integer;
  next_level integer;
BEGIN
  SELECT * INTO existing FROM public.profiles WHERE id = profile_id;
  next_xp := COALESCE(GREATEST(_xp, 0), existing.xp, 0);
  next_packs := COALESCE(GREATEST(_packs_shredded, 0), existing.packs_shredded, 0);
  next_level := COALESCE(GREATEST(_level, 1), GREATEST(1, (next_xp / 500)::integer + 1));

  INSERT INTO public.profiles(id, wallet, username, xp, packs_shredded, level, updated_at)
  VALUES (profile_id, normalized_wallet, COALESCE(NULLIF(_username, ''), existing.username), next_xp, next_packs, next_level, now())
  ON CONFLICT (id) DO UPDATE SET
    wallet = EXCLUDED.wallet,
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    xp = EXCLUDED.xp,
    packs_shredded = EXCLUDED.packs_shredded,
    level = EXCLUDED.level,
    updated_at = now()
  RETURNING * INTO saved;

  RETURN saved;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wallet_shred(
  _wallet text,
  _username text,
  _pack_id text,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  normalized_wallet text := lower(trim(_wallet));
  item_count integer := jsonb_array_length(COALESCE(_items, '[]'::jsonb));
  xp_gain bigint := 0;
  prior_pack_count integer := 0;
  prior_user_count integer := 0;
  existing_profile public.profiles;
  saved_profile public.profiles;
  available_at timestamptz;
BEGIN
  IF _pack_id NOT IN ('starter', 'mystery', 'alpha', 'legendary', 'explorer') THEN
    RAISE EXCEPTION 'Invalid pack';
  END IF;
  IF item_count < 1 OR item_count > 8 THEN
    RAISE EXCEPTION 'Invalid discovery count';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(_items) AS item
    WHERE COALESCE(item->>'kind', '') NOT IN ('USDM', 'USDT', 'XP', 'CARD', 'FACT')
      OR length(COALESCE(item->>'title', '')) < 1
      OR length(COALESCE(item->>'title', '')) > 120
      OR length(COALESCE(item->>'sub', '')) > 500
      OR COALESCE(item->>'rarity', 'Common') NOT IN ('Common', 'Rare', 'Epic', 'Legendary')
  ) THEN
    RAISE EXCEPTION 'Invalid discovery item';
  END IF;

  IF _pack_id = 'starter' THEN
    SELECT created_at + interval '12 hours'
    INTO available_at
    FROM public.discoveries
    WHERE user_id = profile_id
      AND pack_id = 'starter'
      AND created_at >= now() - interval '12 hours'
    ORDER BY created_at DESC
    LIMIT 1;

    IF available_at IS NOT NULL THEN
      RAISE EXCEPTION 'Starter Pack cooldown active until %', available_at;
    END IF;
  END IF;

  SELECT count(*) INTO prior_pack_count FROM public.discoveries WHERE user_id = profile_id AND pack_id = _pack_id;
  SELECT count(*) INTO prior_user_count FROM public.discoveries WHERE user_id = profile_id;
  SELECT * INTO existing_profile FROM public.profiles WHERE id = profile_id;

  SELECT COALESCE(sum(COALESCE((item->>'amount')::numeric, 0)), 0)::bigint
  INTO xp_gain
  FROM jsonb_array_elements(_items) AS item
  WHERE item->>'kind' = 'XP';

  INSERT INTO public.profiles(id, wallet, username, xp, packs_shredded, level, updated_at)
  VALUES (
    profile_id,
    normalized_wallet,
    COALESCE(NULLIF(_username, ''), existing_profile.username),
    COALESCE(existing_profile.xp, 0) + GREATEST(xp_gain, 0),
    COALESCE(existing_profile.packs_shredded, 0) + 1,
    GREATEST(1, ((COALESCE(existing_profile.xp, 0) + GREATEST(xp_gain, 0)) / 500)::integer + 1),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    wallet = EXCLUDED.wallet,
    username = COALESCE(EXCLUDED.username, public.profiles.username),
    xp = EXCLUDED.xp,
    packs_shredded = EXCLUDED.packs_shredded,
    level = EXCLUDED.level,
    updated_at = now()
  RETURNING * INTO saved_profile;

  INSERT INTO public.discoveries(user_id, pack_id, kind, title, sub, rarity, amount)
  SELECT
    profile_id,
    _pack_id,
    item->>'kind',
    left(item->>'title', 120),
    left(COALESCE(item->>'sub', ''), 500),
    COALESCE(item->>'rarity', 'Common'),
    CASE WHEN item ? 'amount' THEN NULLIF(item->>'amount', '')::numeric ELSE NULL END
  FROM jsonb_array_elements(_items) AS item;

  PERFORM public.apply_shred(_pack_id, item_count, 0, prior_pack_count = 0, prior_user_count = 0);

  INSERT INTO public.live_feed(username, wallet, pack_id, kind, text, amount)
  SELECT
    COALESCE(NULLIF(_username, ''), saved_profile.username, left(normalized_wallet, 6)),
    normalized_wallet,
    _pack_id,
    item->>'kind',
    CASE
      WHEN item->>'kind' IN ('USDM', 'USDT') THEN 'discovered ' || COALESCE(item->>'amount', '0') || ' ' || (item->>'kind')
      WHEN item->>'kind' = 'CARD' THEN 'collected ' || (item->>'title')
      ELSE 'discovered a fact'
    END,
    CASE WHEN item ? 'amount' THEN NULLIF(item->>'amount', '')::numeric ELSE NULL END
  FROM jsonb_array_elements(_items) AS item
  WHERE item->>'kind' <> 'XP';

  RETURN jsonb_build_object(
    'ok', true,
    'xp', xp_gain,
    'profile', jsonb_build_object(
      'id', saved_profile.id,
      'wallet', saved_profile.wallet,
      'username', saved_profile.username,
      'xp', saved_profile.xp,
      'packs_shredded', saved_profile.packs_shredded,
      'level', saved_profile.level
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_wallet_pack_purchase(
  _wallet text,
  _pack_id text,
  _order_id text,
  _tx_hash text DEFAULT NULL,
  _price_usdm numeric DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  normalized_wallet text := lower(trim(_wallet));
BEGIN
  IF _pack_id NOT IN ('starter', 'mystery', 'alpha', 'legendary', 'explorer') THEN
    RAISE EXCEPTION 'Invalid pack';
  END IF;
  IF length(COALESCE(_order_id, '')) < 1 OR length(_order_id) > 128 THEN
    RAISE EXCEPTION 'Invalid order id';
  END IF;
  IF _tx_hash IS NOT NULL AND _tx_hash !~ '^0x[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid transaction hash';
  END IF;

  INSERT INTO public.profiles(id, wallet, updated_at)
  VALUES (profile_id, normalized_wallet, now())
  ON CONFLICT (id) DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = now();

  INSERT INTO public.pack_purchases(user_id, pack_id, order_id, tx_hash, price_usdm)
  VALUES (profile_id, _pack_id, _order_id, _tx_hash, GREATEST(_price_usdm, 0));
EXCEPTION WHEN unique_violation THEN
  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_reward_payout(
  _wallet text,
  _pack_id text,
  _amount_usdm numeric,
  _nonce text,
  _claim_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_id uuid := public.wallet_profile_id(_wallet);
  normalized_wallet text := lower(trim(_wallet));
  reward_id uuid;
BEGIN
  IF _pack_id NOT IN ('starter', 'mystery', 'alpha', 'legendary', 'explorer') THEN
    RAISE EXCEPTION 'Invalid pack';
  END IF;
  IF _amount_usdm < 0 OR _amount_usdm > 20 THEN
    RAISE EXCEPTION 'Invalid reward amount';
  END IF;
  IF length(COALESCE(_nonce, '')) < 4 OR length(_nonce) > 128 THEN
    RAISE EXCEPTION 'Invalid nonce';
  END IF;
  IF _claim_id !~ '^0x[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid claim id';
  END IF;

  INSERT INTO public.profiles(id, wallet, updated_at)
  VALUES (profile_id, normalized_wallet, now())
  ON CONFLICT (id) DO UPDATE SET wallet = EXCLUDED.wallet, updated_at = now();

  INSERT INTO public.reward_auth(user_id, wallet, pack_id, amount_usdm, nonce, claim_id, payout_status)
  VALUES (profile_id, normalized_wallet, _pack_id, _amount_usdm, _nonce, _claim_id, 'pending')
  RETURNING id INTO reward_id;

  RETURN reward_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_reward_payout_status(
  _id uuid,
  _status text,
  _tx_hash text DEFAULT NULL,
  _error_message text DEFAULT NULL,
  _paid_at timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _status NOT IN ('pending', 'sent', 'confirmed', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'Invalid payout status';
  END IF;
  IF _tx_hash IS NOT NULL AND _tx_hash !~ '^0x[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Invalid transaction hash';
  END IF;

  UPDATE public.reward_auth
  SET payout_status = _status,
      tx_hash = COALESCE(_tx_hash, tx_hash),
      error_message = _error_message,
      paid_at = COALESCE(_paid_at, paid_at),
      updated_at = now()
  WHERE id = _id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_confirmed_reward_total(_amount_usdm numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.global_stats
  SET rewards_usdm = rewards_usdm + GREATEST(COALESCE(_amount_usdm, 0), 0),
      updated_at = now()
  WHERE id = 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_profile_id(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_wallet_profile(text, text, bigint, integer, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_wallet_shred(text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_wallet_pack_purchase(text, text, text, text, numeric) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_reward_payout(text, text, numeric, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_reward_payout_status(uuid, text, text, text, timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_confirmed_reward_total(numeric) TO anon, authenticated, service_role;