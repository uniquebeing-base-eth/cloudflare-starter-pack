
-- Recreate view without security definer semantics
DROP VIEW IF EXISTS public.leaderboard_view;
CREATE VIEW public.leaderboard_view
WITH (security_invoker = true) AS
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

-- Lock down SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.increment_shred_stats(UUID, BIGINT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_shred_stats(UUID, BIGINT, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
-- Only invoked by the trigger; no direct callers needed.
