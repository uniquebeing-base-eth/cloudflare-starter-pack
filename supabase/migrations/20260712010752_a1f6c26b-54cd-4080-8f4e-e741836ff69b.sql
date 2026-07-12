DROP POLICY IF EXISTS "own profile insert" ON public.profiles;
DROP POLICY IF EXISTS "own profile update" ON public.profiles;
DROP POLICY IF EXISTS "discoveries insert" ON public.discoveries;
DROP POLICY IF EXISTS "live_feed insert" ON public.live_feed;
DROP POLICY IF EXISTS "purchases insert" ON public.pack_purchases;
DROP POLICY IF EXISTS "reward_auth insert" ON public.reward_auth;

REVOKE INSERT, UPDATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT ON public.discoveries FROM anon, authenticated;
REVOKE INSERT ON public.live_feed FROM anon, authenticated;
REVOKE INSERT ON public.pack_purchases FROM anon, authenticated;
REVOKE INSERT ON public.reward_auth FROM anon, authenticated;

GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.discoveries TO service_role;
GRANT ALL ON public.live_feed TO service_role;
GRANT ALL ON public.pack_purchases TO service_role;
GRANT ALL ON public.reward_auth TO service_role;