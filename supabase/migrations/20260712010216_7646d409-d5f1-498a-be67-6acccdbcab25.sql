REVOKE EXECUTE ON FUNCTION public.apply_shred(text, integer, numeric, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.apply_shred(text, integer, numeric, boolean, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_shred(text, integer, numeric, boolean, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shred(text, integer, numeric, boolean, boolean) TO service_role;