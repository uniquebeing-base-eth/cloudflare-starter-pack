
CREATE OR REPLACE FUNCTION public.increment_shred_stats(_user UUID, _xp BIGINT, _pack TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF _user IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
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
