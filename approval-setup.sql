-- Milton Document Manager: approval workflow and RLS hardening
-- Run this once in Supabase SQL Editor as project owner.
-- This does not delete existing documents or user accounts.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';

-- Keep the existing admin profile approved and mark other unapproved profiles pending.
UPDATE public.user_profiles
SET status = CASE
  WHEN LOWER(COALESCE(email, '')) = 'sourav.miltonlifecare@gmail.com' THEN 'approved'
  WHEN approved = TRUE THEN 'approved'
  WHEN status = 'rejected' THEN 'rejected'
  ELSE 'pending'
END;

-- New signups automatically receive a pending profile.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.user_profiles (user_id, email, approved, status)
  VALUES (NEW.id, NEW.email, FALSE, 'pending')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.user_profiles TO authenticated;

-- Remove the earlier profile-read policy so the replacement is unambiguous.
DROP POLICY IF EXISTS "Users can read own profile" ON public.user_profiles;
DROP POLICY IF EXISTS "Users can read own profile or admin can read all" ON public.user_profiles;
DROP POLICY IF EXISTS "Admin can update user approvals" ON public.user_profiles;

-- Users can see only their own profile. The configured admin can see all profiles.
CREATE POLICY "Users can read own profile or admin can read all"
ON public.user_profiles
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR LOWER(COALESCE((SELECT auth.jwt() ->> 'email'), '')) = 'sourav.miltonlifecare@gmail.com'
);

-- Only the configured admin identity can update approval/status fields.
CREATE POLICY "Admin can update user approvals"
ON public.user_profiles
FOR UPDATE
TO authenticated
USING (
  LOWER(COALESCE((SELECT auth.jwt() ->> 'email'), '')) = 'sourav.miltonlifecare@gmail.com'
)
WITH CHECK (
  LOWER(COALESCE((SELECT auth.jwt() ->> 'email'), '')) = 'sourav.miltonlifecare@gmail.com'
);

-- IMPORTANT: review Storage and documents RLS policies separately.
-- This script does not alter document or Storage policies.
