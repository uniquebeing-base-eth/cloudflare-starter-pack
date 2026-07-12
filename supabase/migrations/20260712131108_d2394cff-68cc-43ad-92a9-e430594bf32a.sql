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
  rewards_total numeric := 0;
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
      OR CASE WHEN item ? 'amount' THEN COALESCE((item->>'amount')::numeric, 0) < 0 OR COALESCE((item->>'amount')::numeric, 0) > 20 ELSE false END
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

  SELECT COALESCE(sum(COALESCE((item->>'amount')::numeric, 0)), 0)
  INTO rewards_total
  FROM jsonb_array_elements(_items) AS item
  WHERE item->>'kind' IN ('USDM', 'USDT');

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

  PERFORM public.apply_shred(_pack_id, item_count, rewards_total, prior_pack_count = 0, prior_user_count = 0);

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

REVOKE EXECUTE ON FUNCTION public.begin_reward_payout(text, text, numeric, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_reward_payout_status(uuid, text, text, text, timestamptz) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_confirmed_reward_total(numeric) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_reward_payout(text, text, numeric, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_reward_payout_status(uuid, text, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_confirmed_reward_total(numeric) TO service_role;