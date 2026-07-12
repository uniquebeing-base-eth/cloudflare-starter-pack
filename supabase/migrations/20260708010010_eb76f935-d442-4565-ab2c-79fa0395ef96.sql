
-- Per-pack counters
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
CREATE POLICY "pack_stats readable by all" ON public.pack_stats FOR SELECT USING (true);

INSERT INTO public.pack_stats (pack_id) VALUES ('starter'),('mystery'),('alpha'),('legendary'),('explorer');

-- Global rollup (single row)
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
CREATE POLICY "global_stats readable by all" ON public.global_stats FOR SELECT USING (true);
INSERT INTO public.global_stats (id) VALUES (1);

-- Live activity feed
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
GRANT SELECT ON public.live_feed TO anon, authenticated;
GRANT ALL ON public.live_feed TO service_role;
ALTER TABLE public.live_feed ENABLE ROW LEVEL SECURITY;
CREATE POLICY "live_feed readable by all" ON public.live_feed FOR SELECT USING (true);
CREATE INDEX live_feed_created_idx ON public.live_feed (created_at DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.pack_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.global_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.live_feed;

-- Server-side atomic increment helper for backend use
CREATE OR REPLACE FUNCTION public.apply_shred(
  _pack_id text,
  _drops integer,
  _rewards_usdm numeric,
  _is_new_owner boolean,
  _is_new_shredder boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END;
$$;
REVOKE ALL ON FUNCTION public.apply_shred(text,integer,numeric,boolean,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_shred(text,integer,numeric,boolean,boolean) TO service_role;
