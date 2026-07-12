
REVOKE ALL ON FUNCTION public.apply_shred(text,integer,numeric,boolean,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shred(text,integer,numeric,boolean,boolean) TO service_role;
