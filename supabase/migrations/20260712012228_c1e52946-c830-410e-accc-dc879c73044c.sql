GRANT SELECT ON public.profiles TO anon, authenticated;
GRANT SELECT ON public.discoveries TO anon, authenticated;
GRANT SELECT ON public.global_stats TO anon, authenticated;
GRANT SELECT ON public.live_feed TO anon, authenticated;
GRANT SELECT ON public.pack_purchases TO anon, authenticated;
GRANT SELECT ON public.pack_stats TO anon, authenticated;
GRANT SELECT ON public.reward_auth TO anon, authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.discoveries TO service_role;
GRANT ALL ON public.global_stats TO service_role;
GRANT ALL ON public.live_feed TO service_role;
GRANT ALL ON public.pack_purchases TO service_role;
GRANT ALL ON public.pack_stats TO service_role;
GRANT ALL ON public.reward_auth TO service_role;

GRANT EXECUTE ON FUNCTION public.apply_shred(text, integer, numeric, boolean, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_shred_stats(uuid, bigint, text) TO service_role;