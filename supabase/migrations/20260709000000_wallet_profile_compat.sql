-- Allow wallet-backed profile and discovery records without requiring auth.users rows.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_id_fkey;

ALTER TABLE public.discoveries
  DROP CONSTRAINT IF EXISTS discoveries_user_id_fkey;

ALTER TABLE public.reward_auth
  DROP CONSTRAINT IF EXISTS reward_auth_user_id_fkey;

-- Keep the profile row creation hook working for normal auth signups.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id) VALUES (NEW.id) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
